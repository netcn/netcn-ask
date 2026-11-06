// Data layer: single loader (dedup / retry / cache) + Web Worker search offload + progress
// v2: 全部分片并行下载(受控并发)+ 严格按序摄取(全局下标稳定,搜索/游戏零回归);
//     联想词典懒加载(移出首屏关键路径);searchReady 语义供 UI 做未就绪守卫。
import { decodeMsgpack } from "./mpack.js";
import { tokenize, computeScores } from "./search.js";

export const state = {
  manifest: null, records: [], idIndex: {}, index: null,
  suggest: null, detailMap: {}, detailCache: {}, ready: false,
  searchReady: false
};

const cache = new Map();
const inflight = new Map();
const jd = (b) => JSON.parse(new TextDecoder().decode(b));

let worker = null;
let searchSeq = 0;
const pending = new Map();

async function load(url, dec) {
  if (cache.has(url)) return cache.get(url);
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buf = await res.arrayBuffer();
        const v = dec ? dec(buf) : buf;
        cache.set(url, v);
        return v;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  })();
  inflight.set(url, p);
  try { return await p; } finally { inflight.delete(url); }
}

export async function init(onProgress) {
  const report = (p) => { if (onProgress) onProgress(p); };
  state.manifest = await load("data/manifest.json", jd);
  report(0.06);
  const files = state.manifest.records;

  // 下载全部并行(受控并发);摄取严格按分片顺序进行 ——
  // state.records 任意时刻都是「有序前缀」,倒排下标 gi 永远指向正确记录。
  // 注意:每个下标的 promise 必须在被 await 之前就写进 results，
  // 否则 await undefined 会得到 undefined（TypeError: arr is not iterable）。
  const CONCURRENCY = 4;
  const results = new Array(files.length);
  let nextFile = 0, done = 0;
  const startOne = () => {
    if (nextFile >= files.length) return;
    const i = nextFile++;
    results[i] = load("data/" + files[i].file, decodeMsgpack).then((arr) => {
      done++;
      report(0.06 + 0.64 * (done / files.length));
      return arr;
    });
  };
  for (let k = 0; k < Math.min(CONCURRENCY, files.length); k++) startOne();
  const indexTask = (async () => {
    state.index = await load("data/" + state.manifest.index.file, decodeMsgpack);
    report(0.92);
  })();

  for (let i = 0; i < files.length; i++) {
    const arr = await results[i];
    if (!Array.isArray(arr)) throw new Error("分片格式异常: " + files[i].file);
    startOne();
    for (const r of arr) {
      state.idIndex[r.id] = state.records.length;
      state.records.push(r);
    }
  }
  await indexTask;

  state.detailMap = {};
  for (const d of (state.manifest.details || []))
    for (const id of d.ids) state.detailMap[id] = d.file;

  // spin up worker for off-main-thread scoring
  try {
    worker = new Worker("assets/js/worker.js");
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "search") {
        const cb = pending.get(m.id);
        if (cb) { pending.delete(m.id); cb(m.results); }
      }
    };
    worker.postMessage({ type: "init", index: state.index, count: state.records.length });
  } catch (e) { worker = null; }

  state.searchReady = true;
  state.ready = true;
  report(1);
}

// 联想词典懒加载:首次聚焦/输入搜索框时才拉取(约 2.5MB,移出首屏关键路径)
let suggestPromise = null;
export function ensureSuggest() {
  if (state.suggest) return Promise.resolve(state.suggest);
  if (!state.manifest) return Promise.resolve([]);
  if (!suggestPromise) {
    suggestPromise = load("data/" + state.manifest.suggest.file, jd)
      .then((s) => { state.suggest = s; return s; })
      .catch(() => { suggestPromise = null; return []; });
  }
  return suggestPromise;
}

// Returns [{r, score, hot}] — Worker-backed, with synchronous fallback.
export function searchQ(q) {
  if (!state.searchReady) return Promise.resolve([]);
  return new Promise((resolve) => {
    const toks = tokenize(q);
    if (!worker) {
      resolve(computeScores(toks).map(([gi, sc]) => ({
        r: state.records[gi], score: sc, hot: state.records[gi] ? state.records[gi].hot : 0
      })).filter((x) => x.r));
      return;
    }
    const id = ++searchSeq;
    pending.set(id, (results) => resolve(results.map(([gi, sc]) => ({
      r: state.records[gi], score: sc, hot: state.records[gi] ? state.records[gi].hot : 0
    })).filter((x) => x.r)));
    worker.postMessage({ type: "search", id, q, toks });
  });
}

// Lazy-load a question's full answer shard on demand
export async function getDetail(id) {
  if (state.detailCache[id] !== undefined) return state.detailCache[id];
  const f = state.detailMap[id];
  if (!f) { state.detailCache[id] = null; return null; }
  const arr = await load("data/" + f, decodeMsgpack);
  const found = arr.find((x) => x.id === id) || null;
  state.detailCache[id] = found;
  return found;
}

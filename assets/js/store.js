// Data layer: single loader (dedup / retry / cache) + Web Worker search offload + progress
// v3: 首屏「好玩的东西」不再依赖本模块 —— 由 fun-pack.js 的 64 道精选静态题即时渲染。
//     加载拆成两段：① 记录分片(≈13MB) 先行，完成后 ask:ready；
//     ② 全文倒排索引(≈11MB) 只在第一次关键词搜索时才拉取，不阻塞首屏与进度条。
//     哈希命名的内容分片使用强缓存；索引失败时退回本地子串扫描。
import { decodeMsgpack } from "./mpack.js?v=4";
import { tokenize, computeScores } from "./search.js?v=4";
import { FUN_DETAILS } from "./fun-pack.js?v=4";

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

// 记录分片是否摄取完毕（全文索引就绪前也要等到它，否则 gi 会指向不存在的记录）
// 用可重置的 waiter 而不是一次性 Promise：加载失败点「重试」后仍能正常就绪。
let recordsDone = false;
let recordsWaiters = [];
function waitRecords() {
  if (recordsDone) return Promise.resolve(true);
  return new Promise((r) => { recordsWaiters.push(r); });
}
function settleRecords(ok) {
  if (ok) recordsDone = true;
  const list = recordsWaiters.splice(0);
  for (const r of list) r(ok);
}

// 全文索引是唯一一条独立的懒加载 promise
let indexPromise = null;
let indexFailed = false;

async function load(url, dec) {
  if (cache.has(url)) return cache.get(url);
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // records-*.mpack / detail-*.mpack 是内容哈希命名，永不过期 → 强缓存
        // manifest.json / suggest.json / index.mpack 是固定名，必须复验
        const immutable = /^data\/(records-|detail-)/.test(url);
        const res = await fetch(url, { cache: immutable ? "force-cache" : "no-cache" });
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

/* ---------- 阶段②：全文索引按需加载 ---------- */
export function ensureSearch() {
  if (state.searchReady) return Promise.resolve(true);
  if (indexFailed) return Promise.resolve(false);
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        if (!state.manifest) throw new Error("manifest 尚未就绪");
        const idx = await load("data/" + state.manifest.index.file, decodeMsgpack);
        const ok = await waitRecords();
        if (!ok) throw new Error("记录分片未就绪");
        state.index = idx;
        try {
          worker = new Worker("assets/js/worker.js?v=4");
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
        return true;
      } catch (e) {
        console.warn("全文索引暂不可用，本次改用本地扫描", e);
        // 允许后续搜索重试（偶发网络失败不应永久退化）
        indexFailed = false;
        indexPromise = null;
        return false;
      }
    })();
  }
  return indexPromise;
}

/* ---------- 阶段①：记录分片（首屏不再等索引） ---------- */
export async function init(onProgress) {
  const report = (p) => { if (onProgress) onProgress(p); };
  recordsDone = false;
  try {
    state.manifest = await load("data/manifest.json", jd);
    report(0.06);
    const files = state.manifest.records;

    // 并行下载(受控并发) + 严格按序摄取：state.records 任意时刻都是有序前缀。
    // 每个下标的 promise 必须在被 await 之前就写进 results，
    // 否则 await undefined 会得到 undefined（TypeError: arr is not iterable）。
    const CONCURRENCY = 4;
    const results = new Array(files.length);
    let nextFile = 0, done = 0;
    const startOne = () => {
      if (nextFile >= files.length) return;
      const i = nextFile++;
      results[i] = load("data/" + files[i].file, decodeMsgpack).then((arr) => {
        done++;
        report(0.06 + 0.94 * (done / files.length));
        return arr;
      });
    };
    for (let k = 0; k < Math.min(CONCURRENCY, files.length); k++) startOne();

    for (let i = 0; i < files.length; i++) {
      const arr = await results[i];
      if (!Array.isArray(arr)) throw new Error("分片格式异常: " + files[i].file);
      startOne();
      for (const r of arr) {
        state.idIndex[r.id] = state.records.length;
        state.records.push(r);
      }
    }

    state.detailMap = {};
    for (const d of (state.manifest.details || []))
      for (const id of d.ids) state.detailMap[id] = d.file;

    state.ready = true;
    settleRecords(true);
    report(1);
  } catch (e) {
    settleRecords(false);
    throw e;
  }
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

// 索引不可用时的兜底：主线程子串扫描（仅在异常路径触发）
function simpleScan(toks, q) {
  const needle = (q || "").trim().toLowerCase();
  const out = [];
  for (let gi = 0; gi < state.records.length; gi++) {
    const r = state.records[gi];
    const hay = (((r.q && r.q[0]) || "") + " " + ((r.q && r.q[1]) || "") + " " +
      ((r.s && r.s[0]) || "") + " " + ((r.s && r.s[1]) || "")).toLowerCase();
    let sc = 0;
    for (const t of toks) if (hay.indexOf(t) !== -1) sc++;
    if (needle && hay.indexOf(needle) !== -1) sc += 3;
    if (sc) out.push({ r, score: sc, hot: r.hot || 0 });
  }
  out.sort((a, b) => (b.score - a.score) || (b.hot - a.hot));
  return out.slice(0, 800);
}

// Returns [{r, score, hot}] — Worker-backed, with synchronous fallback.
// 首次关键词搜索会在这里触发 11MB 索引的懒加载，期间 UI 显示加载占位。
export async function searchQ(q) {
  const [ok] = await Promise.all([ensureSearch(), waitRecords()]);
  const toks = tokenize(q);
  if (!ok || !state.searchReady) return simpleScan(toks, q);
  return new Promise((resolve) => {
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
  // 首屏精选包：全量清单还没建好时，直接用静态答案，零请求
  if (!f) return FUN_DETAILS[id] || null;
  const arr = await load("data/" + f, decodeMsgpack);
  const found = arr.find((x) => x.id === id) || null;
  state.detailCache[id] = found;
  return found;
}

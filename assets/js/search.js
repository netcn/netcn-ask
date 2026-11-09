// Search: tokenize query (zh chars + pinyin/latin words) -> score against inverted index
// Worker owns the heavy scan; this module provides tokenize + a synchronous fallback.
import { state } from "./store.js?v=4";

export function tokenize(q) {
  const toks = new Set();
  for (const ch of q) {
    if (ch >= "一" && ch <= "鿿") toks.add(ch); // CJK
  }
  const latin = q.toLowerCase().match(/[a-z0-9+#]+/g);
  if (latin) latin.forEach((w) => toks.add(w));
  return [...toks];
}

function isLatin(t) { return /^[a-z0-9+#]+$/.test(t); }

// 索引里 ASCII 键的缓存: 索引有 ~14 万键，若每次查询都 Object.keys + 正则过滤，
// 同步回退路径会在每次击键时卡住主线程。
// worker.js 在 init 时缓存同一份（ASCII 变量）—— 两份实现的差异正是复制导致的。
let _asciiCache = null;
let _asciiFor = null;
function asciiKeys(idx) {
  if (_asciiFor === idx && _asciiCache) return _asciiCache;
  _asciiFor = idx;
  _asciiCache = Object.keys(idx).filter(isLatin);
  return _asciiCache;
}

// Synchronous scoring (fallback when Worker is unavailable)
export function computeScores(toks) {
  const idx = state.index || {};
  const scores = new Map();
  const ascii = asciiKeys(idx);
  const add = (gi, w) => scores.set(gi, (scores.get(gi) || 0) + w);
  for (const t of toks) {
    const ids = idx[t];
    if (ids) for (const gi of ids) add(gi, 1);
    if (isLatin(t) && t.length >= 3) {
      for (const k of ascii) {
        if (k.indexOf(t) !== -1) {
          const ids2 = idx[k];
          if (ids2) for (const gi of ids2) add(gi, 1);
        }
      }
    }
  }
  const res = [];
  for (const [gi, sc] of scores) {
    const all = toks.length ? toks.every((t) => (idx[t] || []).indexOf(gi) !== -1) : true;
    res.push([gi, sc + (all ? 100 : 0)]);
  }
  res.sort((a, b) => b[1] - a[1] || 0);
  return res;
}

// Full synchronous search returning records (used as fallback only)
export function search(query) {
  const q = (query || "").trim();
  if (!q) return [];
  const scored = computeScores(tokenize(q));
  return scored.map(([gi]) => state.records[gi]).filter(Boolean);
}

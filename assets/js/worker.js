// Web Worker: off-main-thread search scoring (incl. pinyin substring scan)
// Classic worker (no imports) — created from index.html.
let INDEX = null;
let ASCII = [];
let COUNT = 0;

function isLatin(t) { return /^[a-z0-9+#]+$/.test(t); }

self.onmessage = function (e) {
  const m = e.data;
  if (m.type === "init") {
    INDEX = m.index;
    COUNT = m.count || 0;
    ASCII = Object.keys(INDEX || {}).filter(isLatin);
    return;
  }
  if (m.type === "search") {
    const toks = m.toks || [];
    const scores = new Map();
    const add = (gi, w) => scores.set(gi, (scores.get(gi) || 0) + w);
    for (const t of toks) {
      const ids = INDEX[t];
      if (ids) for (const gi of ids) add(gi, 1);
      // pinyin phrase matching: latin token (len>=3) matches combined pinyin substrings
      if (isLatin(t) && t.length >= 3) {
        for (const k of ASCII) {
          if (k.indexOf(t) !== -1) {
            const ids2 = INDEX[k];
            if (ids2) for (const gi of ids2) add(gi, 1);
          }
        }
      }
    }
    const res = [];
    for (const [gi, sc] of scores) {
      const all = toks.length ? toks.every((t) => (INDEX[t] || []).indexOf(gi) !== -1) : true;
      res.push([gi, sc + (all ? 100 : 0)]);
    }
    res.sort((a, b) => b[1] - a[1] || 0);
    self.postMessage({ type: "search", id: m.id, results: res.slice(0, 800) });
  }
};

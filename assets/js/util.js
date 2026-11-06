// Shared small helpers.
//
// esc/escRe 原先在 ui.js 与 game.js 各定义一份（逐字相同，但两份会各自漂移 ——
// R92/R93/R94/R105 同一类错误已发生六次）。统一到此处。
//
// 变更时注意: worker.js 是 classic worker（不能用 import），其中若有同名函数
// 需保留并在此处注释说明差异。

export const esc = (s) => String(s == null ? "" : s)
  .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 旧品牌前缀的同名存储键只搬运一次：新键为空时才找尾缀相同的旧键，搬值后删除旧键。
export const migrateKey = (name, prefix = "ask_") => {
  try {
    if (localStorage.getItem(name) !== null) return;
    const tail = "_" + name.slice(prefix.length);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k !== name && k.endsWith(tail)) {
        const v = localStorage.getItem(k);
        if (v !== null) localStorage.setItem(name, v);
        localStorage.removeItem(k);
        return;
      }
    }
  } catch (e) {}
};
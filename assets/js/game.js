// game.js — 详情页阅读辅助（历史遗留文件名，游戏化玩法已全部移除）
// 只保留：学科 emoji、收藏 / 已掌握。不再有启动台、小游戏、XP、徽章、进度条。
const $ = (s, r = document) => r.querySelector(s);

export const KID_AUDS = new Set(["toddler", "p_low", "p_high"]);
export function isKids() { return false; }
export function setKids() { return false; }

export const CAT_EMOJI = {
  phy: "⚛️", chem: "⚗️", bio: "🧬", astro: "🪐", earth: "🌍", math: "🔢",
  med: "🩺", eng: "🛠️", cs: "💻", env: "🌿", psy: "🧠", soc: "🌐"
};
const KEYWORD_EMOJI = {
  "动物": "🐾", "太空": "🚀", "星星": "⭐", "太阳": "☀️", "月亮": "🌙", "地球": "🌍",
  "水": "💧", "身体": "🫀", "植物": "🌱", "颜色": "🎨", "数字": "🔢", "恐龙": "🦖",
  "海洋": "🌊", "天气": "🌈", "光": "💡", "电": "⚡", "鸟": "🐦", "昆虫": "🐛",
  "食物": "🍎", "梦": "😴", "音乐": "🎵", "机器人": "🤖"
};

export function emojiFor(r) {
  if (!r) return "💡";
  if (r.tag) {
    for (const tg of r.tag) {
      const z = Array.isArray(tg) ? tg[0] : tg;
      for (const k in KEYWORD_EMOJI) if (z && z.indexOf(k) >= 0) return KEYWORD_EMOJI[k];
    }
  }
  return CAT_EMOJI[r.cat] || "💡";
}

/* ---------- 收藏 / 已掌握 ---------- */
const FAV_KEY = "ask_favs_v2";
const MASTER_KEY = "ask_mastered_v2";
function readSet(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch (e) { return {}; }
}
function writeSet(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2000);
}

/** 详情页注入两个阅读辅助按钮。旧版这里还有「测测我/猜猜看/刮刮看」，已删除。 */
export function decorateDetail(r, det) {
  const meta = det.querySelector(".meta");
  if (!meta || !r || !r.id) return;
  const favs = readSet(FAV_KEY), mastered = readSet(MASTER_KEY);
  const wrap = document.createElement("div");
  wrap.className = "read-actions";
  wrap.innerHTML = `<button type="button" data-act="fav" class="${favs[r.id] ? "on" : ""}">⭐ ${favs[r.id] ? "已收藏" : "收藏"}</button>
    <button type="button" data-act="master" class="${mastered[r.id] ? "on" : ""}">✓ ${mastered[r.id] ? "已掌握" : "标为掌握"}</button>`;
  meta.after(wrap);
  wrap.querySelector('[data-act="fav"]').onclick = (e) => {
    const f = readSet(FAV_KEY);
    const on = !f[r.id];
    if (on) f[r.id] = 1; else delete f[r.id];
    writeSet(FAV_KEY, f);
    e.currentTarget.classList.toggle("on", on);
    e.currentTarget.textContent = "⭐ " + (on ? "已收藏" : "收藏");
    toast(on ? "已加入收藏 ⭐" : "已取消收藏");
  };
  wrap.querySelector('[data-act="master"]').onclick = (e) => {
    const m = readSet(MASTER_KEY);
    const on = !m[r.id];
    if (on) m[r.id] = 1; else delete m[r.id];
    writeSet(MASTER_KEY, m);
    e.currentTarget.classList.toggle("on", on);
    e.currentTarget.textContent = "✓ " + (on ? "已掌握" : "标为掌握");
    toast(on ? "已标记为掌握 ✅" : "已取消掌握标记");
  };
}

/* 兼容保留的空接口：ui.js / app.js 旧调用点不会抛错，但不再有任何游戏行为 */
export function initGame() {}
export function renderLaunch() {}
export function startMode() {}
export function startCatBlind() {}
export function markLangToggled() {}

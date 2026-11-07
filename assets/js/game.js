// game.js — 进度引擎 + 游戏化玩法（无游戏中心，玩法嵌进首页启动台与详情页内联）
// 同一批科学题既是答案库也是游戏素材；阅读即 +XP，游戏即问答。
import { state, getDetail } from "./store.js";
import { CONFIG } from "./config.js";
import { getLang, L } from "./i18n.js";
import { speak } from "./tts.js";

const KEY = "ask_progress";
const $ = (s, r = document) => r.querySelector(s);
import { esc, migrateKey } from "./util.js";
const lang = () => getLang();
const ZH = (r) => r.q[0];
const EN = (r) => r.q[1] || "";
const Q = (r) => (lang() === "en" ? (EN(r) || ZH(r)) : ZH(r));
const S = (r) => { const i = lang() === "en" ? 1 : 0; return r.s[i] || r.s[0] || ""; };
const labelCat = (c) => { const m = CONFIG.CATS[c]; return m ? L([m.z, m.e]) : c; };
const diffLabel = (d) => { const m = CONFIG.DIFF[String(d)]; return m ? L([m.z, m.e]) : ""; };
const CATCOLOR = { phy: "#5B8DEF", chem: "#14b8a6", bio: "#34d399", astro: "#a78bfa", earth: "#f59e0b", math: "#f472b6", med: "#fb7185", eng: "#60a5fa", cs: "#22d3ee", env: "#4ade80", psy: "#c084fc", soc: "#fb923c" };
const PLANET_TH = 5; // 点亮一个学科星球所需阅读数

// ---------------- 儿童模式 + 吉祥物 + 内容池 ----------------
export const KID_AUDS = new Set(["toddler", "p_low", "p_high"]);
let KIDS = false;
export function isKids() { return KIDS; }
export function setKids(on) {
  KIDS = !!on;
  try { localStorage.setItem("ask_kids", KIDS ? "1" : "0"); } catch (e) {}
  document.body.classList.toggle("kids", KIDS);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ask:kids", { detail: { on: KIDS } }));
}
// 内容池：儿童模式只取 toddler/p_low/p_high 受众且难度=入门，避免成人内容被错标进来
function recPool() { return KIDS ? state.records.filter((r) => KID_AUDS.has(r.aud) && r.diff === 1) : state.records; }
// 学科吉祥物（大 emoji 主图 / 详情页头部）
export const CAT_EMOJI = { phy: "⚛️", chem: "⚗️", bio: "🧬", astro: "🪐", earth: "🌍", math: "🔢", med: "🩺", eng: "🛠️", cs: "💻", env: "🌿", psy: "🧠", soc: "🌐" };
const KEYWORD_EMOJI = { "动物": "🐾", "太空": "🚀", "星星": "⭐", "太阳": "☀️", "月亮": "🌙", "地球": "🌍", "水": "💧", "身体": "🫀", "植物": "🌱", "颜色": "🎨", "数字": "🔢", "恐龙": "🦖", "海洋": "🌊", "天气": "🌈", "光": "💡", "电": "⚡", "鸟": "🐦", "昆虫": "🐛", "食物": "🍎", "梦": "😴", "音乐": "🎵", "机器人": "🤖" };
export function emojiFor(r) {
  if (!r) return "💡";
  if (r.tag) { for (const tg of r.tag) { const z = Array.isArray(tg) ? tg[0] : tg; for (const k in KEYWORD_EMOJI) if (z && z.indexOf(k) >= 0) return KEYWORD_EMOJI[k]; } }
  return CAT_EMOJI[r.cat] || "💡";
}

// ---------------- 进度状态 ----------------
let P = null;
function fresh() {
  return {
    xp: 0,
    streak: { last: "", count: 0, best: 0 },
    badges: {}, favs: {}, mastered: {}, readsMarked: {},
    stats: { reads: 0, byCat: {}, quizCorrect: 0, quizTotal: 0, guessCorrect: 0, guessTotal: 0, blind: 0, dailyDone: "", dailyStreak: 0, lastDaily: "", dragCorrect: 0, dragTotal: 0, timedBest: 0, langToggled: false }
  };
}
function load() { migrateKey(KEY); try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.xp === "number") return Object.assign(fresh(), v); } catch (e) {} return fresh(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }

const TITLES = ["萌新", "萌新", "学徒", "学徒", "学者", "学者", "研究员", "研究员", "大师", "大师", "院士"];
const levelOf = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;
const titleOf = (lv) => TITLES[Math.min(TITLES.length - 1, lv - 1)];
const xpAt = (lv) => (lv - 1) * (lv - 1) * 50;
function levelProgress(xp) { const lv = levelOf(xp); const base = xpAt(lv), next = xpAt(lv + 1); return Math.max(0, Math.min(1, (xp - base) / (next - base))); }

const BADGES = [
  { id: "first", name: "初来乍到", icon: "🌱", test: (p) => p.stats.reads >= 1 },
  { id: "r50", name: "小有积累", icon: "📚", test: (p) => p.stats.reads >= 50 },
  { id: "r100", name: "百题斩", icon: "⚔️", test: (p) => p.stats.reads >= 100 },
  { id: "bilingual", name: "学贯中西", icon: "🌐", test: (p) => p.stats.langToggled },
  { id: "allcat", name: "十二星宿", icon: "🪐", test: (p) => Object.keys(p.stats.byCat).length >= 12 },
  { id: "combo", name: "连击王", icon: "🔥", test: (p) => p.streak.best >= 7 },
  { id: "sharp", name: "火眼金睛", icon: "🦅", test: (p) => p.stats.quizCorrect >= 10 },
  { id: "guess", name: "神推理", icon: "🔮", test: (p) => p.stats.guessCorrect >= 10 },
  { id: "fav", name: "收藏家", icon: "⭐", test: (p) => Object.keys(p.favs).length >= 50 },
  { id: "blind", name: "盲盒控", icon: "🎁", test: (p) => p.stats.blind >= 100 },
  { id: "master", name: "大师", icon: "🎓", test: (p) => levelOf(p.xp) >= 10 },
  { id: "galaxy", name: "银河旅人", icon: "🌌", test: (p) => Object.values(p.stats.byCat).filter((n) => n >= PLANET_TH).length >= 12 }
];

// ---------------- 惊喜工具 ----------------
function toast(msg) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2200);
}
function confetti(n = 24) {
  const colors = ["#5B8DEF", "#14b8a6", "#34d399", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee", "#fb923c"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div"); c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw"; c.style.background = colors[i % colors.length];
    c.style.animationDuration = (1.4 + Math.random() * 1.2) + "s"; c.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(c);     setTimeout(() => c.remove(), 3000);
  }
}

// ---------------- 嘉年华内容库 ----------------
const VERDICTS = ["宇宙说：很有可能 ✨", "科学判决：未必 ❓", "实验证明：是的 ✅", "八字还没一撇 🤔", "概率站在你这边 🍀", "再想想 🔍", "天机不可泄露 🌫️", "恒星作证：没错 ⭐"];
const FORTUNE_YI = ["宜·大胆假设", "宜·动手实验", "宜·仰望星空", "宜·追问到底", "宜·画张草图", "宜·泡杯茶慢慢想", "宜·和好友辩论", "宜·推翻旧结论"];
const FORTUNE_JI = ["忌·死记硬背", "忌·半途而废", "忌·人云亦云", "忌·跳过步骤", "忌·害怕犯错", "忌·急于下结论", "忌·关掉好奇心", "忌·只看答案"];
function daySeed() { const d = new Date(); return d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate(); }
function todayFortune() { const s = daySeed(); return { yi: FORTUNE_YI[s % FORTUNE_YI.length], ji: FORTUNE_JI[(s * 7) % FORTUNE_JI.length] }; }

// 通用刮卡：在 canvas 上涂灰，刮开露出下层答案
function wireScratch(cv) {
  const ctx = cv.getContext("2d");
  function coat() { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#9aa6c4"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = "#5b6486"; ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("👆 刮开涂层", cv.width / 2, cv.height / 2); }
  coat();
  let moves = 0;
  function scr(x, y) { ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.fill(); if (++moves > 22) { cv.style.opacity = "0"; cv.style.pointerEvents = "none"; } }
  function pos(e) { const b = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return [t.clientX - b.left, t.clientY - b.top]; }
  cv.addEventListener("mousedown", () => cv._d = true);
  window.addEventListener("mouseup", () => cv._d = false);
  cv.addEventListener("mousemove", (e) => { if (!cv._d) return; const [x, y] = pos(e); scr(x, y); });
  cv.addEventListener("touchstart", () => cv._d = true, { passive: true });
  cv.addEventListener("touchend", () => cv._d = false);
  cv.addEventListener("touchmove", (e) => { e.preventDefault(); const [x, y] = pos(e); scr(x, y); }, { passive: false });
}

// ---------------- 核心进度逻辑 ----------------
function dateStr(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function bumpStreakOnVisit() {
  const today = dateStr(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yest = dateStr(y);
  if (P.streak.last === today) return;
  if (P.streak.last === yest) P.streak.count += 1; else P.streak.count = 1;
  P.streak.last = today;
  if (P.streak.count > P.streak.best) P.streak.best = P.streak.count;
  save();
}
function gain(xp) {
  const before = levelOf(P.xp); P.xp += xp; const after = levelOf(P.xp);
  save(); renderHUD();
  if (after > before) { confetti(40); toast("🎉 升级！称号：" + titleOf(after) + "（Lv." + after + "）"); }
  checkBadges();
}
function checkBadges() {
  for (const b of BADGES) {
    if (!P.badges[b.id] && b.test(P)) {
      P.badges[b.id] = true; save();
      confetti(20); toast("🏅 解锁徽章：" + b.icon + " " + b.name);
    }
  }
}
function awardRead(r) {
  if (P.readsMarked[r.id]) return;
  P.readsMarked[r.id] = 1;
  P.stats.reads += 1;
  P.stats.byCat[r.cat] = (P.stats.byCat[r.cat] || 0) + 1;
  gain(5);
}
function toggleFav(r) { if (P.favs[r.id]) delete P.favs[r.id]; else P.favs[r.id] = 1; save(); renderHUD(); return !!P.favs[r.id]; }
function toggleMaster(r) { if (P.mastered[r.id]) delete P.mastered[r.id]; else P.mastered[r.id] = 1; save(); return !!P.mastered[r.id]; }

// ---------------- 取数工具 ----------------
const randRec = () => { const a = recPool(); return a[Math.floor(Math.random() * a.length)]; };
const recById = (id) => state.records[state.idIndex[id]];
function sample(arr, n) { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function dailyRecs() {
  const a = recPool(); const d = new Date(); const seed = d.getFullYear() * 1000 + (d.getMonth() + 1) * 40 + d.getDate();
  const n = a.length, out = []; let s = seed;
  for (let k = 0; k < 3; k++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out.push(a[s % n]); }
  return out;
}

// ---------------- 细 HUD（常驻状态条，不是游戏中心入口） ----------------
function renderHUD() {
  const hud = $("#gameHud"); if (!hud) return;
  hud.hidden = false;
  const lv = levelOf(P.xp), pct = Math.round(levelProgress(P.xp) * 100);
  const badgeN = Object.keys(P.badges).length;
  hud.innerHTML =
    `<div class="hud-ring" title="等级 ${lv} · ${esc(titleOf(lv))}"><b>${lv}</b><span>${esc(titleOf(lv))}</span></div>
     <div class="hud-xp"><div class="hud-xp-bar" style="width:${pct}%"></div></div>
     <div class="hud-stat" title="连续探索">🔥 ${P.streak.count}</div>
     <div class="hud-stat" title="徽章">🏅 ${badgeN}</div>
     <div class="hud-stat" title="已读题数">📖 ${P.stats.reads}</div>`;
}

// ---------------- 跳转详情 ----------------
function gotoDetail(id) { window.dispatchEvent(new CustomEvent("ask:show", { detail: { id } })); }

// ---------------- 首页嘉年华（五花八门 · 有秩序的网格） ----------------
export function renderLaunch() {
  const root = $("#launch"); if (!root) return;
  if (isKids()) { renderKidsLaunch(root); return; }
  const cats = Object.entries(CONFIG.CATS);
  const lit = cats.filter(([c]) => (P.stats.byCat[c] || 0) >= PLANET_TH).length;
  const lead = lit >= 12 ? "🌌 银河已集齐！你就是银河旅人" : "🌈 一座长满游戏的问答百科 · 换批新鲜事，探索不停";
  root.innerHTML = `
    <div class="carnival">
      <div class="cw-top">
        <span class="lead">${lead}</span>
        <button class="cw-shuffle" id="cwShuffle" type="button">🔄 来点新鲜的</button>
      </div>
      <div class="cw cw-gacha" style="--i:0"><div class="cw-card" data-w="gacha"></div></div>
      <div class="cw cw-wheel" style="--i:1"><div class="cw-card" data-w="wheel"></div></div>
      <div class="cw cw-8ball tilt-a" style="--i:2"><div class="cw-card" data-w="ball"></div></div>
      <div class="cw cw-die tilt-b" style="--i:3"><div class="cw-card" data-w="die"></div></div>
      <div class="cw cw-well" style="--i:4"><div class="cw-card" data-w="well"></div></div>
      <div class="cw cw-scratch" style="--i:5"><div class="cw-card" data-w="scratch"></div></div>
      <div class="cw cw-galaxy" style="--i:6"><div class="cw-card" data-w="galaxy"></div></div>
      <div class="cw cw-modes" style="--i:7"><div class="cw-card" data-w="modes"></div></div>
      <div class="cw cw-ticker" style="--i:8"><div class="cw-card" data-w="ticker"></div></div>
      <div class="cw cw-bubbles" style="--i:9"><div class="cw-card" data-w="bubbles"></div></div>
      <div class="cw cw-trail" style="--i:10"><div class="cw-card" data-w="trail"></div></div>
      <div class="cw cw-adv" style="--i:11"><details class="adv"><summary>按学科 / 难度 / 年级 精确筛选</summary><div id="filters"></div></details></div>
    </div>`;
  const sh = $("#cwShuffle", root); if (sh) sh.onclick = () => renderLaunch();
  const safe = (fn) => { try { fn(); } catch (e) { console.warn("carnival widget error", e); } };
  safe(() => buildGacha($('[data-w="gacha"]', root)));
  safe(() => buildWheel($('[data-w="wheel"]', root)));
  safe(() => build8ball($('[data-w="ball"]', root)));
  safe(() => buildDie($('[data-w="die"]', root)));
  safe(() => buildWell($('[data-w="well"]', root)));
  safe(() => buildScratch($('[data-w="scratch"]', root)));
  safe(() => buildGalaxy($('[data-w="galaxy"]', root), lit));
  safe(() => buildModes($('[data-w="modes"]', root)));
  safe(() => buildTicker($('[data-w="ticker"]', root)));
  safe(() => buildBubbles($('[data-w="bubbles"]', root)));
  safe(() => buildTrailCard($('[data-w="trail"]', root)));
  try { window.dispatchEvent(new CustomEvent("ask:renderlaunch")); } catch (e) {}
}

// 🎰 扭蛋机
function buildGacha(card) {
  card.innerHTML = `<h3 class="cw-h">🎰 知识扭蛋</h3><p class="cw-sub">投币，掉一颗胶囊</p>
    <div class="gacha"><div class="gacha-m">🎰</div><div class="capsule"></div></div>
    <button class="cw-btn">扭！</button><div class="gacha-out"></div>`;
  const cap = card.querySelector(".capsule"), out = card.querySelector(".gacha-out"), m = card.querySelector(".gacha-m");
  card.querySelector(".cw-btn").onclick = () => {
    m.classList.remove("shake"); void m.offsetWidth; m.classList.add("shake");
    cap.className = "capsule drop";
    setTimeout(() => {
      cap.classList.add("open"); const r = randRec();
      out.innerHTML = `<div class="cap-card"><span class="g-tag">${esc(labelCat(r.cat))} · ${esc(diffLabel(r.diff))}</span><b>${esc(Q(r))}</b><button class="cap-go" data-id="${r.id}">揭晓 / 查看</button></div>`;
      out.querySelector("button").onclick = () => gotoDetail(r.id);
    }, 650);
  };
}

// 🎡 幸运转盘
function buildWheel(card) {
  const cats = Object.entries(CONFIG.CATS), n = cats.length, seg = 360 / n;
  const pt = (cx, cy, rad, deg) => { const r = deg * Math.PI / 180; return [cx + rad * Math.sin(r), cy - rad * Math.cos(r)]; };
  let slices = "";
  cats.forEach(([c, m], i) => {
    const [x0, y0] = pt(100, 100, 100, i * seg), [x1, y1] = pt(100, 100, 100, (i + 1) * seg);
    slices += `<path d="M100,100 L${x0.toFixed(1)},${y0.toFixed(1)} A100,100 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${CATCOLOR[c] || "#0ea5a0"}" opacity=".85"/>`;
    const [lx, ly] = pt(100, 100, 66, i * seg + seg / 2);
    slices += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8">${esc(m.z.slice(0, 3))}</text>`;
  });
  card.innerHTML = `<h3 class="cw-h">🎡 幸运转盘</h3><p class="cw-sub">转到哪科，抽哪科</p>
    <div class="wheel-wrap"><svg viewBox="0 0 200 200" class="wheel">${slices}</svg><div class="wheel-ptr">▼</div></div>
    <button class="cw-btn">转！</button><div class="wheel-out"></div>`;
  const wheel = card.querySelector(".wheel"), out = card.querySelector(".wheel-out");
  card.querySelector(".cw-btn").onclick = () => {
    const idx = Math.floor(Math.random() * n);
    const deg = 360 * 5 + (360 - (idx * seg + seg / 2));
    wheel.style.transition = "transform 3s cubic-bezier(.17,.67,.3,1)";
    wheel.style.transform = `rotate(${deg}deg)`;
    setTimeout(() => {
      const [c] = cats[idx]; const pool = state.records.filter((r) => r.cat === c);
      const r = pool[Math.floor(Math.random() * pool.length)];
      wheel.classList.add("win");
      if (r) { out.innerHTML = `<button class="wheel-q" data-id="${r.id}">${esc(Q(r))}</button>`; out.querySelector("button").onclick = () => gotoDetail(r.id); }
    }, 3100);
  };
}

// 🔮 魔法 8 球
function build8ball(card) {
  card.innerHTML = `<h3 class="cw-h">🔮 魔法 8 球</h3><p class="cw-sub">问科学，摇一摇</p>
    <div class="ball8"><div class="ball8-ans">?</div></div>
    <button class="cw-btn">摇一摇</button>`;
  const ans = card.querySelector(".ball8-ans"), ball = card.querySelector(".ball8");
  card.querySelector(".cw-btn").onclick = () => {
    ball.classList.remove("shake"); void ball.offsetWidth; ball.classList.add("shake");
    setTimeout(() => { ans.style.animation = "none"; void ans.offsetWidth; ans.style.animation = "fadeIn .45s ease"; ans.textContent = VERDICTS[Math.floor(Math.random() * VERDICTS.length)]; }, 500);
  };
}

// 🎲 知识骰子
function buildDie(card) {
  card.innerHTML = `<h3 class="cw-h">🎲 知识骰子</h3><p class="cw-sub">掷出几，玩哪种</p>
    <div class="die"><span class="die-n">6</span></div>
    <button class="cw-btn">掷！</button>`;
  const die = card.querySelector(".die"), nEl = card.querySelector(".die-n");
  const map = ["blind", "quiz", "guess", "timed", "link", "sort"];
  let cur = 6;
  card.querySelector(".cw-btn").onclick = () => {
    die.classList.remove("roll"); void die.offsetWidth; die.classList.add("roll");
    cur = 1 + Math.floor(Math.random() * 6);
    setTimeout(() => { nEl.textContent = cur; }, 250);
  };
  die.onclick = () => startMode(map[(cur - 1) % 6]);
}

// 🪙 许愿池
function buildWell(card) {
  const f = todayFortune();
  card.innerHTML = `<h3 class="cw-h">🪙 许愿池</h3><p class="cw-sub">投一枚硬币，听科学说</p>
    <div class="well"><div class="well-water"></div><div class="coin">🪙</div></div>
    <button class="cw-btn">投币</button><div class="well-out"></div>`;
  const coin = card.querySelector(".coin"), out = card.querySelector(".well-out");
  card.querySelector(".cw-btn").onclick = () => {
    coin.classList.remove("drop"); void coin.offsetWidth; coin.classList.add("drop");
    setTimeout(() => { out.innerHTML = `<div class="fortune">${f.yi}<br>${f.ji}</div>`; }, 600);
  };
}

// 🎯 刮刮乐
function buildScratch(card) {
  let r = randRec();
  function paint() {
    card.innerHTML = `<h3 class="cw-h">🎯 刮刮乐</h3><p class="cw-sub">刮开涂层，看答案</p>
      <div class="scratch"><div class="scratch-ans"><b>${esc(Q(r))}</b><br>${esc(S(r))}</div>
      <canvas class="scratch-cv"></canvas></div>
      <button class="cw-btn">换一张 ↻</button>`;
    const cv = card.querySelector(".scratch-cv");
    const w = Math.min(340, Math.max(220, (card.clientWidth || 280) - 34));
    cv.width = w; cv.height = 120; cv.style.width = w + "px"; cv.style.height = "120px";
    wireScratch(cv);
    card.querySelector(".cw-btn").onclick = () => { r = randRec(); paint(); };
  }
  paint();
}

// 🪐 星系（原分类网格，保留）
function buildGalaxy(card, lit) {
  const cats = Object.entries(CONFIG.CATS);
  card.innerHTML = `<h3 class="cw-h">🪐 你的星系 <small>${lit}/12</small></h3>
    <div class="galaxy">${cats.map(([c, m]) => {
      const n = P.stats.byCat[c] || 0, pct = Math.min(100, Math.round(n / PLANET_TH * 100)), done = n >= PLANET_TH;
      return `<a class="planet ${done ? "done" : ""}" href="cat/${c}.html" style="--c:${CATCOLOR[c] || "#0ea5a0"}"><span class="p-ring" style="--p:${pct}"></span><b>${esc(m.z)}</b><i>${n}/${PLANET_TH}</i></a>`;
    }).join("")}</div>`;
}
function buildModes(card) {
  const modes = [["blind", "🎲", "知识盲盒"], ["quiz", "🧠", "考考你"], ["guess", "🤔", "猜猜看"], ["timed", "⏱️", "限时抢答"], ["link", "🔗", "知识连线"], ["sort", "🃏", "分类挑战"], ["truefalse", "✅", "判断对错"], ["fill", "🔤", "选词填空"], ["match", "🔗", "连连看"]];
  card.innerHTML = `<h3 class="cw-h">🎮 更多玩法</h3><div class="mode-chips">${modes.map(([n, ic, t]) => `<button class="mode-chip" data-g="${n}">${ic} ${t}</button>`).join("")}</div>`;
  card.querySelectorAll(".mode-chip").forEach((b) => b.onclick = () => startMode(b.dataset.g));
}
function buildTicker(card) {
  const items = sample(state.records, 14);
  const one = items.map((r) => `<span class="tk-item" data-id="${r.id}">${esc(Q(r))}</span>`).join('<span class="tk-sep">·</span>');
  card.innerHTML = `<h3 class="cw-h">📜 冷知识跑马灯</h3><div class="ticker"><div class="ticker-track">${one}${one}</div></div>`;
  card.querySelectorAll(".tk-item").forEach((b) => b.onclick = () => gotoDetail(b.dataset.id));
}
function buildBubbles(card) {
  const items = sample(state.records, 11);
  const icons = ["💡", "🔭", "🧪", "🌟", "❓", "🔬", "🌈", "⚡", "🪐", "💫", "🔥"];
  card.innerHTML = `<h3 class="cw-h">🫧 漂浮题泡泡</h3><p class="cw-sub">点破任意泡泡，读一题</p><div class="bubble-pool"></div>`;
  const pool = card.querySelector(".bubble-pool");
  items.forEach((r, i) => {
    const b = document.createElement("button"); b.className = "bubble"; b.dataset.id = r.id;
    b.style.left = (4 + Math.random() * 86) + "%"; b.style.top = (8 + Math.random() * 74) + "%";
    b.style.animationDelay = (-Math.random() * 9) + "s"; b.style.setProperty("--c", CATCOLOR[r.cat] || "#0ea5a0");
    b.textContent = icons[i % icons.length];
    b.onclick = (e) => { e.stopPropagation(); b.style.animation = "pop .3s forwards"; setTimeout(() => gotoDetail(r.id), 220); };
    pool.appendChild(b);
  });
}
function buildTrailCard(card) {
  const h = renderTrail(); if (!h) { card.remove(); return; }
  card.innerHTML = h; card.querySelectorAll(".trail-dot").forEach((b) => b.onclick = () => gotoDetail(b.dataset.id));
}

function renderTrail() {
  let h = [];
  migrateKey("ask_history");
  try { h = JSON.parse(localStorage.getItem("ask_history") || "[]"); } catch (e) {}
  h = h.slice(0, 6).map((q) => state.records.find((r) => Q(r) === q || r.q[0] === q)).filter(Boolean);
  if (!h.length) return "";
  return `<h3 class="cw-h">✨ 探索足迹</h3><div class="trail">${h.map((r) => `<button class="trail-dot" data-id="${r.id}"><span class="td-q">${esc(Q(r))}</span><span class="td-c" style="color:${CATCOLOR[r.cat] || "#888"}">${esc(labelCat(r.cat))}</span></button>`).join("")}</div>`;
}

// ---------------- 儿童模式：启动台 + 三个轻互动玩法 ----------------
function kidSpeakText(r) {
  const i = lang() === "en" ? 1 : 0;
  const q = r.q[i] || r.q[0];
  const a = (r.s && r.s[i]) || (r.s && r.s[0]) || "";
  return q + (a ? "。 " + a : "");
}
function renderKidsLaunch(root) {
  const lit = Object.keys(P.stats.byCat).filter((c) => (P.stats.byCat[c] || 0) >= PLANET_TH).length;
  root.innerHTML = `<div class="kids-launch">
    <div class="kids-banner">🌟 小朋友的科学乐园 <small>${lit}/12 星球亮起啦</small></div>
    <div class="kids-grid">
      <button class="kcard" data-m="blind"><span class="kic">🎲</span><b>抽一题</b><i>随机来个问题</i></button>
      <button class="kcard" data-m="story"><span class="kic">🔊</span><b>听故事</b><i>念给你听</i></button>
      <button class="kcard" data-m="truefalse"><span class="kic">✅</span><b>对还是错</b><i>判断对错</i></button>
      <button class="kcard" data-m="fill"><span class="kic">🔤</span><b>填填空</b><i>选词补全</i></button>
      <button class="kcard" data-m="match"><span class="kic">🔗</span><b>连连看</b><i>配对游戏</i></button>
      <button class="kcard" data-m="safari"><span class="kic">🪐</span><b>我的星球</b><i>已点亮 ${lit}/12</i></button>
    </div></div>`;
  root.querySelectorAll(".kcard").forEach((b) => b.onclick = () => {
    const m = b.dataset.m;
    if (m === "story") { const r = randRec(); if (speak(kidSpeakText(r), lang())) toast("🔊 " + (Q(r))); else toast("这个浏览器不支持朗读哦"); return; }
    startMode(m);
  });
}

// ✅❌ 判断对错
function playTrueFalse(body) {
  let round = 0, score = 0;
  function item() {
    const r = randRec();
    const others = sample(recPool().filter((x) => x.id !== r.id), 3);
    const correct = Math.random() < 0.5;
    const cand = correct ? r : others[Math.floor(Math.random() * others.length)];
    const candAns = S(cand);
    body.innerHTML = `<div class="g-card kids-card">
      <div class="g-tag">对还是错？（第 ${round + 1} 题）</div>
      <h3 class="g-q">${esc(Q(r))}</h3>
      <div class="tf-ans">${esc(candAns)}</div>
      <div class="g-actions"><button class="g-right big">✅ 对</button><button class="g-wrong big">❌ 错</button></div>
      <div class="g-fb"></div><button class="back-launch">← 返回乐园</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    const fb = body.querySelector(".g-fb");
    body.querySelector(".g-right").onclick = () => judge(true);
    body.querySelector(".g-wrong").onclick = () => judge(false);
    function judge(pick) {
      const ok = (pick === correct);
      if (ok) { score++; gain(10); fb.innerHTML = `<span class="ok">✅ 答对啦！+10</span>`; } else { fb.innerHTML = `<span class="bad">❌ 正确答案：${esc(cand === r ? "对，这就是答案" : "错，这不是答案")}</span>`; }
      renderHUD(); checkBadges(); setTimeout(item, 1100);
    }
    round++;
  }
  item();
}

// 🔤 选词填空
function playFill(body) {
  let round = 0, score = 0;
  const reCJK = /[一-鿿]{2,4}/g, reEn = /[A-Za-z]{3,}/g;
  function chunkOf(s) {
    const cs = []; let m;
    while ((m = reCJK.exec(s))) cs.push(m[0]);
    while ((m = reEn.exec(s))) cs.push(m[0]);
    return cs.length ? cs[Math.floor(Math.random() * cs.length)] : null;
  }
  function item() {
    const r = randRec(); let s = S(r);
    if (!s) { item(); return; }
    const chunk = chunkOf(s);
    if (!chunk) { item(); return; }
    const dist = sample(recPool().map((x) => chunkOf(S(x))).filter(Boolean).filter((c) => c !== chunk), 2);
    if (dist.length < 2) { item(); return; }
    const opts = shuffle([chunk, dist[0], dist[1]]);
    const blanked = s.split(chunk).join("＿＿＿");
    body.innerHTML = `<div class="g-card kids-card">
      <div class="g-tag">选词填空（第 ${round + 1} 题）</div>
      <h3 class="g-q">${esc(Q(r))}</h3>
      <div class="fill-ans">${esc(blanked)}</div>
      <div class="g-opts">${opts.map((o, i) => `<button class="g-opt" data-i="${i}">${esc(o)}</button>`).join("")}</div>
      <div class="g-fb"></div><button class="back-launch">← 返回乐园</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    const fb = body.querySelector(".g-fb");
    body.querySelectorAll(".g-opt").forEach((b) => b.onclick = () => {
      const pick = opts[+b.dataset.i];
      if (pick === chunk) { score++; gain(10); fb.innerHTML = `<span class="ok">✅ 填对啦！+10</span>`; } else { fb.innerHTML = `<span class="bad">❌ 正确答案是：${esc(chunk)}</span>`; }
      renderHUD(); checkBadges(); setTimeout(item, 1100);
    });
    round++;
  }
  item();
}

// 🔗 连连看（问题 ↔ 学科）
function playMatch(body) {
  const set = sample(recPool(), 3); const subs = shuffle(set.map((r) => r.cat));
  const matched = new Set(); let selQ = null;
  function render() {
    body.innerHTML = `<div class="g-card kids-card">
      <div class="g-tag">连连看 · 把问题和学科连起来（${matched.size}/3）</div>
      <div class="g-qlist">${set.map((r, i) => `<button class="g-q2 ${selQ === i ? "sel" : ""} ${matched.has(i) ? "done" : ""}" data-i="${i}"><span class="qem">${emojiFor(r)}</span>${esc(Q(r))}</button>`).join("")}</div>
      <div class="g-subs">${subs.map((c, j) => `<button class="g-sub2" data-j="${j}"><span class="sem">${CAT_EMOJI[c] || "💡"}</span>${esc(labelCat(c))}</button>`).join("")}</div>
      <div class="g-fb"></div><button class="back-launch">← 返回乐园</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    body.querySelectorAll(".g-q2").forEach((b) => b.onclick = () => { if (matched.has(+b.dataset.i)) return; selQ = +b.dataset.i; render(); });
    body.querySelectorAll(".g-sub2").forEach((b) => b.onclick = () => {
      if (selQ == null) return; const i = selQ, c = subs[+b.dataset.j];
      if (set[i].cat === c) { matched.add(i); gain(15); body.querySelector(".g-fb").innerHTML = `<span class="ok">✅ 连上了！</span>`; }
      else body.querySelector(".g-fb").innerHTML = `<span class="bad">❌ 不对，再试试</span>`;
      selQ = null; checkBadges();
      if (matched.size >= 3) body.querySelector(".g-fb").innerHTML = `<span class="ok">🎉 全部连对！</span>`; else render();
    });
  }
  render();
}

// ---------------- 模式：在启动台原地展开，不再开面板 ----------------
const MODES = { blind: playBlind, quiz: playQuiz, guess: playGuess, daily: playDaily, safari: playSafari, timed: playTimed, sort: playSort, link: playLink, truefalse: playTrueFalse, fill: playFill, match: playMatch };
export function startMode(name, seed) {
  const root = $("#launch"); if (!root) return;
  root.innerHTML = `<button class="back-launch">← 返回启动台</button><div class="play-area"></div>`;
  root.querySelector(".back-launch").onclick = renderLaunch;
  (MODES[name] || playBlind)(root.querySelector(".play-area"), seed);
}

// ---------------- 各玩法（back 回启动台，详情跳转走事件） ----------------
function playBlind(body) {
  const r = randRec(); awardRead(r);
  body.innerHTML = `<div class="g-card">
    <div class="g-tag">${esc(labelCat(r.cat))} · ${esc(diffLabel(r.diff))}</div>
    <h3 class="g-q">${esc(Q(r))}</h3>
    <div class="g-ans" hidden>${esc(S(r))}</div>
    <div class="g-actions">
      <button class="g-reveal">揭晓答案</button>
      <button class="g-fav">⭐ ${P.favs[r.id] ? "已收藏" : "收藏"}</button>
      <button class="g-master">✓ 已掌握</button>
      <button class="g-view">查看详情</button>
      <button class="g-next">下一题 →</button>
    </div></div>`;
  body.querySelector(".g-reveal").onclick = (e) => { e.target.hidden = true; body.querySelector(".g-ans").hidden = false; P.stats.blind++; save(); };
  body.querySelector(".g-fav").onclick = (e) => { const on = toggleFav(r); e.target.textContent = "⭐ " + (on ? "已收藏" : "收藏"); };
  body.querySelector(".g-master").onclick = (e) => { toggleMaster(r); e.target.textContent = "✓ 已掌握"; toast("已标记为掌握 ✅"); };
  body.querySelector(".g-view").onclick = () => gotoDetail(r.id);
  body.querySelector(".g-next").onclick = () => playBlind(body);
}

// 分类页入口：限定学科的盲盒
function playCatBlind(body, cat) {
  const pool = recPool().filter((r) => r.cat === cat);
  if (!pool.length) { playBlind(body); return; }
  function one() {
    const r = pool[Math.floor(Math.random() * pool.length)]; awardRead(r);
    body.innerHTML = `<div class="g-card"><div class="g-tag">${esc(labelCat(cat))} · 知识盲盒</div>
      <h3 class="g-q">${esc(Q(r))}</h3><div class="g-ans" hidden>${esc(S(r))}</div>
      <div class="g-actions"><button class="g-reveal">揭晓答案</button><button class="g-view">查看详情</button><button class="g-next">下一题 →</button></div></div>`;
    body.querySelector(".g-reveal").onclick = (e) => { e.target.hidden = true; body.querySelector(".g-ans").hidden = false; };
    body.querySelector(".g-view").onclick = () => gotoDetail(r.id);
    body.querySelector(".g-next").onclick = one;
  }
  one();
}
export function startCatBlind(cat) {
  const root = $("#launch"); if (!root) return;
  root.innerHTML = `<button class="back-launch">← 返回启动台</button><div class="play-area"></div>`;
  root.querySelector(".back-launch").onclick = renderLaunch;
  playCatBlind(root.querySelector(".play-area"), cat);
}

function playQuiz(body, seed) {
  const list = (seed && seed.length) ? seed.map(recById).filter(Boolean) : sample(recPool(), 5);
  let i = 0, correct = 0;
  function item() {
    if (i >= list.length) {
      body.innerHTML = `<div class="g-card"><h3>🧠 完成！</h3><p>本组答对 <b>${correct}</b> / ${list.length}</p><button class="back-launch">← 返回启动台</button></div>`;
      body.querySelector(".back-launch").onclick = renderLaunch; return;
    }
    const r = list[i]; awardRead(r);
    body.innerHTML = `<div class="g-card"><div class="g-tag">考考你 ${i + 1}/${list.length}</div>
      <h3 class="g-q">${esc(Q(r))}</h3>
      <div class="g-ans" hidden>${esc(S(r))}</div>
      <div class="g-actions"><button class="g-reveal">揭晓</button><button class="g-right" hidden>我答对了 ✓</button><button class="g-wrong" hidden>答错了 ✗</button></div>
      <button class="back-launch">← 返回启动台</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    const ans = body.querySelector(".g-ans"), rev = body.querySelector(".g-reveal"), right = body.querySelector(".g-right"), wrong = body.querySelector(".g-wrong");
    rev.onclick = () => { ans.hidden = false; rev.hidden = true; right.hidden = false; wrong.hidden = false; };
    right.onclick = () => { correct++; P.stats.quizCorrect++; P.stats.quizTotal++; gain(12); i++; item(); };
    wrong.onclick = () => { P.stats.quizTotal++; i++; item(); };
  }
  item();
}

function playGuess(body) {
  let combo = 0;
  function round() {
    const pool = sample(recPool(), 4); const target = pool[Math.floor(Math.random() * 4)];
    body.innerHTML = `<div class="g-card">
      <div class="g-tag">猜猜看 · 看答案，猜问题（连击 ${combo}）</div>
      <div class="g-ans-show">${esc(S(target))}</div>
      <div class="g-opts">${pool.map((r, i) => `<button class="g-opt" data-i="${i}">${esc(Q(r))}</button>`).join("")}</div>
      <div class="g-fb"></div>
      <button class="back-launch">← 返回启动台</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    body.querySelectorAll(".g-opt").forEach((b) => b.onclick = () => {
      const pick = pool[+b.dataset.i]; const fb = body.querySelector(".g-fb");
      P.stats.guessTotal++;
      if (pick.id === target.id) { combo++; P.stats.guessCorrect++; gain(15); fb.innerHTML = `<span class="ok">✅ 答对！连击 ${combo}</span>`; }
      else { combo = 0; fb.innerHTML = `<span class="bad">❌ 正确答案是：${esc(Q(target))}</span>`; }
      save(); renderHUD(); checkBadges(); setTimeout(round, 950);
    });
  }
  round();
}

function playDaily(body) {
  const d = new Date(); const key = dateStr(d);
  const recs = dailyRecs();
  const doneToday = P.stats.dailyDone === key;
  if (!doneToday) {
    P.stats.dailyDone = key;
    const y = new Date(d.getTime() - 864e5); const yk = dateStr(y);
    P.stats.dailyStreak = (P.stats.lastDaily === yk) ? (P.stats.dailyStreak || 0) + 1 : 1;
    P.stats.lastDaily = key; gain(30);
  }
  body.innerHTML = `<div class="g-card">
    <div class="g-tag">📅 每日挑战 ${doneToday ? "（今日已完成）" : "（完成 +30 经验）"}</div>
    <p>每日连续挑战：<b>🔥 ${P.stats.dailyStreak || 0}</b> 天</p>
    <div class="g-daily">${recs.map((r) => `<div class="g-ditem"><b>${esc(Q(r))}</b><button class="g-view" data-id="${r.id}">看答案</button></div>`).join("")}</div>
    <button class="back-launch">← 返回启动台</button></div>`;
  body.querySelector(".back-launch").onclick = renderLaunch;
  body.querySelectorAll(".g-view").forEach((b) => b.onclick = () => gotoDetail(b.dataset.id));
}

function playSafari(body) {
  const cats = Object.entries(CONFIG.CATS);
  const lit = cats.filter(([c]) => (P.stats.byCat[c] || 0) >= PLANET_TH).length;
  body.innerHTML = `<div class="g-card">
    <div class="g-tag">🪐 星球探险 · 读题充能，集齐 12 星球（已点亮 ${lit}/12）</div>
    <div class="g-galaxy">${cats.map(([c, m]) => {
      const n = P.stats.byCat[c] || 0; const pct = Math.min(100, Math.round(n / PLANET_TH * 100)); const done = n >= PLANET_TH;
      return `<button class="g-planet ${done ? "done" : ""}" data-c="${c}" style="--c:${CATCOLOR[c] || "#0ea5a0"}"><span class="g-ring" style="--p:${pct}"></span><b>${esc(m.z)}</b><i>${n}/${PLANET_TH}</i></button>`;
    }).join("")}</div>
    <div class="g-fb">${lit >= 12 ? "🌌 银河集齐！你已是银河旅人" : "继续读书，点亮更多星球"}</div>
    <button class="back-launch">← 返回启动台</button></div>`;
  body.querySelector(".back-launch").onclick = renderLaunch;
  body.querySelectorAll(".g-planet").forEach((b) => b.onclick = () => {
    const pool = recPool().filter((r) => r.cat === b.dataset.c);
    if (pool.length) gotoDetail(pool[Math.floor(Math.random() * pool.length)].id);
  });
}

function playTimed(body) {
  let time = 60, score = 0, alive = true;
  body.innerHTML = `<div class="g-card"><div class="g-tag">⏱️ 限时抢答 · 看答案猜问题</div>
    <div class="g-time">⏱️ <b>60</b>s · 得分 <b class="g-score">0</b></div>
    <div class="g-body"></div>
    <button class="back-launch">放弃</button></div>`;
  const timeEl = body.querySelector(".g-time b"), scoreEl = body.querySelector(".g-score");
  body.querySelector(".back-launch").onclick = () => { alive = false; clearInterval(iv); renderLaunch(); };
  function end() { alive = false; clearInterval(iv); if (score > P.stats.timedBest) { P.stats.timedBest = score; save(); } renderHUD(); checkBadges(); body.innerHTML = `<div class="g-card"><h3>⏱️ 时间到！</h3><p>答对 <b>${score}</b> 题 · 历史最佳 <b>${P.stats.timedBest}</b></p><button class="back-launch">← 返回启动台</button></div>`; body.querySelector(".back-launch").onclick = renderLaunch; }
  function round() {
    if (!alive) return;
    const pool = sample(recPool(), 4); const target = pool[Math.floor(Math.random() * 4)];
    body.querySelector(".g-body").innerHTML = `<div class="g-ans-show">${esc(S(target))}</div>
      <div class="g-opts">${pool.map((r, i) => `<button class="g-opt" data-i="${i}">${esc(Q(r))}</button>`).join("")}</div>`;
    body.querySelectorAll(".g-opt").forEach((b) => b.onclick = () => {
      if (!alive) return; const pick = pool[+b.dataset.i];
      if (pick.id === target.id) { score++; gain(15); } timeEl.textContent = time; scoreEl.textContent = score; round();
    });
  }
  const iv = setInterval(() => { if (!alive) return; time--; timeEl.textContent = time; if (time <= 0) end(); }, 1000);
  round();
}

function playSort(body) {
  let ok = 0, to = 0;
  function round() {
    const r = randRec();
    const subs = Object.entries(CONFIG.CATS).map(([c, m]) => `<button class="g-sub" data-c="${c}">${esc(L([m.z, m.e]))}</button>`).join("");
    body.innerHTML = `<div class="g-card"><div class="g-tag">分类挑战 · 把问题分到正确学科（对 ${ok}/${to}）</div>
      <h3 class="g-q">${esc(Q(r))}</h3><div class="g-subs">${subs}</div><div class="g-fb"></div><button class="back-launch">← 返回启动台</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    body.querySelectorAll(".g-sub").forEach((b) => b.onclick = () => {
      to++; P.stats.dragTotal++;
      if (b.dataset.c === r.cat) { ok++; P.stats.dragCorrect++; gain(12); body.querySelector(".g-fb").innerHTML = `<span class="ok">✅ ${esc(labelCat(r.cat))}</span>`; }
      else body.querySelector(".g-fb").innerHTML = `<span class="bad">❌ 正确：${esc(labelCat(r.cat))}</span>`;
      save(); renderHUD(); checkBadges(); setTimeout(round, 800);
    });
  }
  round();
}

function playLink(body) {
  const set = sample(recPool(), 3); const subs = shuffle(set.map((r) => r.cat));
  const matched = new Set(); let selQ = null;
  function render() {
    body.innerHTML = `<div class="g-card"><div class="g-tag">知识连线 · 把问题和学科连起来（${matched.size}/3）</div>
      <div class="g-qlist">${set.map((r, i) => `<button class="g-q2 ${selQ === i ? "sel" : ""} ${matched.has(i) ? "done" : ""}" data-i="${i}">${esc(Q(r))}</button>`).join("")}</div>
      <div class="g-subs">${subs.map((c, j) => `<button class="g-sub2" data-j="${j}">${esc(labelCat(c))}</button>`).join("")}</div>
      <div class="g-fb"></div><button class="back-launch">← 返回启动台</button></div>`;
    body.querySelector(".back-launch").onclick = renderLaunch;
    body.querySelectorAll(".g-q2").forEach((b) => b.onclick = () => { if (matched.has(+b.dataset.i)) return; selQ = +b.dataset.i; render(); });
    body.querySelectorAll(".g-sub2").forEach((b) => b.onclick = () => {
      if (selQ == null) return; const i = selQ, c = subs[+b.dataset.j];
      if (set[i].cat === c) { matched.add(i); gain(15); body.querySelector(".g-fb").innerHTML = `<span class="ok">✅ 连上了！</span>`; }
      else body.querySelector(".g-fb").innerHTML = `<span class="bad">❌ 不对，再试试</span>`;
      selQ = null; checkBadges();
      if (matched.size >= 3) body.querySelector(".g-fb").innerHTML = `<span class="ok">🎉 全部连对！</span>`; else render();
    });
  }
  render();
}

// ---------------- 详情页内联模式（测测我 / 猜猜看） ----------------
function startQuizMode(det, r) {
  const body = det.querySelector("#detail-body"); if (!body) return;
  const saved = body.innerHTML;
  body.innerHTML = `<div class="flip">
    <div class="flip-q">${esc(Q(r))}</div>
    <div class="flip-a" hidden>${esc(S(r))}</div>
    <div class="flip-act">
      <button class="f-reveal">揭晓答案</button>
      <button class="f-right" hidden>我答对了 ✓ +XP</button>
      <button class="f-wrong" hidden>答错了 ✗</button>
      <button class="f-exit">退出自测</button>
    </div></div>`;
  const a = body.querySelector(".flip-a"), rev = body.querySelector(".f-reveal"), right = body.querySelector(".f-right"), wrong = body.querySelector(".f-wrong");
  rev.onclick = () => { a.hidden = false; rev.hidden = true; right.hidden = false; wrong.hidden = false; };
  right.onclick = () => { P.stats.quizTotal++; P.stats.quizCorrect++; gain(12); toast("🧠 答对了！+12 经验"); body.innerHTML = saved; };
  wrong.onclick = () => { P.stats.quizTotal++; toast("🧠 再想想，已回到原题"); body.innerHTML = saved; };
  body.querySelector(".f-exit").onclick = () => { body.innerHTML = saved; };
}
function startGuessMode(det, r) {
  const body = det.querySelector("#detail-body"); if (!body) return;
  const saved = body.innerHTML;
  function round() {
    const pool = sample(state.records, 4); if (!pool.find((x) => x.id === r.id)) pool[0] = r;
    const target = r;
    body.innerHTML = `<div class="flip">
      <div class="g-tag">猜猜看 · 看答案，猜这是哪道题</div>
      <div class="flip-a-show">${esc(S(target))}</div>
      <div class="g-opts">${pool.map((x, i) => `<button class="g-opt" data-i="${i}">${esc(Q(x))}</button>`).join("")}</div>
      <div class="g-fb"></div>
      <button class="f-exit">退出</button></div>`;
    body.querySelector(".f-exit").onclick = () => { body.innerHTML = saved; };
    body.querySelectorAll(".g-opt").forEach((b) => b.onclick = () => {
      const pick = pool[+b.dataset.i]; const fb = body.querySelector(".g-fb");
      P.stats.guessTotal++;
      if (pick.id === target.id) { P.stats.guessCorrect++; gain(15); fb.innerHTML = `<span class="ok">✅ 答对！</span>`; }
      else { fb.innerHTML = `<span class="bad">❌ 正确答案是：${esc(Q(target))}</span>`; }
      save(); renderHUD(); checkBadges(); setTimeout(round, 950);
    });
  }
  round();
}

// ---------------- 详情页注入（内联，不弹窗） ----------------
export function decorateDetail(r, det) {
  if (!P) P = load();
  awardRead(r);
  const meta = det.querySelector(".meta");
  if (!meta) return;
  const wrap = document.createElement("div"); wrap.className = "game-actions";
  wrap.innerHTML = `<button data-act="fav" class="${P.favs[r.id] ? "on" : ""}">⭐ ${P.favs[r.id] ? "已收藏" : "收藏"}</button>
    <button data-act="master" class="${P.mastered[r.id] ? "on" : ""}">✓ 已掌握</button>
    <button data-act="quiz">🧠 测测我</button>
    <button data-act="guess">🤔 猜猜看</button>
    <button data-act="scratch">🎯 刮刮看</button>`;
  meta.after(wrap);
  wrap.querySelector('[data-act="fav"]').onclick = (e) => { const on = toggleFav(r); e.target.classList.toggle("on", on); e.target.textContent = "⭐ " + (on ? "已收藏" : "收藏"); };
  wrap.querySelector('[data-act="master"]').onclick = (e) => { const on = toggleMaster(r); e.target.classList.toggle("on", on); e.target.textContent = "✓ 已掌握"; toast("已标记为掌握 ✅"); };
  wrap.querySelector('[data-act="quiz"]').onclick = () => startQuizMode(det, r);
  wrap.querySelector('[data-act="guess"]').onclick = () => startGuessMode(det, r);
  wrap.querySelector('[data-act="scratch"]').onclick = () => startScratchMode(det, r);
}

function startScratchMode(det, r) {
  const body = det.querySelector("#detail-body"); if (!body) return;
  const saved = body.innerHTML;
  body.innerHTML = `<div class="flip"><div class="g-tag">🎯 刮刮看答案</div>
    <div class="scratch"><div class="scratch-ans"><b>${esc(Q(r))}</b><br>${esc(S(r))}</div>
    <canvas class="scratch-cv" width="280" height="120"></canvas></div>
    <button class="f-exit">退出刮刮乐</button></div>`;
  wireScratch(body.querySelector(".scratch-cv"));
  body.querySelector(".f-exit").onclick = () => { body.innerHTML = saved; };
}

// ---------------- 对外接口 ----------------
export function initGame() {
  P = load();
  try { migrateKey("ask_kids"); localStorage.setItem("ask_kids", "0"); } catch (e) {}
  KIDS = false; /* 儿童按钮已移除 */
  document.body.classList.toggle("kids", KIDS);
  bumpStreakOnVisit();
  renderHUD();
  renderLaunch();
}
export function markLangToggled() { if (!P) P = load(); P.stats.langToggled = true; save(); checkBadges(); }

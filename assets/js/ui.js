// UI: 启动台 + 搜索/筛选(折叠兜底) + 详情(内联游戏模式) + 主题/语言 + URL 状态
import { CONFIG } from "./config.js";
import { state, getDetail, searchQ, ensureSuggest } from "./store.js";
import * as Game from "./game.js";
import { tokenize } from "./search.js";
import { getLang, setLang, t, L } from "./i18n.js";
import { speak, stopSpeak, initTTS, isSpeaking } from "./tts.js";

const $ = (s) => document.querySelector(s);
import { esc, escRe, migrateKey } from "./util.js";

function label(map, key) { return (map[key] && L([map[key].z, map[key].e])) || key; }

function highlight(text, q) {
  const toks = tokenize(q).filter(Boolean);
  if (!toks.length) return esc(text);
  const re = new RegExp("(" + toks.map(escRe).join("|") + ")", "gi");
  return esc(text).replace(re, "<mark>$1</mark>");
}

let facet = { cat: "", diff: "", aud: "" };
let currentQ = "";
let curList = [];
let rendered = 0;
const BATCH = 60;
let io = null, sentinel = null;
let curSug = [], activeSug = -1, histTimer = null;
const HIST_KEY = "ask_history";

function getHistory() { migrateKey(HIST_KEY); try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { return []; } }
function pushHistory(q) {
  if (!q) return;
  let h = getHistory().filter((x) => x !== q);
  h.unshift(q); h = h.slice(0, 8);
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
}
const hasFacet = () => !!(facet.cat || facet.diff || facet.aud);

// ---------- 惊喜交互 (Whimsy) ----------
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2200);
}
function spawnConfetti(n = 28) {
  const colors = ["#5B8DEF", "#14b8a6", "#34d399", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee", "#fb923c"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div"); c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (1.4 + Math.random() * 1.2) + "s";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}
function celebrate(next) {
  spawnConfetti();
  toast(next === "dark" ? "🌙 切换到夜间模式，护眼 ✨" : "☀️ 切换到日间模式，明亮 ✨");
}
function setupKonami() {
  const seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let buf = [];
  document.addEventListener("keydown", (e) => {
    buf.push(e.key); buf = buf.slice(-seq.length);
    if (buf.join(",") === seq.join(",")) {
      document.body.classList.add("rainbow");
      toast("🌈 彩虹模式已开启！你找到了隐藏彩蛋");
      setTimeout(() => document.body.classList.remove("rainbow"), 8000);
    }
  });
}
function fillHero() {
  const el = document.getElementById("stat-total");
  if (!el) return;
  const target = state.records ? state.records.length : 0;
  if (!target) { el.textContent = "—"; return; }
  let cur = 0; const step = Math.max(1, Math.round(target / 40));
  const tick = () => {
    cur = Math.min(target, cur + step);
    el.textContent = cur.toLocaleString();
    if (cur < target) requestAnimationFrame(tick);
  };
  tick();
}

// ---------- 儿童模式 UI 切换 ----------
function applyKidsUI() {
  const h1 = document.querySelector(".hero h1");
  const p = document.querySelector(".hero p");
  const ctaBlind = document.getElementById("cta-blind");
  const ctaDaily = document.getElementById("cta-daily");
  const ctaResume = document.getElementById("cta-resume");
  if (Game.isKids()) {
    if (h1) h1.innerHTML = '小朋友的<span class="grad">科学乐园</span>';
    if (p) p.textContent = "和问答一起，用游戏发现世界的「为什么」！点一点、听一听、玩一玩。";
    if (ctaBlind) ctaBlind.textContent = "🎲 抽一题";
    if (ctaDaily) ctaDaily.textContent = "📅 今日三题";
    if (ctaResume) ctaResume.textContent = "🪐 继续探险";
  } else {
    if (h1) h1.innerHTML = '开始你的<span class="grad">科学冒险</span>';
    if (p) p.textContent = "问答是一座全学科、全难度的中英双语科学问答总库。用游戏的方式去提问、去解答、去探索。";
    if (ctaBlind) ctaBlind.textContent = "🎲 抽一题盲盒";
    if (ctaDaily) ctaDaily.textContent = "📅 今日挑战";
    if (ctaResume) ctaResume.textContent = "🪐 继续你的星系";
  }
}

export function paint() {
  const lang = getLang();
  document.documentElement.lang = lang;
  $("#lang").textContent = t("langBtn");
  applyTheme(savedTheme());
  $("#q").setAttribute("placeholder", t("search"));
  // 注：启动台(含折叠筛选 #filters)由 game.js 在 initGame() 中渲染，这里不重建分类网格
}

function savedTheme() {
  const s = localStorage.getItem("theme");
  if (s) return s;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(mode) {
  document.documentElement.classList.remove("dark", "light");
  if (mode) document.documentElement.classList.add(mode);
}

function chip(group, val, text, active) {
  return `<button class="chip${active ? " active" : ""}" data-group="${group}" data-val="${val}">${esc(text)}</button>`;
}
function buildFilters() {
  const fb = $("#filters");
  if (!fb) return; // 启动台尚未渲染时跳过
  const subj = [["", null]].concat(Object.entries(CONFIG.CATS));
  const diffs = [["", null]].concat(["1", "2", "3"].map((k) => [k, CONFIG.DIFF[k]]));
  const auds = [["", null]].concat(Object.entries(CONFIG.AUD));
  const grp = (labelTxt, arr) => `<span class="fgroup"><span class="flabel">${labelTxt}</span>` +
    arr.map(([k, m]) => {
      const txt = k === "" ? t("all") : L([m.z, m.e]);
      return chip(k, k, txt, facet[k] === k);
    }).join("") + `</span>`;
  fb.innerHTML = `<div class="filterbar">${grp(t("subject"), subj)}${grp(t("level"), diffs)}${grp(t("forwhom"), auds)}</div>`;
  fb.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
    const g = b.dataset.group, v = b.dataset.val;
    facet[g] = (facet[g] === v) ? "" : v;
    buildFilters();
    commit(true);
  }));
}

export function bind() {
  const q = $("#q");
  q.addEventListener("input", () => {
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      currentQ = q.value.trim();
      if (currentQ) { renderSuggest(currentQ); runSearch(); writeUrl(false); }
      else { hideSuggest(); showHistory(); showHome(); writeUrl(false); }
    }, 180);
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (activeSug >= 0 && curSug[activeSug]) { q.value = curSug[activeSug]; currentQ = curSug[activeSug]; }
      hideSuggest(); q.blur(); commit(true);
    } else if (e.key === "ArrowDown") { e.preventDefault(); moveSug(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSug(-1); }
    else if (e.key === "Escape") { hideSuggest(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) hideSuggest(); });

  // Hero 主 CTA：把游戏机制作为第一入口
  const ctaResume = $("#cta-resume");
  if (ctaResume) ctaResume.onclick = () => {
    const g = $(".galaxy"); if (g) g.scrollIntoView({ behavior: "smooth", block: "center" });
    const lit = document.querySelectorAll(".planet.done").length;
    toast(`🪐 继续探索你的星系（已点亮 ${lit}/12）`);
  };
  const ctaBlind = $("#cta-blind");
  if (ctaBlind) ctaBlind.onclick = () => Game.startMode("blind");
  const ctaDaily = $("#cta-daily");
  if (ctaDaily) ctaDaily.onclick = () => Game.startMode("daily");

  $("#lang").addEventListener("click", () => {
    setLang(getLang() === "zh" ? "en" : "zh");
    Game.markLangToggled();
    paint();
    if (currentQ || hasFacet()) runSearch(); else showHome();
  });
  $("#theme").addEventListener("click", () => {
    const cur = document.documentElement.classList.contains("dark") ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next); localStorage.setItem("theme", next);
    celebrate(next);
  });
  const kidsBtn = document.getElementById("kids");
  if (kidsBtn) kidsBtn.onclick = () => {
    Game.setKids(!Game.isKids());
    kidsBtn.classList.toggle("on", Game.isKids());
    kidsBtn.textContent = Game.isKids() ? "🧒 儿童 ✓" : "🧒 儿童";
    applyKidsUI();
    if (currentQ || hasFacet()) runSearch(); else showHome();
  };
  setupKonami();
  window.addEventListener("ask:show", (e) => showDetail(e.detail.id));
  window.addEventListener("ask:renderlaunch", () => buildFilters());
  $("#suggest").addEventListener("click", (e) => {
    const d = e.target.closest("[data-q]");
    if (!d) return;
    q.value = d.dataset.q; currentQ = d.dataset.q; hideSuggest(); commit(true);
  });
  $("#detail").addEventListener("click", (e) => {
    const b = e.target.closest(".back");
    if (b) { e.preventDefault(); writeUrl(false); showHome(); }
  });
}

// ---------- suggestions + history ----------
function renderSuggest(q) {
  // 联想词典懒加载:首次调用才拉取;过期响应直接丢弃
  ensureSuggest().then((dict) => {
    if (q !== currentQ) return;
    const box = $("#suggest");
    const hq = q.toLowerCase();
    const hits = (dict || []).filter((s) => s && s.toLowerCase().startsWith(hq)).slice(0, 8);
    curSug = hits; activeSug = -1;
    if (!hits.length) { hideSuggest(); return; }
    box.innerHTML = hits.map((h, i) => `<div data-q="${esc(h)}" class="${i === activeSug ? "active" : ""}">${esc(h)}</div>`).join("");
    box.hidden = false;
  });
}
function showHistory() {
  const h = getHistory();
  if (!h.length) { hideSuggest(); return; }
  curSug = h; activeSug = -1;
  const box = $("#suggest");
  box.innerHTML = `<div class="sughead">${t("history")}</div>` + h.map((x) => `<div data-q="${esc(x)}">${esc(x)}</div>`).join("");
  box.hidden = false;
}
function moveSug(d) {
  if (!curSug.length) return;
  activeSug = (activeSug + d + curSug.length) % curSug.length;
  const box = $("#suggest");
  box.querySelectorAll("div[data-q]").forEach((el, i) => el.classList.toggle("active", i === activeSug));
  const sel = box.querySelector("div[data-q].active");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}
function hideSuggest() { const box = $("#suggest"); box.hidden = true; box.innerHTML = ""; curSug = []; activeSug = -1; }

// ---------- 首页 / 搜索 切换 ----------
function showHome() {
  $("#detail").hidden = true;
  $("#results").hidden = true; $("#results").innerHTML = "";
  const l = $("#launch");
  if (l) { l.hidden = false; Game.renderLaunch(); }
  buildFilters(); // 重建折叠筛选（renderLaunch 会重建空的 #filters）
}
function hideHome() { const l = $("#launch"); if (l) l.hidden = true; }

// ---------- search + progressive render ----------
async function searchWithFacet() {
  let base;
  if (currentQ) base = await searchQ(currentQ);
  else base = state.records.map((r) => ({ r, score: 0, hot: r.hot }));
  base = base.filter((x) => {
    if (facet.cat && x.r.cat !== facet.cat) return false;
    if (facet.diff && String(x.r.diff) !== facet.diff) return false;
    if (facet.aud && x.r.aud !== facet.aud) return false;
    if (Game.isKids() && !(Game.KID_AUDS.has(x.r.aud) && x.r.diff === 1)) return false; // 儿童模式只看 kid 受众 + 入门难度
    return true;
  });
  base.sort((a, b) => (b.score - a.score) || (b.hot - a.hot) || 0);
  return base;
}

export async function runSearch() {
  // 无查询且无筛选 → 回到启动台（不要列出全部题目）
  if (!currentQ && !hasFacet()) { showHome(); return; }
  if (!state.searchReady) {
    hideHome();
    const box = $("#results");
    $("#detail").hidden = true;
    box.hidden = false;
    box.innerHTML = `<div class="empty"><span class="emoji">⏳</span>${t("loadingData")}</div>`;
    return;
  }
  hideHome();
  const box = $("#results");
  $("#detail").hidden = true;
  const list = await searchWithFacet();
  curList = list; rendered = 0;
  if (!list.length) { box.hidden = false; box.innerHTML = `<div class="empty"><span class="emoji">${t("emptyEmoji")}</span>${t("noResult")}<div class="tip">${t("emptyTip")}</div></div>`; removeSentinel(); return; }
  box.hidden = false;
  box.innerHTML = `<h2 class="reshead">${t("found")} <b>${list.length}</b> ${hasFacet() || currentQ ? t("filtered") : t("results")}</h2>`;
  ensureSentinel(box);
  renderMore();
}
function renderMore() {
  const box = $("#results");
  if (!sentinel || rendered >= curList.length) { removeSentinel(); return; }
  const slice = curList.slice(rendered, rendered + BATCH);
  const frag = document.createDocumentFragment();
  for (const x of slice) frag.appendChild(qitemEl(x));
  box.insertBefore(frag, sentinel);
  rendered += slice.length;
  if (rendered >= curList.length) removeSentinel();
}
function qitemEl(x) {
  const r = x.r, lang = getLang(), q = currentQ;
  const diff = label(CONFIG.DIFF, String(r.diff));
  const aud = label(CONFIG.AUD, r.aud);
  const tags = (r.tag || []).map((tg) => `<span class="tag">${esc(L(tg))}</span>`).join("");
  const el = document.createElement("div");
  el.className = "qitem"; el.dataset.id = r.id;
  el.innerHTML =
    `<p class="q">${highlight(r.q[lang === "en" ? 1 : 0] || r.q[0], q)}<span class="en">${esc(r.q[lang === "en" ? 0 : 1] || "")}</span></p>
     <div class="meta">${esc(diff)} · ${esc(aud)} ${r.ast === 0 ? "· 待解答" : ""}</div>
     ${r.s[lang === "en" ? 1 : 0] ? `<div class="s">${highlight(r.s[lang === "en" ? 1 : 0], q)}</div>` : ""}
     <div>${tags}</div>`;
  el.addEventListener("click", () => { hideSuggest(); writeUrl(true); showDetail(r.id); });
  return el;
}
function ensureSentinel(box) {
  removeSentinel();
  sentinel = document.createElement("div"); sentinel.id = "sentinel"; sentinel.className = "sentinel";
  box.appendChild(sentinel);
  io = new IntersectionObserver((ents) => { if (ents[0].isIntersecting) renderMore(); }, { rootMargin: "240px" });
  io.observe(sentinel);
}
function removeSentinel() {
  if (io) { io.disconnect(); io = null; }
  if (sentinel) { sentinel.remove(); sentinel = null; }
}

function commit(push) {
  const q = $("#q");
  currentQ = q.value.trim();
  if (currentQ) pushHistory(currentQ);
  writeUrl(push);
  runSearch();
}

export function showList() {
  if (currentQ || hasFacet()) runSearch(); else showHome();
}

// ---------- detail（含内联游戏模式） ----------
export async function showDetail(id) {
  const lang = getLang();
  const r = state.records[state.idIndex[id]];
  const box = $("#results");
  const det = $("#detail");
  if (!r) { hideHome(); det.hidden = false; det.innerHTML = `<div class="empty">${t("noResult")}</div>`; return; }
  hideHome();
  det.hidden = false; box.innerHTML = "";
  det.innerHTML = `<a class="back" href="./">${t("back")}</a>
    <div class="detail-head"><div class="q-emoji">${Game.emojiFor(r)}</div>
    <h1>${esc(L(r.q))} <span class="en">${esc(r.q[lang === "en" ? 0 : 1] || "")}</span></h1></div>
    <div class="meta">${esc(label(CONFIG.DIFF, String(r.diff)))} · ${esc(label(CONFIG.AUD, r.aud))} · ${esc(label(CONFIG.CATS, r.cat))} <button class="tts-btn" id="ttsBtn" type="button">🔊 朗读</button></div>
    <div id="detail-body" class="body">
      <div class="skeleton" style="height:16px;width:70%;margin:6px 0 14px"></div>
      <div class="skeleton" style="height:12px;width:95%;margin:8px 0"></div>
      <div class="skeleton" style="height:12px;width:88%;margin:8px 0"></div>
      <div class="skeleton" style="height:12px;width:92%;margin:8px 0"></div>
    </div>`;
  const d = await getDetail(id);
  Game.decorateDetail(r, det);
  const body = $("#detail-body");
  if (!d || (!d.body[lang === "en" ? 1 : 0] && !d.body[lang === "en" ? 0 : 1])) {
    body.innerHTML = `<div class="open">${t("open")}</div>`;
  } else {
    const ans = (d.ans && d.ans.length)
      ? d.ans.map((a) => `<div class="ans">${esc(L(a.t))}<div class="who">— ${esc(a.by || "匿名")} · ${esc(a.role || "")} · ${a.v || 0} 赞</div></div>`).join("")
      : "";
    // 出处 + 核验徽章: App 是主要阅读场景，读者必须看得到
    // 「这条答案的来源是否被独立核验过」，否则可信度承诺无法被感知。
    const vBadge = r.v
      ? `<span class="badge ok">${lang === "en" ? "Verified source" : "出处已核验"}</span>`
      : `<span class="badge warn">${lang === "en" ? "Source pending review" : "出处待核验"}</span>`;
    // 独立核验依据: 让读者能点去出版社/书目页面自己核对
    const evEl = (r.ev && r.ev.length)
      ? `<p class="evlinks">独立核验依据 · Independent verification: ${r.ev.map((e) =>
          `<a class="evlink" href="${esc(e.u)}" target="_blank" rel="noopener">${esc(String(e.l || e.u).slice(0, 56))}</a>`).join(" · ")}</p>`
      : "";
    const srcEl = (d.src && (d.src[0] || d.src[1]))
      ? `<div class="srcbox"><span class="srclabel">${t("source")}</span>${esc(L(d.src))} ${vBadge}${evEl}</div>` : "";
    body.innerHTML = `<div>${esc(L(d.body))}</div>${ans}${srcEl}`;
  }
  const ttsBtn = document.getElementById("ttsBtn");
  if (ttsBtn) {
    const i = lang === "en" ? 1 : 0;
    const qText = (r.q[i] || r.q[0]) || "";
    const aText = (d && d.body && (d.body[i] || d.body[0])) ? (d.body[i] || d.body[0]) : ((r.s && (r.s[i] || r.s[0])) || "");
    const full = qText + (aText ? "。 " + aText : "");
    ttsBtn.onclick = () => {
      if (isSpeaking()) { stopSpeak(); ttsBtn.textContent = "🔊 朗读"; return; }
      speak(full, lang, () => { ttsBtn.textContent = "🔊 朗读"; });
      ttsBtn.textContent = "⏹ 停止";
    };
  }
}

// ---------- URL state ----------
function writeUrl(push) {
  const p = new URLSearchParams();
  if (currentQ) p.set("q", currentQ);
  if (facet.cat) p.set("cat", facet.cat);
  if (facet.diff) p.set("diff", facet.diff);
  if (facet.aud) p.set("aud", facet.aud);
  if (getLang() === "en") p.set("lang", "en");
  const qs = p.toString();
  const url = qs ? "?" + qs : location.pathname;
  if (push) history.pushState(null, "", url); else history.replaceState(null, "", url);
}

export function ready() {
  Game.initGame();              // 加载进度 + 渲染细 HUD + 启动台（含折叠筛选容器）
  initTTS();
  const kb = document.getElementById("kids");
  if (kb) { kb.classList.toggle("on", Game.isKids()); kb.textContent = Game.isKids() ? "🧒 儿童 ✓" : "🧒 儿童"; }
  applyKidsUI();
  const p = new URLSearchParams(location.search);
  facet = { cat: p.get("cat") || "", diff: p.get("diff") || "", aud: p.get("aud") || "" };
  const q = p.get("q") || "";
  $("#q").value = q; currentQ = q;
  const id = p.get("id");
  if (id) { showDetail(id); return; }
  if (p.get("play") === "blind" && facet.cat) { Game.startCatBlind(facet.cat); return; }
  if (q || hasFacet()) runSearch();
  else { buildFilters(); fillHero(); }   // 首页
}

// ---------- progress + error ----------
export function startProgress() {
  const b = $("#progress");
  if (b) { b.hidden = false; b.style.width = "6%"; }
}
export function setProgress(p) {
  const b = $("#progress");
  if (!b) return;
  b.hidden = false;
  b.style.width = Math.max(6, Math.round(p * 100)) + "%";
  if (p >= 1) setTimeout(() => { b.style.width = "100%"; b.hidden = true; }, 250);
}
export function errLoad() {
  const b = $("#progress"); if (b) b.hidden = true;
  $("#retry").hidden = false;
  $("#results").innerHTML = `<div class="err">${t("errLoad")}</div>`;
}

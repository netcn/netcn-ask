// Language: zh / en, persisted, synced to URL
const dict = {
  zh: {
    search: "搜索科学问题，或随便逛逛…",
    noResult: "没找到匹配的问题，换个说法试试？",
    open: "这个问题还在等答案，欢迎你来补一笔 ✨",
    cats: "按学科漫游",
    results: "个结果",
    back: "返回列表",
    loading: "正在为你翻找答案的小精灵…",
    diff: "难度",
    aud: "适合",
    tags: "标签",
    source: "来源",
    langBtn: "EN",
    all: "全部",
    filters: "筛选",
    subject: "学科",
    level: "难度",
    forwhom: "适合",
    history: "最近搜过",
    clear: "清除筛选",
    retry: "重试一下",
    loadingData: "题库正在装填，马上就好…",
    errLoad: "数据加载失败了，戳一下重试就好～",
    filtered: "条（已筛选）",
    found: "为你找到",
    emptyEmoji: "🔭",
    emptyTip: "换个关键词，或点上方学科卡片随便逛逛。",
    heroTitle: '开始你的<span class="grad">科学冒险</span>',
    heroDesc: "问答是一座全学科、全难度的中英双语科学问答总库。用游戏的方式去提问、去解答、去探索。",
    ctaBlind: "🎲 抽一题盲盒", ctaDaily: "📅 今日挑战", ctaResume: "🪐 继续你的星系"
  },
  en: {
    search: "Search science questions, or just wander…",
    noResult: "No matching questions — try a different phrasing?",
    open: "This one is still waiting for an answer — add yours ✨",
    cats: "Browse by subject",
    results: "results",
    back: "Back to list",
    loading: "Summoning the answer sprites for you…",
    diff: "Level",
    aud: "For",
    tags: "Tags",
    source: "Source",
    langBtn: "中",
    all: "All",
    filters: "Filters",
    subject: "Subject",
    level: "Level",
    forwhom: "For",
    history: "Recent",
    clear: "Clear filters",
    retry: "Retry",
    loadingData: "Loading the question bank — one moment…",
    errLoad: "Data failed to load — give it another tap and we're good.",
    filtered: "items (filtered)",
    found: "Found",
    emptyEmoji: "🔭",
    emptyTip: "Try another keyword, or tap a subject card above.",
    heroTitle: 'Start Your <span class="grad">Science Adventure</span>',
    heroDesc: "A bilingual science Q&A library across every subject and level. Ask, answer and explore through play.",
    ctaBlind: "🎲 Random question", ctaDaily: "📅 Daily challenge", ctaResume: "🪐 Continue your galaxy"
  }
};

function initialLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "zh") {
    try { localStorage.setItem("lang", q); } catch (e) {}
    return q;
  }
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") return saved;
  } catch (e) {}
  return "zh";
}

let lang = initialLang();

export function getLang() { return lang; }
export function setLang(l) {
  lang = l;
  try { localStorage.setItem("lang", l); } catch (e) {}
  document.documentElement.lang = l;
  const lb = document.getElementById("ncLang");
  if (lb) lb.textContent = dict[l].langBtn;
}
export function t(k) { return (dict[lang] && dict[lang][k]) || dict.zh[k] || k; }
export function L(arr) { return arr && arr.length === 2 ? (arr[lang === "en" ? 1 : 0] || arr[0]) : (arr || ""); }

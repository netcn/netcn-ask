/* ============================================================
   ask 首页「好玩的东西」首屏内容池（零网络依赖）
   ------------------------------------------------------------
   原来的嘉年华必须等 18 个记录分片(≈13MB) + index.mpack(≈11MB)
   全部下载、msgpack 解码、倒排索引建完才会被 renderLaunch() 画出来。
   这里复用已经随首屏 defer 载入的 64 道真实精选问答(kids-pick.js)，
   适配成 game.js / ui.js 需要的 record 形状，让 12 个玩法在
   DOM 就绪的同一帧就能出现；全量题库就绪后自动切换到 17,305 题。
   ============================================================ */

// kids-pick.js 是 head 里的经典 defer 脚本，一定先于本模块执行。
// 仍保留内置兜底，避免精选包未加载时 randRec() 返回 undefined。
const RAW = (typeof window !== "undefined" && Array.isArray(window.KIDS_PICKS))
  ? window.KIDS_PICKS : [];
const FALLBACK = [
  { id: "fun-fallback-1", cat: "astro", q: "星星为什么一闪一闪的？", a: "星光穿过晃动的大气层被折射，看起来就像在眨眼。" },
  { id: "fun-fallback-2", cat: "phy", q: "天空为什么是蓝色的？", a: "空气把波长短的蓝光散射到四面八方，所以我们抬头看到蓝色。" },
  { id: "fun-fallback-3", cat: "bio", q: "树叶为什么会变黄？", a: "秋天叶绿素分解，原本被遮住的黄色类胡萝卜素就露出来了。" },
  { id: "fun-fallback-4", cat: "earth", q: "为什么会下雨？", a: "水汽遇冷凝成小水滴，水滴变重后落下来就是雨。" },
  { id: "fun-fallback-5", cat: "med", q: "打哈欠为什么会传染？", a: "看到别人打哈欠会激活大脑里的模仿回路，是一种社交同步反应。" },
  { id: "fun-fallback-6", cat: "chem", q: "铁为什么会生锈？", a: "铁和空气中的氧、水发生氧化反应，生成疏松的氧化铁。" },
  { id: "fun-fallback-7", cat: "math", q: "为什么车轮是圆的？", a: "圆形滚动时轴心高度不变，车子最省力也最平稳。" },
  { id: "fun-fallback-8", cat: "cs", q: "电脑为什么只认识 0 和 1？", a: "电路用通电/断电两种稳定状态表示信息，最可靠也最容易复制。" }
];
const SOURCE = RAW.length ? RAW : FALLBACK;

const CATS = new Set(["phy", "chem", "bio", "astro", "earth", "math",
  "med", "eng", "cs", "env", "psy", "soc"]);

function adapt(p, i) {
  const q = String(p.q || "").trim();
  const a = String(p.a || "").trim();
  return {
    id: String(p.id || ("fun-" + i)),
    q: [q, ""],          // 精选包只有中文；英文态回落到中文，不显示重复
    s: [a, ""],
    cat: CATS.has(p.cat) ? p.cat : "bio",
    diff: 1,
    aud: "all",
    hot: 0,
    ast: 1,
    v: 0,
    ev: [],
    tag: [],
    topic: p.topic || "",
    _fun: true           // 标记来源，便于调试与详情兜底
  };
}

export const FUN_RECORDS = SOURCE.filter((p) => p && p.id && p.q).map(adapt);
export const FUN_BY_ID = Object.create(null);
export const FUN_DETAILS = Object.create(null);

for (const r of FUN_RECORDS) {
  FUN_BY_ID[r.id] = r;
  // 与 store.getDetail() 返回的结构一致，点开详情不必再请求任何分片
  FUN_DETAILS[r.id] = { body: [r.s[0], ""], ans: [], src: [] };
}

export const FUN_COUNT = FUN_RECORDS.length;

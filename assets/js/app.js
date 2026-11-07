// Bootstrap
import { init } from "./store.js?v=3";
import * as UI from "./ui.js?v=3";
import * as Game from "./game.js?v=3";

function boot() {
  UI.startProgress();
  init((p) => UI.setProgress(p))
    .then(() => { UI.ready(); window.__askAllReady = true; document.dispatchEvent(new CustomEvent("ask:ready")); })
    .catch(() => UI.errLoad());
}

UI.paint();
UI.bind();
// 「好玩的东西」用 64 道首屏精选静态题即时渲染，不等 18 个分片 + 11MB 索引。
Game.initGame();
boot();

document.getElementById("retry").addEventListener("click", () => {
  document.getElementById("retry").hidden = true;
  boot();
});
window.addEventListener("popstate", () => UI.ready());

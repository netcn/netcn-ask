// Bootstrap
import { init } from "./store.js?v=4";
import * as UI from "./ui.js?v=4";

function boot() {
  UI.startProgress();
  init((p) => UI.setProgress(p))
    .then(() => { UI.ready(); window.__askAllReady = true; document.dispatchEvent(new CustomEvent("ask:ready")); })
    .catch(() => UI.errLoad());
}

UI.paint();
UI.bind();
boot();

document.getElementById("retry").addEventListener("click", () => {
  document.getElementById("retry").hidden = true;
  boot();
});
window.addEventListener("popstate", () => UI.ready());

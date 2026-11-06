// Bootstrap
import { init } from "./store.js";
import * as UI from "./ui.js";

function boot() {
  UI.startProgress();
  init((p) => UI.setProgress(p))
    .then(() => UI.ready())
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

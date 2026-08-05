import "./style.css";
import { GAMES } from "./games";
import { Shell } from "./shell";

const canvas = document.getElementById("stage");
const ui = document.getElementById("ui");

if (!(canvas instanceof HTMLCanvasElement) || !ui) {
  throw new Error("Arcade markup is missing #stage or #ui");
}

const shell = new Shell(canvas, ui);
shell.register(GAMES);
shell.boot();

// Dev-only handle for poking at the running game from the console. Stripped
// from production builds by the `import.meta.env.DEV` guard.
if (import.meta.env.DEV) {
  (window as unknown as { __arcade: Shell }).__arcade = shell;
}

// Safari fires a delayed resize after the URL bar settles; without this the
// playfield can be sized against the pre-collapse viewport height.
window.addEventListener("load", () => {
  setTimeout(() => shell.view.resize(), 120);
});

// Only register in production: a service worker in front of the dev server
// serves stale modules and makes HMR behave bizarrely.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline play is a bonus, not a requirement -- never block boot on it.
    });
  });
}

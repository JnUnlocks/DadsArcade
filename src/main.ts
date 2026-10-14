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

/*
 * Say so when this isn't the real arcade.
 *
 * A release can be tried on a phone before it goes out, at a preview address
 * that looks exactly like the live one. Scores saved there are real, and it
 * is easy to forget which of the two is open, so a preview wears a tag at the
 * top of every screen. Preview addresses are the live one with a label in
 * front: 6a996c08-play.hyperdrive-arcade.workers.dev.
 */
const host = location.hostname;
if (
  host.endsWith("-play.hyperdrive-arcade.workers.dev") ||
  host === "localhost" ||
  host === "127.0.0.1"
) {
  const tag = document.createElement("div");
  tag.className = "dev-tag";
  tag.textContent = "DEV";
  tag.setAttribute("aria-label", "This is the dev version, not the live arcade.");
  document.body.append(tag);
}

// Safari fires a delayed resize after the URL bar settles; without this the
// playfield can be sized against the pre-collapse viewport height.
window.addEventListener("load", () => {
  setTimeout(() => shell.view.resize(), 120);
});

/*
 * Refuse pinch-zoom.
 *
 * iOS Safari deliberately ignores `user-scalable=no` in the viewport meta,
 * so the meta tag alone does nothing here. That matters because this arcade
 * asks you to put two fingers on the screen at once (aim with one, fire with
 * the other) -- which Safari happily reads as a pinch and zooms the page,
 * leaving the game stuck at the wrong scale even across a refresh.
 *
 * These `gesture*` events are WebKit-specific and are the only reliable way
 * to decline. `touch-action: none` in the CSS covers the standards-based
 * path and double-tap zoom.
 */
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (event) => event.preventDefault(), {
    passive: false,
  });
}

// Only register in production: a service worker in front of the dev server
// serves stale modules and makes HMR behave bizarrely.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline play is a bonus, not a requirement -- never block boot on it.
    });
  });
}

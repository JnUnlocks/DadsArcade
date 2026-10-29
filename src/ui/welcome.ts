/**
 * The newcomer help: a row of games to try next, and the home-screen offer.
 * Who sees them, and which games, is decided in core/welcome.ts.
 */

import type { GameModule } from "../core/game";
import type { InstallKind } from "../core/welcome";

function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A game's marquee art, small, at device resolution. */
function smallArt(game: GameModule, size: number): HTMLCanvasElement {
  const art = document.createElement("canvas");
  art.className = "try-art";
  art.setAttribute("aria-hidden", "true");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  art.width = size * dpr;
  art.height = size * dpr;
  const ctx = art.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
    game.drawIcon(ctx, size);
  }
  return art;
}

/**
 * "TRY ANOTHER" and a button per suggested game, art and name. Small enough to
 * sit under PLAY AGAIN without pushing the other buttons off a phone.
 */
export function buildTryAnother(
  label: string,
  games: readonly GameModule[],
  onPick: (game: GameModule) => void,
): HTMLElement {
  const box = el("div", "try-another");
  box.append(el("p", "try-label", label));
  const row = el("div", "try-row");
  for (const game of games) {
    const button = el("button", "try-game");
    button.style.setProperty("--cabinet-accent", game.accent);
    button.setAttribute("aria-label", `Play ${game.title}. ${game.blurb}`);
    button.append(smallArt(game, 32), el("span", "try-name", game.title));
    button.addEventListener("click", () => onPick(game));
    row.append(button);
  }
  box.append(row);
  return box;
}

const INSTALL_COPY: Record<InstallKind, { title: string; body: string }> = {
  "in-app": {
    title: "OPEN IN YOUR BROWSER",
    body:
      "You're playing inside another app, which forgets your streak and scores. " +
      "Tap ••• (or the share button) and choose Open in browser, then add the arcade to your home screen.",
  },
  prompt: {
    title: "ADD TO HOME SCREEN",
    body: "One tap to keep the arcade on your phone. It opens full screen and plays with no signal.",
  },
  ios: {
    title: "ADD TO HOME SCREEN",
    body:
      "Tap the Share button, then Add to Home Screen. The arcade opens full screen from there and plays with no signal.",
  },
};

/**
 * The home-screen offer. Android gets a button that opens its own dialog; an
 * iPhone and an in-app browser get instructions, as there's nothing to press.
 * NOT NOW turns it off for good on this phone.
 */
export function buildInstallCard(
  kind: InstallKind,
  onInstall: () => void,
  onDecline: () => void,
): HTMLElement {
  const copy = INSTALL_COPY[kind];
  const card = el("div", "install-card");
  card.append(el("p", "install-title", copy.title), el("p", "install-body", copy.body));
  const actions = el("div", "install-actions");
  if (kind === "prompt") {
    const add = el("button", "btn btn--primary", "ADD IT");
    add.addEventListener("click", onInstall);
    actions.append(add);
  }
  const later = el("button", "btn btn--quiet", "NOT NOW");
  later.addEventListener("click", () => {
    card.remove();
    onDecline();
  });
  actions.append(later);
  card.append(actions);
  return card;
}

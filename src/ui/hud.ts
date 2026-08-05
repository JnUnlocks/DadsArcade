/**
 * Canvas HUD and CRT overlay.
 *
 * The HUD is drawn rather than DOM because it has to sit inside the letterboxed
 * playfield and stay pixel-consistent with the game. Interactive chrome (the
 * pause button, menus) stays in the DOM where it gets real tap targets.
 */

import type { HudState } from "../core/game";
import type { Settings } from "../core/storage";
import type { View } from "../core/view";

const FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function drawHud(
  ctx: CanvasRenderingContext2D,
  view: View,
  score: number,
  hud: HudState,
  settings: Settings,
): void {
  const top = view.insetTop + 14;
  const scale = settings.largeText ? 1.2 : 1;
  const labelSize = 9 * scale;
  const valueSize = 17 * scale;

  ctx.save();
  ctx.textBaseline = "top";

  // Score, top-left.
  ctx.font = `${labelSize}px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(142,163,200,0.75)";
  ctx.textAlign = "left";
  ctx.fillText("SCORE", 14, top);

  ctx.font = `700 ${valueSize}px ${FONT_STACK}`;
  ctx.fillStyle = settings.highContrast ? "#ffffff" : "#e8f0ff";
  ctx.fillText(String(score).padStart(6, "0"), 14, top + labelSize + 4);

  // Progress, centred -- but nudged left of the 56px pause button.
  ctx.textAlign = "center";
  ctx.font = `${labelSize}px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(142,163,200,0.75)";
  ctx.fillText(hud.progressLabel.toUpperCase(), view.w / 2 - 26, top);

  ctx.font = `700 ${valueSize}px ${FONT_STACK}`;
  ctx.fillStyle = settings.highContrast ? "#ffffff" : "#46e0ff";
  ctx.fillText(String(hud.progress), view.w / 2 - 26, top + labelSize + 4);

  // Lives, bottom-left, drawn as little ship silhouettes.
  const lifeY = view.h - view.insetBottom - 22;
  for (let i = 0; i < hud.lives; i += 1) {
    drawLifeGlyph(ctx, 16 + i * 18, lifeY, settings.highContrast);
  }

  ctx.restore();
}

function drawLifeGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  highContrast: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = highContrast ? "#ffffff" : "#46e0ff";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Scanline + vignette pass. Regenerated only when the playfield resizes --
 * rebuilding ~200 lines every frame is a real cost on a mid-range phone.
 */
let crtCache: HTMLCanvasElement | null = null;
let crtCacheKey = "";

export function drawCrtOverlay(ctx: CanvasRenderingContext2D, view: View): void {
  const key = `${view.w}x${view.h}`;
  if (crtCacheKey !== key || !crtCache) {
    crtCache = buildCrtTexture(view.w, view.h);
    crtCacheKey = key;
  }
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(crtCache, 0, 0, view.w, view.h);
  ctx.restore();
}

function buildCrtTexture(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  // 2x so the scanlines survive being scaled up on a high-DPI screen.
  canvas.width = Math.round(w * 2);
  canvas.height = Math.round(h * 2);
  const c = canvas.getContext("2d");
  if (!c) return canvas;

  c.scale(2, 2);
  c.fillStyle = "rgba(0, 0, 0, 0.22)";
  for (let y = 0; y < h; y += 3) {
    c.fillRect(0, y, w, 1);
  }

  const vignette = c.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  c.fillStyle = vignette;
  c.fillRect(0, 0, w, h);

  return canvas;
}

/**
 * Solitaire's cards and table, drawn from paths like everything else in the
 * arcade.
 *
 * The look is the office PC of twenty-odd years ago: white cards with a thin
 * black edge, the rank and suit in the corner, pips in the middle, on bright
 * green baize. The card backs and the court cards are our own.
 *
 * Every face and back is drawn once per card size into an offscreen canvas
 * and stamped from there, so a frame is 52 drawImage calls however many pips
 * are showing, and the winning bounce can leave a trail of hundreds.
 */

import type { Card, Suit } from "./rules.ts";

export const FELT = "#0b7a2a";
export const FELT_DARK = "#075c1f";
const RED = "#d10f1f";
const BLACK = "#111111";
const FACE = "#ffffff";

export type BackId = "blue" | "red" | "arcade";
export const BACKS: readonly { id: BackId; label: string }[] = [
  { id: "blue", label: "Blue" },
  { id: "red", label: "Red" },
  { id: "arcade", label: "Arcade" },
];

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

export function suitColor(suit: Suit): string {
  return suit === 1 || suit === 2 ? RED : BLACK;
}

/** A suit symbol of height `s` centred on (x, y). */
export function drawSuit(ctx: CanvasRenderingContext2D, suit: Suit, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = suitColor(suit);
  const circle = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const poly = (...pts: number[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    ctx.closePath();
    ctx.fill();
  };
  switch (suit) {
    case 0: // spade
      circle(-0.22, 0.1, 0.24);
      circle(0.22, 0.1, 0.24);
      ctx.beginPath();
      ctx.moveTo(0, -0.5);
      ctx.bezierCurveTo(0.12, -0.3, 0.46, -0.12, 0.46, 0.1);
      ctx.lineTo(-0.46, 0.1);
      ctx.bezierCurveTo(-0.46, -0.12, -0.12, -0.3, 0, -0.5);
      ctx.fill();
      poly(0, 0.08, 0.15, 0.5, -0.15, 0.5);
      break;
    case 1: // heart
      circle(-0.23, -0.17, 0.27);
      circle(0.23, -0.17, 0.27);
      ctx.beginPath();
      ctx.moveTo(-0.49, -0.1);
      ctx.bezierCurveTo(-0.42, 0.14, -0.15, 0.3, 0, 0.48);
      ctx.bezierCurveTo(0.15, 0.3, 0.42, 0.14, 0.49, -0.1);
      ctx.closePath();
      ctx.fill();
      break;
    case 2: // diamond
      ctx.beginPath();
      ctx.moveTo(0, -0.5);
      ctx.quadraticCurveTo(0.17, -0.2, 0.38, 0);
      ctx.quadraticCurveTo(0.17, 0.2, 0, 0.5);
      ctx.quadraticCurveTo(-0.17, 0.2, -0.38, 0);
      ctx.quadraticCurveTo(-0.17, -0.2, 0, -0.5);
      ctx.fill();
      break;
    case 3: // club
      circle(0, -0.24, 0.22);
      circle(-0.24, 0.1, 0.22);
      circle(0.24, 0.1, 0.22);
      circle(0, 0.02, 0.13);
      poly(0, 0.04, 0.15, 0.5, -0.15, 0.5);
      break;
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Where the pips sit on a card from two to ten, as fractions of the pip area:
 * x of 0, 0.5 or 1 for the left, middle and right columns, y from 0 at the
 * top to 1 at the bottom. Pips below the middle are drawn upside down, as on
 * a printed card.
 */
const PIPS: Record<number, readonly [number, number][]> = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

/** Draw a face-up card with its top-left corner at the origin. */
function drawFace(ctx: CanvasRenderingContext2D, card: Card, w: number, h: number): void {
  const r = Math.max(2, w * 0.07);
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r);
  ctx.fillStyle = FACE;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#1a1a1a";
  ctx.stroke();

  const color = suitColor(card.suit);
  const label = RANKS[card.rank]!;
  // The corner has to read in the strip a fanned card leaves showing, so it
  // runs across, rank then suit, rather than stacked as on a printed card.
  const rankSize = w * (label === "10" ? 0.27 : 0.3);
  const corner = (flip: boolean) => {
    ctx.save();
    if (flip) {
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
    }
    ctx.fillStyle = color;
    ctx.font = `700 ${rankSize}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const x = w * 0.07;
    const y = w * 0.06;
    ctx.fillText(label, x, y);
    const tw = ctx.measureText(label).width;
    drawSuit(ctx, card.suit, x + tw + w * 0.13, y + rankSize * 0.47, w * 0.22);
    ctx.restore();
  };
  corner(false);
  corner(true);

  // The middle. Small cards (a phone held upright) get one big suit, which
  // reads better than ten pips the size of a grain of rice.
  const inner = { x: w * 0.27, y: h * 0.27, w: w * 0.46, h: h * 0.46 };
  if (card.rank >= 11) {
    drawCourt(ctx, card, w, h);
  } else if (card.rank === 1) {
    drawSuit(ctx, card.suit, w / 2, h / 2 + h * 0.03, w * 0.46);
  } else if (w < 52) {
    drawSuit(ctx, card.suit, w / 2, h / 2 + h * 0.07, w * 0.42);
  } else {
    const pip = w * 0.17;
    for (const [px, py] of PIPS[card.rank]!) {
      const x = inner.x + px * inner.w;
      const y = inner.y + py * inner.h;
      ctx.save();
      ctx.translate(x, y);
      if (py > 0.5) ctx.rotate(Math.PI);
      drawSuit(ctx, card.suit, 0, 0, pip);
      ctx.restore();
    }
  }
}

/**
 * A jack, queen or king: a framed portrait panel in the suit's colours with
 * the letter large and a crown, cap or tiara over it. Not a copy of any
 * printed deck's courts, and readable at the size of a thumbnail.
 */
function drawCourt(ctx: CanvasRenderingContext2D, card: Card, w: number, h: number): void {
  const px = w * 0.2;
  const py = h * 0.22;
  const pw = w * 0.6;
  const ph = h * 0.56;
  const red = card.suit === 1 || card.suit === 2;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, w * 0.04);
  const grad = ctx.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, red ? "#fff1d6" : "#e9f0ff");
  grad.addColorStop(1, red ? "#ffd7a8" : "#c9d8ff");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.strokeStyle = red ? "#c78b1a" : "#2b4fb3";
  ctx.stroke();

  const cx = w / 2;
  const gold = "#e2a614";
  ctx.fillStyle = gold;
  ctx.strokeStyle = "#7a5200";
  ctx.lineWidth = Math.max(0.75, w * 0.012);
  const hy = py + ph * 0.2;
  const hw = pw * 0.5;
  ctx.beginPath();
  if (card.rank === 13) {
    // King: a five-point crown.
    ctx.moveTo(cx - hw / 2, hy + ph * 0.1);
    ctx.lineTo(cx - hw / 2, hy - ph * 0.06);
    ctx.lineTo(cx - hw / 4, hy + ph * 0.03);
    ctx.lineTo(cx, hy - ph * 0.1);
    ctx.lineTo(cx + hw / 4, hy + ph * 0.03);
    ctx.lineTo(cx + hw / 2, hy - ph * 0.06);
    ctx.lineTo(cx + hw / 2, hy + ph * 0.1);
  } else if (card.rank === 12) {
    // Queen: a rounded tiara.
    ctx.moveTo(cx - hw / 2, hy + ph * 0.1);
    ctx.quadraticCurveTo(cx - hw / 2, hy - ph * 0.04, cx, hy - ph * 0.08);
    ctx.quadraticCurveTo(cx + hw / 2, hy - ph * 0.04, cx + hw / 2, hy + ph * 0.1);
  } else {
    // Jack: a soft cap with a feather.
    ctx.moveTo(cx - hw / 2, hy + ph * 0.1);
    ctx.quadraticCurveTo(cx - hw / 2, hy - ph * 0.06, cx + hw * 0.1, hy - ph * 0.04);
    ctx.quadraticCurveTo(cx + hw / 2, hy, cx + hw / 2, hy + ph * 0.1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (card.rank === 11) {
    ctx.beginPath();
    ctx.strokeStyle = red ? RED : "#2b4fb3";
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.moveTo(cx + hw * 0.1, hy - ph * 0.02);
    ctx.quadraticCurveTo(cx + hw * 0.6, hy - ph * 0.2, cx + hw * 0.75, hy - ph * 0.12);
    ctx.stroke();
  }

  ctx.fillStyle = suitColor(card.suit);
  ctx.font = `700 ${w * 0.34}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(RANKS[card.rank]!, cx, py + ph * 0.55);
  drawSuit(ctx, card.suit, cx, py + ph * 0.84, w * 0.16);
  ctx.restore();
}

/** Draw a card back with its top-left corner at the origin. */
function drawBack(ctx: CanvasRenderingContext2D, back: BackId, w: number, h: number): void {
  const r = Math.max(2, w * 0.07);
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r);
  ctx.fillStyle = FACE;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#1a1a1a";
  ctx.stroke();

  const m = Math.max(2, w * 0.07);
  const ix = m;
  const iy = m;
  const iw = w - m * 2;
  const ih = h - m * 2;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, r * 0.5);
  ctx.clip();

  if (back === "arcade") {
    const grad = ctx.createLinearGradient(0, iy, 0, iy + ih);
    grad.addColorStop(0, "#1a1050");
    grad.addColorStop(1, "#05070f");
    ctx.fillStyle = grad;
    ctx.fillRect(ix, iy, iw, ih);
    // A neon grid floor and a sun, the arcade's own colours.
    ctx.strokeStyle = "rgba(255, 59, 212, 0.75)";
    ctx.lineWidth = Math.max(0.75, w * 0.015);
    const horizon = iy + ih * 0.55;
    for (let i = 0; i < 6; i += 1) {
      const y = horizon + (ih * 0.45 * (i * i)) / 25;
      ctx.beginPath();
      ctx.moveTo(ix, y);
      ctx.lineTo(ix + iw, y);
      ctx.stroke();
    }
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(ix + iw / 2 + i * iw * 0.06, horizon);
      ctx.lineTo(ix + iw / 2 + i * iw * 0.3, iy + ih);
      ctx.stroke();
    }
    const sun = ctx.createLinearGradient(0, horizon - iw * 0.35, 0, horizon);
    sun.addColorStop(0, "#ffd52a");
    sun.addColorStop(1, "#ff3bd4");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(ix + iw / 2, horizon, iw * 0.3, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#19dfff";
    ctx.fillRect(ix, horizon - 0.5, iw, Math.max(1, w * 0.02));
  } else {
    const base = back === "blue" ? "#1f4fbf" : "#b3141f";
    const line = back === "blue" ? "#7fa8ff" : "#ff8c8c";
    ctx.fillStyle = base;
    ctx.fillRect(ix, iy, iw, ih);
    // A woven lattice, then a diamond medallion in the middle.
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(0.6, w * 0.014);
    const step = Math.max(4, w * 0.11);
    for (let d = -ih; d < iw + ih; d += step) {
      ctx.beginPath();
      ctx.moveTo(ix + d, iy);
      ctx.lineTo(ix + d + ih, iy + ih);
      ctx.moveTo(ix + d, iy + ih);
      ctx.lineTo(ix + d + ih, iy);
      ctx.stroke();
    }
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = base;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx, cy - ih * 0.26);
    ctx.lineTo(cx + iw * 0.32, cy);
    ctx.lineTo(cx, cy + ih * 0.26);
    ctx.lineTo(cx - iw * 0.32, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Faces and backs drawn once at the current size and stamped from then on. */
export class CardArt {
  private faces = new Map<number, HTMLCanvasElement>();
  private backs = new Map<BackId, HTMLCanvasElement>();
  private key = "";
  w = 0;
  h = 0;

  /** Throw the cache away if the card size or pixel ratio has changed. */
  setSize(w: number, h: number, dpr: number): void {
    const key = `${w.toFixed(2)}x${h.toFixed(2)}@${dpr}`;
    if (key === this.key) return;
    this.key = key;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.faces.clear();
    this.backs.clear();
  }

  private dpr = 1;

  private make(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(this.w * this.dpr);
    canvas.height = Math.ceil(this.h * this.dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(this.dpr, this.dpr);
    draw(ctx);
    return canvas;
  }

  face(card: Card): HTMLCanvasElement {
    let art = this.faces.get(card.id);
    if (!art) {
      art = this.make((ctx) => drawFace(ctx, card, this.w, this.h));
      this.faces.set(card.id, art);
    }
    return art;
  }

  back(id: BackId): HTMLCanvasElement {
    let art = this.backs.get(id);
    if (!art) {
      art = this.make((ctx) => drawBack(ctx, id, this.w, this.h));
      this.backs.set(id, art);
    }
    return art;
  }
}

/** A small preview of a card back, for the chooser on the title screen. */
export function drawBackPreview(canvas: HTMLCanvasElement, id: BackId): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = 46;
  const h = 64;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  drawBack(ctx, id, w, h);
}

/** An empty place on the table: a faint outline, like a card's shadow. */
export function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(2, w * 0.07));
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeStyle = "rgba(190, 255, 190, 0.35)";
  ctx.stroke();
}

/** The empty stock: a ring to tap to go round again, or a cross when there's nothing left. */
export function drawStockMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  canRecycle: boolean,
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = w * 0.26;
  ctx.save();
  ctx.lineWidth = Math.max(2, w * 0.07);
  ctx.strokeStyle = canRecycle ? "rgba(140, 255, 140, 0.85)" : "rgba(140, 255, 140, 0.3)";
  ctx.lineCap = "round";
  if (canRecycle) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
  }
  ctx.restore();
}

/** The felt, with a soft light in the middle. */
export function drawFelt(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.75);
  grad.addColorStop(0, "#119a38");
  grad.addColorStop(1, FELT_DARK);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** The cabinet's marquee: three cards fanned on the felt. */
export function drawSolitaireIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  const grad = ctx.createRadialGradient(size / 2, size * 0.45, 0, size / 2, size * 0.45, size * 0.75);
  grad.addColorStop(0, "#14a83e");
  grad.addColorStop(1, FELT_DARK);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const w = size * 0.4;
  const h = w * 1.4;
  const cards: [Card, number, number][] = [
    [{ id: 0, suit: 0, rank: 1, up: true }, -0.32, -size * 0.17],
    [{ id: 1, suit: 1, rank: 13, up: true }, 0, 0],
    [{ id: 2, suit: 2, rank: 7, up: true }, 0.32, size * 0.17],
  ];
  for (const [card, angle, dx] of cards) {
    ctx.save();
    ctx.translate(size / 2 + dx, size * 0.6);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h * 0.62);
    // The shadow goes under the card only, not under every pip on it.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = size * 0.03;
    ctx.shadowOffsetY = size * 0.01;
    roundRect(ctx, 0, 0, w, h, w * 0.07);
    ctx.fillStyle = FACE;
    ctx.fill();
    ctx.restore();
    drawFace(ctx, card, w, h);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * How Dad's Prize Drop looks: the ten prizes and the cabinet they fall into.
 *
 * Every prize is a glossy capsule with a toy inside. Each is painted once
 * into a picture of its own and stamped from there, because a full tank is
 * forty of them turning every frame and the toys are too detailed to redraw.
 */

import { prize, PRIZES, TANK_H, TANK_W, DANGER_Y } from "./prizes.ts";

export const FONT = "ui-monospace, Menlo, Consolas, monospace";

const NAVY = "#0b1330";
const INK = "#101a3c";

/** Pixels per tank unit the prize pictures are painted at. */
const SPRITE_SCALE = 3;
/** Room round a picture for its rim, so the edge isn't clipped. */
const SPRITE_PAD = 1.06;

const sprites = new Map<string, HTMLCanvasElement>();

/** A prize's picture, painted the first time it is asked for. */
function sprite(tier: number, highContrast: boolean): HTMLCanvasElement {
  const key = `${tier}${highContrast ? "h" : ""}`;
  const cached = sprites.get(key);
  if (cached) return cached;

  const radius = prize(tier).radius;
  // The small ones get extra, or a marble is a 70-pixel smudge.
  const scale = Math.max(SPRITE_SCALE, 96 / radius);
  const size = Math.ceil(radius * 2 * SPRITE_PAD * scale);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.translate(size / 2, size / 2);
    ctx.scale(radius * scale, radius * scale);
    paintPrize(ctx, tier, highContrast);
  }
  sprites.set(key, canvas);
  return canvas;
}

let shine: HTMLCanvasElement | null = null;

function shineSprite(): HTMLCanvasElement {
  if (shine) return shine;
  const size = 320;
  shine = document.createElement("canvas");
  shine.width = size;
  shine.height = size;
  const ctx = shine.getContext("2d");
  if (ctx) {
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / 2 / SPRITE_PAD, size / 2 / SPRITE_PAD);
    paintShine(ctx);
  }
  return shine;
}

/** Draw a prize of radius `r` at a point, turned by `angle`. */
export function drawPrize(
  ctx: CanvasRenderingContext2D,
  tier: number,
  x: number,
  y: number,
  r: number,
  angle = 0,
  highContrast = false,
  alpha = 1,
): void {
  const image = sprite(tier, highContrast);
  const half = r * SPRITE_PAD;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (angle !== 0) ctx.rotate(angle);
  ctx.drawImage(image, -half, -half, half * 2, half * 2);
  if (angle !== 0) ctx.rotate(-angle);
  ctx.drawImage(shineSprite(), -half, -half, half * 2, half * 2);
  ctx.restore();
}

// ----- Painting a prize, in a space where its radius is 1 -----

function paintPrize(ctx: CanvasRenderingContext2D, tier: number, highContrast: boolean): void {
  const color = prize(tier).color;

  // The capsule: lit from the top left, darker towards the rim.
  const body = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1);
  body.addColorStop(0, shade(color, 0.45));
  body.addColorStop(0.55, color);
  body.addColorStop(1, shade(color, -0.42));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 0.97, 0, Math.PI * 2);
  ctx.clip();
  MOTIFS[tier - 1]?.(ctx);
  ctx.restore();

  // Rim. The top prize gets a gold one.
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = tier === PRIZES.length ? "#FFD166" : shade(color, -0.55);
  ctx.beginPath();
  ctx.arc(0, 0, 0.965, 0, Math.PI * 2);
  ctx.stroke();
  if (highContrast) {
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 0.99, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * The shine on the capsule. It is a picture of its own, laid over the toy
 * without turning, because the light in the arcade doesn't roll when a prize
 * does.
 */
function paintShine(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 0.78, Math.PI * 1.12, Math.PI * 1.42);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(-0.2, -0.76, 0.055, 0, Math.PI * 2);
  ctx.fill();
  // And a little light bouncing back off the floor.
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, 0.84, Math.PI * 0.18, Math.PI * 0.42);
  ctx.stroke();
}

type Motif = (ctx: CanvasRenderingContext2D) => void;

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

/** A shiny cartoon eye. */
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  disc(ctx, x, y, r, "#141a2e");
  disc(ctx, x - r * 0.3, y - r * 0.35, r * 0.38, "#ffffff");
}

/** A smile: the lower half of a circle, as a line. */
function smile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

/** An open, happy mouth with a tongue in it. */
function grin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = "#3a1230";
  ctx.fill();
  ctx.clip();
  disc(ctx, x, y + r * 0.95, r * 0.62, "#ff6f91");
  ctx.restore();
}

/** Eyes shut tight with joy: two little arches. */
function happyEyes(
  ctx: CanvasRenderingContext2D,
  y: number,
  gap: number,
  r: number,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * gap, y, r, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
}

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const reach = i % 2 === 0 ? r : r * 0.5;
    const turn = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(turn) * reach;
    const py = y + Math.sin(turn) * reach;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.lineJoin = "round";
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = r * 0.22;
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

const MOTIFS: readonly Motif[] = [
  // 1. Pocket Marble: glass with a swirl caught in it.
  (ctx) => {
    disc(ctx, 0, 0, 1, "rgba(20,60,160,0.45)");
    ctx.strokeStyle = "#d9fbff";
    ctx.lineWidth = 0.24;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-0.42, 0.3);
    ctx.bezierCurveTo(-0.5, -0.5, 0.45, -0.1, 0.05, 0.12);
    ctx.bezierCurveTo(-0.2, 0.26, 0.2, 0.6, 0.5, 0.2);
    ctx.stroke();
    disc(ctx, 0.02, 0.1, 0.13, INK);
  },

  // 2. Bouncy Ball: two broad stripes.
  (ctx) => {
    ctx.save();
    ctx.rotate(-0.5);
    ctx.fillStyle = "#fff1dc";
    ctx.fillRect(-1.2, -0.52, 2.4, 0.3);
    ctx.fillRect(-1.2, 0.12, 2.4, 0.34);
    ctx.restore();
  },

  // 3. Star Ball.
  (ctx) => {
    star(ctx, 0, 0.04, 0.62, "#ffe34d", "#2c7a1e");
    star(ctx, -0.06, -0.02, 0.3, "rgba(255,255,255,0.35)");
  },

  // 4. Lucky Duck.
  (ctx) => {
    oval(ctx, -0.6, 0.2, 0.17, 0.11, "rgba(255,140,60,0.4)");
    oval(ctx, 0.6, 0.2, 0.17, 0.11, "rgba(255,140,60,0.4)");
    eye(ctx, -0.36, -0.18, 0.15);
    eye(ctx, 0.36, -0.18, 0.15);
    oval(ctx, 0, 0.3, 0.36, 0.22, "#d9540f");
    oval(ctx, 0, 0.22, 0.38, 0.16, "#ff8a2a");
    oval(ctx, 0, 0.42, 0.18, 0.08, "#8a2408");
  },

  // 5. Pocket Racer: a toy car, nose on.
  (ctx) => {
    box(ctx, -0.72, 0.28, 0.3, 0.42, 0.1, "#1b1b2a");
    box(ctx, 0.42, 0.28, 0.3, 0.42, 0.1, "#1b1b2a");
    box(ctx, -0.5, -0.5, 1.0, 0.6, 0.24, "#e3322f");
    box(ctx, -0.38, -0.4, 0.76, 0.34, 0.14, "#16224f");
    box(ctx, -0.34, -0.38, 0.3, 0.1, 0.05, "rgba(255,255,255,0.3)");
    box(ctx, -0.76, -0.04, 1.52, 0.56, 0.22, "#f0403c");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-0.14, -0.04, 0.1, 0.56);
    ctx.fillRect(0.04, -0.04, 0.1, 0.56);
    disc(ctx, -0.5, 0.22, 0.14, "#ffffff");
    disc(ctx, 0.5, 0.22, 0.14, "#ffffff");
    disc(ctx, -0.5, 0.22, 0.09, "#6fe9ff");
    disc(ctx, 0.5, 0.22, 0.09, "#6fe9ff");
    box(ctx, -0.26, 0.34, 0.52, 0.1, 0.05, "#7a1513");
  },

  // 6. Beep Bot: a helmet with a screen for a face.
  (ctx) => {
    box(ctx, -0.92, -0.2, 0.26, 0.5, 0.1, "#ffb637");
    box(ctx, 0.66, -0.2, 0.26, 0.5, 0.1, "#ffb637");
    box(ctx, -0.22, -0.8, 0.44, 0.22, 0.07, "#2f5fd0");
    box(ctx, -0.7, -0.6, 1.4, 1.2, 0.34, "#86b7ff");
    box(ctx, -0.56, -0.4, 1.12, 0.78, 0.22, NAVY);
    box(ctx, -0.38, -0.2, 0.2, 0.3, 0.06, "#6ff3ff");
    box(ctx, 0.18, -0.2, 0.2, 0.3, 0.06, "#6ff3ff");
    smile(ctx, 0, 0.12, 0.12, "#6ff3ff", 0.06);
    box(ctx, -0.2, 0.68, 0.4, 0.1, 0.05, "#ffb637");
  },

  // 7. Hop Buddy.
  (ctx) => {
    oval(ctx, 0, 0.86, 0.72, 0.4, "#c9f7a9");
    disc(ctx, -0.42, -0.42, 0.34, "#35c47e");
    disc(ctx, 0.42, -0.42, 0.34, "#35c47e");
    disc(ctx, -0.42, -0.4, 0.26, "#ffffff");
    disc(ctx, 0.42, -0.4, 0.26, "#ffffff");
    eye(ctx, -0.4, -0.37, 0.17);
    eye(ctx, 0.4, -0.37, 0.17);
    oval(ctx, -0.64, 0.14, 0.16, 0.1, "rgba(255,110,140,0.75)");
    oval(ctx, 0.64, 0.14, 0.16, 0.1, "rgba(255,110,140,0.75)");
    grin(ctx, 0, 0.1, 0.4);
    disc(ctx, -0.08, -0.04, 0.03, "#1d7a48");
    disc(ctx, 0.08, -0.04, 0.03, "#1d7a48");
  },

  // 8. Slime Star: goo with a face.
  (ctx) => {
    ctx.fillStyle = "rgba(226,190,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(-1, -1);
    ctx.lineTo(1, -1);
    ctx.lineTo(1, -0.3);
    ctx.bezierCurveTo(0.8, -0.5, 0.7, -0.1, 0.56, -0.3);
    ctx.bezierCurveTo(0.4, -0.56, 0.2, -0.36, 0, -0.5);
    ctx.bezierCurveTo(-0.3, -0.68, -0.4, -0.2, -0.6, -0.36);
    ctx.bezierCurveTo(-0.76, -0.5, -0.86, -0.2, -1, -0.3);
    ctx.closePath();
    ctx.fill();
    eye(ctx, -0.34, 0.02, 0.14);
    eye(ctx, 0.3, 0.02, 0.14);
    oval(ctx, -0.6, 0.32, 0.15, 0.1, "#58e6ff");
    oval(ctx, 0.56, 0.32, 0.15, 0.1, "#58e6ff");
    grin(ctx, -0.02, 0.24, 0.26);
    star(ctx, 0.44, -0.5, 0.24, "#ffe34d", "#8a55c8");
  },

  // 9. Arcade Captain: a robot with an arcade screen for a face.
  (ctx) => {
    box(ctx, -0.6, 0.5, 1.2, 0.7, 0.2, "#e3322f");
    box(ctx, -0.28, 0.6, 0.56, 0.26, 0.08, NAVY);
    disc(ctx, -0.12, 0.73, 0.075, "#6ff3ff");
    disc(ctx, 0.12, 0.73, 0.075, "#6ff3ff");
    box(ctx, -0.9, -0.32, 0.26, 0.5, 0.1, "#e3322f");
    box(ctx, 0.64, -0.32, 0.26, 0.5, 0.1, "#e3322f");
    box(ctx, -0.36, -0.88, 0.72, 0.34, 0.14, "#e3322f");
    box(ctx, -0.5, -0.68, 1.0, 0.14, 0.06, "#b81f1c");
    box(ctx, -0.68, -0.6, 1.36, 1.06, 0.3, "#ffd23f");
    box(ctx, -0.54, -0.46, 1.08, 0.78, 0.2, NAVY);
    happyEyes(ctx, -0.02, 0.26, 0.13, "#6ff3ff", 0.07);
    smile(ctx, 0, 0.04, 0.12, "#6ff3ff", 0.06);
  },

  // 10. Grand Prize Bot: crowned, and very pleased about it.
  (ctx) => {
    // A sunburst behind it, so it can't be taken for Beep Bot at a glance.
    ctx.fillStyle = "rgba(255,209,102,0.5)";
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 1.2, (i * Math.PI) / 6, (i * Math.PI) / 6 + Math.PI / 12);
      ctx.closePath();
      ctx.fill();
    }
    box(ctx, -0.56, 0.52, 1.12, 0.7, 0.2, "#ffc93a");
    disc(ctx, 0, 0.72, 0.13, "#1c6fd0");
    disc(ctx, 0, 0.72, 0.08, "#6ff3ff");
    box(ctx, -0.86, -0.14, 0.24, 0.44, 0.1, "#3b8cff");
    box(ctx, 0.62, -0.14, 0.24, 0.44, 0.1, "#3b8cff");
    box(ctx, -0.66, -0.4, 1.32, 0.96, 0.32, "#ffffff");
    box(ctx, -0.52, -0.27, 1.04, 0.7, 0.2, NAVY);
    happyEyes(ctx, 0.06, 0.25, 0.13, "#6ff3ff", 0.07);
    grin(ctx, 0, 0.14, 0.15);
    // The crown sits inside the capsule: it is a picture, not a shape.
    ctx.fillStyle = "#ffc93a";
    ctx.strokeStyle = "#b67a08";
    ctx.lineWidth = 0.04;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-0.4, -0.38);
    ctx.lineTo(-0.46, -0.78);
    ctx.lineTo(-0.2, -0.58);
    ctx.lineTo(0, -0.88);
    ctx.lineTo(0.2, -0.58);
    ctx.lineTo(0.46, -0.78);
    ctx.lineTo(0.4, -0.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    disc(ctx, 0, -0.56, 0.075, "#ff4d6d");
    disc(ctx, -0.46, -0.78, 0.05, "#ffe9a8");
    disc(ctx, 0, -0.88, 0.05, "#ffe9a8");
    disc(ctx, 0.46, -0.78, 0.05, "#ffe9a8");
  },
];

// ----- The cabinet -----

export interface Layout {
  /** Top-left of the tank on screen, and screen units per tank unit. */
  x0: number;
  y0: number;
  scale: number;
  /** The strip of ten prizes under the tank. */
  ladderY: number;
  ladderH: number;
  /** The empty stretch between the score line and the tank, on a tall phone. */
  spareY: number;
  spareH: number;
}

/** Fit the tank between the score line and the ladder. */
export function layoutFor(w: number, h: number, insetTop: number, insetBottom: number): Layout {
  const top = insetTop + 66;
  const ladderH = 38;
  const bottomGap = Math.max(10, insetBottom + 6);
  const room = h - top - ladderH - bottomGap - 10;
  const scale = Math.min((w - 20) / TANK_W, room / TANK_H);
  const tankH = TANK_H * scale;
  return {
    x0: (w - TANK_W * scale) / 2,
    // Any height to spare goes above the tank, so the ladder stays in reach.
    y0: top + (room - tankH),
    scale,
    ladderY: top + room + 10,
    ladderH,
    spareY: top,
    spareH: room - tankH,
  };
}

/**
 * The cabinet's sign, in the room a tall phone leaves above the tank. A short
 * screen has no room and gets no sign: the tank is what matters.
 */
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  h: number,
  clock: number,
  calm: boolean,
): void {
  if (h < 58) return;
  const signH = Math.min(78, h - 18);
  const signW = Math.min(250, w - 90);
  const top = y + (h - signH) / 2 - 4;
  const mid = w / 2;
  // The sign hums a little, like a tube that has been on all day.
  const glow = calm ? 1 : 0.88 + 0.12 * Math.sin(clock * 2.2);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.strokeStyle = "rgba(70,224,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (const [dy, reach] of [[-5, 38], [5, 30]] as const) {
      ctx.beginPath();
      ctx.moveTo(mid + side * (signW / 2 + 8), top + signH * 0.6 + dy);
      ctx.lineTo(mid + side * (signW / 2 + 8 + reach), top + signH * 0.6 + dy);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "rgba(124,236,255,0.85)";
  ctx.font = `700 ${Math.max(8, signH * 0.13)}px ${FONT}`;
  ctx.fillText("D A D ' S   A R C A D E", mid, top + signH * 0.1);

  ctx.shadowColor = "#46e0ff";
  ctx.shadowBlur = 14 * glow;
  ctx.fillStyle = "rgba(10,18,48,0.9)";
  ctx.strokeStyle = `rgba(124,236,255,${glow})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundRect(ctx, mid - signW / 2, top + signH * 0.26, signW, signH * 0.7, 12);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 10 * glow;
  ctx.fillStyle = "#e9fdff";
  ctx.font = `700 ${signH * 0.4}px ${FONT}`;
  ctx.fillText("PRIZE DROP", mid, top + signH * 0.63, signW - 24);
  ctx.restore();
}

/** The glass, the glow round it and the line. Drawn in tank units. */
export function drawTank(
  ctx: CanvasRenderingContext2D,
  danger: number,
  clock: number,
  calm: boolean,
): void {
  const glass = ctx.createLinearGradient(0, 0, 0, TANK_H);
  glass.addColorStop(0, "#0a1230");
  glass.addColorStop(1, "#070b1c");
  ctx.fillStyle = glass;
  ctx.beginPath();
  roundRect(ctx, -4, -4, TANK_W + 8, TANK_H + 8, 16);
  ctx.fill();

  // A sheen down each side of the glass.
  const sheen = ctx.createLinearGradient(0, 0, TANK_W, 0);
  sheen.addColorStop(0, "rgba(70,224,255,0.1)");
  sheen.addColorStop(0.08, "rgba(70,224,255,0)");
  sheen.addColorStop(0.92, "rgba(70,224,255,0)");
  sheen.addColorStop(1, "rgba(70,224,255,0.1)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, TANK_W, TANK_H);

  // The line. It only shouts when something is over it.
  const hot = danger > 0;
  const pulse = hot && !calm ? 0.6 + 0.4 * Math.sin(clock * 10) : 1;
  ctx.save();
  ctx.strokeStyle = hot ? `rgba(255,95,95,${pulse})` : "rgba(255,112,111,0.55)";
  ctx.lineWidth = hot ? 2.5 : 1.5;
  ctx.setLineDash([9, 7]);
  ctx.beginPath();
  ctx.moveTo(4, DANGER_Y);
  ctx.lineTo(TANK_W - 4, DANGER_Y);
  ctx.stroke();
  ctx.restore();
}

/** The neon edge, drawn over the prizes so they sit inside the glass. */
export function drawTankRim(ctx: CanvasRenderingContext2D, danger: number): void {
  ctx.save();
  ctx.shadowColor = danger > 0 ? "#ff5f5f" : "#46e0ff";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = danger > 0 ? "#ff8a8a" : "#7cecff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  // Open at the top: that is where the prizes come in.
  ctx.moveTo(-4, -4);
  ctx.lineTo(-4, TANK_H - 12);
  ctx.arcTo(-4, TANK_H + 4, 12, TANK_H + 4, 16);
  ctx.lineTo(TANK_W - 12, TANK_H + 4);
  ctx.arcTo(TANK_W + 4, TANK_H + 4, TANK_W + 4, TANK_H - 12, 16);
  ctx.lineTo(TANK_W + 4, -4);
  ctx.stroke();
  ctx.restore();
}

/**
 * The ladder: all ten prizes in a row, the ones not yet made in shadow.
 * It shows what there is to make. It is not a collection, and nothing is kept.
 */
export function drawLadder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bestTier: number,
  clock: number,
  highContrast: boolean,
  calm: boolean,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(10,18,48,0.9)";
  ctx.strokeStyle = "rgba(70,224,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();

  const slot = (w - 12) / PRIZES.length;
  const r = Math.min(slot / 2 - 2.5, h / 2 - 6);
  for (const p of PRIZES) {
    const cx = x + 6 + slot * (p.tier - 0.5);
    const cy = y + h / 2;
    const made = p.tier <= bestTier;
    // The next one to make breathes a little: that is the thing to aim for.
    const isGoal = p.tier === bestTier + 1;
    const swell = isGoal && !calm ? 1 + 0.08 * Math.sin(clock * 4) : 1;
    drawPrize(ctx, p.tier, cx, cy, r * swell, 0, highContrast, made ? 1 : isGoal ? 0.7 : 0.28);
    if (isGoal) {
      ctx.strokeStyle = "#ffc14d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * swell + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The cabinet's picture on the arcade menu. */
export function drawPrizeDropIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 64;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = "#0a1230";
  ctx.beginPath();
  roundRect(ctx, 8, 6, 48, 54, 8);
  ctx.fill();
  drawPrize(ctx, 7, 24, 45, 13);
  drawPrize(ctx, 6, 45, 47, 10.5);
  drawPrize(ctx, 4, 38, 29, 8.5);
  drawPrize(ctx, 2, 21, 25, 6);
  drawPrize(ctx, 4, 30, 11, 6.5);
  ctx.strokeStyle = "#46e0ff";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(8, 6);
  ctx.lineTo(8, 52);
  ctx.arcTo(8, 60, 16, 60, 8);
  ctx.lineTo(48, 60);
  ctx.arcTo(56, 60, 56, 52, 8);
  ctx.lineTo(56, 6);
  ctx.stroke();
  ctx.restore();
}

// ----- Helpers -----

/** ctx.roundRect, for the phones that don't have it yet. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Lighten (amount above zero) or darken a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const mix = amount < 0 ? 0 : 255;
  const share = Math.abs(amount);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    return Math.round(c + (mix - c) * share);
  };
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

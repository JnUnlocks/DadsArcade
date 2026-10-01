/**
 * Plasma Sort's drawing: the rack, the tubes, the cells, and the result card.
 *
 * The whole game is reading colours at a glance, so the look is built around
 * that and nothing else is allowed to compete: a dark, quiet backdrop, thin
 * glass, and cells that are the only saturated thing on screen. Cells are
 * separate capsules rather than a continuous liquid because the puzzle is about
 * counting -- "are there three reds in that tube or two?" has to be answerable
 * without squinting.
 */

import { CAPACITY } from "./puzzle.ts";

const FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const INK = "#e8f0ff";
export const DIM = "rgba(142,163,200,0.8)";
export const ACCENT = "#46e0ff";
export const WARM = "#ffc14d";

interface Plasma {
  base: string;
  light: string;
  dark: string;
}

function plasma(base: string): Plasma {
  return { base, light: mix(base, "#ffffff", 0.38), dark: mix(base, "#05070f", 0.3) };
}

/**
 * Colour 1..n. Ordered so the first four (the warm-up) and the first six (the
 * daily) are each as far apart as the set allows.
 */
const PLASMA: readonly Plasma[] = [
  plasma("#ff4b5c"), // red
  plasma("#35d6ff"), // cyan
  plasma("#ffc233"), // amber
  plasma("#3ddc84"), // green
  plasma("#a66bff"), // violet
  plasma("#ff7ad9"), // pink
  plasma("#5b7bff"), // blue
  plasma("#e8f0ff"), // white
];

export function plasmaColour(colour: number): string {
  return (PLASMA[(colour - 1) % PLASMA.length] ?? PLASMA[0]!).base;
}

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const ca = (pa >> shift) & 0xff;
    const cb = (pb >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  };
  const value = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  return `#${value.toString(16).padStart(6, "0")}`;
}

// ----- Layout -----

export interface Layout {
  /** Multiplier on the base geometry, so the rack fills whatever phone it's on. */
  scale: number;
  cellW: number;
  cellH: number;
  gap: number;
  tubeW: number;
  tubeH: number;
  /** Horizontal distance between tube centres -- also the tap target width. */
  pitch: number;
  /** Room kept above each tube for a lifted run. */
  headroom: number;
  /** How far a selected run rises. */
  lift: number;
  tubes: Array<{ x: number; bottom: number }>;
}

const BASE = { cellW: 36, cellH: 27, gap: 3, wall: 5, mouth: 13, headroom: 32, rowGap: 16, lift: 19 };

/** Lay `count` tubes out in two rows inside the band between top and bottom. */
export function computeLayout(count: number, w: number, top: number, bottom: number): Layout {
  const rows = count > 4 ? 2 : 1;
  const perRow = Math.ceil(count / rows);

  const tubeW = BASE.cellW + BASE.wall * 2;
  const tubeH = BASE.wall + CAPACITY * BASE.cellH + (CAPACITY - 1) * BASE.gap + BASE.mouth;
  const rowH = tubeH + BASE.headroom;
  const needH = rows * rowH + (rows - 1) * BASE.rowGap;
  const needW = perRow * (tubeW + 26);

  const scale = Math.max(0.6, Math.min(1.3, (bottom - top) / needH, (w - 12) / needW));
  const pitch = Math.min((w - 12) / perRow, (tubeW + 44) * scale);

  const blockH = needH * scale;
  const blockTop = top + Math.max(0, (bottom - top - blockH) / 2);

  const tubes: Layout["tubes"] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = row === rows - 1 ? count - perRow * (rows - 1) : perRow;
    const col = i - row * perRow;
    tubes.push({
      x: w / 2 + (col - (inRow - 1) / 2) * pitch,
      bottom: blockTop + (row + 1) * rowH * scale + row * BASE.rowGap * scale,
    });
  }

  return {
    scale,
    cellW: BASE.cellW * scale,
    cellH: BASE.cellH * scale,
    gap: BASE.gap * scale,
    tubeW: tubeW * scale,
    tubeH: tubeH * scale,
    pitch,
    headroom: BASE.headroom * scale,
    lift: BASE.lift * scale,
    tubes,
  };
}

/** Centre of the cell in `slot` (0 = bottom) of a tube. */
export function cellCentre(layout: Layout, tube: number, slot: number): { x: number; y: number } {
  const t = layout.tubes[tube]!;
  const wall = BASE.wall * layout.scale;
  return {
    x: t.x,
    y: t.bottom - wall - layout.cellH / 2 - slot * (layout.cellH + layout.gap),
  };
}

/** Which tube a tap landed on, or -1. The whole column is the target. */
export function tubeAt(layout: Layout, x: number, y: number): number {
  for (let i = 0; i < layout.tubes.length; i += 1) {
    const t = layout.tubes[i]!;
    if (
      Math.abs(x - t.x) <= layout.pitch / 2 &&
      y >= t.bottom - layout.tubeH - layout.headroom &&
      y <= t.bottom + 14 * layout.scale
    ) {
      return i;
    }
  }
  return -1;
}

// ----- Backdrop -----

/** Fixed star positions: a field that twinkles in place rather than crawling. */
const STARS: ReadonlyArray<{ x: number; y: number; r: number; phase: number }> = (() => {
  const out = [];
  let s = 0x9e3779b9;
  const next = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 46; i += 1) {
    out.push({ x: next(), y: next(), r: 0.5 + next() * 0.8, phase: next() * 6.28 });
  }
  return out;
})();

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  reducedMotion: boolean,
): void {
  ctx.save();
  const wash = ctx.createRadialGradient(w / 2, h * 0.46, 20, w / 2, h * 0.46, h * 0.7);
  wash.addColorStop(0, "#111a36");
  wash.addColorStop(1, "#05070f");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#b9cdf5";
  for (const star of STARS) {
    const twinkle = reducedMotion ? 0.5 : 0.35 + 0.3 * Math.sin(time * 0.9 + star.phase);
    ctx.globalAlpha = twinkle * 0.6;
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The rail each row of tubes stands on. */
export function drawRack(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const rows = new Map<number, { min: number; max: number }>();
  for (const t of layout.tubes) {
    const row = rows.get(t.bottom) ?? { min: t.x, max: t.x };
    row.min = Math.min(row.min, t.x);
    row.max = Math.max(row.max, t.x);
    rows.set(t.bottom, row);
  }
  ctx.save();
  for (const [bottom, { min, max }] of rows) {
    const y = bottom + 7 * layout.scale;
    const x0 = min - layout.tubeW * 0.78;
    const x1 = max + layout.tubeW * 0.78;
    const rail = ctx.createLinearGradient(x0, 0, x1, 0);
    rail.addColorStop(0, "rgba(70,224,255,0)");
    rail.addColorStop(0.15, "rgba(70,224,255,0.4)");
    rail.addColorStop(0.85, "rgba(70,224,255,0.4)");
    rail.addColorStop(1, "rgba(70,224,255,0)");
    ctx.fillStyle = rail;
    ctx.fillRect(x0, y, x1 - x0, 1.5);
  }
  ctx.restore();
}

// ----- Cells -----

/** The shapes that stand in for colour when high contrast is on. */
function drawGlyph(ctx: CanvasRenderingContext2D, colour: number, r: number): void {
  ctx.beginPath();
  switch ((colour - 1) % 8) {
    case 0: // circle
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 1: // triangle
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.85);
      ctx.lineTo(-r, r * 0.85);
      break;
    case 2: // square
      ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      break;
    case 3: // diamond
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(r * 1.1, 0);
      ctx.lineTo(0, r * 1.1);
      ctx.lineTo(-r * 1.1, 0);
      break;
    case 4: // plus
      ctx.rect(-r, -r * 0.33, r * 2, r * 0.66);
      ctx.rect(-r * 0.33, -r, r * 0.66, r * 2);
      break;
    case 5: // bar
      ctx.rect(-r * 1.2, -r * 0.4, r * 2.4, r * 0.8);
      break;
    case 6: // two dots
      ctx.arc(-r * 0.75, 0, r * 0.5, 0, Math.PI * 2);
      ctx.arc(r * 0.75, 0, r * 0.5, 0, Math.PI * 2);
      break;
    default: // ring
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2, true);
      break;
  }
  ctx.closePath();
  ctx.fill();
}

export interface CellStyle {
  highContrast: boolean;
  /** 0..1 halo -- a lifted or flying cell. */
  glow?: number;
  /** Landing squash, 0..1 (1 = just landed). */
  squash?: number;
  alpha?: number;
}

export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: number,
  style: CellStyle,
): void {
  const p = PLASMA[(colour - 1) % PLASMA.length] ?? PLASMA[0]!;
  const squash = style.squash ?? 0;
  const sw = w * (1 + 0.07 * squash);
  const sh = h * (1 - 0.14 * squash);
  // Squash from the bottom edge, so a landing cell compresses onto what's
  // under it instead of shrinking in mid-air.
  const top = y + h / 2 - sh;
  const radius = Math.min(sh * 0.36, 10);

  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;

  if ((style.glow ?? 0) > 0) {
    ctx.shadowColor = p.base;
    ctx.shadowBlur = 14 * (style.glow ?? 0);
  }

  const fill = ctx.createLinearGradient(0, top, 0, top + sh);
  fill.addColorStop(0, p.light);
  fill.addColorStop(0.45, p.base);
  fill.addColorStop(1, p.dark);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x - sw / 2, top, sw, sh, radius);
  ctx.fill();
  ctx.shadowBlur = 0;

  // One soft highlight along the top: enough to read as a lit capsule,
  // not enough to look like a button.
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.roundRect(x - sw / 2 + sw * 0.14, top + sh * 0.13, sw * 0.72, sh * 0.17, sh * 0.085);
  ctx.fill();

  if (style.highContrast) {
    ctx.translate(x, top + sh * 0.58);
    ctx.fillStyle = "rgba(5,7,15,0.72)";
    drawGlyph(ctx, colour, sh * 0.2);
  }
  ctx.restore();
}

// ----- Tubes -----

export interface TubeStyle {
  /** Colour of the finished contents, or 0 while the tube is still in play. */
  sealed: number;
  /** 0..1, decays after the seal lands. */
  sealPulse: number;
  selected: boolean;
  /** A legal destination for the run currently lifted. */
  target: boolean;
  /** Sideways nudge while a refused tap shakes the tube. */
  offsetX: number;
  time: number;
  reducedMotion: boolean;
}

function tubePath(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number): void {
  const r = Math.min(w * 0.36, 16);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, top);
  ctx.lineTo(x - w / 2, top + h - r);
  ctx.quadraticCurveTo(x - w / 2, top + h, x - w / 2 + r, top + h);
  ctx.lineTo(x + w / 2 - r, top + h);
  ctx.quadraticCurveTo(x + w / 2, top + h, x + w / 2, top + h - r);
  ctx.lineTo(x + w / 2, top);
}

/** The glass behind the cells. */
export function drawTubeBack(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  index: number,
  style: TubeStyle,
): void {
  const t = layout.tubes[index]!;
  const x = t.x + style.offsetX;
  const top = t.bottom - layout.tubeH;

  ctx.save();
  tubePath(ctx, x, top, layout.tubeW, layout.tubeH);
  ctx.closePath();
  const glass = ctx.createLinearGradient(x - layout.tubeW / 2, 0, x + layout.tubeW / 2, 0);
  glass.addColorStop(0, "rgba(150,180,235,0.11)");
  glass.addColorStop(0.5, "rgba(150,180,235,0.035)");
  glass.addColorStop(1, "rgba(150,180,235,0.09)");
  ctx.fillStyle = glass;
  ctx.fill();

  if (style.target) {
    // A quiet "you can pour here" under the tube. It's a hint, not a prompt:
    // bright enough for a six-year-old to follow, dim enough to ignore.
    const pulse = style.reducedMotion ? 0.8 : 0.6 + 0.4 * Math.sin(style.time * 5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, t.bottom + 16 * layout.scale, 3 * layout.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The glass outline, rim and reflections, drawn over the cells. */
export function drawTubeFront(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  index: number,
  style: TubeStyle,
): void {
  const t = layout.tubes[index]!;
  const x = t.x + style.offsetX;
  const top = t.bottom - layout.tubeH;
  const w = layout.tubeW;
  const sealed = style.sealed > 0;
  const colour = sealed ? plasmaColour(style.sealed) : "";

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Reflection down the left wall, over the cells -- this one stroke is what
  // makes it read as glass in front of something rather than a box around it.
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2 * layout.scale;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 4.5 * layout.scale, top + 12 * layout.scale);
  ctx.lineTo(x - w / 2 + 4.5 * layout.scale, t.bottom - 20 * layout.scale);
  ctx.stroke();

  if (sealed) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = 6 + 16 * style.sealPulse;
    ctx.strokeStyle = mix(colour, "#ffffff", 0.25 + 0.5 * style.sealPulse);
  } else if (style.selected) {
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
  } else {
    ctx.strokeStyle = "rgba(176,200,240,0.5)";
  }
  ctx.lineWidth = 1.6;
  tubePath(ctx, x, top, w, layout.tubeH);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // The rim, or -- once the tube is finished -- the cap that closes it.
  const rimW = w + 7 * layout.scale;
  const rimH = 5 * layout.scale;
  ctx.beginPath();
  ctx.roundRect(x - rimW / 2, top - rimH / 2, rimW, rimH, rimH / 2);
  if (sealed) {
    ctx.fillStyle = mix(colour, "#ffffff", 0.2 + 0.6 * style.sealPulse);
    ctx.fill();
  } else {
    ctx.fillStyle = "#0b1226";
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ----- Text -----

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  options: { bold?: boolean; align?: CanvasTextAlign; spacing?: number } = {},
): void {
  ctx.save();
  ctx.font = `${options.bold ? "700 " : ""}${size}px ${FONT_STACK}`;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  // letterSpacing is recent; where it's missing the text is simply tighter.
  if (options.spacing && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${options.spacing}px`;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  filled: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.46;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.lineJoin = "round";
  if (filled) {
    ctx.shadowColor = WARM;
    ctx.shadowBlur = 14;
    ctx.fillStyle = WARM;
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(142,163,200,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

// ----- The title card and the cabinet art -----

/** A row of finished tubes, bobbing: what the puzzle looks like when it's done. */
export function drawTitleArt(
  ctx: CanvasRenderingContext2D,
  w: number,
  centreY: number,
  time: number,
  highContrast: boolean,
  reducedMotion: boolean,
): void {
  const colours = [1, 3, 4, 2, 5];
  const layout = computeLayout(colours.length, w, centreY - 80, centreY + 80);
  // One row, pulled in tight: this is a picture, not a board.
  const pitch = layout.tubeW * 1.34;
  layout.tubes = colours.map((_, i) => ({
    x: w / 2 + (i - (colours.length - 1) / 2) * pitch,
    bottom:
      centreY + layout.tubeH / 2 + (reducedMotion ? 0 : Math.sin(time * 1.6 + i * 0.9) * 3),
  }));

  colours.forEach((colour, i) => {
    const style: TubeStyle = {
      sealed: colour,
      sealPulse: reducedMotion ? 0.15 : 0.15 + 0.15 * Math.sin(time * 1.6 + i * 0.9),
      selected: false,
      target: false,
      offsetX: 0,
      time,
      reducedMotion,
    };
    drawTubeBack(ctx, layout, i, style);
    for (let slot = 0; slot < CAPACITY; slot += 1) {
      const c = cellCentre(layout, i, slot);
      drawCell(ctx, c.x, c.y, layout.cellW, layout.cellH, colour, { highContrast });
    }
    drawTubeFront(ctx, layout, i, style);
  });
}

/** Cabinet marquee: three tubes mid-sort. Drawn in a 32-unit box. */
export function drawPlasmaIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const scale = size / 32;
  ctx.save();
  ctx.scale(scale, scale);

  const tubes: number[][] = [
    [1, 1, 2, 3],
    [2, 2, 2],
    [3, 3, 1],
  ];
  tubes.forEach((cells, i) => {
    const x = 6.5 + i * 9.5;
    cells.forEach((colour, slot) => {
      ctx.fillStyle = plasmaColour(colour);
      ctx.beginPath();
      ctx.roundRect(x - 3, 23 - slot * 5.2, 6, 4.4, 1.6);
      ctx.fill();
    });
    ctx.strokeStyle = "rgba(210,225,255,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 4, 5);
    ctx.lineTo(x - 4, 26);
    ctx.quadraticCurveTo(x - 4, 29, x - 1, 29);
    ctx.lineTo(x + 1, 29);
    ctx.quadraticCurveTo(x + 4, 29, x + 4, 26);
    ctx.lineTo(x + 4, 5);
    ctx.stroke();
  });

  ctx.restore();
}

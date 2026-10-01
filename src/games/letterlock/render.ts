/**
 * Letter Lock's drawing: the grid of tiles, the title card, the cabinet art.
 *
 * The genre has one famous look -- flat squares in green, yellow and grey --
 * and this deliberately isn't it. The colours are the arcade's own cyan and
 * amber, and each mark is a different *shape* as well as a different colour:
 *
 *   locked  a solid, lit block        the tumbler has dropped into place
 *   close   a ring around the letter  right letter, still turning
 *   out     a flat, unlit tile        nothing there
 *
 * Shape first, colour second, so the grid reads the same to someone who can't
 * tell cyan from amber, and at arm's length to someone who can.
 */

import { WORD_LENGTH, MAX_GUESSES, type Mark } from "./rules.ts";

const FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const INK = "#e8f0ff";
export const DIM = "rgba(142,163,200,0.8)";
/** Right letter, right spot. The arcade's cyan. */
export const LOCKED = "#46e0ff";
/** In the word, somewhere else. The arcade's amber. */
export const CLOSE = "#ffc14d";
/** Not in the word. */
export const SLATE = "#182238";
/** The cabinet's own colour, for the things that belong to this game alone. */
export const MINT = "#2ce88a";

// ----- Layout -----

export interface Layout {
  /** Side of one tile, in virtual units. */
  tile: number;
  gap: number;
  /** Left edge of the first column and top edge of the first row. */
  left: number;
  top: number;
}

const MAX_TILE = 58;
const MIN_TILE = 30;

/** Fit the six-by-five grid into the band between `top` and `bottom`. */
export function computeLayout(w: number, top: number, bottom: number): Layout {
  const gap = 6;
  const byHeight = (bottom - top - (MAX_GUESSES - 1) * gap) / MAX_GUESSES;
  const byWidth = (w - 48 - (WORD_LENGTH - 1) * gap) / WORD_LENGTH;
  const tile = Math.max(MIN_TILE, Math.min(MAX_TILE, byHeight, byWidth));
  const blockW = WORD_LENGTH * tile + (WORD_LENGTH - 1) * gap;
  const blockH = MAX_GUESSES * tile + (MAX_GUESSES - 1) * gap;
  return {
    tile,
    gap,
    left: (w - blockW) / 2,
    top: top + Math.max(0, (bottom - top - blockH) / 2),
  };
}

export function tileCentre(layout: Layout, row: number, col: number): { x: number; y: number } {
  return {
    x: layout.left + col * (layout.tile + layout.gap) + layout.tile / 2,
    y: layout.top + row * (layout.tile + layout.gap) + layout.tile / 2,
  };
}

// ----- Tiles -----

/** A tile's face: a mark once its guess is in, or one of the two blank states. */
export type Face = Mark | "empty" | "typed";

export interface TileStyle {
  highContrast: boolean;
  /** 0..1 vertical squash -- the tile turning over as its mark is revealed. */
  scaleY?: number;
  /** Uniform scale, for the pop when a letter is typed. */
  scale?: number;
  alpha?: number;
  /** 0..1 halo on a locked tile. */
  glow?: number;
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  letter: string,
  face: Face,
  style: TileStyle,
): void {
  const half = size / 2;
  const radius = size * 0.17;
  const hc = style.highContrast;
  const scale = style.scale ?? 1;

  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale * (style.scaleY ?? 1));

  ctx.beginPath();
  ctx.roundRect(-half, -half, size, size, radius);

  let letterColour = INK;

  switch (face) {
    case "empty":
      ctx.fillStyle = "rgba(10,16,34,0.55)";
      ctx.fill();
      ctx.strokeStyle = hc ? "rgba(232,240,255,0.55)" : "rgba(142,163,200,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;

    case "typed":
      ctx.fillStyle = "rgba(10,16,34,0.85)";
      ctx.fill();
      ctx.strokeStyle = hc ? "#ffffff" : "rgba(232,240,255,0.8)";
      ctx.lineWidth = hc ? 2.5 : 1.75;
      ctx.stroke();
      letterColour = hc ? "#ffffff" : INK;
      break;

    case "locked": {
      if ((style.glow ?? 0) > 0) {
        ctx.shadowColor = LOCKED;
        ctx.shadowBlur = 16 * (style.glow ?? 0);
      }
      const fill = ctx.createLinearGradient(0, -half, 0, half);
      fill.addColorStop(0, "#8fefff");
      fill.addColorStop(0.5, LOCKED);
      fill.addColorStop(1, "#22b6dc");
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (hc) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      letterColour = "#04121c";
      break;
    }

    case "close":
      ctx.fillStyle = hc ? "#0a0f1e" : "rgba(255,193,77,0.1)";
      ctx.fill();
      ctx.strokeStyle = hc ? "rgba(255,193,77,0.6)" : "rgba(255,193,77,0.22)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      // The ring is the cue; the tint above is only there so a row of them
      // still looks like a row of tiles.
      ctx.beginPath();
      ctx.arc(0, 0, half * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = CLOSE;
      ctx.lineWidth = hc ? size * 0.085 : size * 0.06;
      ctx.stroke();
      letterColour = hc ? "#ffffff" : CLOSE;
      break;

    case "out":
      ctx.fillStyle = hc ? "#0a0f1e" : SLATE;
      ctx.fill();
      if (hc) {
        ctx.strokeStyle = "rgba(142,163,200,0.5)";
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      letterColour = hc ? "rgba(190,204,230,0.95)" : "rgba(142,163,200,0.72)";
      break;
  }

  if (letter) {
    ctx.font = `700 ${size * (face === "close" ? 0.46 : 0.52)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = letterColour;
    // A hair below centre: capitals have no descenders, so true middle looks high.
    ctx.fillText(letter.toUpperCase(), 0, size * 0.035);
  }
  ctx.restore();
}

// ----- Backdrop -----

/**
 * A dark wash with the face of a combination dial behind it, turning slowly.
 * Faint enough that it's felt more than seen: the tiles are the only thing on
 * this screen that should be read.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  reducedMotion: boolean,
): void {
  ctx.save();
  const wash = ctx.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.42, h * 0.72);
  wash.addColorStop(0, "#0f1c2e");
  wash.addColorStop(1, "#05070f");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  ctx.translate(w / 2, h * 0.42);
  ctx.rotate(reducedMotion ? 0 : time * 0.02);
  ctx.strokeStyle = "rgba(120,200,190,0.07)";
  ctx.lineWidth = 1;
  for (const r of [w * 0.52, w * 0.7]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const ticks = 60;
  ctx.beginPath();
  for (let i = 0; i < ticks; i += 1) {
    const a = (i / ticks) * Math.PI * 2;
    const inner = w * (i % 5 === 0 ? 0.55 : 0.6);
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * w * 0.66, Math.sin(a) * w * 0.66);
  }
  ctx.stroke();
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

// ----- The title card and the cabinet art -----

const EXAMPLE: ReadonlyArray<{ letter: string; mark: Mark }> = [
  { letter: "c", mark: "locked" },
  { letter: "o", mark: "close" },
  { letter: "d", mark: "out" },
  { letter: "e", mark: "locked" },
  { letter: "s", mark: "out" },
];

const LEGEND: ReadonlyArray<{ mark: Mark; text: string }> = [
  { mark: "locked", text: "RIGHT LETTER, RIGHT SPOT" },
  { mark: "close", text: "RIGHT LETTER, WRONG SPOT" },
  { mark: "out", text: "NOT IN THE WORD" },
];

/**
 * One guess with its marks, and what each mark means. The cabinet's blurb has
 * one line to explain the controls; this is where the rest of the rules live,
 * and it's the first thing on screen every time the game is opened.
 */
export function drawTitleArt(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  time: number,
  highContrast: boolean,
  reducedMotion: boolean,
  textScale: number,
): void {
  const tile = 42;
  const gap = 6;
  const rowW = EXAMPLE.length * tile + (EXAMPLE.length - 1) * gap;
  EXAMPLE.forEach((cell, i) => {
    const bob = reducedMotion ? 0 : Math.sin(time * 1.6 + i * 0.8) * 2.5;
    drawTile(
      ctx,
      (w - rowW) / 2 + i * (tile + gap) + tile / 2,
      top + tile / 2 + bob,
      tile,
      cell.letter,
      cell.mark,
      { highContrast, glow: cell.mark === "locked" ? 0.4 : 0 },
    );
  });

  const size = 9.5 * textScale;
  const chip = 15 * textScale;
  const lineH = 23 * textScale;
  // Measured, so the legend is centred as a block whatever the text size.
  ctx.save();
  ctx.font = `${size}px ${FONT_STACK}`;
  const widest = Math.max(...LEGEND.map((line) => ctx.measureText(line.text).width + line.text.length));
  ctx.restore();
  const blockW = chip + 10 + widest;
  const x = (w - blockW) / 2;

  LEGEND.forEach((line, i) => {
    const y = top + tile + 26 * textScale + i * lineH;
    drawTile(ctx, x + chip / 2, y, chip, "", line.mark, { highContrast });
    drawText(ctx, line.text, x + chip + 10, y, size, DIM, { align: "left", spacing: 1 });
  });
}

/** Height of drawTitleArt's block, so the caller can centre it. */
export function titleArtHeight(textScale: number): number {
  return 42 + 26 * textScale + 2 * 23 * textScale + 10 * textScale;
}

/** Cabinet marquee: a combination padlock with three tumblers. 32-unit box. */
export function drawLockIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const scale = size / 32;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Shackle.
  ctx.strokeStyle = "rgba(214,228,255,0.92)";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(10.5, 15);
  ctx.lineTo(10.5, 11);
  ctx.arc(16, 11, 5.5, Math.PI, 0);
  ctx.lineTo(21.5, 15);
  ctx.stroke();

  // Body.
  ctx.beginPath();
  ctx.roundRect(5.5, 14, 21, 14.5, 3.4);
  ctx.fillStyle = "#12203a";
  ctx.fill();
  ctx.strokeStyle = MINT;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Three tumblers: one locked, one close, one out.
  const tile = 4.8;
  const gap = 1.3;
  const left = 16 - (tile * 3 + gap * 2) / 2;
  const top = 18.6;
  ctx.fillStyle = LOCKED;
  ctx.beginPath();
  ctx.roundRect(left, top, tile, tile, 1);
  ctx.fill();

  ctx.strokeStyle = CLOSE;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(left + tile + gap + tile / 2, top + tile / 2, tile / 2 - 0.4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#4a587a";
  ctx.beginPath();
  ctx.roundRect(left + 2 * (tile + gap), top, tile, tile, 1);
  ctx.fill();

  ctx.restore();
}

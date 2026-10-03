/**
 * Two ways to draw the same snake.
 *
 * CLASSIC is the screen from the old phone: two colours, a pale green LCD and
 * the dark pixels on it, nothing interpolated -- the snake jumps a whole cell
 * at a time because that's what it did. HYPER is the arcade's own neon, with
 * the snake gliding between cells.
 *
 * Everything is paths and rectangles, like the rest of the arcade.
 */

import { COLS, DIR_VECTORS, ROWS, type Cell, type Dir, type Snake } from "./rules.ts";
import type { Laser, LaserPhase, Stage } from "./stages.ts";

export interface Layout {
  cell: number;
  /** Top-left corner of cell (0, 0). */
  x0: number;
  y0: number;
}

export type PickupKind = "shield" | "magnet" | "nut";

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const LCD = {
  bg: "#c7f0d8",
  ink: "#43523d",
  inkStrong: "#1c2418",
  bezel: "#1b2233",
};

export const NEON = {
  floor: "#081024",
  grid: "rgba(70, 224, 255, 0.07)",
  frame: "#2a3550",
  frameEdge: "#55648a",
  snake: "#2f7bff",
  snakeLight: "#7fc0ff",
  snakeBoost: "#ffd84d",
  apple: "#ff3b4e",
  laser: "#ff3348",
  shield: "#46e0ff",
  magnet: "#ff4d6d",
  nut: "#ffc14d",
  hazard: "#ffc14d",
};

export const cellCentre = (layout: Layout, col: number, row: number) => ({
  x: layout.x0 + (col + 0.5) * layout.cell,
  y: layout.y0 + (row + 0.5) * layout.cell,
});

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// =====================================================================
// CLASSIC
// =====================================================================

/** Room the LCD needs around the playfield: a header line and a wall. */
export const LCD_HEADER = 22;
export const LCD_PAD = 9;

export function drawLcdPanel(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  highContrast: boolean,
): void {
  const w = layout.cell * COLS;
  const h = layout.cell * ROWS;
  const x = layout.x0 - LCD_PAD;
  const y = layout.y0 - LCD_PAD - LCD_HEADER;

  // The phone's bezel, then the screen set into it.
  ctx.fillStyle = LCD.bezel;
  roundedRect(ctx, x - 4, y - 4, w + LCD_PAD * 2 + 8, h + LCD_PAD * 2 + LCD_HEADER + 8, 12);
  ctx.fill();
  ctx.fillStyle = highContrast ? "#e6ffe9" : LCD.bg;
  roundedRect(ctx, x, y, w + LCD_PAD * 2, h + LCD_PAD * 2 + LCD_HEADER, 8);
  ctx.fill();

  // The wall. It's solid in this one: touch it and that's the game.
  ctx.strokeStyle = lcdInk(highContrast);
  ctx.lineWidth = 3;
  ctx.strokeRect(layout.x0 - 3.5, layout.y0 - 3.5, w + 7, h + 7);
}

const lcdInk = (highContrast: boolean): string => (highContrast ? LCD.inkStrong : LCD.ink);

/**
 * Score on the left and the level beside it. When a bonus is out, its
 * countdown takes the right, like the original.
 */
export function drawLcdHeader(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  score: number,
  level: number,
  bonusValue: number | null,
  highContrast: boolean,
): void {
  const y = layout.y0 - LCD_PAD - LCD_HEADER / 2 + 2;
  ctx.save();
  ctx.fillStyle = lcdInk(highContrast);
  ctx.font = `700 15px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(String(score).padStart(4, "0"), layout.x0 - 2, y);
  ctx.textAlign = "center";
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(`LEVEL ${level}`, layout.x0 + (layout.cell * COLS) / 2, y);
  ctx.font = `700 15px ${FONT}`;
  if (bonusValue !== null) {
    ctx.textAlign = "right";
    ctx.fillText(String(bonusValue).padStart(3, "0"), layout.x0 + layout.cell * COLS + 2, y);
    drawLcdBug(ctx, layout.x0 + layout.cell * COLS - 44, y - 1, 13);
  }
  ctx.restore();
}

export function drawLcdSnake(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  snake: Snake,
  highContrast: boolean,
): void {
  const { cell } = layout;
  const inset = Math.max(1.5, cell * 0.14);
  const thick = cell - inset * 2;
  ctx.fillStyle = lcdInk(highContrast);

  // Each segment is joined to the next, so the body reads as one line with a
  // clear gap between rows of itself rather than as a string of beads.
  for (let i = 0; i < snake.body.length; i += 1) {
    const a = snake.body[i]!;
    const b = snake.body[i + 1] ?? a;
    const left = layout.x0 + Math.min(a.col, b.col) * cell + inset;
    const top = layout.y0 + Math.min(a.row, b.row) * cell + inset;
    ctx.fillRect(
      left,
      top,
      thick + Math.abs(a.col - b.col) * cell,
      thick + Math.abs(a.row - b.row) * cell,
    );
  }

  // One light pixel for an eye, on the side of the head facing forward.
  const head = snake.body[0]!;
  const v = DIR_VECTORS[snake.dir];
  const c = cellCentre(layout, head.col, head.row);
  const eye = Math.max(2, cell * 0.16);
  ctx.fillStyle = highContrast ? "#e6ffe9" : LCD.bg;
  ctx.fillRect(
    c.x + v.dc * thick * 0.2 - v.dr * thick * 0.2 - eye / 2,
    c.y + v.dr * thick * 0.2 + v.dc * thick * 0.2 - eye / 2,
    eye,
    eye,
  );
}

/** Four pixels in a diamond. */
export function drawLcdFood(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  food: Cell,
  highContrast: boolean,
): void {
  const c = cellCentre(layout, food.col, food.row);
  const px = layout.cell * 0.26;
  ctx.fillStyle = lcdInk(highContrast);
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    ctx.fillRect(c.x + dx * px - px / 2, c.y + dy * px - px / 2, px, px);
  }
}

export function drawLcdBonus(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  cell: Cell,
  highContrast: boolean,
): void {
  const c = cellCentre(layout, cell.col, cell.row);
  ctx.fillStyle = lcdInk(highContrast);
  drawLcdBug(ctx, c.x, c.y, layout.cell * 0.9);
}

/** A blocky little bug: a body, a head and four legs. Caller sets fillStyle. */
function drawLcdBug(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const u = size / 6;
  ctx.fillRect(x - 2 * u, y - u, 4 * u, 2 * u);
  ctx.fillRect(x - u, y - 2 * u, 2 * u, u);
  ctx.fillRect(x - 3 * u, y - 2 * u, u, u);
  ctx.fillRect(x + 2 * u, y - 2 * u, u, u);
  ctx.fillRect(x - 3 * u, y + u, u, u);
  ctx.fillRect(x + 2 * u, y + u, u, u);
}

export function drawLcdBanner(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  text: string,
  highContrast: boolean,
): void {
  const cx = layout.x0 + (layout.cell * COLS) / 2;
  const cy = layout.y0 + layout.cell * ROWS * 0.3;
  ctx.save();
  ctx.font = `700 18px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = lcdInk(highContrast);
  ctx.fillRect(cx - w / 2, cy - 15, w, 30);
  ctx.fillStyle = highContrast ? "#e6ffe9" : LCD.bg;
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

// =====================================================================
// HYPER
// =====================================================================

export const FRAME = 7;

export function drawNeonBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#060a18");
  sky.addColorStop(1, "#0c1330");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

export function drawNeonBoard(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const { cell, x0, y0 } = layout;
  const w = cell * COLS;
  const h = cell * ROWS;

  // Steel frame with hazard tape at the corners.
  ctx.fillStyle = NEON.frame;
  roundedRect(ctx, x0 - FRAME, y0 - FRAME, w + FRAME * 2, h + FRAME * 2, 6);
  ctx.fill();
  ctx.strokeStyle = NEON.frameEdge;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x0 - FRAME, y0 - FRAME, w + FRAME * 2, h + FRAME * 2, 6);
  ctx.clip();
  for (const [cx, cy] of [
    [x0 - FRAME, y0 - FRAME],
    [x0 + w - 34 + FRAME, y0 - FRAME],
    [x0 - FRAME, y0 + h],
    [x0 + w - 34 + FRAME, y0 + h],
  ] as const) {
    drawHazardTape(ctx, cx, cy, 34, FRAME);
  }
  ctx.restore();

  ctx.fillStyle = NEON.floor;
  ctx.fillRect(x0, y0, w, h);

  // The edges are open in this mode -- out one side, in the other -- so the
  // inside of the frame is lit like a doorway rather than left as a wall.
  ctx.strokeStyle = NEON.shield;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 1, y0 - 1, w + 2, h + 2);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = NEON.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c += 1) {
    ctx.moveTo(x0 + c * cell, y0);
    ctx.lineTo(x0 + c * cell, y0 + h);
  }
  for (let r = 1; r < ROWS; r += 1) {
    ctx.moveTo(x0, y0 + r * cell);
    ctx.lineTo(x0 + w, y0 + r * cell);
  }
  ctx.stroke();
}

function drawHazardTape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = NEON.hazard;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#151a28";
  for (let i = -h; i < w + h; i += 9) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.lineTo(x + i + h + 4.5, y);
    ctx.lineTo(x + i + 4.5, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Apples eaten toward the stage's target, as pips along the top of the frame. */
export function drawGoalPips(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  eaten: number,
  target: number,
): void {
  const w = layout.cell * COLS;
  const gap = 3;
  const span = w - 96;
  const pip = (span - gap * (target - 1)) / target;
  const x = layout.x0 + 48;
  const y = layout.y0 - FRAME + 2;
  for (let i = 0; i < target; i += 1) {
    ctx.fillStyle = i < eaten ? NEON.apple : "rgba(255,255,255,0.14)";
    ctx.fillRect(x + i * (pip + gap), y, pip, FRAME - 4);
  }
}

export function drawCrates(ctx: CanvasRenderingContext2D, layout: Layout, stage: Stage): void {
  const { cell } = layout;
  const pad = cell * 0.08;
  for (const key of stage.crates) {
    const x = layout.x0 + (key % COLS) * cell + pad;
    const y = layout.y0 + Math.floor(key / COLS) * cell + pad;
    const s = cell - pad * 2;
    ctx.fillStyle = "#6b4a2b";
    roundedRect(ctx, x, y, s, s, 2);
    ctx.fill();
    ctx.fillStyle = "#8a6238";
    ctx.fillRect(x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72);
    ctx.strokeStyle = "#3c2814";
    ctx.lineWidth = Math.max(1.5, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.16, y + s * 0.16);
    ctx.lineTo(x + s * 0.84, y + s * 0.84);
    ctx.moveTo(x + s * 0.84, y + s * 0.16);
    ctx.lineTo(x + s * 0.16, y + s * 0.84);
    ctx.stroke();
    ctx.strokeStyle = "#b98a52";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }
}

export function drawLaser(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  laser: Laser,
  phase: LaserPhase,
  time: number,
): void {
  const { cell } = layout;
  const first = laser.cells[0]!;
  const last = laser.cells[laser.cells.length - 1]!;
  const a = cellCentre(layout, first % COLS, Math.floor(first / COLS));
  const b = cellCentre(layout, last % COLS, Math.floor(last / COLS));
  // Stretch the beam from the wall to the far edge of its last cell.
  const horizontal = laser.axis === "row";
  const dir = laser.fromStart ? 1 : -1;
  const from = {
    x: a.x - (horizontal ? dir * cell * 0.5 : 0),
    y: a.y - (horizontal ? 0 : dir * cell * 0.5),
  };
  const to = {
    x: b.x + (horizontal ? dir * cell * 0.5 : 0),
    y: b.y + (horizontal ? 0 : dir * cell * 0.5),
  };

  ctx.save();
  ctx.lineCap = "butt";
  if (phase === "warn") {
    // The tell: a thin flickering line, a full second before it's live.
    ctx.strokeStyle = NEON.laser;
    ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(time * 14));
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  } else if (phase === "on") {
    for (const [width, alpha, colour] of [
      [cell * 0.8, 0.18, NEON.laser],
      [cell * 0.4, 0.4, NEON.laser],
      [cell * 0.14, 1, "#ffe3e6"],
    ] as const) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // The emitter, bolted to the frame. It glows whenever the beam is coming.
  const ex = from.x - (horizontal ? dir * FRAME * 0.5 : 0);
  const ey = from.y - (horizontal ? 0 : dir * FRAME * 0.5);
  ctx.fillStyle = "#151a28";
  ctx.fillRect(ex - 5, ey - 5, 10, 10);
  ctx.fillStyle = phase === "off" ? "#6e1c26" : NEON.laser;
  ctx.fillRect(ex - 2.5, ey - 2.5, 5, 5);
}

export function drawApple(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  food: Cell,
  time: number,
): void {
  const c = cellCentre(layout, food.col, food.row);
  const r = layout.cell * (0.33 + 0.02 * Math.sin(time * 5));
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = NEON.apple;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(c.x, c.y + r * 0.1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffb3bb";
  ctx.beginPath();
  ctx.arc(c.x - r * 0.35, c.y - r * 0.25, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5b3a1a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - r * 0.8);
  ctx.lineTo(c.x + r * 0.15, c.y - r * 1.3);
  ctx.stroke();
  ctx.fillStyle = "#52e07a";
  ctx.beginPath();
  ctx.ellipse(c.x + r * 0.55, c.y - r * 1.15, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** One of the three pickups, centred on (x, y) and about `size` across. */
export function drawPickupGlyph(
  ctx: CanvasRenderingContext2D,
  kind: PickupKind,
  x: number,
  y: number,
  size: number,
): void {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  if (kind === "shield") {
    ctx.fillStyle = NEON.shield;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, -r * 0.6);
    ctx.lineTo(r * 0.85, r * 0.1);
    ctx.quadraticCurveTo(r * 0.7, r * 0.75, 0, r);
    ctx.quadraticCurveTo(-r * 0.7, r * 0.75, -r * 0.85, r * 0.1);
    ctx.lineTo(-r * 0.85, -r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9f8ff";
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 0.45, -r * 0.35);
    ctx.lineTo(r * 0.45, r * 0.05);
    ctx.quadraticCurveTo(r * 0.35, r * 0.4, 0, r * 0.55);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "magnet") {
    ctx.lineCap = "butt";
    ctx.lineWidth = r * 0.5;
    ctx.strokeStyle = NEON.magnet;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.75);
    ctx.lineTo(-r * 0.6, r * 0.1);
    ctx.arc(0, r * 0.1, r * 0.6, Math.PI, 0, true);
    ctx.lineTo(r * 0.6, -r * 0.75);
    ctx.stroke();
    ctx.fillStyle = "#f2f5ff";
    ctx.fillRect(-r * 0.85, -r * 0.95, r * 0.5, r * 0.4);
    ctx.fillRect(r * 0.35, -r * 0.95, r * 0.5, r * 0.4);
  } else {
    ctx.fillStyle = NEON.nut;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a4a00";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPickup(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  kind: PickupKind,
  cell: Cell,
  time: number,
): void {
  const c = cellCentre(layout, cell.col, cell.row);
  const colour = kind === "shield" ? NEON.shield : kind === "magnet" ? NEON.magnet : NEON.nut;
  ctx.save();
  ctx.globalAlpha = 0.2 + 0.08 * Math.sin(time * 6);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(c.x, c.y, layout.cell * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawPickupGlyph(ctx, kind, c.x, c.y + Math.sin(time * 4) * 1.2, layout.cell * 0.72);
}

export interface NeonSnakeLook {
  /** 0..1 of the way through the current step. */
  alpha: number;
  boosting: boolean;
  shielded: boolean;
  magnet: boolean;
  highContrast: boolean;
  time: number;
}

export function drawNeonSnake(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  snake: Snake,
  look: NeonSnakeLook,
): void {
  const { cell } = layout;
  const points = segmentPoints(layout, snake, look.alpha);
  const body = look.boosting ? NEON.snakeBoost : NEON.snake;

  // Clipped to the floor, so a segment sliding out through an open edge
  // disappears into it instead of riding over the frame.
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.x0, layout.y0, cell * COLS, cell * ROWS);
  ctx.clip();
  const light = look.boosting ? "#fff3b8" : look.highContrast ? "#ffffff" : NEON.snakeLight;

  ctx.save();
  // Glow: one wide soft stroke under the whole body. A shadowBlur per segment
  // looks the same and costs a phone its frame rate.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = body;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = cell * 1.25;
  ctx.beginPath();
  points.forEach((p, i) => {
    // Lift the pen where the body crosses an edge, or the glow would be a
    // stripe right across the board.
    const prev = points[i - 1];
    const joined = prev && Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) < cell * 1.6;
    if (joined) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  const size = cell * 0.84;
  for (let i = points.length - 1; i >= 1; i -= 1) {
    const p = points[i]!;
    ctx.fillStyle = body;
    roundedRect(ctx, p.x - size / 2, p.y - size / 2, size, size, cell * 0.2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.55;
    roundedRect(ctx, p.x - size * 0.3, p.y - size * 0.3, size * 0.6, size * 0.6, cell * 0.12);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const head = points[0]!;
  const v = DIR_VECTORS[snake.dir];
  drawNeonHead(ctx, head.x, head.y, cell, snake.dir, body, look.time);
  ctx.restore();

  if (look.magnet) {
    ctx.strokeStyle = NEON.magnet;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -look.time * 22;
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (look.shielded) {
    ctx.strokeStyle = NEON.shield;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.65 + 0.3 * Math.sin(look.time * 6);
    ctx.beginPath();
    ctx.arc(head.x + v.dc, head.y + v.dr, cell * 0.78, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNeonHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  dir: Dir,
  colour: string,
  time: number,
): void {
  const v = DIR_VECTORS[dir];
  const size = cell * 0.96;

  // The tongue flicks out now and then.
  if (Math.sin(time * 5) > 0.55) {
    ctx.strokeStyle = "#ff5fae";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + v.dc * size * 0.45, y + v.dr * size * 0.45);
    ctx.lineTo(x + v.dc * size * 0.8, y + v.dr * size * 0.8);
    ctx.stroke();
  }

  ctx.fillStyle = colour;
  roundedRect(ctx, x - size / 2, y - size / 2, size, size, cell * 0.3);
  ctx.fill();

  // Eyes sit forward and to either side of the direction of travel.
  for (const side of [-1, 1]) {
    const ex = x + v.dc * size * 0.16 - v.dr * side * size * 0.23;
    const ey = y + v.dr * size * 0.16 + v.dc * side * size * 0.23;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, ey, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a1020";
    ctx.beginPath();
    ctx.arc(ex + v.dc * size * 0.05, ey + v.dr * size * 0.05, size * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Where each segment is drawn, sliding from the cell behind it. */
function segmentPoints(
  layout: Layout,
  snake: Snake,
  alpha: number,
): Array<{ x: number; y: number }> {
  return snake.body.map((to, i) => {
    const from = snake.body[i + 1] ?? snake.tailFrom;
    const b = cellCentre(layout, to.col, to.row);
    // A step is one cell. Anything longer went out through an edge and came
    // back in on the far side: slide out for the first half of the step, in
    // for the second, never across the middle of the board.
    const wrap = (d: number) => (Math.abs(d) > 1 ? -Math.sign(d) : d);
    const dc = wrap(to.col - from.col);
    const dr = wrap(to.row - from.row);
    const crossed = dc !== to.col - from.col || dr !== to.row - from.row;
    if (crossed && alpha < 0.5) {
      const a = cellCentre(layout, from.col, from.row);
      return { x: a.x + dc * layout.cell * alpha, y: a.y + dr * layout.cell * alpha };
    }
    return {
      x: b.x - dc * layout.cell * (1 - alpha),
      y: b.y - dr * layout.cell * (1 - alpha),
    };
  });
}

export function drawNeonBanner(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  text: string,
  sub: string,
): void {
  const cx = layout.x0 + (layout.cell * COLS) / 2;
  const cy = layout.y0 + layout.cell * ROWS * 0.3;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 24px ${FONT}`;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#050814";
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, cx, cy);
  if (sub) {
    ctx.font = `700 12px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeText(sub, cx, cy + 24);
    ctx.fillStyle = NEON.nut;
    ctx.fillText(sub, cx, cy + 24);
  }
  ctx.restore();
}

export function drawPopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  alpha: number,
  colour: string,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(5,8,20,0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Status chips under the board: what's active, and for how much longer. */
export function drawStatus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shielded: boolean,
  magnetLeft: number,
  magnetTotal: number,
): void {
  let cx = x;
  if (shielded) {
    drawPickupGlyph(ctx, "shield", cx, y, 15);
    cx += 24;
  }
  if (magnetLeft > 0) {
    drawPickupGlyph(ctx, "magnet", cx, y, 15);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(cx + 12, y - 2, 36, 4);
    ctx.fillStyle = NEON.magnet;
    ctx.fillRect(cx + 12, y - 2, 36 * (magnetLeft / magnetTotal), 4);
  }
}

// =====================================================================
// Title card and cabinet art
// =====================================================================

/** The loop the two demo snakes run on the title card: a ring of cells. */
const DEMO_COLS = 8;
const DEMO_ROWS = 6;

function demoRing(): Cell[] {
  const ring: Cell[] = [];
  for (let c = 0; c < DEMO_COLS; c += 1) ring.push({ col: c, row: 0 });
  for (let r = 1; r < DEMO_ROWS; r += 1) ring.push({ col: DEMO_COLS - 1, row: r });
  for (let c = DEMO_COLS - 2; c >= 0; c -= 1) ring.push({ col: c, row: DEMO_ROWS - 1 });
  for (let r = DEMO_ROWS - 2; r >= 1; r -= 1) ring.push({ col: 0, row: r });
  return ring;
}

const DEMO_RING = demoRing();
const DEMO_LENGTH = 9;

export function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  time: number,
  highContrast: boolean,
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font = `italic 800 30px ${FONT}`;
  ctx.fillStyle = "#ff8a3d";
  ctx.fillText("JB’s", w / 2 - 92, top + 26);

  ctx.font = `italic 800 34px ${FONT}`;
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1c4fd6";
  ctx.strokeText("HYPER SNAKE", w / 2, top + 62);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("HYPER SNAKE", w / 2, top + 62);
  ctx.restore();

  // Two little screens, side by side: the same snake, then and now.
  const cell = 15;
  const screenW = DEMO_COLS * cell;
  const gap = 28;
  const leftX = w / 2 - gap / 2 - screenW;
  const rightX = w / 2 + gap / 2;
  const y = top + 96;

  const stepped = Math.floor(time * 7);
  const smooth = time * 7;

  // Then.
  const lcd: Layout = { cell, x0: leftX, y0: y };
  ctx.fillStyle = LCD.bezel;
  roundedRect(ctx, leftX - 10, y - 10, screenW + 20, DEMO_ROWS * cell + 20, 9);
  ctx.fill();
  ctx.fillStyle = highContrast ? "#e6ffe9" : LCD.bg;
  roundedRect(ctx, leftX - 6, y - 6, screenW + 12, DEMO_ROWS * cell + 12, 5);
  ctx.fill();
  drawLcdSnake(ctx, lcd, demoSnake(stepped), highContrast);
  drawLcdFood(ctx, lcd, { col: 3, row: 3 }, highContrast);

  // Now.
  const neon: Layout = { cell, x0: rightX, y0: y };
  ctx.fillStyle = NEON.frame;
  roundedRect(ctx, rightX - 10, y - 10, screenW + 20, DEMO_ROWS * cell + 20, 9);
  ctx.fill();
  ctx.fillStyle = NEON.floor;
  roundedRect(ctx, rightX - 6, y - 6, screenW + 12, DEMO_ROWS * cell + 12, 5);
  ctx.fill();
  drawApple(ctx, neon, { col: 4, row: 2 }, time);
  drawNeonSnake(ctx, neon, demoSnake(Math.floor(smooth)), {
    alpha: smooth - Math.floor(smooth),
    boosting: false,
    shielded: false,
    magnet: false,
    highContrast,
    time,
  });

  ctx.save();
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(142,163,200,0.9)";
  const labelY = y + DEMO_ROWS * cell + 28;
  ctx.fillText("1997", leftX + screenW / 2, labelY);
  ctx.fillText("TODAY", rightX + screenW / 2, labelY);
  ctx.restore();
}

function demoSnake(step: number): Snake {
  const n = DEMO_RING.length;
  const at = (i: number): Cell => DEMO_RING[(((step - i) % n) + n) % n]!;
  const body: Cell[] = [];
  for (let i = 0; i < DEMO_LENGTH; i += 1) body.push(at(i));
  const head = body[0]!;
  const neck = body[1]!;
  const dir: Dir =
    head.col > neck.col ? "right" : head.col < neck.col ? "left" : head.row > neck.row ? "down" : "up";
  return { body, dir, queue: [], grow: 0, tailFrom: at(DEMO_LENGTH), wraps: false };
}

/** Cabinet marquee: a neon snake curled round an apple, in a 32-unit box. */
export function drawSnakeIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const u = size / 32;
  ctx.save();
  ctx.scale(u, u);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = NEON.snake;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 8;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(5, 25);
    ctx.lineTo(15, 25);
    ctx.lineTo(15, 16);
    ctx.lineTo(6, 16);
    ctx.lineTo(6, 7);
    ctx.lineTo(19, 7);
  };
  path();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  path();
  ctx.stroke();
  drawNeonHead(ctx, 20, 7, 7, "right", NEON.snake, 0);
  ctx.fillStyle = NEON.apple;
  ctx.beginPath();
  ctx.arc(25, 21, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#52e07a";
  ctx.beginPath();
  ctx.ellipse(27, 16.6, 2, 1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** One life: the snake's head, in a ~10x10 box at the origin. */
export function drawSnakeLifeIcon(ctx: CanvasRenderingContext2D, highContrast: boolean): void {
  drawNeonHead(ctx, 0, 0, 12, "right", highContrast ? "#ffffff" : NEON.snake, 0);
}

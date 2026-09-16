/**
 * Brickfall's art.
 *
 * The look is deliberately this arcade's rather than the genre's usual one --
 * see the note in pieces.ts about why that matters here specifically. Blocks
 * are drawn as bevelled tiles in the cabinet's own accent colours, on the same
 * near-black the rest of the machines use, so a Brickfall board reads as one
 * of ours at a glance.
 */

import { PIECE_COLOURS, type PieceKind } from "./pieces.ts";
import { COLS, ROWS, SPAWN_ROWS, type Grid, type Piece } from "./board.ts";
import { occupiedCells } from "./board.ts";

export const PALETTE = {
  well: "#080c16",
  wellEdge: "rgba(142,163,200,0.28)",
  grid: "rgba(142,163,200,0.07)",
  panel: "rgba(142,163,200,0.5)",
  ghost: "rgba(232,240,255,0.22)",
} as const;

export interface Layout {
  x0: number;
  y0: number;
  cell: number;
  panelX: number;
}

/** One settled or falling block. */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: PieceKind,
  alpha = 1,
): void {
  const colour = PIECE_COLOURS[kind];
  const inset = Math.max(1, size * 0.07);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.16);
  ctx.fill();

  // A lit top-left and a shaded bottom-right. Two thin strokes rather than a
  // gradient: gradients cost a paint per block and there can be two hundred
  // of them on screen at level 25.
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(x + inset * 2, y + size - inset * 2.2);
  ctx.lineTo(x + inset * 2, y + inset * 2.2);
  ctx.lineTo(x + size - inset * 2.2, y + inset * 2.2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(x + size - inset * 2, y + inset * 2.4);
  ctx.lineTo(x + size - inset * 2, y + size - inset * 2);
  ctx.lineTo(x + inset * 2.4, y + size - inset * 2);
  ctx.stroke();

  ctx.restore();
}

/** The empty well: floor, walls, and a faint column guide. */
export function drawWell(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void {
  const { x0, y0, cell } = layout;
  const w = cell * COLS;
  const h = cell * ROWS;

  ctx.save();
  ctx.fillStyle = PALETTE.well;
  ctx.fillRect(x0, y0, w, h);

  // Column guides only, no horizontal rules. Rows are read by the blocks
  // themselves, and a full grid makes a busy board unreadable.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c += 1) {
    ctx.beginPath();
    ctx.moveTo(x0 + c * cell, y0);
    ctx.lineTo(x0 + c * cell, y0 + h);
    ctx.stroke();
  }

  ctx.strokeStyle = PALETTE.wellEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();
}

/** Everything that has settled. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  grid: Grid,
  flashRows: ReadonlySet<number>,
  flashOn: boolean,
): void {
  const { x0, y0, cell } = layout;
  for (let row = SPAWN_ROWS; row < grid.length; row += 1) {
    const y = y0 + (row - SPAWN_ROWS) * cell;
    for (let col = 0; col < COLS; col += 1) {
      const kind = grid[row]![col];
      if (!kind) continue;
      if (flashRows.has(row)) {
        if (!flashOn) continue;
        // Clearing rows go white before they vanish, so a Tetris is visibly
        // four rows leaving rather than the stack silently jumping down.
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x0 + col * cell + 1, y + 1, cell - 2, cell - 2);
        ctx.restore();
        continue;
      }
      drawBlock(ctx, x0 + col * cell, y, cell, kind);
    }
  }
}

/** The falling piece. */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  piece: Piece,
  alpha = 1,
): void {
  const { x0, y0, cell } = layout;
  for (const [col, row] of occupiedCells(piece)) {
    if (row < SPAWN_ROWS) continue; // still above the lip of the well
    drawBlock(ctx, x0 + col * cell, y0 + (row - SPAWN_ROWS) * cell, cell, piece.kind, alpha);
  }
}

/**
 * Where the piece will land.
 *
 * Drawn as an outline rather than a translucent copy of the piece: it has to
 * be unmistakably a marker and not a second block, or a busy board becomes
 * hard to read. For a child this is the difference between planning a drop and
 * guessing at one.
 */
export function drawLandingGuide(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  piece: Piece,
  distance: number,
): void {
  if (distance <= 0) return;
  const { x0, y0, cell } = layout;

  ctx.save();
  ctx.strokeStyle = PALETTE.ghost;
  ctx.lineWidth = Math.max(1.5, cell * 0.08);
  ctx.setLineDash([cell * 0.22, cell * 0.18]);

  for (const [col, row] of occupiedCells({ ...piece, row: piece.row + distance })) {
    if (row < SPAWN_ROWS) continue;
    const x = x0 + col * cell;
    const y = y0 + (row - SPAWN_ROWS) * cell;
    ctx.strokeRect(x + cell * 0.14, y + cell * 0.14, cell * 0.72, cell * 0.72);
  }
  ctx.restore();
}

/** The side panel: what's coming, and how far up the climb you are. */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  next: PieceKind,
  level: number,
  maxLevel: number,
  lines: number,
  toGo: number | null,
  largeText: boolean,
): void {
  const { panelX, y0, cell } = layout;
  const scale = largeText ? 1.15 : 1;
  const label = (text: string, y: number) => {
    ctx.fillStyle = PALETTE.panel;
    ctx.font = `${8 * scale}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = "left";
    ctx.fillText(text, panelX, y);
  };
  const value = (text: string, y: number, colour = "#e8f0ff") => {
    ctx.fillStyle = colour;
    ctx.font = `700 ${15 * scale}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = "left";
    ctx.fillText(text, panelX, y);
  };

  ctx.save();
  ctx.textBaseline = "top";

  label("NEXT", y0 + 2);
  const preview = Math.min(cell * 0.72, 16);
  // Drawn from the piece's own cells so the preview matches what arrives,
  // including the pieces whose bounding box has an empty column.
  for (const [c, r] of occupiedCells({ kind: next, rotation: 0, col: 0, row: 0 })) {
    drawBlock(ctx, panelX + c * preview, y0 + 16 + r * preview, preview, next);
  }

  const statsY = y0 + 16 + preview * 3 + 14;
  label("LEVEL", statsY);
  value(`${level}`, statsY + 11, level >= maxLevel ? "#ffc14d" : "#e8f0ff");
  label(`OF ${maxLevel}`, statsY + 30);

  label("LINES", statsY + 50);
  value(`${lines}`, statsY + 61);

  // The countdown is the point of this panel. A running total alone never
  // said that lines are what level you up, or how many are left.
  label(toGo === null ? "TOP LEVEL" : "LEVEL UP IN", statsY + 84);
  if (toGo === null) {
    value("MAX", statsY + 95, "#ffc14d");
  } else {
    value(`${toGo}`, statsY + 95, "#46e0ff");
    label(toGo === 1 ? "LINE" : "LINES", statsY + 114);
  }

  ctx.restore();
}

/** Cabinet marquee art for the arcade menu. */
export function drawBrickfallIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  const scale = size / 32;
  ctx.save();
  ctx.scale(scale, scale);

  // A part-filled well with a piece on its way down.
  ctx.fillStyle = PALETTE.well;
  ctx.fillRect(5, 2, 22, 28);
  ctx.strokeStyle = PALETTE.wellEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(5, 2, 22, 28);

  const cell = 5.5;
  drawBlock(ctx, 5, 6, cell, "I");
  drawBlock(ctx, 10.5, 6, cell, "I");

  drawBlock(ctx, 5, 24.5, cell, "J");
  drawBlock(ctx, 10.5, 24.5, cell, "T");
  drawBlock(ctx, 16, 24.5, cell, "L");
  drawBlock(ctx, 21.5, 24.5, cell, "S");
  drawBlock(ctx, 16, 19, cell, "Z");
  drawBlock(ctx, 21.5, 19, cell, "O");

  ctx.restore();
}

/** The "lives remaining" pip is unused here, but the HUD wants a glyph. */
export function drawBlockLifeIcon(
  ctx: CanvasRenderingContext2D,
  highContrast: boolean,
): void {
  ctx.fillStyle = highContrast ? "#ffffff" : "#46e0ff";
  ctx.fillRect(-4, -4, 8, 8);
}

export { COLS, ROWS };

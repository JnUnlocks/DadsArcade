/**
 * The well, the rules for what fits in it, and the twenty-five level curve.
 *
 * Kept free of the DOM and of the game class so the parts that can be quietly
 * wrong -- collision, line clearing, and the speed ramp -- can be tested
 * directly. A line-clear bug that drops the wrong row is invisible in review
 * and obvious the moment a child is halfway up the well.
 */

import { cellsFor, type PieceKind } from "./pieces.ts";

export const COLS = 10;
export const ROWS = 20;

/** Rows above the visible well where a piece spawns. */
export const SPAWN_ROWS = 2;

/** null is empty; anything else is the colour of the piece that settled. */
export type Cell = PieceKind | null;
export type Grid = Cell[][];

export function emptyGrid(): Grid {
  return Array.from({ length: ROWS + SPAWN_ROWS }, () =>
    Array.from({ length: COLS }, () => null as Cell),
  );
}

export interface Piece {
  kind: PieceKind;
  rotation: number;
  col: number;
  row: number;
}

/** Absolute board cells a piece currently occupies. */
export function occupiedCells(piece: Piece): Array<[number, number]> {
  return cellsFor(piece.kind, piece.rotation).map(
    ([c, r]) => [piece.col + c, piece.row + r] as [number, number],
  );
}

/**
 * Can this piece sit here?
 *
 * Above the top of the well is allowed -- pieces spawn there and must be able
 * to exist before they've fallen in. Only the side walls, the floor, and
 * settled blocks block.
 */
export function fits(grid: Grid, piece: Piece): boolean {
  for (const [col, row] of occupiedCells(piece)) {
    if (col < 0 || col >= COLS) return false;
    if (row >= ROWS + SPAWN_ROWS) return false;
    if (row < 0) continue; // still above the board
    if (grid[row]![col] !== null) return false;
  }
  return true;
}

/** Stamp a piece into the grid. Mutates. */
export function settle(grid: Grid, piece: Piece): void {
  for (const [col, row] of occupiedCells(piece)) {
    if (row < 0 || row >= ROWS + SPAWN_ROWS) continue;
    grid[row]![col] = piece.kind;
  }
}

/**
 * Remove every full row, letting what was above fall.
 *
 * Rebuilds rather than splicing in place. Splicing while iterating downward is
 * the classic way to skip a row when two clear at once, and the symptom --
 * one row of a Tetris silently surviving -- looks like a rendering glitch.
 */
export function clearLines(grid: Grid): { grid: Grid; cleared: number[] } {
  const cleared: number[] = [];
  const kept: Grid = [];

  for (let row = 0; row < grid.length; row += 1) {
    if (grid[row]!.every((cell) => cell !== null)) cleared.push(row);
    else kept.push(grid[row]!);
  }

  while (kept.length < grid.length) {
    kept.unshift(Array.from({ length: COLS }, () => null as Cell));
  }

  return { grid: kept, cleared };
}

/** How far this piece can fall before it lands. */
export function dropDistance(grid: Grid, piece: Piece): number {
  let distance = 0;
  while (fits(grid, { ...piece, row: piece.row + distance + 1 })) distance += 1;
  return distance;
}

// ----- Levels -----

export const MAX_LEVEL = 25;

/**
 * Lines needed to finish a given level.
 *
 * Front-loaded on purpose. A flat eight per level meant a first game could run
 * three and a half minutes without a single level-up -- the very first playtest
 * did exactly that -- and the level-up is the moment that tells a new player
 * the game has somewhere to go. The first three levels take four lines each,
 * so the first jingle arrives within a minute or two; after that it settles to
 * eight, which keeps the full climb to 25 a real undertaking.
 */
export const EARLY_LEVELS = 3;
export const EARLY_LINES_PER_LEVEL = 4;
export const LINES_PER_LEVEL = 8;

export function linesForLevel(level: number): number {
  return level <= EARLY_LEVELS ? EARLY_LINES_PER_LEVEL : LINES_PER_LEVEL;
}

/** Total lines cleared at the moment you arrive at `level`. */
export function linesToReach(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l += 1) total += linesForLevel(l);
  return total;
}

/**
 * Seconds a piece takes to fall one row at a given level.
 *
 * Twenty-five levels is a long climb, so the curve has to do two things at
 * once: stay slow enough at the bottom that a child can think, and keep
 * getting meaningfully harder for twenty-five steps without becoming
 * impossible. A flat multiplier does neither -- it either sprints away in the
 * first five levels or barely moves across the last ten.
 *
 * So the curve is derived from its two endpoints rather than from a chosen
 * per-level multiplier: geometric from a generous 0.9s at level 1 to exactly
 * 0.05s at level 25. Picking the ratio by hand instead meant the curve hit the
 * floor early and levels 23, 24 and 25 were all the same speed -- three levels
 * of climb that did nothing.
 *
 * 0.05s a row is the bottom for a reason: below that the piece is effectively
 * teleporting and the only workable strategy is memorising the spawn.
 */
const LEVEL_ONE_INTERVAL = 0.9;
const TOP_LEVEL_INTERVAL = 0.05;
const DECAY_PER_LEVEL = Math.pow(
  TOP_LEVEL_INTERVAL / LEVEL_ONE_INTERVAL,
  1 / (MAX_LEVEL - 1),
);

export function fallInterval(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, level));
  // The floor is exactness rather than safety now: the geometric term lands a
  // hair under the target at level 25 in floating point. Because the decay is
  // derived from that same endpoint it cannot bind any earlier, so the curve
  // stays strictly decreasing for all twenty-five levels.
  return Math.max(
    TOP_LEVEL_INTERVAL,
    LEVEL_ONE_INTERVAL * Math.pow(DECAY_PER_LEVEL, clamped - 1),
  );
}

/** Level implied by a line count, capped. */
export function levelForLines(lines: number): number {
  let level = 1;
  while (level < MAX_LEVEL && lines >= linesToReach(level + 1)) level += 1;
  return level;
}

/**
 * Lines still to clear before the next level, or null at the top.
 *
 * This is what the panel shows. A bare running total of lines told nobody that
 * lines were what levelled you up, let alone how many -- the first question
 * after the first playtest was "what does it take to advance?".
 */
export function linesUntilNextLevel(lines: number): number | null {
  const level = levelForLines(lines);
  if (level >= MAX_LEVEL) return null;
  return linesToReach(level + 1) - lines;
}

/**
 * Points for clearing rows at once.
 *
 * Steeply superlinear on purpose: four rows in one go is worth more than four
 * separate singles, which is the whole reason to build a well and wait rather
 * than shaving a row off the top whenever you can.
 */
export function lineScore(rows: number, level: number): number {
  const base = [0, 40, 120, 360, 1000][Math.min(rows, 4)] ?? 0;
  return base * level;
}

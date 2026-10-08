/**
 * BRICK BLAST's rules: an eight-by-eight board, three pieces to choose from,
 * and rows and columns that go when they fill.
 *
 * Nothing falls here. The pieces wait at the bottom of the screen and the
 * player puts each one where they like, so the game is about room rather than
 * speed: every piece placed is space spent, and the only way to get it back is
 * to finish a line.
 *
 * Kept free of the DOM and of the game class for the same reason board.ts is:
 * what fits, what clears and when the game is over are the parts that can be
 * quietly wrong, and "it said game over but that piece fitted" is the bug a
 * child will find first.
 */

import type { PieceKind } from "./pieces.ts";

export const SIZE = 8;

/** null is empty; anything else is the colour of the piece that was put there. */
export type Tile = PieceKind | null;
export type Board = Tile[][];

export interface Shape {
  readonly id: string;
  /** [col, row] offsets from the shape's top-left corner. */
  readonly cells: ReadonlyArray<readonly [number, number]>;
  readonly w: number;
  readonly h: number;
  /** Which of the cabinet's block colours it wears. */
  readonly tone: PieceKind;
  /** How often it turns up, before the level has its say. */
  readonly weight: number;
}

/**
 * The pieces, drawn as they look. A piece can be turned in the tray (see
 * rotate), so the several ways up of one shape here only decide how it
 * arrives, and how often that shape turns up at all.
 */
const ART: ReadonlyArray<readonly [id: string, tone: PieceKind, weight: number, rows: string]> = [
  ["dot", "O", 0.8, "#"],
  ["h2", "I", 1, "##"],
  ["v2", "I", 1, "#/#"],
  ["h3", "I", 1, "###"],
  ["v3", "I", 1, "#/#/#"],
  ["h4", "I", 1, "####"],
  ["v4", "I", 1, "#/#/#/#"],
  ["h5", "I", 0.4, "#####"],
  ["v5", "I", 0.4, "#/#/#/#/#"],
  ["sq2", "O", 1.2, "##/##"],
  ["sq3", "O", 0.35, "###/###/###"],
  ["rect-h", "T", 0.5, "###/###"],
  ["rect-v", "T", 0.5, "##/##/##"],
  ["corner-a", "L", 0.8, "#./##"],
  ["corner-b", "L", 0.8, ".#/##"],
  ["corner-c", "L", 0.8, "##/#."],
  ["corner-d", "L", 0.8, "##/.#"],
  ["ell-a", "L", 0.7, "#./#./##"],
  ["ell-b", "L", 0.7, ".#/.#/##"],
  ["ell-c", "L", 0.7, "###/#.."],
  ["ell-d", "L", 0.7, "###/..#"],
  ["big-a", "J", 0.3, "#../#../###"],
  ["big-b", "J", 0.3, "..#/..#/###"],
  ["big-c", "J", 0.3, "###/#../#.."],
  ["big-d", "J", 0.3, "###/..#/..#"],
  ["tee-a", "T", 0.6, "###/.#."],
  ["tee-b", "T", 0.6, ".#./###"],
  ["tee-c", "T", 0.6, "#./##/#."],
  ["tee-d", "T", 0.6, ".#/##/.#"],
  ["ess-a", "S", 0.6, ".##/##."],
  ["ess-b", "S", 0.6, "#./##/.#"],
  ["zed-a", "Z", 0.6, "##./.##"],
  ["zed-b", "Z", 0.6, ".#/##/#."],
];

export const SHAPES: readonly Shape[] = ART.map(([id, tone, weight, art]) => {
  const rows = art.split("/");
  const cells: Array<readonly [number, number]> = [];
  rows.forEach((line, row) => {
    [...line].forEach((mark, col) => {
      if (mark === "#") cells.push([col, row]);
    });
  });
  return { id, tone, weight, cells, w: rows[0]!.length, h: rows.length };
});

/** The same piece, a quarter turn clockwise. */
export function rotate(shape: Shape): Shape {
  return {
    ...shape,
    cells: shape.cells.map(([c, r]) => [shape.h - 1 - r, c] as const),
    w: shape.h,
    h: shape.w,
  };
}

const cellsKey = (shape: Shape): string =>
  shape.cells
    .map(([c, r]) => `${c},${r}`)
    .sort()
    .join(" ");

/** Do two shapes cover the same squares, whatever order they list them in? */
export function sameShape(a: Shape, b: Shape): boolean {
  return cellsKey(a) === cellsKey(b);
}

/**
 * Every different way up a piece can be turned, starting with the way it is.
 * A square has one, a straight line two, an L four.
 */
export function turns(shape: Shape): Shape[] {
  const out: Shape[] = [];
  let next = shape;
  for (let i = 0; i < 4; i += 1) {
    if (!out.some((seen) => sameShape(seen, next))) out.push(next);
    next = rotate(next);
  }
  return out;
}

export function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null as Tile));
}

/** Can this shape go with its top-left corner here? */
export function canPlace(board: Board, shape: Shape, col: number, row: number): boolean {
  for (const [c, r] of shape.cells) {
    const x = col + c;
    const y = row + r;
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return false;
    if (board[y]![x] !== null) return false;
  }
  return true;
}

/** Is there anywhere this shape could go, the way up it is now? */
export function fitsAnywhere(board: Board, shape: Shape): boolean {
  for (let row = 0; row <= SIZE - shape.h; row += 1) {
    for (let col = 0; col <= SIZE - shape.w; col += 1) {
      if (canPlace(board, shape, col, row)) return true;
    }
  }
  return false;
}

/** Is there anywhere this shape could go if it were turned? */
export function fitsTurned(board: Board, shape: Shape): boolean {
  return turns(shape).some((turned) => fitsAnywhere(board, turned));
}

/**
 * The game is over when nothing left in the tray can go anywhere -- turned
 * any way. A piece that would fit on its side is still a move, and ending
 * the game on it would be the game being wrong, not the player.
 */
export function anyMoves(board: Board, tray: ReadonlyArray<Shape | null>): boolean {
  return tray.some((shape) => shape !== null && fitsTurned(board, shape));
}

export interface Move {
  /** Which tray piece. */
  slot: number;
  /** The piece, the way up it has to be. */
  shape: Shape;
  col: number;
  row: number;
  /** True when the piece has to be turned from how it sits in the tray. */
  turned: boolean;
}

/**
 * A good place for one of the tray's pieces: what the hint points at.
 *
 * Good, not best. It likes finishing lines most, then a snug fit -- squares
 * that touch a wall or another piece -- because a piece tucked into a corner
 * leaves the board tidier than one dropped in the middle. It would sooner
 * show a spot for a piece as it sits than one that needs turning first, since
 * a hint with two steps is a harder hint to follow.
 */
export function bestMove(board: Board, tray: ReadonlyArray<Shape | null>): Move | null {
  let best: Move | null = null;
  let bestScore = -Infinity;

  tray.forEach((piece, slot) => {
    if (!piece) return;
    turns(piece).forEach((shape, turn) => {
      for (let row = 0; row <= SIZE - shape.h; row += 1) {
        for (let col = 0; col <= SIZE - shape.w; col += 1) {
          if (!canPlace(board, shape, col, row)) continue;

          const trial = board.map((line) => [...line]);
          place(trial, shape, col, row);
          const lines = fullLines(trial);

          let touching = 0;
          for (const [c, r] of shape.cells) {
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const x = col + c + dc;
              const y = row + r + dr;
              if (x < 0 || x >= SIZE || y < 0 || y >= SIZE || board[y]![x] !== null) touching += 1;
            }
          }

          const score =
            (lines.rows.length + lines.cols.length) * 100 + touching - (turn > 0 ? 6 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = { slot, shape, col, row, turned: turn > 0 };
          }
        }
      }
    });
  });

  return best;
}

/** Stamp a shape into the board. Mutates. */
export function place(board: Board, shape: Shape, col: number, row: number): void {
  for (const [c, r] of shape.cells) board[row + r]![col + c] = shape.tone;
}

export interface Lines {
  rows: number[];
  cols: number[];
}

/** Every row and column that is full right now. */
export function fullLines(board: Board): Lines {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < SIZE; i += 1) {
    if (board[i]!.every((tile) => tile !== null)) rows.push(i);
    if (board.every((line) => line[i] !== null)) cols.push(i);
  }
  return { rows, cols };
}

export interface Cleared {
  col: number;
  row: number;
  tone: PieceKind;
}

/**
 * Empty those lines, and say what was in them.
 *
 * Both lists are read before anything is emptied, and a square where a row
 * and a column cross is reported once. Emptying the rows first and then
 * looking for full columns would find none, and the cross -- the best move
 * in the game -- would pay for half of what it did.
 */
export function clearLines(board: Board, lines: Lines): Cleared[] {
  const gone: Cleared[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (!lines.rows.includes(row) && !lines.cols.includes(col)) continue;
      const tone = board[row]![col];
      if (tone) gone.push({ col, row, tone });
    }
  }
  for (const { col, row } of gone) board[row]![col] = null;
  return gone;
}

export function isEmpty(board: Board): boolean {
  return board.every((line) => line.every((tile) => tile === null));
}

// ----- Scoring -----

/** A point a square, just for putting a piece down. */
export function placeScore(shape: Shape): number {
  return shape.cells.length;
}

/**
 * Pieces that may be placed without clearing before a combo is lost.
 *
 * Most pieces in this game clear nothing -- they are the setting-up. A combo
 * that died on the first one would never get past two, so it survives as
 * long as something clears within every three pieces: one tray.
 */
export const COMBO_GRACE = 3;

export const COMBO_STEP = 100;

/**
 * Points for clearing lines with one piece.
 *
 * Climbs faster than the count -- 100, 300, 600, 1000 -- so one piece that
 * finishes a row and a column together beats two pieces that take one each.
 * `combo` is how many clears in a row this one makes; every one after the
 * first adds a step.
 */
export function clearScore(lines: number, combo: number, level: number): number {
  if (lines <= 0) return 0;
  const base = (100 * lines * (lines + 1)) / 2;
  return (base + Math.max(0, combo - 1) * COMBO_STEP) * level;
}

/** Points for leaving the board completely empty. */
export const BOARD_CLEAR_BONUS = 500;

export function boardClearBonus(level: number): number {
  return BOARD_CLEAR_BONUS * level;
}

// ----- Levels -----

export const MAX_LEVEL = 25;
export const LINES_PER_LEVEL = 6;

export function levelForLines(lines: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL));
}

/** Lines still to clear before the next level, or null at the top. */
export function linesUntilNextLevel(lines: number): number | null {
  const level = levelForLines(lines);
  if (level >= MAX_LEVEL) return null;
  return level * LINES_PER_LEVEL - lines;
}

/**
 * How likely a shape is at a level.
 *
 * There is no clock to speed up, so the climb is in the pieces: the big
 * awkward ones turn up more as the level rises and the one- and two-square
 * fillers that get you out of trouble turn up less. Each level scores more
 * (see clearScore), which is what it pays for the squeeze.
 *
 * The slope is gentle on purpose. This is tuned for the children: the big
 * pieces start out rare and the fillers never drop below two thirds of how
 * often they began. A harder game for the adults is a separate mode to add,
 * not a number to turn up here.
 */
export function shapeWeight(shape: Shape, level: number): number {
  const steps = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  const size = shape.cells.length;
  if (size >= 5) return shape.weight * (1 + steps * 0.03);
  if (size <= 2) return shape.weight * Math.max(0.65, 1 - steps * 0.02);
  return shape.weight;
}

/** Below this share of the board empty, the deal starts to help. */
export const TIGHT_BOARD = 0.4;

/** How much of the board is still empty, 0 to 1. */
export function freeShare(board: Board): number {
  const free = board.reduce((n, line) => n + line.filter((tile) => tile === null).length, 0);
  return free / (SIZE * SIZE);
}

function pickShape(level: number, random: () => number, tight: boolean): Shape {
  // On a crowded board the small pieces come twice as often: the moment a
  // child most needs a way out is the moment to offer one.
  const weight = (shape: Shape): number =>
    shapeWeight(shape, level) * (tight && shape.cells.length <= 3 ? 2 : 1);

  let total = 0;
  for (const shape of SHAPES) total += weight(shape);
  let roll = random() * total;
  for (const shape of SHAPES) {
    roll -= weight(shape);
    if (roll <= 0) return shape;
  }
  return SHAPES[SHAPES.length - 1]!;
}

const TRAY_SIZE = 3;
const DEAL_TRIES = 30;

/**
 * Three pieces for the tray.
 *
 * Never a hand that is dead on arrival. Losing because of what you built is
 * the game; losing because of what you were handed is a grudge. It tries
 * first for a hand where every piece has somewhere to go right now, and
 * settles for one where at least one does. Whether all three can go down one
 * after another is still the player's puzzle.
 */
export function deal(board: Board, level: number, random: () => number): Shape[] {
  const tight = freeShare(board) < TIGHT_BOARD;
  let playable: Shape[] | null = null;

  for (let attempt = 0; attempt < DEAL_TRIES; attempt += 1) {
    const hand = Array.from({ length: TRAY_SIZE }, () => pickShape(level, random, tight));
    if (hand.every((shape) => fitsTurned(board, shape))) return hand;
    if (!playable && anyMoves(board, hand)) playable = hand;
  }
  if (playable) return playable;

  // Thirty dead hands in a row means the board is very nearly full. A single
  // square always fits somewhere: a board with no empty square would be eight
  // full rows, and full rows have already been cleared.
  const dot = SHAPES[0]!;
  return [dot, pickShape(level, random, tight), pickShape(level, random, tight)];
}

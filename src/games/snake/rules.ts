/**
 * Snake's rules, with no canvas and no DOM in sight.
 *
 * Two things here are easy to get subtly wrong, and both are the difference
 * between a snake game that feels fair and one that feels like it ate your
 * input:
 *
 *   - Turns are queued, two deep. A quick UP-then-LEFT made inside a single
 *     step has to produce both turns, one per step. Reading only "the latest
 *     direction" drops the first, and comparing a new turn against the
 *     direction the snake is *currently* travelling lets UP-then-DOWN fold the
 *     snake back into its own neck.
 *   - The tail cell is free on the step the tail leaves it. Chasing your own
 *     tail in a tight loop is the oldest trick in the game, and it only works
 *     if moving into the square the tail is vacating doesn't count as a crash.
 */

import type { Rng } from "../../core/rng.ts";

export const COLS = 17;
export const ROWS = 21;

/** Where every run and every respawn starts: mid-board, heading right. */
export const START_ROW = 10;
export const START_HEAD_COL = 5;
export const START_LENGTH = 4;

export type Dir = "up" | "down" | "left" | "right";

export interface Cell {
  col: number;
  row: number;
}

export const DIR_VECTORS: Record<Dir, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/** How many turns can be waiting. More than two and stale swipes pile up. */
const MAX_QUEUED_TURNS = 2;

export interface Snake {
  /** Head first. */
  body: Cell[];
  dir: Dir;
  queue: Dir[];
  /** Segments still owed from food already eaten. */
  grow: number;
  /** Where the last segment was before the latest step, for smooth drawing. */
  tailFrom: Cell;
  /**
   * True when the edges of the board are open: leave by one side and come
   * back in on the other. HYPER plays this way; CLASSIC's wall is solid.
   */
  wraps: boolean;
}

export type StepResult = "moved" | "crashed";

/** Is this cell blocked by something that isn't the snake -- a crate, say. */
export type Blocked = (col: number, row: number) => boolean;

export const cellKey = (col: number, row: number): number => row * COLS + col;

export const inBounds = (col: number, row: number): boolean =>
  col >= 0 && col < COLS && row >= 0 && row < ROWS;

export function createSnake(wraps = false): Snake {
  const body: Cell[] = [];
  for (let i = 0; i < START_LENGTH; i += 1) {
    body.push({ col: START_HEAD_COL - i, row: START_ROW });
  }
  const tail = body[body.length - 1]!;
  return { body, dir: "right", queue: [], grow: 0, tailFrom: { ...tail }, wraps };
}

/**
 * Ask for a turn. Refused if it repeats or reverses the turn before it --
 * judged against the last *queued* direction, not the current one -- or if
 * the queue is already full.
 */
export function queueTurn(snake: Snake, dir: Dir): boolean {
  const last = snake.queue[snake.queue.length - 1] ?? snake.dir;
  if (dir === last || dir === OPPOSITE[last]) return false;
  if (snake.queue.length >= MAX_QUEUED_TURNS) return false;
  snake.queue.push(dir);
  return true;
}

export function occupies(snake: Snake, col: number, row: number): boolean {
  return snake.body.some((s) => s.col === col && s.row === row);
}

/**
 * The cell one step from the head in `dir`, or null if that's off the board.
 * A snake that wraps never gets null: it comes back in on the far side.
 */
export function cellAhead(snake: Snake, dir: Dir): Cell | null {
  const head = snake.body[0]!;
  const v = DIR_VECTORS[dir];
  const col = head.col + v.dc;
  const row = head.row + v.dr;
  if (snake.wraps) return { col: (col + COLS) % COLS, row: (row + ROWS) % ROWS };
  return inBounds(col, row) ? { col, row } : null;
}

/** Would moving the head one cell in `dir` be a crash? */
export function wouldCrash(snake: Snake, dir: Dir, blocked: Blocked): boolean {
  const ahead = cellAhead(snake, dir);
  if (!ahead || blocked(ahead.col, ahead.row)) return true;
  const { col, row } = ahead;
  // The last segment moves out of the way this step unless the snake is
  // growing, in which case it stays put and is as solid as the rest.
  const solid = snake.grow > 0 ? snake.body.length : snake.body.length - 1;
  for (let i = 0; i < solid; i += 1) {
    const s = snake.body[i]!;
    if (s.col === col && s.row === row) return true;
  }
  return false;
}

/** Take one step, applying the next queued turn first. */
export function advance(snake: Snake, blocked: Blocked): StepResult {
  const turn = snake.queue.shift();
  if (turn) snake.dir = turn;
  if (wouldCrash(snake, snake.dir, blocked)) return "crashed";

  snake.body.unshift(cellAhead(snake, snake.dir)!);
  if (snake.grow > 0) {
    snake.grow -= 1;
    const tail = snake.body[snake.body.length - 1]!;
    snake.tailFrom = { ...tail };
  } else {
    snake.tailFrom = snake.body.pop()!;
  }
  return "moved";
}

/**
 * Directions the snake could take right now without crashing, straight on
 * first. This is what a shield buys: a moment to be pointed somewhere safe.
 */
export function safeDirs(snake: Snake, blocked: Blocked): Dir[] {
  const side: Dir[] =
    snake.dir === "up" || snake.dir === "down" ? ["left", "right"] : ["up", "down"];
  return [snake.dir, ...side].filter((dir) => !wouldCrash(snake, dir, blocked));
}

/** A random empty cell, or null when the board is full. */
export function pickFreeCell(
  rng: Rng,
  taken: (col: number, row: number) => boolean,
): Cell | null {
  const free: Cell[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!taken(col, row)) free.push({ col, row });
    }
  }
  return free.length === 0 ? null : rng.pick(free);
}

/**
 * The magnet: slide food one cell closer to the head, if it's within reach
 * and the cell it would slide into is open. Returns the cell it ends up on.
 */
export const MAGNET_REACH = 4;

export function pullToward(
  food: Cell,
  head: Cell,
  open: (col: number, row: number) => boolean,
): Cell {
  const dc = head.col - food.col;
  const dr = head.row - food.row;
  const distance = Math.abs(dc) + Math.abs(dr);
  if (distance <= 1 || distance > MAGNET_REACH) return food;

  const alongCol = { col: food.col + Math.sign(dc), row: food.row };
  const alongRow = { col: food.col, row: food.row + Math.sign(dr) };
  // Close the bigger gap first, and fall back to the other axis if a crate
  // is in the way.
  const order = Math.abs(dc) >= Math.abs(dr) ? [alongCol, alongRow] : [alongRow, alongCol];
  for (const next of order) {
    if (next.col === food.col && next.row === food.row) continue;
    if (inBounds(next.col, next.row) && open(next.col, next.row)) return next;
  }
  return food;
}

// ----- Classic scoring and pace -----

export const CLASSIC_FOOD_POINTS = 10;
/** A bonus critter turns up after this many pieces of food. */
export const CLASSIC_BONUS_EVERY = 5;
export const CLASSIC_BONUS_SECONDS = 6;

/**
 * Classic has nine levels, like the speed setting on the phone -- except
 * here you climb them by eating rather than picking one from a menu.
 */
export const CLASSIC_MAX_LEVEL = 9;
export const CLASSIC_FOOD_PER_LEVEL = 5;

export function classicLevel(foodEaten: number): number {
  return Math.min(CLASSIC_MAX_LEVEL, 1 + Math.floor(foodEaten / CLASSIC_FOOD_PER_LEVEL));
}

/**
 * Steps per second. Level 1 is a stroll -- slow enough to learn the controls
 * on -- and each level is a clear step quicker, up to a level 9 that's fast
 * but still readable.
 */
export function classicSpeed(foodEaten: number): number {
  return 5 + (classicLevel(foodEaten) - 1) * 0.65;
}

/** The bonus is worth less the longer it's left: 100 down to 10, in tens. */
export function classicBonusValue(secondsLeft: number): number {
  const fraction = Math.max(0, Math.min(1, secondsLeft / CLASSIC_BONUS_SECONDS));
  return Math.max(10, Math.ceil(fraction * 10) * 10);
}

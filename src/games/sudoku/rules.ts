/**
 * Sudoku's rules: what's on the board, what a slip or a hint costs, and what
 * a solve is worth.
 *
 * No DOM, so each of them has a test beside it (rules.test.ts).
 *
 * The board is two arrays of 81. `values` is the digit showing in each square
 * (0 for none) and may hold a wrong one, since a slip stays on the board in
 * red until it's changed. `notes` is the pencil marks, a bitmask per square
 * with bit N set for digit N.
 */

import { CELLS, PEERS, UNITS, boxOf, candidates, type Difficulty } from "./generate.ts";

export { formatClock } from "../crossword/rules.ts";

const bit = (digit: number): number => 1 << digit;

/** True when the square holds its right digit: a given, or one got right. */
export function isRight(values: readonly number[], solution: readonly number[], cell: number): boolean {
  return values[cell] === solution[cell];
}

export function isSolved(values: readonly number[], solution: readonly number[]): boolean {
  return values.every((digit, cell) => digit === solution[cell]);
}

/** The board with every slip taken off: what the notes are worked out from. */
function rightOnly(values: readonly number[], solution: readonly number[]): number[] {
  return values.map((digit, cell) => (digit === solution[cell] ? digit : 0));
}

/** Pencil marks for every unsolved square: each digit its row, column and box allow. */
export function autoNotes(values: readonly number[], solution: readonly number[]): number[] {
  const grid = rightOnly(values, solution);
  return grid.map((digit, cell) => (digit === 0 ? candidates(grid, cell) : 0));
}

/** The notes after `digit` goes into `cell`: gone from there and from its peers. */
export function notesAfterPlacing(notes: readonly number[], cell: number, digit: number): number[] {
  const next = notes.slice();
  next[cell] = 0;
  for (const peer of PEERS[cell]!) next[peer]! &= ~bit(digit);
  return next;
}

export function toggleNote(notes: readonly number[], cell: number, digit: number): number[] {
  const next = notes.slice();
  next[cell]! ^= bit(digit);
  return next;
}

export function hasNote(notes: readonly number[], cell: number, digit: number): boolean {
  return (notes[cell]! & bit(digit)) !== 0;
}

/** How many of each digit are still to place; index 1-9, index 0 unused. */
export function remaining(values: readonly number[], solution: readonly number[]): number[] {
  const left = new Array<number>(10).fill(9);
  left[0] = 0;
  values.forEach((digit, cell) => {
    if (digit !== 0 && digit === solution[cell]) left[digit]! -= 1;
  });
  return left;
}

/** The rows, columns and boxes through `cell` that are now completely right. */
export function finishedUnits(
  values: readonly number[],
  solution: readonly number[],
  cell: number,
): (readonly number[])[] {
  return UNITS.filter(
    (unit) => unit.includes(cell) && unit.every((at) => values[at] === solution[at]),
  );
}

// ----- What help costs -----

/**
 * A wrong digit is shown the moment it lands and adds time; it never ends the
 * puzzle. A hint fills a square and costs more than a slip, so asking is never
 * cheaper than thinking. Both are seconds on the clock.
 */
export const MISTAKE_SECONDS = 30;
export const HINT_SECONDS = 60;

// ----- Scoring -----

/**
 * The crossword's curve: `top` points for an instant solve, half of that at
 * `par` seconds, and never zero. A harder puzzle is worth more and gets longer.
 */
const SCORING: Record<Difficulty, { top: number; par: number }> = {
  easy: { top: 2000, par: 300 },
  medium: { top: 3000, par: 480 },
  hard: { top: 4000, par: 720 },
  expert: { top: 5000, par: 900 },
};

/** `seconds` is the clock plus every penalty. */
export function scoreSolve(difficulty: Difficulty, seconds: number): number {
  const { top, par } = SCORING[difficulty];
  return Math.max(1, Math.round((top * par) / (par + Math.max(0, seconds))));
}

// ----- The day's puzzle -----

/** Salts this game's seed so no two daily challenges ever correlate. */
export const SEED_SALT = 0x5355444f;

/** The seed for a day's puzzle, where `day` is `dailySeed(date)`. */
export function dailyPuzzleSeed(day: number): number {
  return (Math.imul(Math.floor(day), 2654435761) ^ SEED_SALT) >>> 0;
}

/**
 * The week climbs like a newspaper's: gentle on Monday, the hard one on
 * Sunday. Indexed by `Date.getDay()`, so Sunday is first.
 */
const WEEK: readonly Difficulty[] = ["expert", "easy", "easy", "medium", "medium", "hard", "hard"];

export function dailyDifficulty(date: Date): Difficulty {
  return WEEK[date.getDay()]!;
}

// ----- Sharing -----

export type BoxMark = "clean" | "helped" | "slipped";

/** One mark per 3x3 box: a slip in it outranks a hint in it. */
export function boxMarks(slipped: Iterable<number>, helped: Iterable<number>): BoxMark[] {
  const marks = new Array<BoxMark>(9).fill("clean");
  for (const cell of helped) marks[boxOf(cell)] = "helped";
  for (const cell of slipped) marks[boxOf(cell)] = "slipped";
  return marks;
}

export { CELLS };

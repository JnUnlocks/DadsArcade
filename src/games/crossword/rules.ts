/**
 * The crossword's rules: what the player has filled in, what a hint costs,
 * and what a solve is worth.
 *
 * No DOM, so each of them has a test beside it (rules.test.ts).
 *
 * A fill is one string, a character per square in reading order: the letter
 * typed there, a space for an empty white square, `#` for a black one. That's
 * the same shape as the solution, so "is it solved" is a string comparison,
 * and it's the shape that gets saved.
 */

import { BLACK, clueCells, solutionOf, type Puzzle, type PuzzleClue, type PuzzleSize } from "./generate.ts";

export const EMPTY = " ";

/** A fill with nothing typed: the solution's black squares and spaces. */
export function emptyFill(puzzle: Puzzle): string {
  return solutionOf(puzzle).replace(/[a-z]/g, EMPTY);
}

export function setLetter(fill: string, cell: number, letter: string): string {
  return fill.slice(0, cell) + letter + fill.slice(cell + 1);
}

/** True when a saved fill is the right shape for this puzzle. */
export function fitsPuzzle(fill: unknown, puzzle: Puzzle): fill is string {
  if (typeof fill !== "string") return false;
  const solution = solutionOf(puzzle);
  if (fill.length !== solution.length) return false;
  for (let i = 0; i < fill.length; i += 1) {
    const black = solution[i] === BLACK;
    if (black !== (fill[i] === BLACK)) return false;
    if (!black && !/^[a-z ]$/.test(fill[i]!)) return false;
  }
  return true;
}

export function isFull(fill: string): boolean {
  return !fill.includes(EMPTY);
}

export function isSolved(fill: string, puzzle: Puzzle): boolean {
  return fill === solutionOf(puzzle);
}

/** The squares of a clue that hold a letter that isn't the right one. */
export function wrongCells(fill: string, puzzle: Puzzle, clue: PuzzleClue): number[] {
  const solution = solutionOf(puzzle);
  return clueCells(puzzle, clue).filter(
    (cell) => fill[cell] !== EMPTY && fill[cell] !== solution[cell],
  );
}

/** The squares of a clue that still need their right letter. */
export function unsolvedCells(fill: string, puzzle: Puzzle, clue: PuzzleClue): number[] {
  const solution = solutionOf(puzzle);
  return clueCells(puzzle, clue).filter((cell) => fill[cell] !== solution[cell]);
}

/** What the Word Finder is asked for a clue: known letters, `?` for the rest. */
export function cluePattern(fill: string, puzzle: Puzzle, clue: PuzzleClue): string {
  return clueCells(puzzle, clue)
    .map((cell) => (fill[cell] === EMPTY ? "?" : fill[cell]))
    .join("");
}

// ----- Hints -----

/**
 * Help is always there and always costs time, never the solve: everyone gets
 * to finish, and a clean solve still ranks above one that leaned on the
 * buttons. The prices are in seconds added to the clock.
 *
 *   check   says which letters of this word are wrong
 *   letter  fills in one square
 *   word    fills in the whole word
 *   finder  opens the Word Finder on this word's pattern
 */
export type Hint = "check" | "letter" | "word" | "finder";

export const HINT_SECONDS: Record<Hint, number> = {
  check: 10,
  letter: 20,
  finder: 20,
  word: 60,
};

// ----- Scoring -----

/**
 * What a solve is worth: `top` points for an instant one, half of that at
 * `par` seconds, a third at twice par, and so on. It never reaches zero, so a
 * forty-minute solve by a seven-year-old is still a score on the board, and
 * every second saved is still worth something.
 *
 * The bigger grid is worth more and gets longer to do it in.
 */
const SCORING: Record<PuzzleSize, { top: number; par: number }> = {
  9: { top: 3000, par: 300 },
  11: { top: 5000, par: 600 },
};

/** `seconds` is the clock plus every hint's penalty. */
export function scoreSolve(size: PuzzleSize, seconds: number): number {
  const { top, par } = SCORING[size];
  return Math.max(1, Math.round((top * par) / (par + Math.max(0, seconds))));
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

// ----- The day's puzzle -----

/** Salts this game's seed so no two daily challenges ever correlate. */
export const SEED_SALT = 0x58574f52;

/**
 * Day one of the paper, as a `dailySeed()` day number: 3 October 2026, the
 * day the crossword shipped. Only used for the issue number on the masthead.
 */
export const EPOCH_DAY = Date.UTC(2026, 9, 3) / 86_400_000;

/** The seed for a day's puzzle, where `day` is `dailySeed(date)`. */
export function dailyPuzzleSeed(day: number): number {
  return (Math.imul(Math.floor(day), 2654435761) ^ SEED_SALT) >>> 0;
}

/** "No. 1" on the first day, counting up. */
export function issueNumber(day: number): number {
  return Math.max(1, Math.floor(day) - EPOCH_DAY + 1);
}

/**
 * What Sudoku remembers between sessions: the puzzle in progress for each
 * mode, the daily streak, and the best time at each difficulty.
 *
 * Every mode saves after every move, for the crossword's reason: a phone will
 * throw a backgrounded page away mid-puzzle, and nobody should lose a grid to
 * a phone call.
 *
 * The puzzle is saved whole rather than re-made from its seed, so a change to
 * the generator can't swap the grid under someone halfway through it.
 *
 * The daily is one play. A finished daily stays saved with its result, and
 * opening it again that day only shows it; an unfinished one resumes with its
 * clock where it was. As everywhere else here, that's a rule the device keeps
 * rather than one the server enforces.
 *
 * The streak rules are Letter Lock's own, imported rather than copied.
 */

import { advanceStreak, liveStreak, type Streak } from "../letterlock/progress.ts";
import { CELLS, DIFFICULTIES, countSolutions, toCells, type Difficulty, type Puzzle } from "./generate.ts";

export { advanceStreak, liveStreak, type Streak };

const KEY_SAVES = "hyperdrive.sudoku.saves";
const KEY_STREAK = "hyperdrive.sudoku.streak";
const KEY_BESTS = "hyperdrive.sudoku.bests";

/** `daily`, or one free-play slot per difficulty. */
export type SaveSlot = "daily" | `free-${Difficulty}`;

export interface SavedResult {
  score: number;
  /** The clock with penalties added: the time the board ranks. */
  seconds: number;
  mistakes: number;
  hints: number;
}

export interface SavedGame {
  /** Local `dailyKey()` for the daily; empty for free play. */
  date: string;
  puzzle: Puzzle;
  /** 81 digits: what's showing in each square, slips included. */
  values: string;
  /** Pencil marks, a bitmask per square. */
  notes: number[];
  autoNotes: boolean;
  /** Seconds on the clock, without penalties. */
  seconds: number;
  /** Seconds added by slips and hints. */
  penalty: number;
  mistakes: number;
  hints: number;
  /** Squares a hint filled in. */
  helped: number[];
  /** Squares a wrong digit went into. */
  slipped: number[];
  /** Set once the puzzle is solved. */
  result: SavedResult | null;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled -- not worth interrupting play.
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isGrid(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && value.length === CELLS && pattern.test(value);
}

function parsePuzzle(stored: unknown): Puzzle | null {
  const raw = stored as Partial<Puzzle> | null;
  if (!raw || typeof raw !== "object") return null;
  if (!DIFFICULTIES.includes(raw.difficulty as Difficulty)) return null;
  if (!isGrid(raw.givens, /^[0-9]+$/) || !isGrid(raw.solution, /^[1-9]+$/)) return null;
  // Every given has to be what the solution says, and the solution a real one.
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (raw.givens[cell] !== "0" && raw.givens[cell] !== raw.solution[cell]) return null;
  }
  if (countSolutions(toCells(raw.solution), 1) !== 1) return null;
  return { difficulty: raw.difficulty as Difficulty, givens: raw.givens, solution: raw.solution };
}

function cellList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((cell): cell is number => Number.isInteger(cell) && cell >= 0 && cell < CELLS)
    : [];
}

/**
 * Whatever was stored, as a saved game -- or null if it isn't shaped like one.
 * Kept apart from localStorage so the checks can be tested: this is read back
 * from disk, possibly written by an older build.
 */
export function parseSavedGame(stored: unknown): SavedGame | null {
  const raw = stored as Partial<SavedGame> | null;
  if (!raw || typeof raw !== "object") return null;
  const puzzle = parsePuzzle(raw.puzzle);
  if (!puzzle || !isGrid(raw.values, /^[0-9]+$/)) return null;
  // The givens can't have been typed over.
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (puzzle.givens[cell] !== "0" && raw.values[cell] !== puzzle.givens[cell]) return null;
  }

  const notes =
    Array.isArray(raw.notes) && raw.notes.length === CELLS
      ? raw.notes.map((mask) => (Number.isInteger(mask) ? (mask as number) & 0x3fe : 0))
      : new Array<number>(CELLS).fill(0);

  const result = raw.result;
  const finished =
    result && typeof result === "object" && isCount(result.score) && isCount(result.seconds)
      ? {
          score: result.score,
          seconds: result.seconds,
          mistakes: isCount(result.mistakes) ? result.mistakes : 0,
          hints: isCount(result.hints) ? result.hints : 0,
        }
      : null;

  return {
    date: typeof raw.date === "string" ? raw.date : "",
    puzzle,
    values: raw.values,
    notes,
    autoNotes: raw.autoNotes === true,
    seconds: isCount(raw.seconds) ? raw.seconds : 0,
    penalty: isCount(raw.penalty) ? raw.penalty : 0,
    mistakes: isCount(raw.mistakes) ? raw.mistakes : 0,
    hints: isCount(raw.hints) ? raw.hints : 0,
    helped: cellList(raw.helped),
    slipped: cellList(raw.slipped),
    result: finished,
  };
}

function loadSaves(): Record<string, unknown> {
  const raw = readJson(KEY_SAVES);
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/**
 * The saved game in a slot. The daily slot only answers for the date asked
 * about: yesterday's unfinished puzzle is gone once today's exists.
 */
export function loadGame(slot: SaveSlot, date = ""): SavedGame | null {
  const saved = parseSavedGame(loadSaves()[slot]);
  if (!saved) return null;
  if (slot === "daily" && saved.date !== date) return null;
  return saved;
}

export function saveGame(slot: SaveSlot, game: SavedGame): void {
  const saves = loadSaves();
  saves[slot] = game;
  writeJson(KEY_SAVES, saves);
}

/** A finished free-play puzzle has nothing left to come back to. */
export function clearGame(slot: SaveSlot): void {
  const saves = loadSaves();
  delete saves[slot];
  writeJson(KEY_SAVES, saves);
}

export function loadStreak(): Streak {
  const raw = readJson(KEY_STREAK) as Partial<Streak> | null;
  if (!raw || typeof raw.last !== "string" || typeof raw.count !== "number") {
    return { last: "", count: 0 };
  }
  return { last: raw.last, count: raw.count };
}

export function saveStreak(streak: Streak): void {
  writeJson(KEY_STREAK, streak);
}

/** Best time in seconds at each difficulty, penalties included. */
export function loadBestTimes(): Partial<Record<Difficulty, number>> {
  const raw = readJson(KEY_BESTS);
  const bests: Partial<Record<Difficulty, number>> = {};
  if (!raw || typeof raw !== "object") return bests;
  for (const difficulty of DIFFICULTIES) {
    const seconds = (raw as Record<string, unknown>)[difficulty];
    if (isCount(seconds) && seconds > 0) bests[difficulty] = seconds;
  }
  return bests;
}

/** Records a time and reports whether it beat the previous best. */
export function recordBestTime(difficulty: Difficulty, seconds: number): boolean {
  const bests = loadBestTimes();
  const previous = bests[difficulty];
  if (previous !== undefined && seconds >= previous) return false;
  bests[difficulty] = seconds;
  writeJson(KEY_BESTS, bests);
  return true;
}

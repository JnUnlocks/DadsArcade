/**
 * What the crossword remembers between sessions: the puzzle in progress for
 * each mode, and the daily streak.
 *
 * A crossword is a ten-minute sit, and a phone will happily throw a
 * backgrounded page away in less. So every mode saves after every letter, not
 * just the daily: nobody should lose half a grid to a phone call.
 *
 * The puzzle itself is saved whole, clues and all, rather than re-made from
 * its seed. An update that adds words to the clue bank changes what a seed
 * makes, and the grid someone is halfway through has to stay the grid they
 * started.
 *
 * The daily board ranks the first attempt, so a finished daily stays saved
 * with its result and opening it again that day only shows it. As everywhere
 * else here, that's a rule the device keeps rather than one the server
 * enforces.
 *
 * The streak rules are Letter Lock's own, imported rather than copied.
 */

import {
  advanceStreak,
  liveStreak,
  type Streak,
} from "../letterlock/progress.ts";
import { SIZES, type Puzzle, type PuzzleSize } from "./generate.ts";
import { fitsPuzzle } from "./rules.ts";

export { advanceStreak, liveStreak, type Streak };

const KEY_SAVES = "hyperdrive.crossword.saves";
const KEY_STREAK = "hyperdrive.crossword.streak";

/** `daily`, or `free-9` / `free-11` for the two free-play sizes. */
export type SaveSlot = "daily" | `free-${PuzzleSize}`;

export interface SavedResult {
  score: number;
  /** The clock with penalties added: the time the board ranks. */
  seconds: number;
  hints: number;
}

export interface SavedGame {
  /** Local `dailyKey()` for the daily; empty for free play. */
  date: string;
  puzzle: Puzzle;
  fill: string;
  /** Seconds on the clock, without penalties. */
  seconds: number;
  /** Seconds added by hints. */
  penalty: number;
  hints: number;
  /** Squares a hint filled in, as grid indices. */
  helped: number[];
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

function parsePuzzle(stored: unknown): Puzzle | null {
  const raw = stored as Partial<Puzzle> | null;
  if (!raw || typeof raw !== "object") return null;
  const size = raw.size;
  if (!SIZES.includes(size as PuzzleSize)) return null;
  if (!Array.isArray(raw.rows) || raw.rows.length !== size) return null;
  if (!raw.rows.every((row) => typeof row === "string" && row.length === size && /^[a-z#]+$/.test(row))) {
    return null;
  }
  if (!Array.isArray(raw.clues) || raw.clues.length === 0) return null;
  for (const clue of raw.clues) {
    if (!clue || typeof clue !== "object") return null;
    if (clue.dir !== "across" && clue.dir !== "down") return null;
    if (!isCount(clue.number) || !isCount(clue.row) || !isCount(clue.col)) return null;
    if (typeof clue.answer !== "string" || typeof clue.clue !== "string") return null;
    // The answer has to be what the grid actually says at that place.
    for (let i = 0; i < clue.answer.length; i += 1) {
      const row = clue.row + (clue.dir === "down" ? i : 0);
      const col = clue.col + (clue.dir === "across" ? i : 0);
      if (raw.rows[row]?.[col] !== clue.answer[i]) return null;
    }
  }
  return { size: size as PuzzleSize, rows: raw.rows.slice(), clues: raw.clues.map((clue) => ({ ...clue })) };
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
  if (!puzzle || !fitsPuzzle(raw.fill, puzzle)) return null;

  const result = raw.result;
  const finished =
    result && typeof result === "object" && isCount(result.score) && isCount(result.seconds)
      ? { score: result.score, seconds: result.seconds, hints: isCount(result.hints) ? result.hints : 0 }
      : null;

  const cells = puzzle.size * puzzle.size;
  return {
    date: typeof raw.date === "string" ? raw.date : "",
    puzzle,
    fill: raw.fill,
    seconds: isCount(raw.seconds) ? raw.seconds : 0,
    penalty: isCount(raw.penalty) ? raw.penalty : 0,
    hints: isCount(raw.hints) ? raw.hints : 0,
    helped: Array.isArray(raw.helped)
      ? raw.helped.filter((cell): cell is number => Number.isInteger(cell) && cell >= 0 && cell < cells)
      : [],
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

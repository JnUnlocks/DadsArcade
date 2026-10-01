/**
 * What Plasma Sort remembers between sessions: today's attempt, and the streak.
 *
 * Today's attempt is saved after every pour for two reasons. The honest one is
 * that a phone call shouldn't cost anyone their puzzle. The other is that the
 * daily board ranks the *first* solve, and without this, RESTART on the pause
 * menu would be a free way to wipe the pour counter and try again.
 *
 * Local-only, like the Prize Jar. That makes "first solve" a rule the device
 * keeps rather than one the server enforces, which is the right amount for a
 * board shared between family and friends.
 *
 * Storage failures are swallowed the same way core/storage.ts does it.
 */

import type { Board, Pour } from "./puzzle.ts";

const KEY_DAILY = "hyperdrive.plasmasort.daily";
const KEY_STREAK = "hyperdrive.plasmasort.streak";

export interface DailyResult {
  score: number;
  pours: number;
  par: number;
  seconds: number;
}

/** The state of one day's puzzle on this device. */
export interface DailyAttempt {
  /** Local `dailyKey()` this attempt belongs to. */
  date: string;
  board: Board;
  /** Pours taken back still count, so this can exceed `history.length`. */
  pours: number;
  seconds: number;
  history: Pour[];
  /** Set once the first solve is in; later runs that day are practice. */
  result: DailyResult | null;
}

export interface Streak {
  /** Local `dailyKey()` of the most recent solved daily. */
  last: string;
  count: number;
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

/** Today's saved attempt, or null if there isn't one for this date. */
export function loadDailyAttempt(date: string): DailyAttempt | null {
  const raw = readJson(KEY_DAILY) as Partial<DailyAttempt> | null;
  if (!raw || raw.date !== date || !Array.isArray(raw.board)) return null;
  return {
    date,
    board: raw.board,
    pours: typeof raw.pours === "number" ? raw.pours : 0,
    seconds: typeof raw.seconds === "number" ? raw.seconds : 0,
    history: Array.isArray(raw.history) ? raw.history : [],
    result: raw.result ?? null,
  };
}

export function saveDailyAttempt(attempt: DailyAttempt): void {
  writeJson(KEY_DAILY, attempt);
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

/**
 * The streak after solving today's puzzle.
 *
 * Takes the two date keys rather than a clock so it can be tested, and so the
 * caller decides what "yesterday" means (local time, same as the board).
 */
export function advanceStreak(streak: Streak, today: string, yesterday: string): Streak {
  if (streak.last === today) return streak;
  return { last: today, count: streak.last === yesterday ? streak.count + 1 : 1 };
}

/** The streak worth showing: a run that missed yesterday is over. */
export function liveStreak(streak: Streak, today: string, yesterday: string): number {
  return streak.last === today || streak.last === yesterday ? streak.count : 0;
}

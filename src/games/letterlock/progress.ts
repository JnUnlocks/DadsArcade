/**
 * What Letter Lock remembers between sessions: today's attempt, and the streak.
 *
 * Today's attempt is saved after every guess, for the same two reasons Plasma
 * Sort saves after every pour. A phone call shouldn't cost anyone their word;
 * and the daily board ranks the *first* attempt, so without this RESTART on
 * the pause menu would be six fresh tries at a word you'd already narrowed
 * down.
 *
 * The answer is saved alongside the guesses. If an update changes the word
 * list halfway through someone's day, the attempt they come back to is still
 * the word they were working on, and the tiles they've already seen stay true.
 *
 * Local-only, so "first attempt" is a rule the device keeps rather than one
 * the server enforces -- the right amount for a family board.
 *
 * Storage failures are swallowed the same way core/storage.ts does it.
 */

import { MAX_GUESSES, WORD_LENGTH } from "./rules.ts";

const KEY_DAILY = "hyperdrive.letterlock.daily";
const KEY_STREAK = "hyperdrive.letterlock.streak";

export interface DailyResult {
  solved: boolean;
  /** Tries used: 1..6 for a solve, 6 for a miss. */
  guesses: number;
  /** Zero for a miss. */
  score: number;
  seconds: number;
}

/** The state of one day's word on this device. */
export interface DailyAttempt {
  /** Local `dailyKey()` this attempt belongs to. */
  date: string;
  answer: string;
  guesses: string[];
  seconds: number;
  /** Set once the attempt is over; opening it again that day only shows it. */
  result: DailyResult | null;
}

export interface Streak {
  /** Local `dailyKey()` of the most recent finished daily. */
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

function isWord(value: unknown): value is string {
  return typeof value === "string" && value.length === WORD_LENGTH && /^[a-z]+$/.test(value);
}

/**
 * Whatever was stored, as an attempt for `date` -- or null if it's for another
 * day or isn't shaped like one. Kept apart from localStorage so the checks can
 * be tested: this is read back from disk, possibly written by an older build.
 */
export function parseDailyAttempt(stored: unknown, date: string): DailyAttempt | null {
  const raw = stored as Partial<DailyAttempt> | null;
  if (!raw || typeof raw !== "object" || raw.date !== date) return null;
  if (!isWord(raw.answer) || !Array.isArray(raw.guesses)) return null;
  if (raw.guesses.length > MAX_GUESSES || !raw.guesses.every(isWord)) return null;

  const result = raw.result;
  const finished =
    result && typeof result === "object" && typeof result.solved === "boolean"
      ? {
          solved: result.solved,
          guesses: typeof result.guesses === "number" ? result.guesses : raw.guesses.length,
          score: typeof result.score === "number" ? result.score : 0,
          seconds: typeof result.seconds === "number" ? result.seconds : 0,
        }
      : null;

  return {
    date,
    answer: raw.answer,
    guesses: raw.guesses.slice(),
    seconds: typeof raw.seconds === "number" && raw.seconds > 0 ? raw.seconds : 0,
    result: finished,
  };
}

/** Today's saved attempt, or null if there isn't one for this date. */
export function loadDailyAttempt(date: string): DailyAttempt | null {
  return parseDailyAttempt(readJson(KEY_DAILY), date);
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
 * The streak after solving the word for `today`.
 *
 * Takes the two date keys rather than a clock so it can be tested, and so the
 * caller decides what "yesterday" means (local time, same as the board).
 */
export function advanceStreak(streak: Streak, today: string, yesterday: string): Streak {
  if (streak.last === today) return streak;
  return { last: today, count: streak.last === yesterday ? streak.count + 1 : 1 };
}

/**
 * The streak after missing the word for `today`: back to nothing. Dated today
 * so that tomorrow's solve starts a new run at one rather than carrying on.
 */
export function breakStreak(today: string): Streak {
  return { last: today, count: 0 };
}

/** The streak worth showing: a run that missed yesterday is over. */
export function liveStreak(streak: Streak, today: string, yesterday: string): number {
  return streak.last === today || streak.last === yesterday ? streak.count : 0;
}

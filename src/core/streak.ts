/**
 * The arcade's daily streak: finish two of the daily challenges and the day
 * is lit.
 *
 * Every daily game keeps a streak of its own, and those stay exactly as they
 * were. This one sits above them and asks for less than all of them: any two
 * different dailies, won or lost. A lost Letter Lock still counts, because
 * the streak is for turning up, not for winning. Only the dailies count,
 * because they're the same puzzle for everyone that day.
 *
 * It's worked out from a log of which dailies were finished on which day,
 * never incremented in place. That matters at midnight: a puzzle started at
 * 23:58 and finished at 00:03 is filed under the day it was started, so it
 * can complete a day that has already gone -- and recomputing means the
 * streak, and any shield spent on that day, simply come out right.
 *
 * Shields are the forgiving part. Every seventh day of a streak earns one, up
 * to two, and a missed day spends one on its own. They can't be bought and
 * there's nothing to tap. A day covered by a shield keeps the streak alive
 * but doesn't add to it.
 *
 * Pure functions only; core/storage.ts keeps the log.
 */

import { dailyKey } from "./rng.ts";

/** Different dailies a day needs before it counts. */
export const DAILIES_NEEDED = 2;
/** Days of streak per shield earned. */
export const SHIELD_EVERY = 7;
/** Shields that can be held at once. */
export const MAX_SHIELDS = 2;
/** Streak lengths with a trophy, smallest first. */
export const MILESTONES: readonly number[] = [3, 7, 14, 30, 50, 100, 200, 365];

/** Local `dailyKey()` -> ids of the daily games finished for that day. */
export type DayLog = Record<string, string[]>;

export interface StreakState {
  /** Days in the current streak, today included once it's lit. */
  count: number;
  /** The longest streak this device has had. */
  best: number;
  shields: number;
  /** Daily games finished today, in the order they were finished. */
  doneToday: readonly string[];
  /** Today has its two dailies. */
  litToday: boolean;
  /** There's a streak and today isn't lit yet. */
  atRisk: boolean;
  /** Days a shield was spent on, oldest first. */
  shieldDays: readonly string[];
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The `dailyKey()` of the day after the one given. */
export function nextDailyKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Local noon, so a daylight-saving shift can't tip it into the wrong day.
  return dailyKey(new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1, 12));
}

/** The log with one more finish in it. A game already logged that day is a no-op. */
export function addFinish(log: DayLog, gameId: string, dateKey: string): DayLog {
  const games = log[dateKey] ?? [];
  if (games.includes(gameId)) return log;
  return { ...log, [dateKey]: [...games, gameId] };
}

/**
 * Whatever was stored, as a log -- dropping anything not shaped like one.
 * Kept apart from localStorage so it can be tested against what an older or
 * damaged save might hold.
 */
export function parseDayLog(stored: unknown): DayLog {
  const log: DayLog = {};
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return log;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!DATE_KEY.test(key) || !Array.isArray(value)) continue;
    const games = [...new Set(value.filter((g): g is string => typeof g === "string" && g !== ""))];
    if (games.length > 0) log[key] = games;
  }
  return log;
}

/** The streak as of `today`, walked forward from the first day in the log. */
export function streakState(log: DayLog, today = dailyKey()): StreakState {
  const lit = (key: string) => (log[key]?.length ?? 0) >= DAILIES_NEEDED;
  const first = Object.keys(log)
    .filter((key) => key <= today)
    .sort()[0];

  let count = 0;
  let best = 0;
  let shields = 0;
  const shieldDays: string[] = [];

  const light = () => {
    count += 1;
    best = Math.max(best, count);
    if (count % SHIELD_EVERY === 0) shields = Math.min(MAX_SHIELDS, shields + 1);
  };

  if (first) {
    for (let key = first; key < today; key = nextDailyKey(key)) {
      if (lit(key)) light();
      else if (count > 0 && shields > 0) {
        shields -= 1;
        shieldDays.push(key);
      } else count = 0;
    }
  }

  const doneToday = log[today] ?? [];
  const litToday = doneToday.length >= DAILIES_NEEDED;
  if (litToday) light();

  return {
    count,
    best,
    shields,
    doneToday,
    litToday,
    atRisk: count > 0 && !litToday,
    shieldDays,
  };
}

/** The first trophy not yet earned, or null once every one is. */
export function nextMilestone(best: number): number | null {
  return MILESTONES.find((days) => days > best) ?? null;
}

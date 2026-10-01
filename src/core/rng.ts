/**
 * Small seeded PRNG (mulberry32).
 *
 * Seeding matters for more than reproducible tests: it's what makes a weekly
 * challenge possible later -- everyone gets the same seed for the week, so
 * their scores are directly comparable rather than luck-of-the-draw.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty array");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

/** Seed derived from the current ISO week, so it rolls over every Monday. */
export function weeklySeed(date = new Date()): number {
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const week = Math.floor(utc / (7 * 24 * 60 * 60 * 1000));
  return week >>> 0;
}

/**
 * Seed derived from the calendar day.
 *
 * Deliberately *local* rather than UTC. A daily challenge is a thing you do
 * "today", and a child in a UTC-9 timezone finding that tomorrow's puzzle
 * arrived at 3pm -- or that today's vanished mid-afternoon -- is a bug in
 * every way that matters, even though the clock is behaving correctly.
 * The board id is derived from the same local date, so the seed and the board
 * always roll over together.
 */
export function dailySeed(date = new Date()): number {
  const days = Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
  );
  return days >>> 0;
}

/** `YYYY-MM-DD` in local time -- the board id suffix for a daily challenge. */
export function dailyKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The `dailyKey()` of the day before the one given.
 *
 * Worked out from the key rather than from the clock, so a streak can be
 * checked against the day a puzzle was *started* -- which, for one begun at
 * 23:58 and finished at 00:03, is not the day it ends on.
 */
export function previousDailyKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Local noon, so a daylight-saving shift can't tip it into the wrong day.
  return dailyKey(new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) - 1, 12));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" -> "Oct 1". Falls back to the key itself if it isn't a date. */
export function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  const name = MONTHS[(month ?? 0) - 1];
  return name && day ? `${name} ${day}` : dateKey;
}

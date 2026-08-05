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

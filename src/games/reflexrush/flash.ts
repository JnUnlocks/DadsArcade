/**
 * Flash Point -- the rules, and nothing else.
 *
 * Five tries. Each one waits a random while, then shows GO. Tap as soon as
 * you see it. Tap before it and that try is a false start; take longer than
 * the timeout and it's a miss. Either way the try is used up.
 *
 * Scoring for the arcade's scoreboard: every GO is worth 1,000 points, less
 * one point for every millisecond you took. A false start or a miss is worth
 * nothing. So five quick taps make about 3,700; jumping early costs a whole
 * try's worth, which is the right lesson.
 *
 * Pure: the game supplies the times (flash.test.ts).
 */

export const TRIALS = 5;
/** The wait before GO, in seconds, chosen at random in this range. */
export const WAIT_MIN = 1.5;
export const WAIT_MAX = 4;
/** No tap this long after GO is a miss. */
export const TIMEOUT_MS = 2000;
export const POINTS_PER_GO = 1000;

export type Trial = { kind: "hit"; ms: number } | { kind: "early" } | { kind: "miss" };

/** A wait drawn from `random`, a 0..1 source. */
export function waitFor(random: () => number): number {
  return WAIT_MIN + (WAIT_MAX - WAIT_MIN) * random();
}

/**
 * What a tap means. `sinceGo` is milliseconds from GO appearing to the tap,
 * or null if GO hadn't appeared yet.
 */
export function judge(sinceGo: number | null): Trial {
  if (sinceGo === null || sinceGo < 0) return { kind: "early" };
  if (sinceGo >= TIMEOUT_MS) return { kind: "miss" };
  return { kind: "hit", ms: Math.round(sinceGo) };
}

export function points(t: Trial): number {
  return t.kind === "hit" ? Math.max(0, POINTS_PER_GO - t.ms) : 0;
}

export interface FlashSummary {
  score: number;
  /** Times of the taps that counted, in the order they were made. */
  times: number[];
  /** Middle of the counted times; null when nothing counted. */
  median: number | null;
  best: number | null;
  falseStarts: number;
  misses: number;
}

export function summarise(trials: readonly Trial[]): FlashSummary {
  const times = trials.flatMap((t) => (t.kind === "hit" ? [t.ms] : []));
  return {
    score: trials.reduce((sum, t) => sum + points(t), 0),
    times,
    median: median(times),
    best: times.length > 0 ? Math.min(...times) : null,
    falseStarts: trials.filter((t) => t.kind === "early").length,
    misses: trials.filter((t) => t.kind === "miss").length,
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

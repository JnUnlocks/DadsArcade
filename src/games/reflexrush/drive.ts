/**
 * Overdrive -- the rules, and nothing else.
 *
 * Ten seconds. Every tap charges the reactor. Only taps inside the round
 * count -- [start, start + 10 s) -- by each tap's own timestamp, so a tap in
 * the last frame still counts and one a hair late doesn't. One input method
 * per round, set by the first tap: a hand on the keyboard can't add a finger
 * on the screen. And one finger at a time: a tap that lands while another
 * finger is still down is ignored, so drumming two fingers isn't "faster".
 *
 * Pure: the game supplies the presses (rules.test.ts).
 */

export const DRIVE_MS = 10_000;
/** The charge milestones, in taps. Decoration only: nothing stops at 100. */
export const MILESTONES = [20, 40, 60, 80, 100] as const;

export interface Drive {
  start: number;
  deadline: number;
  /** Time of every tap that counted, in order. */
  taps: number[];
  method: "pointer" | "key" | null;
}

export interface DrivePress {
  at: number;
  via: "pointer" | "key";
  /** Other pointers already down when this one landed. */
  alongside?: number;
}

export function newDrive(start: number, ms = DRIVE_MS): Drive {
  return { start, deadline: start + ms, taps: [], method: null };
}

/** Count a press if it should. Returns true when it did. */
export function press(d: Drive, p: DrivePress): boolean {
  if (p.at < d.start || p.at >= d.deadline) return false;
  if (p.via === "pointer" && (p.alongside ?? 0) > 0) return false;
  if (d.method === null) d.method = p.via;
  else if (p.via !== d.method) return false;
  d.taps.push(p.at);
  return true;
}

/** Taps in the second up to `now`: the live speed, not the round's average. */
export function liveSpeed(d: Drive, now: number): number {
  const from = now - 1000;
  let n = 0;
  for (let i = d.taps.length - 1; i >= 0 && d.taps[i]! > from; i -= 1) {
    if (d.taps[i]! <= now) n += 1;
  }
  return n;
}

/** The most taps in any one-second stretch of the round. */
export function peakSpeed(d: Drive): number {
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < d.taps.length; hi += 1) {
    while (d.taps[hi]! - d.taps[lo]! >= 1000) lo += 1;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

/** Taps per second over the whole round. */
export function average(d: Drive): number {
  return d.taps.length / ((d.deadline - d.start) / 1000);
}

/** How many milestones `taps` has passed. */
export function milestonesReached(taps: number): number {
  return MILESTONES.filter((m) => taps >= m).length;
}

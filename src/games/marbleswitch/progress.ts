/**
 * Best medals per level and mode, kept on this device.
 *
 * A level is unlocked by clearing the one before it in the same mode, with
 * any number of stars. If the browser won't store anything, progress is kept
 * for this visit instead, and play is never blocked.
 */

import type { LevelDef } from "./levels.ts";
import type { Mode } from "./sim.ts";

const KEY = "hyperdrive.marbleswitch.progress";

/** Level number to best stars (1-3), per mode. */
export type Progress = Record<Mode, Record<number, number>>;

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let memory: Progress = { junior: {}, classic: {} };

function store(): KeyValue | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(storage: KeyValue | null = store()): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      return { junior: { ...memory.junior, ...parsed.junior }, classic: { ...memory.classic, ...parsed.classic } };
    }
  } catch {
    // Fall back to this visit's.
  }
  return { junior: { ...memory.junior }, classic: { ...memory.classic } };
}

/** Keep a clear, if it beats what was there. */
export function recordResult(mode: Mode, level: number, stars: number, storage: KeyValue | null = store()): void {
  const progress = loadProgress(storage);
  if ((progress[mode][level] ?? 0) >= stars) return;
  progress[mode][level] = stars;
  memory = progress;
  try {
    storage?.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Kept in memory for this visit.
  }
}

/** Stars for a clear in this many flips. */
export function starsFor(level: LevelDef, mode: Mode, flips: number): number {
  const [two, three] = level.stars[mode];
  return flips <= three ? 3 : flips <= two ? 2 : 1;
}

/** The first level of the Workshop, the second pack. */
export const WORKSHOP_FIRST = 11;

/**
 * Whether a level can be played yet: the first always, then one per clear in
 * the same mode. The Workshop opens once level 10 is cleared in either mode,
 * so someone who learned on Junior can start it in Classic.
 */
export function isUnlocked(progress: Progress, mode: Mode, level: number): boolean {
  if (level === 1) return true;
  if (level === WORKSHOP_FIRST) {
    return (progress.junior[level - 1] ?? 0) > 0 || (progress.classic[level - 1] ?? 0) > 0;
  }
  return (progress[mode][level - 1] ?? 0) > 0;
}

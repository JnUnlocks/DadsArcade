/**
 * Zap Dash -- the rules, and nothing else.
 *
 * Thirty seconds on a 3x3 grid. One energy orb at a time: tap it before it
 * fades. Orbs fade faster as the round goes on. From five seconds in, a
 * crossed-out hazard tile turns up now and then in a different cell; tapping
 * it costs points, and so does tapping an empty cell. Hits in a row build a
 * combo worth more each.
 *
 * Pure, and driven by a seeded Rng: the same seed gives the same orbs in the
 * same cells at the same moments, which a family cup will need so everyone
 * faces the same round. Time is the round's own clock in seconds, so a pause
 * stops it. Tested in rules.test.ts.
 */

import { Rng } from "../../core/rng.ts";

export const ROUND_SECONDS = 30;
export const CELLS = 9;

/** An orb lasts this long at the start of the round, shrinking to the end value by the end. */
export const ORB_LIFE_START = 1.2;
export const ORB_LIFE_END = 0.65;
/** A beat between one orb going and the next appearing, so the eye can follow. */
export const ORB_GAP = 0.12;

export const HAZARD_FROM = 5;
export const HAZARD_LIFE = 0.9;
export const HAZARD_GAP_MIN = 1.5;
export const HAZARD_GAP_MAX = 2.5;

export const HIT_POINTS = 100;
export const COMBO_POINTS = 10;
export const COMBO_CAP = 10;
export const HAZARD_PENALTY = 150;
export const EMPTY_PENALTY = 25;

export interface Spot {
  cell: number;
  /** Round time it appeared. */
  born: number;
  /** Round time it goes. */
  until: number;
}

export interface Zap {
  rng: Rng;
  /** Seconds into the round. */
  t: number;
  orb: Spot | null;
  /** When the next orb appears, if there isn't one. */
  nextOrbAt: number;
  hazard: Spot | null;
  nextHazardAt: number;
  /** The cell last tapped: nothing spawns under the finger that's still there. */
  lastTap: number;
  lastOrbCell: number;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  /** Orbs that faded untouched. */
  missed: number;
  hazardHits: number;
  emptyTaps: number;
  /** Every tap on a cell during play. */
  presses: number;
  over: boolean;
}

export type Tap =
  | { kind: "hit"; cell: number; points: number; combo: number }
  | { kind: "hazard"; cell: number; points: number }
  | { kind: "empty"; cell: number; points: number };

export function newZap(seed: number): Zap {
  return {
    rng: new Rng(seed),
    t: 0,
    orb: null,
    nextOrbAt: 0,
    hazard: null,
    nextHazardAt: HAZARD_FROM,
    lastTap: -1,
    lastOrbCell: -1,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    missed: 0,
    hazardHits: 0,
    emptyTaps: 0,
    presses: 0,
    over: false,
  };
}

/** How long an orb appearing at round time `t` lasts. */
export function orbLife(t: number): number {
  const k = Math.max(0, Math.min(1, t / ROUND_SECONDS));
  return ORB_LIFE_START + (ORB_LIFE_END - ORB_LIFE_START) * k;
}

/** A random cell that isn't any of `avoid`. */
function pickCell(rng: Rng, avoid: readonly number[]): number {
  const open: number[] = [];
  for (let c = 0; c < CELLS; c += 1) if (!avoid.includes(c)) open.push(c);
  return open[Math.floor(rng.next() * open.length)] ?? 0;
}

/**
 * Advance the round to `t + dt`: orbs fade and appear, hazards come and go,
 * and the round ends at thirty seconds. Returns true if an orb faded.
 */
export function advance(z: Zap, dt: number): { faded: boolean } {
  if (z.over) return { faded: false };
  z.t += dt;
  let faded = false;

  if (z.orb && z.t >= z.orb.until) {
    faded = true;
    z.missed += 1;
    z.combo = 0;
    z.orb = null;
    z.nextOrbAt = z.t + ORB_GAP;
  }
  if (z.hazard && z.t >= z.hazard.until) {
    z.hazard = null;
    z.nextHazardAt = z.t + HAZARD_GAP_MIN + (HAZARD_GAP_MAX - HAZARD_GAP_MIN) * z.rng.next();
  }

  if (z.t >= ROUND_SECONDS) {
    z.over = true;
    z.orb = null;
    z.hazard = null;
    return { faded };
  }

  if (!z.orb && z.t >= z.nextOrbAt) {
    const avoid = [z.lastOrbCell, z.lastTap];
    if (z.hazard) avoid.push(z.hazard.cell);
    const cell = pickCell(z.rng, avoid);
    z.orb = { cell, born: z.t, until: z.t + orbLife(z.t) };
    z.lastOrbCell = cell;
  }
  if (!z.hazard && z.t >= HAZARD_FROM && z.t >= z.nextHazardAt) {
    const avoid = [z.lastTap];
    if (z.orb) avoid.push(z.orb.cell);
    z.hazard = { cell: pickCell(z.rng, avoid), born: z.t, until: z.t + HAZARD_LIFE };
  }
  return { faded };
}

/** A tap on `cell`. One tap is one action: there is no dragging across cells. */
export function tap(z: Zap, cell: number): Tap | null {
  if (z.over || cell < 0 || cell >= CELLS) return null;
  z.presses += 1;
  z.lastTap = cell;

  if (z.orb && z.orb.cell === cell) {
    const points = HIT_POINTS + COMBO_POINTS * Math.min(z.combo, COMBO_CAP);
    z.combo += 1;
    z.bestCombo = Math.max(z.bestCombo, z.combo);
    z.hits += 1;
    z.score += points;
    z.orb = null;
    z.nextOrbAt = z.t + ORB_GAP;
    return { kind: "hit", cell, points, combo: z.combo };
  }

  z.combo = 0;
  if (z.hazard && z.hazard.cell === cell) {
    z.hazardHits += 1;
    z.hazard = null;
    z.nextHazardAt = z.t + HAZARD_GAP_MIN + (HAZARD_GAP_MAX - HAZARD_GAP_MIN) * z.rng.next();
    const points = Math.min(HAZARD_PENALTY, z.score);
    z.score -= points;
    return { kind: "hazard", cell, points: -points };
  }

  z.emptyTaps += 1;
  const points = Math.min(EMPTY_PENALTY, z.score);
  z.score -= points;
  return { kind: "empty", cell, points: -points };
}

/** Orb hits as a share of every tap, 0-100. No taps is 0. */
export function accuracy(z: Zap): number {
  return z.presses === 0 ? 0 : Math.round((z.hits / z.presses) * 100);
}

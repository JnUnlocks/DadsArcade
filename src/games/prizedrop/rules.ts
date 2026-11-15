/**
 * The rules of Dad's Prize Drop: what you are handed, what a merge is worth
 * and when the cabinet is full. No drawing and no DOM, so all of it can be
 * tested by dropping prizes in a loop.
 */

import { Rng } from "../../core/rng.ts";
import { addBody, createWorld, stepWorld, type Body, type StepReport, type World } from "./physics.ts";
import {
  DANGER_Y,
  DROP_COOLDOWN,
  NEWBORN_GRACE,
  OPENING_DROPS,
  OPENING_TIER,
  OVERFLOW_LIMIT,
  prize,
  RELEASE_Y,
  SPAWN_WEIGHTS,
  TANK_H,
  TANK_W,
} from "./prizes.ts";

/**
 * The order prizes are handed out in.
 *
 * It has a random source of its own, fed by nothing but the seed, so the same
 * seed is the same run of prizes whatever else happens on screen. That is the
 * whole of what a daily drop needs: everyone given the same seed is handed
 * the same prizes in the same order.
 */
export class DropSequence {
  private readonly rng: Rng;
  private dealt = 0;
  private readonly opening: number;

  /** `opening` is how many of the first drops are the easy pair. */
  constructor(seed: number, opening = OPENING_DROPS) {
    this.rng = new Rng(seed);
    this.opening = opening;
  }

  /** How many prizes have been handed out: with the seed, all it takes to pick up where it was. */
  get handedOut(): number {
    return this.dealt;
  }

  next(): number {
    this.dealt += 1;
    if (this.dealt <= this.opening) return OPENING_TIER;
    const roll = this.rng.next();
    let edge = 0;
    for (let i = 0; i < SPAWN_WEIGHTS.length; i += 1) {
      edge += SPAWN_WEIGHTS[i]!;
      if (roll < edge) return i + 1;
    }
    return SPAWN_WEIGHTS.length;
  }
}

export interface Run {
  world: World;
  sequence: DropSequence;
  /** The prize in hand, and the one after it. */
  current: number;
  next: number;
  score: number;
  /** The biggest prize in the tank so far this run. */
  bestTier: number;
  /** Seconds until the next prize can be let go. */
  cooldown: number;
  /** Seconds a prize has been over the line. Zero when none is. */
  danger: number;
  over: boolean;
  /** Seconds of play, not counting anything paused. */
  time: number;
  drops: number;
}

export function createRun(seed: number, opening = OPENING_DROPS): Run {
  const sequence = new DropSequence(seed, opening);
  const current = sequence.next();
  const next = sequence.next();
  return {
    world: createWorld(),
    sequence,
    current,
    next,
    score: 0,
    bestTier: 1,
    cooldown: 0,
    danger: 0,
    over: false,
    time: 0,
    drops: 0,
  };
}

/** Keep an aim inside the walls for the prize in hand. */
export function clampAim(run: Run, x: number): number {
  const r = prize(run.current).radius;
  return Math.min(TANK_W - r, Math.max(r, x));
}

/**
 * How far down a prize of this size would get, falling straight at x: the
 * height of its centre when it first touches something.
 */
export function restHeight(run: Run, x: number, radius: number): number {
  let y = TANK_H - radius;
  for (const body of run.world.bodies) {
    const dx = body.x - x;
    const reach = radius + body.r;
    if (Math.abs(dx) >= reach) continue;
    const top = body.y - Math.sqrt(reach * reach - dx * dx);
    if (top < y) y = top;
  }
  return y;
}

export function canDrop(run: Run): boolean {
  return !run.over && run.cooldown <= 0;
}

/**
 * Let go of the prize in hand. Returns it, or null if it wasn't time yet:
 * one release is one prize, and one prize is one step along the sequence.
 */
export function drop(run: Run, x: number): Body | null {
  if (!canDrop(run)) return null;
  const at = clampAim(run, x);
  // When the pile has reached the top, the prize starts on it and not in it.
  // Starting inside another prize would have the two thrown apart, at the
  // one moment of the game when everything needs to hold still.
  const height = Math.min(RELEASE_Y, restHeight(run, at, prize(run.current).radius));
  const body = addBody(run.world, run.current, at, height);
  if (run.current > run.bestTier) run.bestTier = run.current;
  run.current = run.next;
  run.next = run.sequence.next();
  run.cooldown = DROP_COOLDOWN;
  run.drops += 1;
  return body;
}

/** True for a prize that is over the line and old enough to count. */
export function isOverflowing(body: Body): boolean {
  return body.age >= NEWBORN_GRACE && body.y - body.r < DANGER_Y;
}

/**
 * One step of the tank.
 *
 * The cabinet is full when any prize has stayed over the line for
 * OVERFLOW_LIMIT seconds. A prize that has only just been dropped or made
 * doesn't count, or every drop would start the clock on its way past the
 * line. The clock stops the moment nothing is over, so a merge that pulls
 * the pile down is a rescue. Dropping more can't hold it off: each prize
 * only has its first moments free, and whatever it lands on still counts.
 */
export function stepRun(run: Run, dt?: number): StepReport {
  if (run.over) return { merges: [], impact: 0, impactTier: 0 };

  const report = stepWorld(run.world, dt);
  const elapsed = dt ?? 1 / 120;
  run.time += elapsed;
  if (run.cooldown > 0) run.cooldown = Math.max(0, run.cooldown - elapsed);

  for (const merge of report.merges) {
    run.score += prize(merge.tier).points;
    if (merge.tier > run.bestTier) run.bestTier = merge.tier;
  }

  if (run.world.bodies.some(isOverflowing)) {
    run.danger += elapsed;
    if (run.danger >= OVERFLOW_LIMIT) run.over = true;
  } else {
    run.danger = 0;
  }
  return report;
}

// ----- The daily drop -----

/**
 * Bumped whenever a change would hand out a different run of prizes for the
 * same day. A daily saved under another version is left alone rather than
 * carried on under rules it wasn't started with.
 */
export const DAILY_RULES = 1;

/**
 * Today's seed: the date, the game and the rules version, so everyone playing
 * the same day is handed the same prizes in the same order.
 */
export function dailyDropSeed(dateKey: string): number {
  const text = `prize-drop:${dateKey}:v${DAILY_RULES}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The daily starts straight in: no easy opening pair, the same for everyone. */
export function createDailyRun(dateKey: string): Run {
  return createRun(dailyDropSeed(dateKey), 0);
}

/** Everything needed to put a daily back exactly as it was. Plain data, for localStorage. */
export interface RunSnapshot {
  seed: number;
  opening: number;
  handedOut: number;
  bodies: Body[];
  nextId: number;
  current: number;
  next: number;
  score: number;
  bestTier: number;
  cooldown: number;
  danger: number;
  time: number;
  drops: number;
}

export function snapshotRun(run: Run, seed: number, opening: number): RunSnapshot {
  return {
    seed,
    opening,
    handedOut: run.sequence.handedOut,
    bodies: run.world.bodies.map((b) => ({ ...b })),
    nextId: run.world.nextId,
    current: run.current,
    next: run.next,
    score: run.score,
    bestTier: run.bestTier,
    cooldown: run.cooldown,
    danger: run.danger,
    time: run.time,
    drops: run.drops,
  };
}

/**
 * The run a snapshot was taken of, or null for anything that doesn't add up.
 * The sequence is dealt forward from the seed to where it was, so the prizes
 * still to come are the ones that were always coming.
 */
export function restoreRun(snap: RunSnapshot): Run | null {
  const numbers = [snap.seed, snap.opening, snap.handedOut, snap.nextId, snap.current, snap.next,
    snap.score, snap.bestTier, snap.cooldown, snap.danger, snap.time, snap.drops];
  if (!numbers.every(Number.isFinite) || !Array.isArray(snap.bodies)) return null;
  if (snap.handedOut < 2 || snap.handedOut > 100000) return null;
  const sequence = new DropSequence(snap.seed, snap.opening);
  for (let i = 0; i < snap.handedOut; i += 1) sequence.next();
  const bodies: Body[] = [];
  for (const b of snap.bodies) {
    const fields = [b.id, b.tier, b.x, b.y, b.vx, b.vy, b.r, b.fullR, b.w, b.angle, b.spin, b.age];
    if (!fields.every(Number.isFinite) || b.tier < 1 || b.tier > 10) return null;
    bodies.push({ ...b });
  }
  return {
    world: { bodies, nextId: snap.nextId },
    sequence,
    current: snap.current,
    next: snap.next,
    score: snap.score,
    bestTier: snap.bestTier,
    cooldown: snap.cooldown,
    danger: snap.danger,
    over: false,
    time: snap.time,
    drops: snap.drops,
  };
}

/**
 * One climb: JES, the pads, the camera and the score. No drawing and no DOM,
 * so all of it can be tested by bouncing a robot in a loop.
 */

import { cullBelow, createLevel, extendTo, padX, type Level, type Pad } from "./level.ts";
import {
  ACCEL,
  ARENA_W,
  BODY_HALF,
  BODY_HEIGHT,
  BOOST_BOUNCE,
  BOUNCE,
  FALL_GRACE,
  FOLLOW_AT,
  FOOT_HALF,
  GRAVITY,
  HEIGHT_PER_POINT,
  MAX_FALL,
  MAX_RUN,
  NEUTRAL_DECEL,
  RELAY_BONUS,
  STEP,
  type Mode,
} from "./tuning.ts";

export interface Jes {
  x: number;
  /** Height of the feet. */
  y: number;
  vx: number;
  vy: number;
}

export interface Landing {
  readonly pad: Pad;
  /** True the first time a relay is landed on: the one landing that pays. */
  readonly powered: boolean;
}

export interface Climb {
  readonly level: Level;
  readonly jes: Jes;
  /** World height at the bottom of the screen. Only ever goes up. */
  cameraY: number;
  /** How tall the screen is, in arena units. */
  viewH: number;
  /** The highest the feet have been. */
  peak: number;
  relays: number;
  landings: number;
  time: number;
  over: boolean;
}

export function createClimb(seed: number, mode: Mode, viewH: number): Climb {
  const level = createLevel(seed, mode);
  const climb: Climb = {
    level,
    // Set off from the rooftop, already on the way up: the first bounce is free.
    jes: { x: ARENA_W / 2, y: 0, vx: 0, vy: BOUNCE },
    cameraY: -viewH * 0.18,
    viewH,
    peak: 0,
    relays: 0,
    landings: 0,
    time: 0,
    over: false,
  };
  extendTo(level, climb.cameraY + viewH * 2);
  return climb;
}

export function heightPoints(climb: Climb): number {
  return Math.floor(climb.peak / HEIGHT_PER_POINT);
}

export function score(climb: Climb): number {
  return heightPoints(climb) + climb.relays * RELAY_BONUS;
}

/** A resize keeps JES where he is in the world; only how much is shown changes. */
export function setViewHeight(climb: Climb, viewH: number): void {
  climb.viewH = viewH;
  extendTo(climb.level, climb.cameraY + viewH * 2);
}

/**
 * One fixed step. `steer` is -1, 0 or 1. Returns the landing, if there was one.
 *
 * A landing needs JES coming down, his feet crossing the top of a pad during
 * this step, and the foot over the pad at that moment. Going up, pads are
 * passed straight through. If two pads are crossed in one step -- a long
 * fall -- the higher one is the one he lands on.
 */
export function stepClimb(climb: Climb, steer: number, dt = STEP): Landing | null {
  if (climb.over) return null;
  const jes = climb.jes;
  const startTime = climb.time;
  climb.time += dt;

  if (steer !== 0) {
    jes.vx += steer * ACCEL * dt;
  } else if (jes.vx !== 0) {
    const slow = NEUTRAL_DECEL * dt;
    jes.vx = Math.abs(jes.vx) <= slow ? 0 : jes.vx - Math.sign(jes.vx) * slow;
  }
  jes.vx = Math.max(-MAX_RUN, Math.min(MAX_RUN, jes.vx));
  jes.vy = Math.max(-MAX_FALL, jes.vy - GRAVITY * dt);

  const fromX = jes.x;
  const fromY = jes.y;
  jes.x += jes.vx * dt;
  jes.y += jes.vy * dt;

  // Solid sides.
  if (jes.x < BODY_HALF) {
    jes.x = BODY_HALF;
    jes.vx = 0;
  } else if (jes.x > ARENA_W - BODY_HALF) {
    jes.x = ARENA_W - BODY_HALF;
    jes.vx = 0;
  }

  let landing: Landing | null = null;
  if (jes.vy < 0) {
    let best: Pad | null = null;
    for (const pad of climb.level.pads) {
      if (pad.broken || fromY < pad.y || jes.y > pad.y) continue;
      // Where he was, and where the pad was, at the moment the feet crossed.
      const share = fromY === jes.y ? 0 : (fromY - pad.y) / (fromY - jes.y);
      const footX = fromX + (jes.x - fromX) * share;
      const at = padX(pad, startTime + dt * share);
      if (Math.abs(footX - at) > pad.w / 2 + FOOT_HALF) continue;
      if (!best || pad.y > best.y) best = pad;
    }
    if (best) {
      jes.y = best.y;
      jes.vy = best.kind === "boost" ? BOOST_BOUNCE : BOUNCE;
      climb.landings += 1;
      let powered = false;
      if (best.kind === "relay" && !best.powered) {
        best.powered = true;
        climb.relays += 1;
        powered = true;
      }
      if (best.kind === "brittle") best.broken = true;
      landing = { pad: best, powered };
    }
  }

  if (jes.y > climb.peak) climb.peak = jes.y;

  // The camera follows him up and never comes back down.
  const follow = jes.y - climb.viewH * FOLLOW_AT;
  if (follow > climb.cameraY) climb.cameraY = follow;

  extendTo(climb.level, climb.cameraY + climb.viewH * 2);
  cullBelow(climb.level, climb.cameraY - 240);

  if (jes.y + BODY_HEIGHT < climb.cameraY - FALL_GRACE) climb.over = true;
  return landing;
}

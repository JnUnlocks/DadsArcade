/**
 * Level generation.
 *
 * The one property that matters here is that every generated level can
 * actually be crossed. Difficulty comes from speeding traffic up and tightening
 * gaps, and both of those have a point past which a lane stops being hard and
 * starts being impossible -- a road lane with no gap wide enough to stand in,
 * or a river lane whose logs are too short to land on. Losing a life to a level
 * that could not be crossed is the same unfairness as an unmixable slime order,
 * and it's just as invisible: it reads as "this game is broken", not as "this
 * level was generated wrong".
 *
 * So the ramp is written as clamps rather than as multipliers, and the bounds
 * are asserted in lanes.test.ts across hundreds of levels.
 */

import type { Rng } from "../../core/rng.ts";
import {
  COLS,
  RIVER_ROWS,
  ROAD_ROWS,
  ROWS,
  type Lane,
  type Occupant,
} from "./types.ts";

/**
 * A road lane always leaves at least this much clear space between vehicles.
 *
 * The frog occupies 0.7 of a cell, so 1.6 leaves room to be standing in a gap
 * without clipping either bumper, with margin for the moment mid-hop.
 */
export const MIN_ROAD_GAP = 1.6;

/** A river platform is never shorter than this, or it can't be landed on. */
export const MIN_PLATFORM_WIDTH = 1.6;

/** A river gap wider than this would need a hop the frog cannot make. */
export const MAX_RIVER_GAP = 2.6;

/** Nothing ever moves faster than this, in cells per second. */
export const MAX_SPEED = 3.4;
export const MIN_SPEED = 0.7;

/**
 * Build a level.
 *
 * `level` starts at 1 and climbs forever; the curve flattens rather than
 * running away, because past a certain speed the game stops being readable and
 * simply becomes luck.
 */
export function buildLanes(rng: Rng, level: number): Lane[] {
  // Saturating ramp: fast early progress, then a ceiling.
  const heat = 1 - Math.pow(0.82, Math.max(0, level - 1));
  const lanes: Lane[] = new Array(ROWS);

  for (let i = 0; i < ROAD_ROWS.length; i += 1) {
    lanes[ROAD_ROWS[i]!] = roadLane(rng, heat, i);
  }
  for (let i = 0; i < RIVER_ROWS.length; i += 1) {
    lanes[RIVER_ROWS[i]!] = riverLane(rng, heat, i);
  }

  return lanes;
}

function roadLane(rng: Rng, heat: number, index: number): Lane {
  // Alternating directions by default: traffic coming both ways is what makes
  // the player read each lane separately instead of finding one safe column.
  const dir: 1 | -1 = index % 2 === 0 ? 1 : -1;

  const truck = rng.chance(0.3);
  const occupant: Occupant = truck ? "truck" : "car";
  const width = truck ? rng.range(1.7, 2.3) : rng.range(0.9, 1.2);

  const speed = clamp(
    rng.range(0.9, 1.6) + heat * 1.7,
    MIN_SPEED,
    MAX_SPEED,
  );

  // Gaps tighten with heat but never below the crossable floor.
  const gap = Math.max(MIN_ROAD_GAP, rng.range(3.4, 5.2) - heat * 2.2);

  return {
    kind: "road",
    occupant,
    dir,
    speed,
    width,
    period: width + gap,
    phase: rng.range(0, COLS),
    variant: rng.int(0, 5),
  };
}

function riverLane(rng: Rng, heat: number, index: number): Lane {
  const dir: 1 | -1 = index % 2 === 0 ? -1 : 1;

  const turtle = rng.chance(0.35);
  const occupant: Occupant = turtle ? "turtle" : "log";

  // Platforms shrink with heat, but never below what a frog can land on.
  const width = Math.max(
    MIN_PLATFORM_WIDTH,
    (turtle ? rng.range(1.8, 2.4) : rng.range(2.4, 3.6)) - heat * 0.8,
  );

  const speed = clamp(rng.range(0.7, 1.3) + heat * 1.4, MIN_SPEED, MAX_SPEED);

  // River gaps are bounded at BOTH ends: too wide is an impossible hop, and
  // too narrow is a solid bridge with no game in it.
  const gap = clamp(rng.range(1.2, 2.2) + heat * 0.6, 0.9, MAX_RIVER_GAP);

  return {
    kind: "river",
    occupant,
    dir,
    speed,
    width,
    period: width + gap,
    phase: rng.range(0, COLS),
    variant: rng.int(0, 5),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

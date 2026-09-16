/**
 * Every generated level has to be crossable.
 *
 * This is the same class of guarantee as "every slime order is mixable", and
 * it fails the same silent way: a road lane with no gap to stand in, or a
 * river lane with logs too short to land on, doesn't look like a generation
 * bug from the player's chair. It looks like the game is cheating. At level 20
 * nobody would question dying constantly -- which is exactly why the bound has
 * to be asserted rather than eyeballed.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Rng } from "../../core/rng.ts";
import {
  buildLanes,
  MAX_RIVER_GAP,
  MAX_SPEED,
  MIN_PLATFORM_WIDTH,
  MIN_ROAD_GAP,
  MIN_SPEED,
} from "./lanes.ts";
import {
  COLS,
  laneGap,
  occupantPositions,
  overlapsOccupant,
  platformUnder,
  RIVER_ROWS,
  ROAD_ROWS,
  rowKind,
  type Lane,
} from "./types.ts";

/** Levels 1..60 across a spread of seeds. */
function everyLane(visit: (lane: Lane, level: number, seed: number) => void) {
  for (let seed = 0; seed < 40; seed += 1) {
    for (const level of [1, 2, 3, 5, 8, 13, 20, 35, 60]) {
      const lanes = buildLanes(new Rng(seed * 100 + level), level);
      for (const row of [...ROAD_ROWS, ...RIVER_ROWS]) {
        visit(lanes[row]!, level, seed);
      }
    }
  }
}

describe("level generation", () => {
  it("always leaves a standable gap in every road lane", () => {
    everyLane((lane, level, seed) => {
      if (lane.kind !== "road") return;
      assert.ok(
        laneGap(lane) >= MIN_ROAD_GAP - 1e-9,
        `level ${level} seed ${seed}: road gap ${laneGap(lane).toFixed(2)} is too narrow to stand in`,
      );
    });
  });

  it("always leaves a landable platform in every river lane", () => {
    everyLane((lane, level, seed) => {
      if (lane.kind !== "river") return;
      assert.ok(
        lane.width >= MIN_PLATFORM_WIDTH - 1e-9,
        `level ${level} seed ${seed}: platform ${lane.width.toFixed(2)} is too small to land on`,
      );
      assert.ok(
        laneGap(lane) <= MAX_RIVER_GAP + 1e-9,
        `level ${level} seed ${seed}: river gap ${laneGap(lane).toFixed(2)} needs a hop the frog can't make`,
      );
    });
  });

  it("never moves anything faster than a player can read", () => {
    everyLane((lane, level, seed) => {
      assert.ok(
        lane.speed >= MIN_SPEED - 1e-9 && lane.speed <= MAX_SPEED + 1e-9,
        `level ${level} seed ${seed}: speed ${lane.speed.toFixed(2)} out of bounds`,
      );
    });
  });

  it("keeps a river lane from becoming a solid bridge", () => {
    // A gap of zero would mean an unbroken platform and no game in that lane.
    everyLane((lane, level, seed) => {
      if (lane.kind !== "river") return;
      assert.ok(
        laneGap(lane) > 0.5,
        `level ${level} seed ${seed}: river lane is effectively a bridge`,
      );
    });
  });

  it("gets harder, then levels off instead of running away", () => {
    const meanSpeed = (level: number) => {
      let total = 0;
      let n = 0;
      for (let seed = 0; seed < 60; seed += 1) {
        for (const lane of buildLanes(new Rng(seed), level)) {
          if (!lane) continue;
          total += lane.speed;
          n += 1;
        }
      }
      return total / n;
    };

    const early = meanSpeed(1);
    const mid = meanSpeed(6);
    const late = meanSpeed(40);

    assert.ok(mid > early, `level 6 (${mid.toFixed(2)}) should beat level 1 (${early.toFixed(2)})`);
    assert.ok(late >= mid, "difficulty should not go backwards");
    assert.ok(late <= MAX_SPEED, "the ramp must saturate, not run away");
  });

  it("builds a lane for every road and river row, and none elsewhere", () => {
    const lanes = buildLanes(new Rng(1), 1);
    for (const row of [...ROAD_ROWS, ...RIVER_ROWS]) {
      assert.ok(lanes[row], `row ${row} has no lane`);
      assert.equal(lanes[row]!.kind, rowKind(row));
    }
  });
});

describe("lane traffic", () => {
  const lane = (over: Partial<Lane> = {}): Lane => ({
    kind: "road",
    occupant: "car",
    dir: 1,
    speed: 1,
    width: 1,
    period: 3,
    phase: 0,
    variant: 0,
    ...over,
  });

  it("keeps occupants spaced by exactly one period", () => {
    const positions = occupantPositions(lane(), 0).sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i += 1) {
      assert.ok(
        Math.abs(positions[i]! - positions[i - 1]! - 3) < 1e-6,
        `spacing drifted: ${positions.join(", ")}`,
      );
    }
  });

  it("covers the full width of the board at any moment", () => {
    // If the pattern ever failed to span the board, traffic would visibly
    // pop in and out at the edges.
    for (let t = 0; t < 20; t += 0.37) {
      const positions = occupantPositions(lane(), t);
      assert.ok(Math.min(...positions) <= 0, `left edge bare at t=${t.toFixed(2)}`);
      assert.ok(Math.max(...positions) >= COLS - 1, `right edge bare at t=${t.toFixed(2)}`);
    }
  });

  it("scrolls in the lane's direction", () => {
    // Asserted through occupancy rather than by comparing array entries:
    // positions wrap, so positions[0] is not a stable identity across time
    // and comparing it comes out backwards whenever it happens to wrap.
    const rightward = lane({ dir: 1, phase: 0, speed: 1, width: 1, period: 3 });
    assert.ok(!overlapsOccupant(rightward, 0, 1.5), "gap should start clear");
    assert.ok(overlapsOccupant(rightward, 1, 1.5), "dir +1 should arrive from the left");

    const leftward = lane({ dir: -1, phase: 3, speed: 1, width: 1, period: 3 });
    assert.ok(!overlapsOccupant(leftward, 0, 2.5), "gap should start clear");
    assert.ok(overlapsOccupant(leftward, 1, 2.5), "dir -1 should arrive from the right");
  });

  it("detects a hit only where a vehicle actually is", () => {
    const l = lane({ phase: 2, speed: 0, width: 1 });
    assert.ok(overlapsOccupant(l, 0, 2.4), "standing under a car should be a hit");
    assert.ok(!overlapsOccupant(l, 0, 4), "standing in a gap should be safe");
  });

  it("finds a platform only where one actually is", () => {
    const l = lane({ kind: "river", occupant: "log", phase: 1, speed: 0, width: 3, period: 5 });
    // Logs sit at 1..4 and 6..9, so 5 is the open water between them.
    assert.notEqual(platformUnder(l, 0, 2), null, "should be riding the log");
    assert.notEqual(platformUnder(l, 0, 7), null, "7 is on the second log");
    assert.equal(platformUnder(l, 0, 5), null, "open water should be a drowning");
  });

  it("carries a rider at the lane's speed", () => {
    // What makes the river half work: the platform's position is a pure
    // function of time, so a rider tracks it exactly with no drift.
    const l = lane({ kind: "river", occupant: "log", phase: 0, speed: 2, dir: 1, width: 3, period: 6 });
    const at0 = platformUnder(l, 0, 1);
    const at1 = platformUnder(l, 1, 3);
    assert.notEqual(at0, null);
    assert.notEqual(at1, null);
    assert.ok(Math.abs(at1! - at0! - 2) < 1e-6, "one second at 2 cells/s should move 2 cells");
  });
});

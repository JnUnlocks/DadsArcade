/**
 * The rules of Dad's Prize Drop: what you are handed, what it scores and
 * when the cabinet is full.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Rng } from "../../core/rng.ts";
import { addBody } from "./physics.ts";
import {
  DANGER_Y,
  DROP_COOLDOWN,
  NEWBORN_GRACE,
  OVERFLOW_LIMIT,
  prize,
  PRIZES,
  RELEASE_Y,
  SPAWN_WEIGHTS,
  TANK_H,
  TANK_W,
  TOP_TIER,
} from "./prizes.ts";
import { canDrop, clampAim, createRun, drop, DropSequence, stepRun, type Run } from "./rules.ts";

const STEP = 1 / 120;

function wait(run: Run, seconds: number): void {
  for (let i = 0; i < seconds / STEP; i += 1) stepRun(run);
}

describe("the ladder", () => {
  it("has ten prizes, each bigger and worth more than the last", () => {
    assert.equal(PRIZES.length, 10);
    assert.equal(TOP_TIER, 10);
    for (let i = 1; i < PRIZES.length; i += 1) {
      assert.equal(PRIZES[i]!.tier, i + 1);
      assert.ok(PRIZES[i]!.radius > PRIZES[i - 1]!.radius);
      assert.ok(PRIZES[i]!.points > PRIZES[i - 1]!.points);
    }
    // Dropping the smallest scores nothing, and nothing makes it.
    assert.equal(PRIZES[0]!.points, 0);
  });

  it("fits its biggest prize in the tank", () => {
    assert.ok(prize(TOP_TIER).radius * 2 < TANK_W);
    assert.ok(prize(TOP_TIER).radius * 2 < TANK_H - DANGER_Y);
  });

  it("has no prize past the top", () => {
    assert.throws(() => prize(TOP_TIER + 1));
    assert.throws(() => prize(0));
  });
});

describe("what you are handed", () => {
  it("is the same for the same seed", () => {
    const a = new DropSequence(20261016);
    const b = new DropSequence(20261016);
    for (let i = 0; i < 300; i += 1) assert.equal(a.next(), b.next());
  });

  it("is different for a different seed", () => {
    const a = new DropSequence(1);
    const b = new DropSequence(2);
    const same = Array.from({ length: 60 }, () => a.next() === b.next()).filter(Boolean);
    assert.ok(same.length < 60);
  });

  it("is only ever one of the four smallest", () => {
    const sequence = new DropSequence(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      const tier = sequence.next();
      assert.ok(tier >= 1 && tier <= SPAWN_WEIGHTS.length, `handed a tier ${tier}`);
      seen.add(tier);
    }
    assert.equal(seen.size, SPAWN_WEIGHTS.length);
  });

  it("comes out in about the share each is meant to", () => {
    const sequence = new DropSequence(99, 0);
    const counts = [0, 0, 0, 0];
    const total = 20000;
    for (let i = 0; i < total; i += 1) counts[sequence.next() - 1]! += 1;
    SPAWN_WEIGHTS.forEach((weight, i) => {
      assert.ok(Math.abs(counts[i]! / total - weight) < 0.02, `tier ${i + 1}: ${counts[i]! / total}`);
    });
  });

  it("opens an endless run with a pair to merge", () => {
    const run = createRun(123);
    assert.equal(run.current, 2);
    assert.equal(run.next, 2);
  });

  it("can open without the pair, for a daily drop", () => {
    const withPair = new DropSequence(5);
    const without = new DropSequence(5, 0);
    withPair.next();
    withPair.next();
    // After the opening pair, the two are the same run of prizes.
    for (let i = 0; i < 50; i += 1) assert.equal(withPair.next(), without.next());
  });

  it("isn't changed by anything else using random numbers", () => {
    const quiet = new DropSequence(42);
    const noisy = new DropSequence(42);
    const other = new Rng(1);
    for (let i = 0; i < 100; i += 1) {
      other.next();
      Math.random();
      assert.equal(quiet.next(), noisy.next());
    }
  });
});

describe("dropping", () => {
  it("is one prize for one release, however fast the taps", () => {
    const run = createRun(1);
    assert.ok(drop(run, 100));
    for (let i = 0; i < 20; i += 1) assert.equal(drop(run, 100), null);
    assert.equal(run.world.bodies.length, 1);
    assert.equal(run.drops, 1);
  });

  it("lets the next one go after the wait", () => {
    const run = createRun(1);
    drop(run, 60);
    wait(run, DROP_COOLDOWN - 0.05);
    assert.equal(canDrop(run), false);
    wait(run, 0.1);
    assert.equal(canDrop(run), true);
    assert.ok(drop(run, 300));
    assert.equal(run.drops, 2);
  });

  it("moves along the sequence one prize at a time", () => {
    const run = createRun(77);
    const expected = new DropSequence(77);
    for (let i = 0; i < 40 && !run.over; i += 1) {
      assert.equal(run.current, expected.next());
      assert.ok(drop(run, 20 + ((i * 61) % 320)));
      wait(run, DROP_COOLDOWN + 0.02);
    }
  });

  it("drops it where it was aimed, above the line", () => {
    const run = createRun(1);
    const body = drop(run, 222);
    assert.ok(body);
    assert.equal(body.x, 222);
    assert.equal(body.y, RELEASE_Y);
    assert.ok(RELEASE_Y < DANGER_Y);
  });

  it("keeps the aim inside the walls", () => {
    const run = createRun(1);
    const r = prize(run.current).radius;
    assert.equal(clampAim(run, -50), r);
    assert.equal(clampAim(run, 9999), TANK_W - r);
    const body = drop(run, -50);
    assert.equal(body?.x, r);
  });
});

describe("scoring", () => {
  it("scores nothing for a drop", () => {
    const run = createRun(1);
    drop(run, 100);
    wait(run, 2);
    assert.equal(run.score, 0);
  });

  it("scores the new prize once when two merge", () => {
    const run = createRun(1); // opens with two Bouncy Balls
    drop(run, 100);
    wait(run, 1.5);
    drop(run, 102);
    wait(run, 2);
    assert.equal(run.score, prize(3).points);
    assert.equal(run.bestTier, 3);
  });

  it("adds up to exactly the merges that happened", () => {
    const run = createRun(31);
    const aim = new Rng(8);
    let expected = 0;
    let merges = 0;
    for (let i = 0; i < 120 * 90 && !run.over; i += 1) {
      if (i % 70 === 0) drop(run, aim.range(0, TANK_W));
      for (const merge of stepRun(run).merges) {
        expected += prize(merge.tier).points;
        merges += 1;
      }
    }
    assert.ok(merges > 20, "the run should have had plenty of merges");
    assert.equal(run.score, expected);
  });

  it("gives a chain no bonus", () => {
    // Two ducks merge under a racer, which lands on the racer they make.
    const run = createRun(1);
    addBody(run.world, 5, 148, TANK_H - 130);
    addBody(run.world, 4, 121, TANK_H - 27);
    addBody(run.world, 4, 175, TANK_H - 27);
    wait(run, 3);
    assert.equal(run.score, prize(5).points + prize(6).points);
    assert.equal(run.bestTier, 6);
  });

  it("keeps going after the Grand Prize Bot", () => {
    const run = createRun(1);
    const r = prize(9).radius;
    addBody(run.world, 9, r, TANK_H - r);
    addBody(run.world, 9, r * 3, TANK_H - r);
    wait(run, 3);
    assert.equal(run.bestTier, TOP_TIER);
    assert.equal(run.score, prize(TOP_TIER).points);
    assert.equal(run.over, false);
    assert.equal(run.world.bodies.length, 1);
  });
});

describe("too full", () => {
  it("doesn't count a prize on its way in", () => {
    const run = createRun(1);
    drop(run, 180);
    // It starts above the line, and for a moment that is fine.
    assert.ok(run.world.bodies[0]!.y - run.world.bodies[0]!.r < DANGER_Y);
    wait(run, 3);
    assert.equal(run.danger, 0);
    assert.equal(run.over, false);
  });

  /**
   * A cabinet that really is full: Grand Prize Bots wedged between the walls,
   * one on the next, until the last stands over the line. They don't merge
   * and there is nowhere for them to go.
   */
  function overfull(): Run {
    const run = createRun(1);
    const r = prize(TOP_TIER).radius;
    const rise = Math.sqrt((2 * r) ** 2 - (TANK_W - 2 * r) ** 2);
    for (let i = 0; i < 8; i += 1) {
      const y = TANK_H - r - rise * i;
      addBody(run.world, TOP_TIER, i % 2 === 0 ? r : TANK_W - r, y);
      if (y - r < DANGER_Y) break;
    }
    return run;
  }

  function topOf(run: Run) {
    return run.world.bodies[run.world.bodies.length - 1]!;
  }

  it("gives a prize its first moments free", () => {
    const run = overfull();
    wait(run, NEWBORN_GRACE - 0.1);
    assert.equal(run.danger, 0);
    wait(run, 0.3);
    assert.ok(run.danger > 0);
  });

  it("ends the run once a prize has stayed over the line", () => {
    const run = overfull();
    wait(run, NEWBORN_GRACE + OVERFLOW_LIMIT - 0.3);
    assert.equal(run.over, false);
    assert.ok(run.danger > 0);
    wait(run, 0.6);
    assert.equal(run.over, true);
  });

  it("ends it once, and then nothing moves", () => {
    const run = overfull();
    wait(run, NEWBORN_GRACE + OVERFLOW_LIMIT + 0.5);
    assert.equal(run.over, true);

    const score = run.score;
    const time = run.time;
    const bodies = JSON.stringify(run.world.bodies);
    assert.equal(drop(run, 100), null);
    wait(run, 2);
    assert.equal(run.score, score);
    assert.equal(run.time, time);
    assert.equal(JSON.stringify(run.world.bodies), bodies);
  });

  it("stops the clock when the pile comes back down", () => {
    const run = overfull();
    wait(run, NEWBORN_GRACE + 1);
    assert.ok(run.danger > 0);
    // Take the top of the pile away, as a merge would.
    run.world.bodies = run.world.bodies.slice(0, -1);
    wait(run, 0.2);
    assert.equal(run.danger, 0);
    wait(run, OVERFLOW_LIMIT + 1);
    assert.equal(run.over, false);
  });

  it("can't be held off by dropping more", () => {
    const run = overfull();
    let dropped = 0;
    for (let i = 0; i < 120 * 8 && !run.over; i += 1) {
      if (drop(run, 20 + ((i * 37) % 320))) dropped += 1;
      stepRun(run);
    }
    assert.ok(dropped > 3, "it should have been dropping the whole time");
    assert.equal(run.over, true);
    assert.ok(run.time < NEWBORN_GRACE + OVERFLOW_LIMIT + 0.5, `it took ${run.time.toFixed(1)}s`);
  });

  it("starts a prize on top of a pile that has reached the top", () => {
    const run = overfull();
    const top = topOf(run);
    const body = drop(run, top.x);
    assert.ok(body);
    const gap = Math.hypot(body.x - top.x, body.y - top.y) - body.r - top.r;
    assert.ok(Math.abs(gap) < 0.01, `it started ${gap.toFixed(2)} from the pile`);
    assert.ok(body.y < RELEASE_Y);
  });

  it("doesn't shove the pile about when prizes land on a full tank", () => {
    const run = overfull();
    const top = topOf(run);
    let fastest = 0;
    for (let i = 0; i < 120 * 2; i += 1) {
      const dropped = drop(run, top.x - 40 + ((i * 37) % 80));
      // It starts at rest, on the pile: nothing has been pushed out of anything.
      if (dropped) assert.equal(Math.hypot(dropped.vx, dropped.vy), 0);
      stepRun(run);
      for (const b of run.world.bodies) {
        if (b.tier === TOP_TIER) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
      }
    }
    assert.ok(fastest < 60, `the pile was moving at ${fastest.toFixed(0)}`);
  });

  it("ends every run sooner or later", () => {
    for (const seed of [3, 4, 5]) {
      const run = createRun(seed);
      const aim = new Rng(seed);
      for (let i = 0; i < 120 * 1200 && !run.over; i += 1) {
        if (i % 60 === 0) drop(run, aim.range(0, TANK_W));
        stepRun(run);
      }
      assert.equal(run.over, true, `seed ${seed} never filled the cabinet`);
    }
  });
});

describe("the clock", () => {
  it("only runs when the tank is stepped", () => {
    // Pausing is the arcade not calling stepRun. Nothing here reads the time
    // of day, so a pause of any length costs nothing.
    const run = createRun(1);
    drop(run, 100);
    wait(run, 1);
    assert.ok(Math.abs(run.time - 1) < 0.02);
  });

  it("starts a new run with nothing left over", () => {
    const old = createRun(1);
    drop(old, 100);
    wait(old, 1);
    const fresh = createRun(2);
    assert.equal(fresh.world.bodies.length, 0);
    assert.equal(fresh.score, 0);
    assert.equal(fresh.danger, 0);
    assert.equal(fresh.cooldown, 0);
    assert.equal(fresh.time, 0);
    assert.equal(fresh.over, false);
    assert.equal(fresh.bestTier, 1);
  });
});

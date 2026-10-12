/**
 * The tank has to behave before anything is drawn in it.
 *
 * These are the ways a hand-written physics engine goes wrong: a prize that
 * merges twice, one that falls through another, a pile that never sits
 * still, a number that turns into NaN. Each has a test, so the cabinet can
 * be tuned without wondering what broke.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addBody, createWorld, PHYSICS_STEP, stepWorld, type MergeEvent, type World } from "./physics.ts";
import { prize, TANK_H, TANK_W, TOP_TIER } from "./prizes.ts";

/** Run the tank for a while and collect every merge. */
function run(world: World, seconds: number): MergeEvent[] {
  const merges: MergeEvent[] = [];
  for (let i = 0; i < seconds / PHYSICS_STEP; i += 1) {
    merges.push(...stepWorld(world).merges);
  }
  return merges;
}

function assertSane(world: World): void {
  for (const b of world.bodies) {
    assert.ok(
      [b.x, b.y, b.vx, b.vy, b.angle, b.spin, b.r].every(Number.isFinite),
      `prize ${b.id} has a number that isn't one`,
    );
    assert.ok(b.x >= b.r - 0.01 && b.x <= TANK_W - b.r + 0.01, `prize ${b.id} is through a wall`);
    assert.ok(b.y <= TANK_H - b.r + 0.01, `prize ${b.id} is through the floor`);
  }
}

describe("merging", () => {
  it("turns two matching prizes into one of the next", () => {
    const world = createWorld();
    addBody(world, 2, 100, TANK_H - 16);
    addBody(world, 2, 100 + 31, TANK_H - 16);
    const merges = run(world, 0.5);

    assert.equal(merges.length, 1);
    assert.equal(merges[0]!.tier, 3);
    assert.equal(world.bodies.length, 1);
    assert.equal(world.bodies[0]!.tier, 3);
  });

  it("leaves prizes that don't match alone", () => {
    const world = createWorld();
    addBody(world, 2, 100, TANK_H - 16);
    addBody(world, 3, 136, TANK_H - 21);
    const merges = run(world, 1);

    assert.equal(merges.length, 0);
    assert.equal(world.bodies.length, 2);
  });

  it("can't use one prize in two merges", () => {
    // Three in a row, all touching. Two merge; the third is left over.
    const world = createWorld();
    addBody(world, 4, 100, TANK_H - 27);
    addBody(world, 4, 153, TANK_H - 27);
    addBody(world, 4, 206, TANK_H - 27);
    const first = stepWorld(world).merges;

    assert.equal(first.length, 1);
    assert.equal(world.bodies.length, 2);
    assert.deepEqual(world.bodies.map((b) => b.tier).sort(), [4, 5]);
  });

  it("names each parent once across a whole pile", () => {
    const world = createWorld();
    for (let i = 0; i < 12; i += 1) addBody(world, 1, 20 + i * 23, TANK_H - 12);
    const used = new Set<number>();
    for (const merge of run(world, 2)) {
      for (const id of merge.parents) {
        assert.ok(!used.has(id), `prize ${id} merged twice`);
        used.add(id);
      }
    }
    assert.ok(used.size >= 12);
  });

  it("stops at the top of the ladder", () => {
    const world = createWorld();
    const r = prize(TOP_TIER).radius;
    addBody(world, TOP_TIER, r, TANK_H - r);
    // Too wide to sit side by side, so the second rests on the first.
    addBody(world, TOP_TIER, TANK_W - r, TANK_H - r * 2.2);
    const merges = run(world, 3);

    assert.equal(merges.length, 0);
    assert.equal(world.bodies.length, 2);
    assert.ok(world.bodies.every((b) => b.tier === TOP_TIER));
    assertSane(world);
  });

  it("makes the new prize where the two were, moving as they were", () => {
    const world = createWorld();
    const a = addBody(world, 3, 100, 200);
    const b = addBody(world, 3, 141, 200);
    a.vx = 60;
    b.vx = 20;
    const [merge] = stepWorld(world).merges;

    assert.ok(merge);
    assert.ok(Math.abs(merge.x - 120.5) < 1.5, `made at x=${merge.x}`);
    assert.ok(Math.abs(world.bodies[0]!.vx - 40) < 12, `moving at ${world.bodies[0]!.vx}`);
  });
});

describe("staying in the tank", () => {
  it("survives two prizes in exactly the same place", () => {
    const world = createWorld();
    addBody(world, 3, 180, 200);
    addBody(world, 5, 180, 200);
    run(world, 2);
    assertSane(world);
  });

  it("keeps a big prize made against the wall inside it", () => {
    const world = createWorld();
    const r = prize(8).radius;
    addBody(world, 8, r, TANK_H - r);
    addBody(world, 8, r, TANK_H - r * 3 + 1);
    // Something for the new prize to grow into.
    addBody(world, 6, r * 2 + prize(6).radius + 1, TANK_H - prize(6).radius);
    const merges = run(world, 2);

    assert.equal(merges.length, 1);
    assertSane(world);
    const made = world.bodies.find((b) => b.tier === 9);
    assert.ok(made);
    assert.equal(made.r, prize(9).radius, "it finished growing");
  });

  it("doesn't throw the neighbours when a prize swells into them", () => {
    const world = createWorld();
    // Two ducks with a marble sitting in the dip between them.
    addBody(world, 4, 150, TANK_H - 27);
    addBody(world, 4, 204, TANK_H - 27);
    const marble = addBody(world, 1, 177, TANK_H - 27 - 28);
    let fastest = 0;
    for (let i = 0; i < 240; i += 1) {
      stepWorld(world);
      fastest = Math.max(fastest, Math.hypot(marble.vx, marble.vy));
    }
    assert.ok(fastest < 500, `the marble was thrown at ${fastest.toFixed(0)}`);
    assertSane(world);
  });

  it("doesn't let a fast prize pass through a small one", () => {
    const world = createWorld();
    const marble = addBody(world, 1, 180, TANK_H - 12);
    const falling = addBody(world, 3, 180, -400);
    falling.vy = 5000; // far past anything gravity could do; it gets capped
    for (let i = 0; i < 240; i += 1) {
      stepWorld(world);
      assert.ok(falling.y < marble.y, "the falling prize got underneath");
    }
    assertSane(world);
  });

  it("holds a prize dropped from the top of the tank", () => {
    const world = createWorld();
    for (let tier = 1; tier <= 4; tier += 1) {
      addBody(world, tier, 40 + tier * 70, 24);
    }
    run(world, 3);
    assertSane(world);
    for (const b of world.bodies) {
      assert.ok(Math.abs(b.y - (TANK_H - b.r)) < 0.5, `prize ${b.id} isn't on the floor`);
    }
  });
});

describe("coming to rest", () => {
  it("leaves a stack standing", () => {
    // Biggest at the bottom, each a different prize so nothing merges.
    const world = createWorld();
    let y = TANK_H;
    for (const tier of [7, 6, 5, 4, 3]) {
      const r = prize(tier).radius;
      y -= r;
      addBody(world, tier, 180, y);
      y -= r;
    }
    run(world, 3);
    const before = world.bodies.map((b) => ({ x: b.x, y: b.y }));
    run(world, 3);

    world.bodies.forEach((b, i) => {
      const moved = Math.hypot(b.x - before[i]!.x, b.y - before[i]!.y);
      assert.ok(moved < 0.5, `prize ${b.id} drifted ${moved.toFixed(2)} while at rest`);
      assert.ok(Math.hypot(b.vx, b.vy) < 5, `prize ${b.id} is still moving`);
    });
    // And it is still a stack: nothing squeezed out sideways.
    assert.ok(world.bodies.every((b) => Math.abs(b.x - 180) < 2));
  });

  it("settles a heap of mixed prizes", () => {
    const world = createWorld();
    const tiers = [5, 1, 3, 6, 2, 4, 1, 7, 3, 2, 5, 1];
    tiers.forEach((tier, i) => {
      addBody(world, tier, 40 + ((i * 97) % 280), 20);
      run(world, 0.6);
    });
    run(world, 5);
    assertSane(world);
    for (const b of world.bodies) {
      assert.ok(Math.hypot(b.vx, b.vy) < 5, `prize ${b.id} never settled`);
    }
  });

  it("does the same thing every time", () => {
    const play = (): string => {
      const world = createWorld();
      for (let i = 0; i < 30; i += 1) {
        addBody(world, 1 + (i % 4), 30 + ((i * 53) % 300), 24);
        run(world, 0.5);
      }
      return JSON.stringify(world.bodies.map((b) => [b.tier, b.x, b.y]));
    };
    assert.equal(play(), play());
  });
});

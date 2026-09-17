/**
 * The tower has to be climbable, and the junk has to leave.
 *
 * Both fail silently. A girder whose open end drops junk into a gap with no
 * girder below leaves junk falling forever off the bottom of the screen; a
 * ladder a pixel outside the girder above can't be finished; a jump a pixel too
 * low can never clear a tyre. None of those look like bugs from the player's
 * chair -- they look like the game is unfair.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Rng } from "../../core/rng.ts";
import {
  difficulty,
  downhill,
  GIRDERS,
  girderY,
  GRAVITY,
  JUMP_VELOCITY,
  JUNK_RADIUS,
  junkHitsPlayer,
  jumpedOver,
  LADDERS,
  ladderBottomY,
  ladderTop,
  ladderTopY,
  newPlayer,
  PLAYER_W,
  ROBOT,
  ROOF,
  spawnJunk,
  START,
  stepJunk,
  stepPlayer,
  touchesRobot,
  WALK_SPEED,
  WORLD_W,
  type Intent,
  type JunkKind,
  type Player,
} from "./level.ts";

const IDLE: Intent = { x: 0, y: 0, jump: false };

describe("the tower", () => {
  it("slopes every girder down toward its open end", () => {
    for (let i = 0; i < GIRDERS.length; i += 1) {
      const g = GIRDERS[i]!;
      if (g.open === "right") assert.ok(g.y2 > g.y1, `girder ${i} should fall to the right`);
      if (g.open === "left") assert.ok(g.y1 > g.y2, `girder ${i} should fall to the left`);
      if (g.open === "bin") assert.ok(g.y1 > g.y2, "the floor drains left into the bin");
    }
  });

  it("alternates open ends so junk zig-zags down", () => {
    for (let i = 1; i < GIRDERS.length - 2; i += 1) {
      assert.notEqual(downhill(i), downhill(i + 1), `girders ${i} and ${i + 1} roll the same way`);
    }
  });

  it("always has a girder below an open end to catch falling junk", () => {
    for (let i = 1; i < GIRDERS.length - 1; i += 1) {
      const g = GIRDERS[i]!;
      const below = GIRDERS[i - 1]!;
      // Junk leaves just past the end and drifts a little further while falling.
      const dropX = g.open === "right" ? g.x2 + 14 : g.x1 - 14;
      assert.ok(
        dropX >= below.x1 && dropX <= below.x2,
        `junk falling off girder ${i} at x=${dropX} misses girder ${i - 1}`,
      );
    }
  });

  it("puts every ladder fully on both girders it connects", () => {
    for (const ladder of LADDERS) {
      for (const level of [ladder.bottom, ladderTop(ladder)]) {
        const g = GIRDERS[level]!;
        assert.ok(
          ladder.x - PLAYER_W / 2 >= g.x1 && ladder.x + PLAYER_W / 2 <= g.x2,
          `ladder at x=${ladder.x} hangs off girder ${level}`,
        );
      }
      assert.ok(ladderTopY(ladder) < ladderBottomY(ladder), "ladders go up");
    }
  });

  it("can be climbed from the start to the dog", () => {
    const reached = new Set<number>([START.level]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const ladder of LADDERS) {
        if (reached.has(ladder.bottom) && !reached.has(ladderTop(ladder))) {
          reached.add(ladderTop(ladder));
          grew = true;
        }
      }
    }
    assert.ok(reached.has(ROOF), "no route of ladders reaches the roof");
  });

  it("never makes you touch the robot to use a ladder", () => {
    for (const ladder of LADDERS) {
      for (const level of [ladder.bottom, ladderTop(ladder)]) {
        if (level !== ROBOT.level) continue;
        assert.ok(
          ladder.x - PLAYER_W / 2 >= ROBOT.x2,
          `ladder at x=${ladder.x} on the robot's girder is inside the robot`,
        );
      }
    }
  });
});

describe("junk", () => {
  const kinds: JunkKind[] = ["tire", "spool", "paint", "toolbox"];

  it("always makes it down the tower and into the bin", () => {
    for (let seed = 0; seed < 60; seed += 1) {
      for (const stage of [1, 4, 10]) {
        const rng = new Rng(seed * 31 + stage);
        const junk = spawnJunk(1, kinds[seed % kinds.length]!);
        let t = 0;
        while (!junk.gone && t < 120) {
          stepJunk(junk, 1 / 60, stage, rng);
          assert.ok(Number.isFinite(junk.x) && Number.isFinite(junk.y), "junk position went NaN");
          assert.ok(junk.x > -40 && junk.x < WORLD_W + 40, `junk flew off sideways to x=${junk.x}`);
          if (junk.mode === "roll" && !junk.gone) {
            assert.ok(
              Math.abs(junk.y - girderY(junk.level, junk.x)) < 0.5,
              "rolling junk should sit on its girder",
            );
          }
          t += 1 / 60;
        }
        assert.ok(junk.gone, `seed ${seed} stage ${stage}: junk still on the tower after 120s`);
        assert.equal(junk.level, 0, "junk should leave through the bottom");
      }
    }
  });

  it("still takes ladders on a slow frame", () => {
    // Crossing detection, not proximity: at dt 0.1 junk moves ~5 units a step
    // and would sail past a ladder a proximity check was waiting for.
    let tookLadder = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = new Rng(seed);
      const junk = spawnJunk(1, "paint");
      let t = 0;
      while (!junk.gone && t < 60) {
        stepJunk(junk, 0.1, 8, rng);
        if (junk.mode === "ladder") {
          tookLadder += 1;
          break;
        }
        t += 0.1;
      }
    }
    assert.ok(tookLadder > 20, `only ${tookLadder}/200 took a ladder at dt 0.1`);
  });

  it("gets harder with each stage, then levels off", () => {
    for (let stage = 2; stage <= 30; stage += 1) {
      const now = difficulty(stage);
      const before = difficulty(stage - 1);
      assert.ok(now.throwInterval <= before.throwInterval);
      assert.ok(now.junkSpeed >= before.junkSpeed);
      assert.ok(now.ladderChance >= before.ladderChance);
    }
    assert.ok(difficulty(100).throwInterval >= 1.15, "throws must never become a solid wall");
    assert.ok(difficulty(100).junkSpeed <= 96);
    assert.ok(difficulty(100).ladderChance <= 0.42);
  });
});

describe("jumping", () => {
  it("jumps high enough to clear any junk", () => {
    const apex = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
    assert.ok(apex > JUNK_RADIUS * 2 + 4, `apex ${apex.toFixed(1)} can't clear a ${JUNK_RADIUS * 2} tall tyre`);
  });

  it("stays over the junk long enough to clear the fastest junk coming at you", () => {
    // Time spent higher than the junk, times the closing speed, must exceed
    // the width that has to pass underneath (junk + JB).
    const clear = JUNK_RADIUS * 2;
    const a = GRAVITY / 2;
    const b = JUMP_VELOCITY;
    const disc = b * b - 4 * a * clear;
    assert.ok(disc > 0, "never gets above the junk at all");
    const window = Math.sqrt(disc) / a;
    const closing = difficulty(100).junkSpeed * 1.25 + WALK_SPEED;
    const needed = JUNK_RADIUS * 2 + PLAYER_W;
    assert.ok(
      window * closing > needed,
      `only ${(window * closing).toFixed(1)} units of clearance for ${needed} needed`,
    );
  });

  it("lands back on the same girder", () => {
    const p = newPlayer();
    stepPlayer(p, 1 / 60, { x: -1, y: 0, jump: true });
    let landed = false;
    for (let i = 0; i < 120 && !landed; i += 1) {
      landed = stepPlayer(p, 1 / 60, IDLE).includes("land");
    }
    assert.ok(landed, "never landed");
    assert.equal(p.level, START.level);
    assert.ok(Math.abs(p.y - girderY(p.level, p.x)) < 0.01);
  });
});

describe("JB", () => {
  function onLadderBottom(index: number): Player {
    const p = newPlayer();
    const ladder = LADDERS[index]!;
    p.level = ladder.bottom;
    p.x = ladder.x;
    p.y = ladderBottomY(ladder);
    return p;
  }

  it("can't walk off either end of a girder", () => {
    const p = newPlayer();
    for (let i = 0; i < 600; i += 1) stepPlayer(p, 1 / 60, { x: 1, y: 0, jump: false });
    assert.ok(p.x <= GIRDERS[0]!.x2, "walked off the right end");
    for (let i = 0; i < 1200; i += 1) stepPlayer(p, 1 / 60, { x: -1, y: 0, jump: false });
    assert.ok(p.x >= GIRDERS[0]!.x1, "walked off the left end");
  });

  it("climbs a ladder up to the next girder", () => {
    const p = onLadderBottom(0);
    const events: string[] = [];
    for (let i = 0; i < 300; i += 1) events.push(...stepPlayer(p, 1 / 60, { x: 0, y: -1, jump: false }));
    assert.ok(events.includes("climbStart"));
    assert.equal(p.level, 1);
    assert.equal(p.mode, "walk");
  });

  it("can't climb while holding the wrench, and says why", () => {
    const p = onLadderBottom(0);
    p.wrench = 5;
    const events = stepPlayer(p, 1 / 60, { x: 0, y: -1, jump: false });
    assert.ok(events.includes("blockedByWrench"));
    assert.equal(p.mode, "walk");
  });

  it("reaches the dog from the last ladder", () => {
    const last = LADDERS.findIndex((l) => ladderTop(l) === ROOF);
    const p = onLadderBottom(last);
    const events: string[] = [];
    for (let i = 0; i < 300; i += 1) events.push(...stepPlayer(p, 1 / 60, { x: 0, y: -1, jump: false }));
    assert.ok(events.includes("roof"));
    assert.equal(p.level, ROOF);
  });

  it("gets hit by junk on top of him, and not by junk a stride away", () => {
    const p = newPlayer();
    const near = spawnJunk(1, "tire");
    near.level = p.level;
    near.x = p.x;
    near.y = p.y;
    assert.ok(junkHitsPlayer(near, p));

    const far = spawnJunk(2, "tire");
    far.level = p.level;
    far.x = p.x + 24;
    far.y = girderY(p.level, far.x);
    assert.ok(!junkHitsPlayer(far, p));
  });

  it("scores a jump only when he is actually above the junk", () => {
    const p = newPlayer();
    const j = spawnJunk(1, "tire");
    j.level = p.level;
    j.x = p.x;
    j.y = p.y;
    assert.ok(!jumpedOver(j, p), "standing next to it isn't a jump");
    p.mode = "jump";
    p.y -= JUNK_RADIUS * 2 + 4;
    assert.ok(jumpedOver(j, p));
  });

  it("gets hurt walking into the robot", () => {
    const p = newPlayer();
    p.level = ROBOT.level;
    p.x = ROBOT.x2 - 2;
    assert.ok(touchesRobot(p));
    p.x = ROBOT.x2 + PLAYER_W;
    assert.ok(!touchesRobot(p));
  });
});

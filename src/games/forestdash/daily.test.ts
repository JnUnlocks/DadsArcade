/**
 * Today's course is made by the date, so nobody has ever looked at tomorrow's.
 * These run a year of them through the same checks the hand-built courses get.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dailyCourse, generateDaily } from "./daily.ts";
import { pickRivals } from "./ghosts.ts";
import { createRacer, recordBotRun, RUN_SPEED, stepRacer, type Controls } from "./rules.ts";
import { courseKey, groundAt } from "./track.ts";

const STEP = 1 / 60;
const NONE: Controls = { pressed: false, held: false };
const PRESS: Controls = { pressed: true, held: true };
const HOLD: Controls = { pressed: false, held: true };

/** A year of seeds, starting from an arbitrary day. */
const SEEDS = Array.from({ length: 365 }, (_, i) => 20730 + i);

describe("forest dash: today's course", () => {
  it("finds a fair course for every day of a year, without falling back", () => {
    for (const seed of SEEDS) {
      const { track, attempts } = generateDaily(seed);
      assert.ok(attempts < 20, `day ${seed} fell back to the Mossy Floor`);
      const run = recordBotRun(track, STEP);
      assert.ok(run.finishTime > 30 && run.finishTime < 60, `day ${seed}: ${run.finishTime}s`);
      assert.ok(
        run.points.every((p) => p.pose !== "gone"),
        `day ${seed}: the computer racer fell`,
      );
      assert.ok(groundAt(track, track.startX) && groundAt(track, track.finishX));
      assert.ok(track.endX - track.finishX >= 300);
    }
  });

  it("lets you cross every updraft pit just by jumping and holding on", () => {
    for (const seed of SEEDS) {
      const { track } = generateDaily(seed);
      for (const u of track.updrafts) {
        const before = track.ground.filter((g) => g.x1 <= u.x0).at(-1)!;
        const r = createRacer(before.x1 - 200);
        r.y = before.top;
        r.vx = RUN_SPEED;
        while (r.x < before.x1 - 120) stepRacer(r, track, NONE, STEP);
        stepRacer(r, track, PRESS, STEP);
        let crossed = false;
        for (let i = 0; i < 900 && r.respawnTimer <= 0; i += 1) {
          stepRacer(r, track, HOLD, STEP);
          if (r.grounded && r.x > u.x1) {
            crossed = true;
            break;
          }
        }
        assert.ok(crossed, `day ${seed}: fell into the updraft pit at ${u.x0}`);
      }
    }
  });

  it("is the same course for everyone on a day, and a different one the next", () => {
    const a = JSON.stringify(generateDaily(20730).track);
    assert.equal(a, JSON.stringify(generateDaily(20730).track));
    const different = SEEDS.slice(1, 30).filter(
      (seed) => JSON.stringify(generateDaily(seed).track) !== a,
    );
    assert.equal(different.length, 29);
  });

  it("files its runs under a key that starts with the date and fits the server", () => {
    const course = dailyCourse(new Date(2026, 9, 5, 12));
    assert.equal(course.id, "daily-20261005");
    const key = courseKey(course.id, course.build(), 1);
    assert.match(key, /^daily-20261005-1-[a-z0-9]+$/);
    assert.ok(key.length <= 40);
    // Two builds are equal but not the same object.
    assert.deepEqual(course.build(), course.build());
    assert.notEqual(course.build(), course.build());
  });
});

describe("forest dash: who you race", () => {
  const runs = [30, 34, 38, 42, 46, 50].map((s) => ({ timeMs: s * 1000 }));

  it("takes the fastest three by default, and when you have no time yet", () => {
    assert.deepEqual(pickRivals(runs, "fastest", 47000).map((r) => r.timeMs), [30000, 34000, 38000]);
    assert.deepEqual(pickRivals(runs, "near", null).map((r) => r.timeMs), [30000, 34000, 38000]);
  });

  it("takes the three closest to your time, fastest first", () => {
    assert.deepEqual(pickRivals(runs, "near", 47000).map((r) => r.timeMs), [42000, 46000, 50000]);
    assert.deepEqual(pickRivals(runs, "near", 20000).map((r) => r.timeMs), [30000, 34000, 38000]);
  });

  it("takes whatever it's given when a person was asked for", () => {
    assert.deepEqual(pickRivals(runs.slice(4), "RIL", 30000).map((r) => r.timeMs), [46000, 50000]);
  });
});

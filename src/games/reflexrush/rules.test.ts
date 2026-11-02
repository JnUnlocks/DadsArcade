/**
 * Reflex Rush's rules: Neon Skyline's cutting and bouncing, and Flash Point's
 * judging and scoring. Both are the kind of thing that is quietly wrong --
 * a perfect window a unit too tight, a median off by one -- and looks to the
 * player like the game cheated.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BONUS_WIDTH,
  FIELD_W,
  MAX_SPEED,
  newSkyline,
  PERFECT_TOLERANCE,
  place,
  slide,
  speedFor,
  START_SPEED,
  START_W,
  step,
  widen,
  height,
  type Mover,
  type Skyline,
} from "./skyline.ts";
import { judge, median, points, summarise, TIMEOUT_MS, TRIALS, waitFor, WAIT_MAX, WAIT_MIN } from "./flash.ts";

/** Put the sliding block exactly `offset` units right of the block below. */
function aim(s: Skyline, offset: number): void {
  const below = s.tower[s.tower.length - 1]!;
  s.mover = { ...s.mover, x: below.x + offset };
}

describe("neon skyline", () => {
  it("cuts off the overhang and keeps the overlap", () => {
    const s = newSkyline();
    const below = s.tower[0]!;
    aim(s, 30);
    const result = place(s);
    assert.equal(result?.kind, "cut");
    if (result?.kind !== "cut") return;
    assert.deepEqual(result.placed, { x: below.x + 30, w: START_W - 30 });
    assert.deepEqual(result.cut, { x: below.x + START_W, w: 30 });
    assert.equal(s.mover.w, START_W - 30, "the next block is the overlap's width");
    assert.equal(height(s), 1);
  });

  it("cuts the left-hand overhang too", () => {
    const s = newSkyline();
    const below = s.tower[0]!;
    aim(s, -25);
    const result = place(s);
    assert.equal(result?.kind, "cut");
    if (result?.kind !== "cut") return;
    assert.deepEqual(result.cut, { x: below.x - 25, w: 25 });
    assert.deepEqual(result.placed, { x: below.x, w: START_W - 25 });
  });

  it("calls it PERFECT within the tolerance, and snaps it into line", () => {
    for (const offset of [PERFECT_TOLERANCE, -PERFECT_TOLERANCE, 0]) {
      const s = newSkyline();
      aim(s, offset);
      const result = place(s);
      assert.equal(result?.kind, "perfect", `offset ${offset}`);
      assert.deepEqual(s.tower[1], s.tower[0]);
    }
    const s = newSkyline();
    aim(s, PERFECT_TOLERANCE + 0.5);
    assert.equal(place(s)?.kind, "cut", "just outside the tolerance is a cut");
  });

  it("scores 10 a block and a growing PERFECT bonus that stops at five", () => {
    const s = newSkyline();
    const gained: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      aim(s, 0);
      const before = s.score;
      place(s);
      gained.push(s.score - before);
    }
    assert.deepEqual(gained, [15, 20, 25, 30, 35, 35, 35]);
    aim(s, 20);
    const before = s.score;
    place(s);
    assert.equal(s.score - before, 10);
    assert.equal(s.streak, 0);
    assert.equal(s.bestStreak, 7);
    assert.equal(s.perfects, 7);
  });

  it("wins back width on every third PERFECT in a row, never past the start", () => {
    const s = newSkyline();
    aim(s, 50); // a cut: down to 170 wide
    place(s);
    const narrow = s.mover.w;
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      aim(s, 0);
      results.push(place(s));
    }
    assert.deepEqual(
      results.map((r) => (r?.kind === "perfect" ? r.bonus : null)),
      [false, false, true],
    );
    assert.equal(s.mover.w, narrow + BONUS_WIDTH);

    const full = newSkyline();
    for (let i = 0; i < 3; i += 1) {
      aim(full, 0);
      place(full);
    }
    assert.equal(full.mover.w, START_W, "no bonus beyond the starting width");
    assert.equal(widen({ x: 0, w: START_W - 4 }, BONUS_WIDTH).w, START_W);
    assert.equal(widen({ x: 0, w: 100 }, BONUS_WIDTH).x, 0, "widening stays on the field");
  });

  it("ends the run on a complete miss", () => {
    const s = newSkyline();
    aim(s, START_W + 1);
    const result = place(s);
    assert.equal(result?.kind, "miss");
    assert.ok(s.over);
    assert.equal(place(s), null, "nothing more to place");
    assert.equal(height(s), 0);
  });

  it("bounces off both walls and keeps going", () => {
    const m: Mover = { x: 0, w: 100, dir: 1 };
    const span = FIELD_W - 100;
    const hitRight = slide(m, 100, span / 100);
    assert.ok(Math.abs(hitRight.x - span) < 1e-9);
    const back = slide(m, 100, span / 100 + 0.5);
    assert.ok(Math.abs(back.x - (span - 50)) < 1e-9);
    assert.equal(back.dir, -1);
    const home = slide(m, 100, (span * 2) / 100 + 0.1);
    assert.ok(Math.abs(home.x - 10) < 1e-9);
    assert.equal(home.dir, 1);
    // Several crossings in one long step land in the same place as many small ones.
    let small = m;
    for (let i = 0; i < 600; i += 1) small = slide(small, 100, 1 / 60);
    const big = slide(m, 100, 10);
    assert.ok(Math.abs(small.x - big.x) < 1e-6 && small.dir === big.dir);
  });

  it("runs backwards to where the block was when the tap happened", () => {
    const m: Mover = { x: 40, w: 120, dir: -1 };
    for (const t of [0.05, 0.4, 3]) {
      const there = slide(m, 150, t);
      const back = slide(there, 150, -t);
      assert.ok(Math.abs(back.x - m.x) < 1e-9 && back.dir === m.dir, `t=${t}`);
    }
    const s = newSkyline();
    aim(s, 0);
    step(s, 0.1);
    assert.equal(place(s, 0.1)?.kind, "perfect", "placed where it was 0.1s ago");
  });

  it("speeds up 10% every five floors and stops at the cap", () => {
    assert.equal(speedFor(0), START_SPEED);
    assert.equal(speedFor(4), START_SPEED);
    assert.ok(Math.abs(speedFor(5) - START_SPEED * 1.1) < 1e-9);
    assert.equal(speedFor(500), MAX_SPEED);
  });

  it("slides each new block in from the other side", () => {
    const s = newSkyline();
    assert.equal(s.mover.dir, 1);
    aim(s, 0);
    place(s);
    assert.equal(s.mover.dir, -1);
    assert.equal(s.mover.x, FIELD_W - s.mover.w);
  });
});

describe("flash point", () => {
  it("waits between 1.5 and 4 seconds", () => {
    assert.equal(waitFor(() => 0), WAIT_MIN);
    assert.equal(waitFor(() => 1), WAIT_MAX);
  });

  it("judges a tap before GO as a false start, and a slow one as a miss", () => {
    assert.deepEqual(judge(null), { kind: "early" });
    assert.deepEqual(judge(-3), { kind: "early" });
    assert.deepEqual(judge(254.4), { kind: "hit", ms: 254 });
    assert.deepEqual(judge(TIMEOUT_MS - 1), { kind: "hit", ms: TIMEOUT_MS - 1 });
    assert.deepEqual(judge(TIMEOUT_MS), { kind: "miss" });
  });

  it("scores 1,000 a GO less the milliseconds, and nothing for an early or late tap", () => {
    assert.equal(points({ kind: "hit", ms: 250 }), 750);
    assert.equal(points({ kind: "hit", ms: 1400 }), 0);
    assert.equal(points({ kind: "early" }), 0);
    assert.equal(points({ kind: "miss" }), 0);
  });

  it("takes the median of the taps that counted", () => {
    assert.equal(median([300, 200, 250]), 250);
    assert.equal(median([300, 200, 250, 280]), 265);
    assert.equal(median([]), null);
  });

  it("sums up a mixed round", () => {
    const s = summarise([
      { kind: "hit", ms: 240 },
      { kind: "early" },
      { kind: "hit", ms: 300 },
      { kind: "miss" },
      { kind: "hit", ms: 210 },
    ]);
    assert.equal(s.score, 760 + 700 + 790);
    assert.deepEqual(s.times, [240, 300, 210]);
    assert.equal(s.median, 240);
    assert.equal(s.best, 210);
    assert.equal(s.falseStarts, 1);
    assert.equal(s.misses, 1);
  });

  it("shows no median and scores nothing when no tap counted", () => {
    const s = summarise(Array.from({ length: TRIALS }, () => ({ kind: "early" as const })));
    assert.equal(s.median, null);
    assert.equal(s.best, null);
    assert.equal(s.score, 0);
    assert.equal(s.falseStarts, TRIALS);
  });
});

/**
 * The course has to be finishable, and the controls have to be forgiving.
 *
 * The computer racer plays by exactly the player's rules, so it doubles as
 * proof that every gap, ledge and updraft on the track can actually be
 * cleared -- move a piece and break that, and this fails rather than a child
 * finding a pit nobody can cross.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRacer,
  FALL_LIMIT,
  JUMP_SPEED,
  recordBotRun,
  RESPAWN_SECONDS,
  RUN_SPEED,
  sampleRun,
  stepRacer,
  type Controls,
} from "./rules.ts";
import { buildTrack, groundAt, type Track } from "./track.ts";

const STEP = 1 / 60;
const NONE: Controls = { pressed: false, held: false };
const PRESS: Controls = { pressed: true, held: true };
const HOLD: Controls = { pressed: false, held: true };

/** A plain course: flat, a pit `gap` wide at x = 400, then flat again. */
function pitTrack(gap: number): Track {
  return {
    ground: [
      { x0: 0, x1: 400, top: 0 },
      { x0: 400 + gap, x1: 3000, top: 0 },
    ],
    hazards: [],
    puddles: [],
    caps: [],
    updrafts: [],
    acorns: [],
    startX: 50,
    finishX: 2500,
    endX: 3000,
  };
}

/** Run to just before the edge at top speed, then jump, holding or not. */
function jumpPit(gap: number, hold: boolean): boolean {
  const track = pitTrack(gap);
  const r = createRacer(100);
  r.vx = RUN_SPEED;
  while (r.x < 396) stepRacer(r, track, NONE, STEP);
  stepRacer(r, track, PRESS, STEP);
  for (let i = 0; i < 400; i += 1) {
    stepRacer(r, track, hold ? HOLD : NONE, STEP);
    if (r.respawnTimer > 0) return false;
    if (r.grounded && r.x > 400 + gap) return true;
  }
  return false;
}

describe("forest dash: the course", () => {
  it("can be finished by the computer racer, without a single fall", () => {
    const track = buildTrack();
    const run = recordBotRun(track, STEP);
    assert.ok(Number.isFinite(run.finishTime), "the computer racer never reached the finish");
    // A fall would show as a dip below the pit limit in the recording.
    assert.ok(
      run.points.every((p) => p.pose !== "gone"),
      "the computer racer fell somewhere on the course",
    );
  });

  it("lets you cross every updraft pit just by jumping and holding on", () => {
    // The simplest thing a child will try. The glide has to stay a glide while
    // the updraft lifts it, or the lift does nothing and the pit can't be crossed.
    const track = buildTrack();
    assert.ok(track.updrafts.length > 0);
    for (const u of track.updrafts) {
      const before = track.ground.filter((g) => g.x1 <= u.x0).at(-1)!;
      const r = createRacer(before.x1 - 200);
      r.y = before.top;
      r.vx = RUN_SPEED;
      while (r.x < before.x1 - 120) stepRacer(r, track, NONE, STEP);
      stepRacer(r, track, PRESS, STEP);
      let crossed = false;
      let highest = r.y;
      for (let i = 0; i < 900 && r.respawnTimer <= 0; i += 1) {
        stepRacer(r, track, HOLD, STEP);
        highest = Math.max(highest, r.y);
        if (r.grounded && r.x > u.x1) {
          crossed = true;
          break;
        }
      }
      assert.ok(crossed, `fell into the updraft pit at ${u.x0}`);
      assert.ok(highest > before.top + 200, `the updraft at ${u.x0} never lifted you`);
    }
  });

  it("takes a clean run between 30 and 60 seconds", () => {
    const run = recordBotRun(buildTrack(), STEP);
    assert.ok(run.finishTime > 30 && run.finishTime < 60, `clean run took ${run.finishTime}s`);
  });

  it("has solid ground at the start and finish lines", () => {
    const track = buildTrack();
    assert.ok(groundAt(track, track.startX));
    assert.ok(groundAt(track, track.finishX));
    assert.ok(track.endX - track.finishX >= 300, "no room to run past the finish");
  });
});

describe("forest dash: jumping and gliding", () => {
  it("clears a 140-unit pit with just a tap", () => {
    assert.ok(jumpPit(140, false));
  });

  it("needs a glide for a 300-unit pit, and a glide gets you over", () => {
    assert.equal(jumpPit(300, false), false);
    assert.ok(jumpPit(300, true));
  });

  it("still jumps if you press a moment after running off the edge", () => {
    const track = pitTrack(120);
    const r = createRacer(100);
    r.vx = RUN_SPEED;
    while (r.x < 402) stepRacer(r, track, NONE, STEP);
    assert.equal(r.grounded, false);
    stepRacer(r, track, PRESS, STEP);
    assert.ok(r.vy > JUMP_SPEED * 0.9, "a late press was refused");
  });

  it("puts you back on the ground after a fall, behind the pit", () => {
    const track = pitTrack(500);
    const r = createRacer(100);
    r.vx = RUN_SPEED;
    let steps = 0;
    while (r.respawnTimer <= 0 && steps < 1000) {
      stepRacer(r, track, NONE, STEP);
      steps += 1;
    }
    assert.ok(r.y < FALL_LIMIT + 1);
    for (let i = 0; i < Math.ceil(RESPAWN_SECONDS / STEP) + 1; i += 1) {
      stepRacer(r, track, NONE, STEP);
    }
    assert.equal(r.grounded, true);
    assert.ok(r.x < 400 && r.x > 200, `respawned at ${r.x}`);
  });
});

describe("forest dash: the computer racer's playback", () => {
  it("is slower at a lower pace, and keeps running past the end", () => {
    const run = recordBotRun(buildTrack(), STEP);
    const t = run.finishTime / 2;
    assert.ok(sampleRun(run, STEP, t, 0.9).x < sampleRun(run, STEP, t, 1).x);
    const past = sampleRun(run, STEP, run.finishTime + 2, 1);
    assert.ok(past.x > run.points[run.points.length - 1]!.x);
  });
});

/**
 * Pause semantics are the easiest thing in this project to break silently, and
 * the symptom on a real phone is brutal: you take a call, come back, and the
 * game has simulated a quarter-second of bullets into your face before you can
 * react. These tests pin the behaviour down with a fake clock.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { GameLoop, STEP } from "./loop.ts";

let now = 0;
let pendingFrame: ((t: number) => void) | null = null;

/** Advance the clock AND deliver an animation frame. */
function advance(ms: number): void {
  now += ms;
  const frame = pendingFrame;
  pendingFrame = null;
  frame?.(now);
}

/**
 * Advance the clock WITHOUT delivering frames -- exactly what happens when the
 * tab is backgrounded and the browser stops calling requestAnimationFrame.
 */
function jump(ms: number): void {
  now += ms;
}

beforeEach(() => {
  now = 0;
  pendingFrame = null;
  const g = globalThis as unknown as Record<string, unknown>;
  g.performance = { now: () => now };
  g.requestAnimationFrame = (fn: (t: number) => void): number => {
    pendingFrame = fn;
    return 1;
  };
  g.cancelAnimationFrame = (): void => {
    pendingFrame = null;
  };
});

describe("GameLoop", () => {
  it("advances the simulation in whole fixed steps", () => {
    let steps = 0;
    const loop = new GameLoop(() => (steps += 1), () => {});
    loop.start();

    // 100ms holds five whole 1/60s steps, not six: 6/60 is 0.1000000000000000055
    // in floating point, a hair more than the 0.1s available.
    advance(100);
    assert.equal(steps, 5);
  });

  it("runs no simulation while paused", () => {
    let steps = 0;
    const loop = new GameLoop(() => (steps += 1), () => {});
    loop.start();
    advance(100);
    const before = steps;

    loop.pause();
    advance(500);
    advance(500);

    assert.equal(steps, before, "simulation advanced while paused");
  });

  it("still renders while paused, so the overlay draws over a live frame", () => {
    let renders = 0;
    const loop = new GameLoop(() => {}, () => (renders += 1));
    loop.start();
    loop.pause();
    const before = renders;

    advance(50);

    assert.ok(renders > before, "rendering stopped while paused");
  });

  /**
   * The regression that matters. Without resetting `last` on resume, the first
   * frame back sees the entire backgrounded duration as one delta and burns
   * through MAX_STEPS of simulation instantly.
   */
  it("does not fast-forward after a long backgrounded pause", () => {
    let steps = 0;
    const loop = new GameLoop(() => (steps += 1), () => {});
    loop.start();
    advance(100);
    const before = steps;

    loop.pause();
    jump(3000); // three seconds with the tab hidden: no frames delivered
    loop.resume();
    advance(20); // one frame's worth of real time

    assert.equal(
      steps - before,
      1,
      "resume replayed backgrounded time instead of starting fresh",
    );
  });

  it("caps catch-up work so a slow frame cannot spiral", () => {
    let steps = 0;
    const loop = new GameLoop(() => (steps += 1), () => {});
    loop.start();

    advance(5000); // one absurdly long frame

    assert.ok(steps <= 5, `ran ${steps} steps in a single frame`);
  });

  it("exposes a sane fixed step", () => {
    assert.ok(Math.abs(STEP - 1 / 60) < 1e-9);
  });
});

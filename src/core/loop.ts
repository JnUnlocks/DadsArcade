/**
 * Fixed-timestep game loop.
 *
 * Simulation always advances in whole 1/60s steps so the game plays identically
 * on a 60Hz phone and a 120Hz one. Rendering still happens every animation
 * frame, interpolated by `alpha`.
 *
 * Pause is the subtle part. Two things must be true when we resume:
 *   1. No accumulated time is left over, and
 *   2. `last` is reset to *now*.
 * Miss either and the first frame back sees a multi-second delta and burns
 * through MAX_STEPS of simulation instantly -- you unpause and immediately die.
 */

export const STEP = 1 / 60;

/** Simulation steps we're willing to run in one frame before giving up and
 *  dropping time. Prevents a death spiral on a slow device. */
const MAX_STEPS = 5;

/** Any frame delta longer than this is treated as "we were backgrounded". */
const MAX_FRAME_DELTA = 0.25;

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private _running = false;
  private _paused = false;

  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  // Assigned explicitly rather than via parameter properties so this module
  // stays readable by Node's built-in TypeScript stripping, which the tests use.
  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update;
    this.render = render;
  }

  get running(): boolean {
    return this._running;
  }

  get paused(): boolean {
    return this._paused;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this._running = false;
    cancelAnimationFrame(this.raf);
  }

  pause(): void {
    if (this._paused) return;
    this._paused = true;
    this.acc = 0;
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.last = performance.now();
    this.acc = 0;
  }

  private frame = (now: number): void => {
    if (!this._running) return;
    this.raf = requestAnimationFrame(this.frame);

    let elapsed = (now - this.last) / 1000;
    this.last = now;
    if (elapsed > MAX_FRAME_DELTA) elapsed = MAX_FRAME_DELTA;

    if (!this._paused) {
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.update(STEP);
        this.acc -= STEP;
        steps += 1;
      }
      // Couldn't keep up -- discard the backlog rather than compounding it.
      if (steps === MAX_STEPS) this.acc = 0;
    }

    // Keep rendering while paused so the pause overlay draws over a live
    // (but frozen) game world.
    this.render(this._paused ? 1 : this.acc / STEP);
  };
}

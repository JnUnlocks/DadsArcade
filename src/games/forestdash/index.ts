/**
 * FOREST DASH -- a one-thumb race through a glowing mushroom forest.
 *
 * This is the first playable from the game plan: the fox, one hand-built
 * course, and one computer racer (Pip the squirrel) to beat. Runs aren't
 * ranked yet; the daily course, the rest of the cast and the family's ghosts
 * come next, and all of them build on what's here.
 *
 * The rules that make it work on a phone:
 *
 *   - You never steer. The fox runs on its own; the one button is jump, and
 *     holding it after the top of the jump is a glide. Anyone who can tap can
 *     play, and the skill is entirely in timing.
 *   - Nothing ends the race. A pit costs you a second or two and puts you
 *     back a few steps earlier; a log trips you and you lose speed. A bad run
 *     is slow, never over, so a child always gets to the finish line.
 *   - The other racer plays by your rules. Pip is a recording of a computer
 *     player running this exact course on this exact physics, played back a
 *     touch slower than it ran -- so he never does anything you can't, and a
 *     clean run beats him.
 */

import { STEP } from "../../core/loop.ts";
import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import {
  Camera,
  drawBanner,
  drawCourse,
  drawForestDashIcon,
  drawFox,
  drawRaceBar,
  drawSky,
  drawSquirrel,
  drawTag,
  PALETTE,
  WORLD_SCALE,
} from "./render.ts";
import {
  createRacer,
  paceFinishTime,
  poseOf,
  RACER_HALF_W,
  recordBotRun,
  sampleRun,
  stepRacer,
  type Racer,
  type RecordedRun,
} from "./rules.ts";
import { buildTrack, type Track } from "./track.ts";

/**
 * How fast Pip runs, as a fraction of a clean computer run.
 *
 * At 0.9 he finishes about four seconds behind a clean run, so a first-timer
 * who falls once or twice will usually lose to him and a second try usually
 * won't. The plan's easy, medium and fast racers are this number at three
 * settings.
 */
const RIVAL_PACE = 0.9;

/** Seconds for each beat of READY, 3, 2, 1. */
const COUNT_BEAT = 0.6;
/** How long the finish line celebration runs before the results screen. */
const FINISH_SECONDS = 2.2;

/** Where the fox stands on screen, in screen units from the left edge. */
const FOX_SCREEN_X = 80;

const ACORN_POINTS = 10;

type Phase = "countdown" | "racing" | "finished" | "over";

export class ForestDash implements GameInstance {
  private readonly host: GameHost;
  private readonly track: Track;
  private readonly rivalRun: RecordedRun;
  private readonly rivalTime: number;
  private readonly fox: Racer;
  private readonly cam = new Camera();
  private readonly particles = new Particles();
  private readonly taken = new Set<number>();

  private phase: Phase = "countdown";
  private countdown = COUNT_BEAT * 4;
  /** Seconds since the start gun. */
  private raceTime = 0;
  /** Seconds since the game opened, for animation. */
  private time = 0;
  private finishTime = 0;
  private finishTimer = 0;
  private wasHeld = false;
  private lastBeat = -1;
  /** A tip shown after a fall, and how much longer it stays up. */
  private hint = "";
  private hintTimer = 0;
  private falls = 0;

  // Assigned explicitly rather than via parameter properties, so Node's type
  // stripping can load this file in tests, as with the other games.
  constructor(host: GameHost) {
    this.host = host;
    this.track = buildTrack();
    this.rivalRun = recordBotRun(this.track, STEP);
    this.rivalTime = paceFinishTime(this.rivalRun, RIVAL_PACE);
    this.fox = createRacer(this.track.startX);
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.hintTimer > 0) this.hintTimer -= dt;

    // One button: a touch anywhere, Space, or Up. Up is the one key the
    // shell reports as a level, so it's the one that can be held to glide.
    const up = input.axisY < 0;
    const held = input.pointerDown || up;
    const pressed = input.justPressed || (up && !this.wasHeld);
    this.wasHeld = held;

    if (this.phase === "countdown") {
      this.countdown -= dt;
      const beat = Math.ceil(this.countdown / COUNT_BEAT);
      if (beat !== this.lastBeat && beat >= 1 && beat <= 3) this.host.sfx("uiMove");
      this.lastBeat = beat;
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.host.sfx("waveStart");
      }
      this.follow(dt);
      return;
    }

    if (this.phase === "over") return;

    this.raceTime += dt;
    const controls =
      this.phase === "racing" ? { pressed, held } : { pressed: false, held: false };
    for (const event of stepRacer(this.fox, this.track, controls, dt)) this.onEvent(event);
    this.collectAcorns();

    if (this.phase === "racing" && this.fox.x >= this.track.finishX) {
      this.finishTime = this.raceTime;
      this.phase = "finished";
      this.finishTimer = FINISH_SECONDS;
      this.host.sfx(this.won() ? "dashFinish" : "lockMiss");
      this.burst(this.track.finishX, 60, PALETTE.finish, 28, 120);
    }

    if (this.phase === "finished") {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.end();
    }

    this.follow(dt);
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { view, settings } = this.host;
    const reduced = settings.reducedMotion;
    const cam = this.cam;
    cam.floor = view.h * 0.76;

    drawSky(ctx, view.w, view.h, cam, this.time, reduced);
    drawCourse(ctx, this.track, cam, view.w, view.h, this.time, this.taken, reduced);

    const rival = this.rivalAt();
    const rx = cam.sx(rival.x);
    const ry = cam.sy(rival.y);
    drawSquirrel(ctx, rx, ry, rival.pose, this.time);
    if (rival.pose !== "gone" && rx > -20 && rx < view.w + 20) {
      drawTag(ctx, rx, ry - 34, "PIP", PALETTE.squirrel);
    }

    drawFox(ctx, cam.sx(this.fox.x), cam.sy(this.fox.y), poseOf(this.fox), this.fox.stride);

    ctx.save();
    ctx.translate(-cam.x * WORLD_SCALE, cam.floor + cam.y * WORLD_SCALE);
    this.particles.render(ctx);
    ctx.restore();

    const span = this.track.finishX - this.track.startX;
    drawRaceBar(
      ctx,
      view.w,
      view.insetTop + 58,
      formatTime(this.phase === "countdown" ? 0 : this.shownTime()),
      (this.fox.x - this.track.startX) / span,
      (rival.x - this.track.startX) / span,
    );

    const mid = view.insetTop + (cam.floor - view.insetTop) * 0.42;
    if (this.phase === "countdown") {
      const beat = Math.ceil(this.countdown / COUNT_BEAT);
      drawBanner(ctx, view.w, mid, beat >= 4 ? "READY" : String(beat), beat >= 4 ? 30 : 46);
      drawBanner(ctx, view.w, mid + 40, "TAP TO JUMP · HOLD TO GLIDE", 11);
    } else if (this.phase === "racing" && this.raceTime < 0.7) {
      drawBanner(ctx, view.w, mid, "GO!", 46);
    } else if (this.phase === "racing" && this.hintTimer > 0) {
      drawBanner(ctx, view.w, mid, this.hint, 12);
    } else if (this.phase === "finished") {
      drawBanner(ctx, view.w, mid, this.won() ? "YOU WIN!" : "PIP WINS!", 34);
      drawBanner(ctx, view.w, mid + 36, formatTime(this.finishTime), 18);
    }
  }

  hud(): HudState {
    return { lives: 0, progress: this.place(), progressLabel: "Place" };
  }

  // ----- Race -----

  private shownTime(): number {
    return this.phase === "racing" ? this.raceTime : this.finishTime;
  }

  private rivalAt() {
    if (this.phase === "countdown") return { x: this.track.startX, y: 0, pose: "run" as const };
    return sampleRun(this.rivalRun, STEP, this.raceTime, RIVAL_PACE);
  }

  private won(): boolean {
    return this.finishTime <= this.rivalTime;
  }

  /** 1 if you're ahead (or finished ahead), 2 if Pip is. */
  private place(): number {
    if (this.phase === "finished" || this.phase === "over") return this.won() ? 1 : 2;
    return this.fox.x >= this.rivalAt().x ? 1 : 2;
  }

  private end(): void {
    this.phase = "over";
    const place = this.place();
    this.host.gameOver({
      progress: place,
      progressLabel: "Place",
      headline: `${place === 1 ? "1ST" : "2ND"} PLACE · ${formatTime(this.finishTime)}`,
      ranked: false,
    });
  }

  private onEvent(event: string): void {
    const f = this.fox;
    switch (event) {
      case "jump":
        this.host.sfx("dashJump");
        break;
      case "bounce":
        this.host.sfx("dashBounce");
        this.burst(f.x, f.y, PALETTE.capPink, 12, 80);
        break;
      case "trip":
        this.host.sfx("dashTrip");
        this.host.shake(2);
        this.burst(f.x + RACER_HALF_W, f.y + 10, PALETTE.logRing, 8, 60);
        break;
      case "fall":
        this.host.sfx("frogSplat");
        this.falls += 1;
        this.hintAfterFall();
        break;
      case "respawn":
        this.burst(f.x, f.y + 10, PALETTE.glow, 14, 70);
        break;
    }
  }

  /**
   * A pit you keep falling into is the one place this game could stop being
   * "slow, never over", so after a fall it says what that pit wants.
   */
  private hintAfterFall(): void {
    const x = this.fox.x;
    const updraft = this.track.updrafts.some((u) => x > u.x0 - 400 && x < u.x1 + 300);
    if (updraft) this.hint = "HOLD IN THE GLOW TO FLOAT UP";
    else if (this.falls <= 2) this.hint = "HOLD AFTER A JUMP TO GLIDE";
    else return;
    this.hintTimer = 3.5;
  }

  private collectAcorns(): void {
    const f = this.fox;
    if (f.respawnTimer > 0) return;
    for (let i = 0; i < this.track.acorns.length; i += 1) {
      if (this.taken.has(i)) continue;
      const a = this.track.acorns[i]!;
      if (Math.abs(a.x - f.x) < RACER_HALF_W + 6 && Math.abs(a.y - (f.y + 14)) < 22) {
        this.taken.add(i);
        this.host.addScore(ACORN_POINTS);
        this.host.sfx("dashAcorn");
        this.burst(a.x, a.y, PALETTE.acorn, 6, 50);
      }
    }
  }

  /** Particles live in world space, so they stay put as the forest scrolls. */
  private burst(wx: number, wy: number, color: string, count: number, power: number): void {
    this.particles.burst(wx * WORLD_SCALE, -wy * WORLD_SCALE, color, count, power);
  }

  /**
   * Keep the fox at a fixed spot on screen, and only lift the view when he's
   * thrown higher than an ordinary jump -- a camera that bobs on every jump
   * makes the ground you're aiming for move too.
   */
  private follow(dt: number): void {
    this.cam.x = this.fox.x - FOX_SCREEN_X / WORLD_SCALE;
    const target = Math.max(0, this.fox.y - 140);
    this.cam.y += (target - this.cam.y) * Math.min(1, dt * 4);
  }
}

/** 42.37 seconds as "0:42.3". */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

export const forestDashModule: GameModule = {
  id: "forest-dash",
  title: "FOREST DASH",
  shortTitle: "FOREST",
  progressShort: "PL",
  blurb: "Race Pip the squirrel through the mushroom forest. Tap to jump, hold to glide.",
  accent: "#ff5a6e",

  drawIcon(ctx, size) {
    drawForestDashIcon(ctx, size);
  },

  create(host: GameHost): GameInstance {
    return new ForestDash(host);
  },
};

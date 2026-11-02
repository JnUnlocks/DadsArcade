/**
 * Overdrive, on screen. The rules are in drive.ts.
 *
 * The round starts on GO, after the 3-2-1 -- not on the first tap -- and the
 * reactor is the one place to tap. The score is added once, at the end: an
 * interrupted round (the phone locked, a call came in) starts again from the
 * 3-2-1 with nothing kept, because ten seconds with a hole in them isn't a
 * ten-second score.
 */

import type { GameHost, HudState } from "../../core/game.ts";
import { drawCity, FONT, label, RR } from "./art.ts";
import {
  average,
  DRIVE_MS,
  liveSpeed,
  MILESTONES,
  milestonesReached,
  newDrive,
  peakSpeed,
  press,
  type Drive,
} from "./drive.ts";
import { isAction, type Press } from "./presses.ts";

export const DRIVE_BOARD = "overdrive";

const COUNT_BEAT = 0.6;
const COUNT_BEATS = 3;
const END_SECONDS = 1.6;
/** Taps further than this from the reactor's centre miss it. */
const REACTOR_REACH = 135;
const ORANGE = "#ff7a4d";

type Phase = "count" | "play" | "end" | "done";

export class OverdriveGame {
  private readonly host: GameHost;
  private readonly onDone: () => void;
  private phase: Phase = "count";
  private timer = COUNT_BEAT * COUNT_BEATS;
  private drive: Drive | null = null;
  private pulse = 0;
  private time = 0;
  private interrupted = false;
  private popup: { text: string; age: number } | null = null;

  constructor(host: GameHost, onDone: () => void) {
    this.host = host;
    this.onDone = onDone;
  }

  private centre(): { x: number; y: number } {
    const { view } = this.host;
    return { x: view.w / 2, y: view.insetTop + (view.h - view.insetTop - view.insetBottom) * 0.46 };
  }

  private onReactor(p: Press): boolean {
    if (p.via === "key") return true;
    if (p.x === undefined || p.y === undefined) return false;
    const { view } = this.host;
    const c = this.centre();
    return Math.hypot(view.toWorldX(p.x) - c.x, view.toWorldY(p.y) - c.y) <= REACTOR_REACH;
  }

  update(dt: number, presses: readonly Press[]): void {
    this.time += dt;
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 6);
    if (this.popup) {
      this.popup.age += dt;
      if (this.popup.age > 0.9) this.popup = null;
    }

    if (this.phase === "count") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = "play";
        this.interrupted = false;
        this.drive = newDrive(performance.now());
      }
      return;
    }
    if (this.phase === "end") {
      this.timer -= dt;
      if (this.timer <= 0) this.finish();
      return;
    }
    if (this.phase !== "play" || !this.drive) return;

    const d = this.drive;
    const before = d.taps.length;
    for (const p of presses) {
      if (!isAction(p) || !this.onReactor(p)) continue;
      press(d, p);
    }
    const gained = d.taps.length - before;
    if (gained > 0) {
      this.pulse = 1;
      this.host.sfx("driveTap");
      if (milestonesReached(d.taps.length) > milestonesReached(before)) {
        this.host.sfx("driveMilestone");
        this.popup = { text: `${MILESTONES[milestonesReached(d.taps.length) - 1]}!`, age: 0 };
      }
    }
    // Presses are counted by their own time, so ones from the last moment of
    // the round that arrive with this frame were counted above.
    if (performance.now() >= d.deadline) {
      this.phase = "end";
      this.timer = END_SECONDS;
      this.host.sfx("roundClear");
      if (d.taps.length > 0) this.host.addScore(d.taps.length);
    }
  }

  private finish(): void {
    this.phase = "done";
    const d = this.drive;
    const taps = d?.taps.length ?? 0;
    const peak = d ? peakSpeed(d) : 0;
    this.host.gameOver({
      boardId: DRIVE_BOARD,
      progress: Math.max(1, peak),
      progressLabel: "Peak taps a second",
      ranked: taps > 0,
      headline: `${taps} TAPS · ${(d ? average(d) : 0).toFixed(1)} A SECOND`,
      changeLabel: "PICK ANOTHER GAME",
    });
    this.onDone();
  }

  // ----- Drawing -----

  render(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const d = this.drive;
    const taps = d?.taps.length ?? 0;
    const lit = milestonesReached(taps);
    drawCity(ctx, view.w, view.h, view.h - view.insetBottom - 20, 0);
    ctx.fillStyle = `rgba(12,6,30,${0.62 - lit * 0.08})`;
    ctx.fillRect(0, 0, view.w, view.h);
    this.drawLights(ctx, lit);

    const c = this.centre();
    this.drawReactor(ctx, c.x, c.y, taps);

    if (this.phase === "play" && d) {
      const left = Math.max(0, d.deadline - performance.now());
      this.drawTimer(ctx, left / DRIVE_MS, left);
      label(ctx, `${liveSpeed(d, performance.now())} TAPS/S NOW`, c.x, c.y + 150, 12, RR.ink, 800);
    }
    if (this.popup) {
      const k = this.popup.age / 0.9;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      label(ctx, this.popup.text, c.x, c.y - 120 - (this.host.settings.reducedMotion ? 0 : k * 16), 22, RR.yellow);
      ctx.restore();
    }
    if (this.phase === "count") this.drawCountdown(ctx);
    if (this.phase === "end" || this.phase === "done") this.drawSummary(ctx);
  }

  /** A row of five lights along the skyline, one per milestone reached. */
  private drawLights(ctx: CanvasRenderingContext2D, lit: number): void {
    const { view } = this.host;
    const y = view.h - view.insetBottom - 34;
    for (let i = 0; i < MILESTONES.length; i += 1) {
      const x = view.w / 2 + (i - 2) * 50;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = i < lit ? RR.yellow : "rgba(142,163,200,0.25)";
      ctx.fill();
      label(ctx, String(MILESTONES[i]), x, y + 18, 9, i < lit ? RR.yellow : RR.dim, 700);
    }
  }

  private drawReactor(ctx: CanvasRenderingContext2D, cx: number, cy: number, taps: number): void {
    const still = this.host.settings.reducedMotion;
    const r = 78 + (still ? 0 : this.pulse * 6);
    // Charge: a ring per hundred taps, the newest drawn on top.
    const laps = Math.floor(taps / 100);
    const part = (taps % 100) / 100;
    ctx.save();
    ctx.lineWidth = 12;
    ctx.strokeStyle = "rgba(142,163,200,0.18)";
    ctx.beginPath();
    ctx.arc(cx, cy, 110, 0, Math.PI * 2);
    ctx.stroke();
    if (laps > 0) {
      ctx.strokeStyle = ORANGE;
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = laps > 0 ? RR.yellow : RR.pink;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, 110, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (!still) {
      ctx.shadowColor = RR.pink;
      ctx.shadowBlur = 18 + this.pulse * 14;
    }
    const grad = ctx.createRadialGradient(cx, cy, 6, cx, cy, r);
    grad.addColorStop(0, "#fff3c4");
    grad.addColorStop(0.45, ORANGE);
    grad.addColorStop(1, RR.pinkDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = `900 44px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = RR.navy;
    ctx.fillText(String(taps), cx, cy - 4);
    ctx.font = `800 10px ${FONT}`;
    ctx.fillText("TAPS", cx, cy + 26);
    ctx.restore();
  }

  private drawTimer(ctx: CanvasRenderingContext2D, left: number, ms: number): void {
    const { view } = this.host;
    const y = view.insetTop + 78;
    const w = view.w - 60;
    ctx.fillStyle = "rgba(142,163,200,0.25)";
    ctx.fillRect(30, y, w, 6);
    ctx.fillStyle = left < 0.2 ? RR.pink : ORANGE;
    ctx.fillRect(30, y, w * left, 6);
    label(ctx, `${(ms / 1000).toFixed(1)}s`, view.w - 46, y - 12, 11, RR.ink, 800);
  }

  private drawCountdown(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const cx = view.w / 2;
    const y = view.insetTop + 92;
    const big = this.host.settings.largeText ? 1.15 : 1;
    ctx.fillStyle = "rgba(8,6,26,0.6)";
    ctx.fillRect(0, y - 26, view.w, 112);
    label(ctx, this.interrupted ? "INTERRUPTED: STARTING OVER" : "OVERDRIVE", cx, y, (this.interrupted ? 15 : 22) * big, ORANGE);
    label(ctx, "Tap the reactor to charge it.", cx, y + 28, 12 * big, RR.ink, 700);
    label(ctx, "How much power can you make in 10 seconds?", cx, y + 46, 11 * big, RR.ink, 700);
    label(ctx, "TAP  ·  OR SPACE  ·  ONE FINGER AT A TIME", cx, y + 68, 10 * big, RR.dim, 700);
    const c = this.centre();
    label(ctx, String(Math.max(1, Math.ceil(this.timer / COUNT_BEAT))), c.x, c.y - 140, 40, RR.yellow);
  }

  private drawSummary(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const d = this.drive;
    if (!d) return;
    const cx = view.w / 2;
    const y = view.insetTop + 100;
    ctx.save();
    ctx.fillStyle = "rgba(8,10,30,0.9)";
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 2;
    ctx.fillRect(36, y - 34, view.w - 72, 98);
    ctx.strokeRect(37, y - 33, view.w - 74, 96);
    ctx.restore();
    label(ctx, `${d.taps.length} TAPS`, cx, y, 26, RR.yellow);
    label(
      ctx,
      `${average(d).toFixed(1)} A SECOND   ·   PEAK ${peakSpeed(d)} IN ONE SECOND`,
      cx,
      y + 34,
      11,
      RR.ink,
      700,
    );
  }

  hud(): HudState {
    return { lives: 0, progress: this.drive ? peakSpeed(this.drive) : 0, progressLabel: "Peak/s" };
  }

  pausesWhenHidden(): boolean {
    return this.phase === "play" || this.phase === "count";
  }

  /** Interrupted mid-round: nothing is kept, and it starts again from the 3-2-1. */
  onPause(): void {
    if (this.phase !== "play" && this.phase !== "count") return;
    this.interrupted = this.phase === "play";
    this.phase = "count";
    this.timer = COUNT_BEAT * COUNT_BEATS;
    this.drive = null;
  }
}

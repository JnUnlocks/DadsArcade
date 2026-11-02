/**
 * Neon Skyline, on screen: the countdown, the camera, the pieces that fall,
 * and the sounds. The rules are in skyline.ts.
 */

import type { GameHost, HudState } from "../../core/game.ts";
import { drawBlock, drawCity, label, RR } from "./art.ts";
import type { Press } from "./presses.ts";
import {
  BLOCK_H,
  BONUS_EVERY,
  height,
  newSkyline,
  place,
  step,
  type Block,
  type Placement,
} from "./skyline.ts";

/** Seconds per beat of the 3-2-1, which also keeps the opening tap out. */
const COUNT_BEAT = 0.6;
const COUNT_BEATS = 3;
/** How long the missed block falls before the results. */
const FALL_SECONDS = 2.2;
/**
 * Presses closer together than this are one press: a block needs longer than
 * this to slide anywhere, so a second tap this soon is a bounced finger, and
 * placing a fresh block at the wall with it would end the run for nothing.
 */
const MIN_GAP_MS = 120;
/** The furthest back a press is rewound to (see skyline.place). */
const MAX_REWIND = 0.1;
/** Where the sliding block sits, below the HUD, once the tower is tall. */
const ROW_FROM_TOP = 150;

interface Piece {
  x: number;
  y: number;
  w: number;
  vy: number;
  vx: number;
  rot: number;
  spin: number;
  color: "cyan" | "pink";
  age: number;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  color: string;
  age: number;
}

type Phase = "count" | "play" | "fallen" | "done";

export class NeonSkylineGame {
  private readonly host: GameHost;
  private readonly onDone: () => void;
  private readonly s = newSkyline();
  private phase: Phase = "count";
  private timer = COUNT_BEAT * COUNT_BEATS;
  private camera = 0;
  private pieces: Piece[] = [];
  private popups: Popup[] = [];
  private lastPressAt = -Infinity;
  /** Glow on the block just placed PERFECT. */
  private shine = 0;
  private time = 0;

  constructor(host: GameHost, onDone: () => void) {
    this.host = host;
    this.onDone = onDone;
  }

  update(dt: number, presses: readonly Press[]): void {
    this.time += dt;
    if (this.shine > 0) this.shine = Math.max(0, this.shine - dt * 2.5);
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < 0.9);
    this.movePieces(dt);
    this.moveCamera(dt);

    if (this.phase === "count") {
      this.timer -= dt;
      if (this.timer <= 0) this.phase = "play";
      return;
    }
    if (this.phase === "fallen") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = "done";
        this.finish();
      }
      return;
    }
    if (this.phase !== "play") return;

    step(this.s, dt);
    const now = performance.now();
    for (const press of presses) {
      if (press.at - this.lastPressAt < MIN_GAP_MS) continue;
      this.lastPressAt = press.at;
      const ago = Math.min(MAX_REWIND, Math.max(0, (now - press.at) / 1000));
      const result = place(this.s, ago);
      if (result) this.landed(result);
      if (this.s.over) break;
    }
  }

  private landed(result: Placement): void {
    const row = height(this.s);
    if (result.kind === "miss") {
      this.host.sfx("stackMiss");
      this.host.shake(3);
      this.host.buzz([40, 40, 80]);
      this.dropPiece(result.fell, height(this.s) + 1, 0.6);
      this.phase = "fallen";
      this.timer = FALL_SECONDS;
      return;
    }

    this.host.addScore(result.points);
    const mid = result.placed.x + result.placed.w / 2;
    const y = this.rowY(row);
    if (result.kind === "cut") {
      this.host.sfx("stackPlace");
      this.dropPiece(result.cut, row, result.cut.x < result.placed.x ? -1 : 1);
      return;
    }

    this.host.sfx("stackPerfect");
    this.shine = 1;
    this.popup(result.streak > 1 ? `PERFECT ×${result.streak}` : "PERFECT!", mid, y - 14, RR.yellow);
    if (result.bonus) {
      this.host.sfx("stackBonus");
      this.host.buzz(20);
      this.popup("+ WIDTH BACK!", mid, y - 32, RR.cyan);
    }
  }

  /** A piece cut off (or the whole missed block) falling away. */
  private dropPiece(b: Block, row: number, push: number): void {
    if (this.host.settings.reducedMotion || b.w <= 0) return;
    this.pieces.push({
      x: b.x,
      y: this.worldRowTop(row),
      w: b.w,
      vy: -40,
      vx: push * 40,
      rot: 0,
      spin: push * (1.5 + Math.random()),
      color: row % 2 === 0 ? "cyan" : "pink",
      age: 0,
    });
  }

  private movePieces(dt: number): void {
    for (const p of this.pieces) {
      p.age += dt;
      p.vy += 700 * dt;
      p.y -= p.vy * dt; // world y counts up, so falling is downward on screen
      p.x += p.vx * dt;
      p.rot += p.spin * dt;
    }
    this.pieces = this.pieces.filter((p) => p.age < 2);
  }

  /**
   * Follow the tower up. With reduced motion the camera steps instead of
   * gliding -- the same view, without the drift.
   */
  private moveCamera(dt: number): void {
    const { view } = this.host;
    const ground = this.groundY();
    const topOfRow = (height(this.s) + 2) * BLOCK_H;
    const target = Math.max(0, topOfRow - (ground - (view.insetTop + ROW_FROM_TOP)));
    if (this.host.settings.reducedMotion) this.camera = target;
    else this.camera += (target - this.camera) * Math.min(1, dt * 6);
  }

  private popup(text: string, x: number, y: number, color: string): void {
    this.popups.push({ text, x: Math.max(70, Math.min(290, x)), y, color, age: 0 });
  }

  private finish(): void {
    const floors = height(this.s);
    this.host.gameOver({
      progress: Math.max(1, floors),
      progressLabel: "Floor",
      ranked: floors > 0,
      headline: floors > 0 ? `${floors} FLOOR${floors === 1 ? "" : "S"} HIGH` : "NOT A FLOOR YET",
      changeLabel: "PICK ANOTHER GAME",
    });
    this.onDone();
  }

  // ----- Drawing -----

  private groundY(): number {
    const { view } = this.host;
    return view.h - view.insetBottom - 70;
  }

  /** Height of a row's top above the ground, in world units. */
  private worldRowTop(row: number): number {
    return (row + 1) * BLOCK_H;
  }

  /** Screen y of a row's top edge. Row 0 is the foundation. */
  private rowY(row: number): number {
    return this.groundY() - this.worldRowTop(row) + this.camera;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const ground = this.groundY();
    drawCity(ctx, view.w, view.h, ground + this.camera, this.camera);

    // The street the tower stands on.
    const street = ground + this.camera;
    if (street < view.h) {
      ctx.fillStyle = "#07071a";
      ctx.fillRect(0, street, view.w, view.h - street);
      ctx.fillStyle = RR.pink;
      ctx.fillRect(0, street, view.w, 2);
      ctx.fillStyle = "rgba(255,79,184,0.18)";
      ctx.fillRect(0, street + 2, view.w, 6);
    }

    const tower = this.s.tower;
    const top = tower.length - 1;
    for (let row = 0; row <= top; row += 1) {
      const y = this.rowY(row);
      if (y > view.h || y + BLOCK_H < 0) continue;
      const b = tower[row]!;
      drawBlock(ctx, b.x, y, b.w, BLOCK_H, row % 2 === 0 ? "cyan" : "pink");
    }
    if (this.shine > 0 && top > 0) {
      const b = tower[top]!;
      ctx.save();
      ctx.globalAlpha = this.shine;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, this.rowY(top) + 1, b.w - 2, BLOCK_H - 2);
      ctx.restore();
    }

    if (this.phase === "play" || this.phase === "count") {
      const m = this.s.mover;
      const row = tower.length;
      drawBlock(ctx, m.x, this.rowY(row), m.w, BLOCK_H, row % 2 === 0 ? "cyan" : "pink", 0.8);
    }

    for (const p of this.pieces) {
      const y = ground - p.y + this.camera;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.age / 2);
      ctx.translate(p.x + p.w / 2, y + BLOCK_H / 2);
      ctx.rotate(p.rot);
      drawBlock(ctx, -p.w / 2, -BLOCK_H / 2, p.w, BLOCK_H, p.color);
      ctx.restore();
    }

    for (const p of this.popups) {
      const k = p.age / 0.9;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      label(ctx, p.text, p.x, p.y - (this.host.settings.reducedMotion ? 0 : k * 16), 13, p.color);
      ctx.restore();
    }

    this.drawStreak(ctx);
    if (this.phase === "count") this.drawCountdown(ctx);
    if (this.phase === "fallen" || this.phase === "done") this.drawSummary(ctx);
  }

  /** Progress toward the next width bonus: one pip per PERFECT in a row. */
  private drawStreak(ctx: CanvasRenderingContext2D): void {
    if (this.phase !== "play" || this.s.streak === 0) return;
    const { view } = this.host;
    const y = view.insetTop + 76;
    const filled = this.s.streak % BONUS_EVERY || BONUS_EVERY;
    label(ctx, "PERFECT STREAK", view.w / 2, y, 9, RR.dim, 800);
    for (let i = 0; i < BONUS_EVERY; i += 1) {
      const x = view.w / 2 + (i - 1) * 16;
      ctx.beginPath();
      ctx.arc(x, y + 14, 5, 0, Math.PI * 2);
      ctx.fillStyle = i < filled ? RR.yellow : "rgba(142,163,200,0.25)";
      ctx.fill();
    }
  }

  private drawCountdown(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const cx = view.w / 2;
    const y = view.insetTop + 120;
    const big = this.host.settings.largeText ? 1.15 : 1;
    label(ctx, "NEON SKYLINE", cx, y, 22 * big, RR.cyan);
    label(ctx, "Tap when the moving block lines up.", cx, y + 30, 12 * big, RR.ink, 700);
    label(ctx, "Build as high as you can!", cx, y + 48, 12 * big, RR.ink, 700);
    label(ctx, "TAP  ·  SPACE  ·  ENTER", cx, y + 72, 10 * big, RR.dim, 700);
    const beat = Math.ceil(this.timer / COUNT_BEAT);
    label(ctx, String(Math.max(1, beat)), cx, y + 120, 48, RR.yellow);
  }

  private drawSummary(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const cx = view.w / 2;
    const y = view.insetTop + 130;
    ctx.save();
    ctx.fillStyle = "rgba(8,10,30,0.88)";
    ctx.strokeStyle = RR.cyan;
    ctx.lineWidth = 2;
    ctx.fillRect(40, y - 34, view.w - 80, 108);
    ctx.strokeRect(41, y - 33, view.w - 82, 106);
    ctx.restore();
    const floors = height(this.s);
    label(ctx, floors > 0 ? `${floors} FLOOR${floors === 1 ? "" : "S"}` : "MISSED!", cx, y, 26, RR.yellow);
    label(ctx, `PERFECT ${this.s.perfects}   ·   BEST STREAK ${this.s.bestStreak}`, cx, y + 34, 11, RR.ink, 700);
    label(ctx, `SCORE ${this.s.score}`, cx, y + 56, 11, RR.dim, 700);
  }

  hud(): HudState {
    return { lives: 0, progress: height(this.s), progressLabel: "Floor" };
  }

  /** Only a run in progress needs protecting from a background pause. */
  pausesWhenHidden(): boolean {
    return this.phase === "play" || this.phase === "count";
  }
}

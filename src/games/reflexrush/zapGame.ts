/**
 * Zap Dash, on screen. The rules are in zap.ts.
 *
 * Taps are judged against the grid as it stood when the frame began, before
 * time moves on, so an orb tapped in its last frame counts. A tap outside the
 * grid isn't on a cell at all and isn't counted. Orbs are cyan circles with a
 * bolt; hazards are pink squares with a cross -- different colour AND shape.
 */

import type { GameHost, HudState } from "../../core/game.ts";
import { drawCity, FONT, label, RR } from "./art.ts";
import { GRID_KEYS, type Press } from "./presses.ts";
import {
  accuracy,
  advance,
  CELLS,
  newZap,
  ROUND_SECONDS,
  tap,
  type Tap,
} from "./zap.ts";

export const ZAP_BOARD = "zap-dash";

const COUNT_BEAT = 0.6;
const COUNT_BEATS = 3;
const END_SECONDS = 1.4;
const GAP = 10;
const KEY_LABELS = ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"];
const VIOLET = "#a77bff";

interface Pop {
  text: string;
  cell: number;
  color: string;
  age: number;
}

type Phase = "count" | "play" | "end" | "done";

export class ZapDashGame {
  private readonly host: GameHost;
  private readonly onDone: () => void;
  private readonly z = newZap((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  private phase: Phase = "count";
  private timer = COUNT_BEAT * COUNT_BEATS;
  private pops: Pop[] = [];
  /** Brief flash on a cell after a tap: which cell, how it went, how long left. */
  private flash: { cell: number; good: boolean; left: number } | null = null;
  private time = 0;
  private usedKeys = false;

  constructor(host: GameHost, onDone: () => void) {
    this.host = host;
    this.onDone = onDone;
  }

  // ----- Layout -----

  private grid(): { x: number; y: number; size: number } {
    const { view } = this.host;
    const top = view.insetTop + 120;
    const bottom = view.h - view.insetBottom - 60;
    const size = Math.min((view.w - 32 - GAP * 2) / 3, (bottom - top - GAP * 2) / 3);
    const span = size * 3 + GAP * 2;
    return { x: (view.w - span) / 2, y: top + (bottom - top - span) / 2, size };
  }

  private cellRect(cell: number): { x: number; y: number; s: number } {
    const g = this.grid();
    return {
      x: g.x + (cell % 3) * (g.size + GAP),
      y: g.y + Math.floor(cell / 3) * (g.size + GAP),
      s: g.size,
    };
  }

  /** Which cell a client-space point is on, or -1 between or outside them. */
  private cellAt(clientX: number, clientY: number): number {
    const { view } = this.host;
    const x = view.toWorldX(clientX);
    const y = view.toWorldY(clientY);
    for (let c = 0; c < CELLS; c += 1) {
      const r = this.cellRect(c);
      if (x >= r.x && x <= r.x + r.s && y >= r.y && y <= r.y + r.s) return c;
    }
    return -1;
  }

  // ----- Loop -----

  update(dt: number, presses: readonly Press[]): void {
    this.time += dt;
    for (const p of this.pops) p.age += dt;
    this.pops = this.pops.filter((p) => p.age < 0.7);
    if (this.flash) {
      this.flash.left -= dt;
      if (this.flash.left <= 0) this.flash = null;
    }

    if (this.phase === "count") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = "play";
        advance(this.z, 0); // the first orb, right away
      }
      return;
    }
    if (this.phase === "end") {
      this.timer -= dt;
      if (this.timer <= 0) this.finish();
      return;
    }
    if (this.phase !== "play") return;

    // Judge taps against the grid as it was at the start of this frame.
    for (const p of presses) {
      let cell = -1;
      if (p.via === "pointer" && p.x !== undefined && p.y !== undefined) cell = this.cellAt(p.x, p.y);
      else if (p.code !== undefined && p.code in GRID_KEYS) {
        cell = GRID_KEYS[p.code]!;
        this.usedKeys = true;
      }
      if (cell < 0) continue;
      const result = tap(this.z, cell);
      if (result) this.react(result);
    }

    const { faded } = advance(this.z, dt);
    if (faded) this.host.sfx("zapFade");
    if (this.z.over) {
      this.phase = "end";
      this.timer = END_SECONDS;
      this.host.sfx("roundClear");
    }
  }

  private react(r: Tap): void {
    if (r.kind === "hit") {
      this.host.addScore(r.points);
      this.host.sfx("zapHit");
      this.pops.push({ text: `+${r.points}`, cell: r.cell, color: RR.cyan, age: 0 });
      this.flash = { cell: r.cell, good: true, left: 0.18 };
      return;
    }
    // A miss takes points back off the shell's running score too.
    if (r.points < 0) this.host.addScore(r.points);
    this.host.sfx("zapBad");
    if (r.kind === "hazard") {
      this.host.buzz(50);
      this.host.shake(2);
    }
    this.pops.push({
      text: r.points < 0 ? String(r.points) : "MISS",
      cell: r.cell,
      color: RR.pink,
      age: 0,
    });
    this.flash = { cell: r.cell, good: false, left: 0.22 };
  }

  private finish(): void {
    this.phase = "done";
    const acc = accuracy(this.z);
    this.host.gameOver({
      boardId: ZAP_BOARD,
      progress: Math.max(1, acc),
      progressLabel: "Accuracy %",
      ranked: this.z.hits > 0,
      headline: `${this.z.hits} ZAPPED · ${acc}%`,
      changeLabel: "PICK ANOTHER GAME",
    });
    this.onDone();
  }

  // ----- Drawing -----

  render(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    drawCity(ctx, view.w, view.h, view.h - view.insetBottom - 20, 0);
    ctx.fillStyle = "rgba(20,8,48,0.7)";
    ctx.fillRect(0, 0, view.w, view.h);

    this.drawTimer(ctx);
    for (let c = 0; c < CELLS; c += 1) this.drawCell(ctx, c);
    for (const p of this.pops) {
      const r = this.cellRect(p.cell);
      const k = p.age / 0.7;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      const rise = this.host.settings.reducedMotion ? 0 : k * 18;
      label(ctx, p.text, r.x + r.s / 2, r.y + 14 - rise, 15, p.color);
      ctx.restore();
    }
    if (this.phase === "play" && this.z.combo >= 2) {
      label(ctx, `COMBO ×${this.z.combo}`, view.w / 2, this.grid().y + this.grid().size * 3 + GAP * 2 + 22, 13, RR.yellow);
    }
    if (this.phase === "count") this.drawCountdown(ctx);
    if (this.phase === "end" || this.phase === "done") this.drawSummary(ctx);
  }

  private drawCell(ctx: CanvasRenderingContext2D, cell: number): void {
    const r = this.cellRect(cell);
    ctx.save();
    roundRect(ctx, r.x, r.y, r.s, r.s, 14);
    ctx.fillStyle = "rgba(60,24,120,0.75)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(167,123,255,0.65)";
    ctx.stroke();
    if (this.flash && this.flash.cell === cell) {
      ctx.globalAlpha = Math.min(1, this.flash.left * 5);
      ctx.fillStyle = this.flash.good ? "rgba(46,230,255,0.35)" : "rgba(255,79,184,0.35)";
      ctx.fill();
    }
    ctx.restore();

    const cx = r.x + r.s / 2;
    const cy = r.y + r.s / 2;
    const z = this.z;
    if (this.phase === "play" && z.orb && z.orb.cell === cell) this.drawOrb(ctx, cx, cy, r.s, z.orb.born, z.orb.until);
    if (this.phase === "play" && z.hazard && z.hazard.cell === cell) this.drawHazard(ctx, cx, cy, r.s);

    // The key for this cell, small in the corner: always there, so a
    // keyboard player can learn the layout, and brighter once keys are in use.
    ctx.save();
    ctx.font = `700 ${Math.round(r.s * 0.13)}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = this.usedKeys ? "rgba(238,243,255,0.8)" : "rgba(238,243,255,0.35)";
    ctx.fillText(KEY_LABELS[cell]!, r.x + 8, r.y + 7);
    ctx.restore();
  }

  /** A cyan orb with a bolt, and a ring that runs down as it fades. */
  private drawOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, born: number, until: number): void {
    const left = Math.max(0, Math.min(1, (until - this.z.t) / (until - born)));
    const r = s * 0.3;
    ctx.save();
    if (!this.host.settings.reducedMotion) {
      ctx.shadowColor = RR.cyan;
      ctx.shadowBlur = 14;
    }
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    grad.addColorStop(0, "#c8fbff");
    grad.addColorStop(1, RR.cyan);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = RR.cyan;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
    // The bolt.
    ctx.fillStyle = RR.navy;
    ctx.beginPath();
    const b = r * 0.55;
    ctx.moveTo(cx + b * 0.15, cy - b);
    ctx.lineTo(cx - b * 0.55, cy + b * 0.12);
    ctx.lineTo(cx - b * 0.02, cy + b * 0.12);
    ctx.lineTo(cx - b * 0.2, cy + b);
    ctx.lineTo(cx + b * 0.55, cy - b * 0.15);
    ctx.lineTo(cx + b * 0.02, cy - b * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A pink square with a cross: a different shape from the orb, not just a colour. */
  private drawHazard(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
    const h = s * 0.27;
    ctx.save();
    roundRect(ctx, cx - h, cy - h, h * 2, h * 2, 8);
    ctx.fillStyle = "#3a0f33";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = RR.pink;
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.55, cy - h * 0.55);
    ctx.lineTo(cx + h * 0.55, cy + h * 0.55);
    ctx.moveTo(cx + h * 0.55, cy - h * 0.55);
    ctx.lineTo(cx - h * 0.55, cy + h * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  /** Time left, as a bar across the top of the grid. */
  private drawTimer(ctx: CanvasRenderingContext2D): void {
    const g = this.grid();
    const w = g.size * 3 + GAP * 2;
    const y = g.y - 22;
    const left = this.phase === "count" ? 1 : Math.max(0, 1 - this.z.t / ROUND_SECONDS);
    ctx.fillStyle = "rgba(142,163,200,0.25)";
    ctx.fillRect(g.x, y, w, 6);
    ctx.fillStyle = left < 0.2 ? RR.pink : VIOLET;
    ctx.fillRect(g.x, y, w * left, 6);
    const secs = this.phase === "count" ? ROUND_SECONDS : Math.max(0, Math.ceil(ROUND_SECONDS - this.z.t));
    label(ctx, `${secs}s`, g.x + w - 14, y - 12, 11, RR.ink, 800);
  }

  private drawCountdown(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const cx = view.w / 2;
    const g = this.grid();
    ctx.fillStyle = "rgba(8,6,26,0.78)";
    ctx.fillRect(0, g.y - 30, view.w, g.size * 3 + GAP * 2 + 40);
    const y = g.y + 20;
    const big = this.host.settings.largeText ? 1.15 : 1;
    label(ctx, "ZAP DASH", cx, y, 22 * big, VIOLET);
    label(ctx, "Tap the energy orbs.", cx, y + 30, 12 * big, RR.ink, 700);
    label(ctx, "Avoid the hazards!", cx, y + 48, 12 * big, RR.ink, 700);
    label(ctx, "TAP  ·  OR  Q W E / A S D / Z X C", cx, y + 72, 10 * big, RR.dim, 700);
    label(ctx, String(Math.max(1, Math.ceil(this.timer / COUNT_BEAT))), cx, y + 124, 48, RR.yellow);
  }

  private drawSummary(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    const cx = view.w / 2;
    const y = this.grid().y + 40;
    ctx.save();
    ctx.fillStyle = "rgba(8,10,30,0.9)";
    ctx.strokeStyle = VIOLET;
    ctx.lineWidth = 2;
    ctx.fillRect(36, y - 34, view.w - 72, 128);
    ctx.strokeRect(37, y - 33, view.w - 74, 126);
    ctx.restore();
    const z = this.z;
    label(ctx, "TIME!", cx, y, 26, RR.yellow);
    label(ctx, `ZAPPED ${z.hits}   ·   ACCURACY ${accuracy(z)}%`, cx, y + 32, 11, RR.ink, 700);
    label(ctx, `FADED ${z.missed}   ·   HAZARDS ${z.hazardHits}   ·   BEST COMBO ${z.bestCombo}`, cx, y + 54, 10, RR.dim, 700);
    label(ctx, `SCORE ${z.score}`, cx, y + 78, 12, RR.cyan, 800);
  }

  hud(): HudState {
    const left = this.phase === "play" ? Math.max(0, Math.ceil(ROUND_SECONDS - this.z.t)) : ROUND_SECONDS;
    return { lives: 0, progress: left, progressLabel: "Seconds" };
  }

  pausesWhenHidden(): boolean {
    return this.phase === "play" || this.phase === "count";
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

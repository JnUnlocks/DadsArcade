/**
 * Dad's Prize Drop.
 *
 * Slide to aim, let go to drop a toy into the cabinet. Two the same become
 * the next prize up the ladder, and the run ends when the pile won't stay
 * under the line. One thumb, no timer, and nothing to read first.
 *
 * The rules are in rules.ts and the tank in physics.ts, both without a
 * screen. This file is the hands and the fireworks: where the finger is,
 * what a merge looks and sounds like, and the card that ends the run.
 */

import type { GameHost, GameInstance, GameModule, HudState, StartOptions } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { loadBests } from "../../core/storage.ts";
import type { SoundName } from "../../core/audio.ts";
import {
  DANGER_Y,
  DROP_COOLDOWN,
  OVERFLOW_LIMIT,
  prize,
  RELEASE_Y,
  TANK_H,
  TANK_W,
  TOP_TIER,
} from "./prizes.ts";
import {
  drawLadder,
  drawMarquee,
  drawPrize,
  drawPrizeDropIcon,
  drawTank,
  drawTankRim,
  FONT,
  layoutFor,
  roundRect,
  type Layout,
} from "./render.ts";
import { canDrop, clampAim, createRun, drop, restHeight, stepRun, type Run } from "./rules.ts";

const GAME_ID = "prize-drop";
const SEEN_KEY = "hyperdrive.prizedrop.seenHowTo";

/** Tank units a second the aim moves under the arrow keys. */
const KEY_AIM_SPEED = 250;
/** A release this close to the end of the wait still counts, a moment later. */
const EARLY_RELEASE = 0.2;
/** A beat to see the full cabinet before the card covers it. */
const END_PAUSE = 1.3;
/** Seconds between two knocking sounds, however busy the tank is. */
const KNOCK_GAP = 0.09;
/** Drops before the words under the line fade away. */
const HINT_DROPS = 3;

const HOW_TO_PLAY = [
  "Slide to aim. Lift your finger to drop.",
  "Two matching toys become a bigger prize.",
  "Keep the pile below the glowing line.",
  "Can you make the Grand Prize Bot?",
] as const;

interface Ring {
  x: number;
  y: number;
  from: number;
  to: number;
  life: number;
  span: number;
  color: string;
}

interface Float {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}

type Phase = "howto" | "play" | "ending";

class PrizeDrop implements GameInstance {
  private readonly host: GameHost;
  private readonly run: Run;
  private readonly particles = new Particles();
  private rings: Ring[] = [];
  private floats: Float[] = [];

  private phase: Phase;
  private clock = 0;
  private endTimer = 0;

  private aimX = TANK_W / 2;
  /** The finger that is aiming, if one is down. */
  private aimPointer: number | null = null;
  /** A finger came up and its prize hasn't been dropped yet. */
  private releasePending = false;
  private enterPressed = false;
  /** The how-to card was touched, and goes when that touch ends. */
  private cardPressed = false;

  private knockWait = 0;
  private banner = "";
  private bannerTimer = 0;
  private warned = false;
  private readonly best: number;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    // A fresh run of prizes each time. The seed never touches the effects.
    this.run = createRun((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.best = loadBests()[GAME_ID] ?? 0;
    this.phase = start?.again || hasSeenHowTo() ? "play" : "howto";

    const canvas = host.view.canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("keydown", this.onKeyDown);
  }

  destroy(): void {
    const canvas = this.host.view.canvas;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  /** Pausing lets go of the aim without dropping anything. */
  onPause(): void {
    this.forgetInput();
  }

  onResume(): void {
    this.forgetInput();
  }

  pausesWhenHidden(): boolean {
    return this.phase === "play";
  }

  hud(): HudState {
    return {
      lives: 0,
      progress: Math.max(this.best, this.host.score),
      progressLabel: "Best",
      rollScore: true,
    };
  }

  // ----- Input -----

  private forgetInput(): void {
    this.aimPointer = null;
    this.releasePending = false;
    this.enterPressed = false;
    this.cardPressed = false;
  }

  private layout(): Layout {
    const { w, h, insetTop, insetBottom } = this.host.view;
    return layoutFor(w, h, insetTop, insetBottom);
  }

  /** A touch on the screen, as a place in the tank. */
  private toTank(event: PointerEvent): { x: number; y: number } {
    const layout = this.layout();
    const view = this.host.view;
    return {
      x: (view.toWorldX(event.clientX) - layout.x0) / layout.scale,
      y: (view.toWorldY(event.clientY) - layout.y0) / layout.scale,
    };
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.phase === "howto") {
      this.cardPressed = true;
      return;
    }
    // One finger aims. A second one is ignored, not a second drop.
    if (this.phase !== "play" || this.aimPointer !== null) return;
    const at = this.toTank(event);
    // The aim has to start on the cabinet or under it, where a thumb rests.
    // A touch up by the score, or one brushing the edge of the screen, isn't
    // a drop.
    if (at.x < -10 || at.x > TANK_W + 10 || at.y < -40) return;
    this.aimPointer = event.pointerId;
    this.releasePending = false;
    this.aimX = clampAim(this.run, at.x);
  };

  private onPointerMove = (event: PointerEvent): void => {
    // A mouse aims just by moving: there is no finger to put down first.
    const hovering =
      event.pointerType === "mouse" && this.aimPointer === null && this.phase === "play";
    if (event.pointerId !== this.aimPointer && !hovering) return;
    this.aimX = clampAim(this.run, this.toTank(event).x);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.phase === "howto") {
      if (this.cardPressed) this.closeHowTo();
      return;
    }
    if (event.pointerId !== this.aimPointer) return;
    this.aimPointer = null;
    this.aimX = clampAim(this.run, this.toTank(event).x);
    // Let go a touch early and it still drops, as soon as it can. Any earlier
    // and it is a stray tap: the prize isn't in hand yet.
    if (this.run.cooldown <= EARLY_RELEASE) this.releasePending = true;
  };

  /** The phone took the touch away. That is never a drop. */
  private onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.aimPointer) this.aimPointer = null;
    this.cardPressed = false;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Enter" || event.repeat) return;
    // Enter on a focused button belongs to the button.
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea")) return;
    this.enterPressed = true;
  };

  private closeHowTo(): void {
    this.phase = "play";
    this.forgetInput();
    markHowToSeen();
    this.host.sfx("uiSelect");
  }

  // ----- Update -----

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    const wantsDrop = input.firePressed || this.enterPressed;
    this.enterPressed = false;

    if (this.phase === "howto") {
      if (wantsDrop) this.closeHowTo();
      return;
    }

    this.particles.update(dt);
    this.updateEffects(dt);

    if (this.phase === "ending") {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish();
      return;
    }

    const run = this.run;
    if (input.axisX !== 0) {
      this.aimX = clampAim(run, this.aimX + input.axisX * KEY_AIM_SPEED * dt);
    }
    if (wantsDrop) this.releasePending = true;
    if (this.releasePending && canDrop(run)) {
      this.releasePending = false;
      this.letGo();
    }

    // Two steps of the tank to one of the arcade's: the physics is tuned at
    // 120 a second. The loop above this has already dealt with hidden time
    // and long frames, so there is no second clock to keep here.
    for (let i = 0; i < 2; i += 1) {
      const report = stepRun(run, dt / 2);
      for (const merge of report.merges) this.onMerge(merge.tier, merge.x, merge.y);
      if (report.impact > 0 && this.knockWait <= 0) {
        this.knockWait = KNOCK_GAP;
        this.host.sfx("dropKnock");
      }
    }
    this.knockWait -= dt;

    if (run.danger > 0 && !this.warned) {
      this.warned = true;
      this.host.sfx("dropWarn");
    } else if (run.danger === 0) {
      this.warned = false;
    }

    if (run.over) {
      this.phase = "ending";
      this.endTimer = END_PAUSE;
      this.forgetInput();
      this.host.sfx("dropFull");
      this.host.buzz([60, 60, 120]);
    }
  }

  private letGo(): void {
    const body = drop(this.run, this.aimX);
    if (!body) return;
    // The next prize may be wider than the last, and has to fit at the wall.
    this.aimX = clampAim(this.run, this.aimX);
    this.host.sfx("dropLetGo");
  }

  private onMerge(tier: number, x: number, y: number): void {
    const made = prize(tier);
    const host = this.host;
    host.addScore(made.points);

    const calm = host.settings.reducedMotion;
    this.rings.push({
      x,
      y,
      from: made.radius * 0.6,
      to: made.radius * 1.7,
      life: 0.4,
      span: 0.4,
      color: made.color,
    });
    if (!calm) this.particles.burst(x, y, made.color, 8 + tier * 2, 70 + tier * 18);
    this.floats.push({
      x,
      y: y - made.radius * 0.4,
      text: `+${made.points}`,
      life: 0.9,
      color: "#ffffff",
      size: 13 + tier * 1.4,
    });

    if (tier >= TOP_TIER) {
      host.sfx("dropGrand");
      host.buzz([70, 50, 70, 50, 160]);
      host.shake(7);
      this.say("GRAND PRIZE BOT!", 1.2);
      if (!calm) {
        for (const color of ["#FFD166", "#45DDF4", "#F77CB8", "#B4E86C"]) {
          this.particles.burst(x, y, color, 18, 260);
        }
      }
      return;
    }
    host.sfx(`dropMerge${Math.min(9, tier)}` as SoundName);
    if (tier >= 5) {
      host.buzz(tier >= 8 ? [40, 40, 60] : 25);
      host.shake(tier - 3);
    }
    // The first time a big one turns up this run, say what it is.
    if (tier >= 6 && tier === this.run.bestTier && this.count(tier) === 1) {
      this.say(`${made.name.toUpperCase()}!`, 1.1);
    }
  }

  private count(tier: number): number {
    return this.run.world.bodies.filter((b) => b.tier === tier).length;
  }

  private say(text: string, seconds: number): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  private updateEffects(dt: number): void {
    for (const ring of this.rings) ring.life -= dt;
    this.rings = this.rings.filter((ring) => ring.life > 0);
    for (const float of this.floats) {
      float.life -= dt;
      float.y -= 34 * dt;
    }
    this.floats = this.floats.filter((float) => float.life > 0);
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
  }

  private finish(): void {
    const run = this.run;
    this.host.gameOver({
      progress: run.bestTier,
      progressLabel: `Best prize: ${prize(run.bestTier).name}, number`,
      headline: "CABINET FULL!",
      // Time in the tank, not time spent reading the card.
      durationMs: run.time * 1000,
    });
  }

  // ----- Render -----

  render(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const layout = this.layout();
    const run = this.run;
    const calm = settings.reducedMotion;
    const contrast = settings.highContrast;
    const danger = this.phase === "play" ? run.danger : this.phase === "ending" ? 1 : 0;

    // The sign leaves the top of the gap to the prizes: a pile that is over
    // the line stands up out of the tank, and has to be seen doing it.
    drawMarquee(ctx, view.w, layout.spareY, layout.spareH - 50 * layout.scale, this.clock, calm);

    ctx.save();
    ctx.translate(layout.x0, layout.y0);
    ctx.scale(layout.scale, layout.scale);

    drawTank(ctx, danger, this.clock, calm);
    this.drawLineWords(ctx, danger);
    if (this.phase === "play") this.drawGuide(ctx);

    ctx.save();
    // Nothing shows through the walls or the floor while a prize is swelling.
    ctx.beginPath();
    ctx.rect(-4, -60, TANK_W + 8, TANK_H + 64);
    ctx.clip();
    for (const body of run.world.bodies) {
      drawPrize(ctx, body.tier, body.x, body.y, body.r, body.angle, contrast);
    }
    ctx.restore();

    if (this.phase === "play") this.drawHand(ctx, contrast);

    this.particles.render(ctx);
    this.drawEffects(ctx);
    drawTankRim(ctx, danger);

    if (this.phase === "ending") {
      ctx.fillStyle = "rgba(5,7,15,0.4)";
      ctx.fillRect(-4, -60, TANK_W + 8, TANK_H + 64);
    }
    ctx.restore();

    drawLadder(
      ctx,
      layout.x0 - 4 * layout.scale,
      layout.ladderY,
      (TANK_W + 8) * layout.scale,
      layout.ladderH,
      run.bestTier,
      this.clock,
      contrast,
      calm,
    );
    this.drawNext(ctx, contrast);
    this.drawBanner(ctx, layout);

    if (this.phase === "howto") this.drawHowTo(ctx, view.w, view.h);
  }

  /** The words on the line: what it is for, and then that you're over it. */
  private drawLineWords(ctx: CanvasRenderingContext2D, danger: number): void {
    ctx.save();
    ctx.textBaseline = "top";
    if (danger > 0) {
      // A bar that runs down, so "how long have I got" has an answer.
      const left = Math.max(0, 1 - this.run.danger / OVERFLOW_LIMIT);
      ctx.fillStyle = "#ff5f5f";
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("TOO FULL!", TANK_W / 2, DANGER_Y + 8);
      ctx.fillStyle = "rgba(255,95,95,0.25)";
      ctx.fillRect(TANK_W / 2 - 60, DANGER_Y + 28, 120, 5);
      ctx.fillStyle = "#ff5f5f";
      ctx.fillRect(TANK_W / 2 - 60, DANGER_Y + 28, 120 * left, 5);
    } else {
      ctx.fillStyle = "rgba(255,112,111,0.7)";
      ctx.font = `700 9px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText("KEEP BELOW THE LINE", 10, DANGER_Y + 6);
    }

    // For the first few drops, the one thing there is to know.
    if (this.run.drops < HINT_DROPS && this.phase === "play") {
      ctx.fillStyle = "rgba(124,236,255,0.8)";
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("SLIDE TO AIM  ·  LET GO TO DROP", TANK_W / 2, TANK_H * 0.45);
    }
    ctx.restore();
  }

  private drawGuide(ctx: CanvasRenderingContext2D): void {
    const radius = prize(this.run.current).radius;
    const land = Math.max(RELEASE_Y, restHeight(this.run, this.aimX, radius));
    ctx.save();
    ctx.strokeStyle = "rgba(124,236,255,0.6)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.setLineDash([1, 9]);
    ctx.beginPath();
    ctx.moveTo(this.aimX, RELEASE_Y + radius + 4);
    ctx.lineTo(this.aimX, land);
    ctx.stroke();
    // A faint outline where it will sit, so a near miss is seen coming.
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(124,236,255,0.3)";
    ctx.beginPath();
    ctx.arc(this.aimX, land, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** The prize in hand. It pops into place as the last one falls away. */
  private drawHand(ctx: CanvasRenderingContext2D, contrast: boolean): void {
    const run = this.run;
    const ready = 1 - run.cooldown / DROP_COOLDOWN;
    if (ready <= 0) return;
    const radius = prize(run.current).radius;
    drawPrize(ctx, run.current, this.aimX, RELEASE_Y, radius * (0.4 + 0.6 * ready), 0, contrast, ready);
  }

  private drawEffects(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.span;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const float of this.floats) {
      ctx.globalAlpha = Math.min(1, float.life * 3);
      ctx.font = `700 ${float.size}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(5,7,15,0.85)";
      // Kept off the walls: a merge in the corner still shows its points.
      const x = Math.min(TANK_W - 30, Math.max(30, float.x));
      ctx.strokeText(float.text, x, float.y);
      ctx.fillStyle = float.color;
      ctx.fillText(float.text, x, float.y);
    }
    ctx.restore();
  }

  /** NEXT, in the score line, between the best score and the pause button. */
  private drawNext(ctx: CanvasRenderingContext2D, contrast: boolean): void {
    const top = this.host.view.insetTop + 10;
    const x = 204;
    const w = 80;
    const h = 44;
    ctx.save();
    ctx.fillStyle = "rgba(10,18,48,0.9)";
    ctx.strokeStyle = "rgba(70,224,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roundRect(ctx, x, top, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(142,163,200,0.9)";
    ctx.font = `700 9px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("NEXT", x + 9, top + h / 2);
    // Never bigger than the box, but a duck is still bigger than a marble.
    const radius = 9 + this.run.next * 2;
    drawPrize(ctx, this.run.next, x + w - 24, top + h / 2, radius, 0, contrast);
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, layout: Layout): void {
    if (this.bannerTimer <= 0 || !this.banner) return;
    const scale = this.host.settings.largeText ? 1.15 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.bannerTimer * 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${20 * scale}px ${FONT}`;
    const x = layout.x0 + (TANK_W / 2) * layout.scale;
    // Up in the empty part of the tank, clear of the pile.
    const y = layout.y0 + 96 * layout.scale;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(5,7,15,0.9)";
    ctx.strokeText(this.banner, x, y);
    ctx.fillStyle = "#ffc14d";
    ctx.fillText(this.banner, x, y);
    ctx.restore();
  }

  /** The card a new player sees once. After that the rules are on PAUSE. */
  private drawHowTo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const scale = this.host.settings.largeText ? 1.12 : 1;
    const cardW = Math.min(320, w - 28);
    const cardH = 306 * scale;
    const x = (w - cardW) / 2;
    const y = (h - cardH) / 2;

    ctx.save();
    ctx.fillStyle = "rgba(5,7,15,0.78)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#0a1230";
    ctx.strokeStyle = "#46e0ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, x, y, cardW, cardH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#7cecff";
    ctx.font = `700 ${18 * scale}px ${FONT}`;
    ctx.fillText("HOW TO PLAY", w / 2, y + 30 * scale);

    // Two the same make the next one: the whole game, as a picture.
    const rowY = y + 74 * scale;
    drawPrize(ctx, 3, w / 2 - 78, rowY, 17);
    drawPrize(ctx, 3, w / 2 - 34, rowY, 17);
    drawPrize(ctx, 4, w / 2 + 58, rowY, 23);
    ctx.fillStyle = "#e8f0ff";
    ctx.font = `700 ${18 * scale}px ${FONT}`;
    ctx.fillText("=", w / 2 + 8, rowY);

    ctx.font = `${12.5 * scale}px ${FONT}`;
    ctx.textAlign = "left";
    HOW_TO_PLAY.forEach((line, i) => {
      const lineY = y + (120 + i * 27) * scale;
      ctx.fillStyle = "#ffc14d";
      ctx.fillText(`${i + 1}.`, x + 16, lineY);
      ctx.fillStyle = "#e8f0ff";
      ctx.fillText(line, x + 38, lineY, cardW - 50);
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(142,163,200,0.9)";
    ctx.font = `${10 * scale}px ${FONT}`;
    ctx.fillText("Arrow keys to aim  ·  Space to drop", w / 2, y + 232 * scale);

    const pulse = this.host.settings.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(this.clock * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#46e0ff";
    ctx.beginPath();
    roundRect(ctx, w / 2 - 90, y + cardH - 56 * scale, 180, 40 * scale, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#05070f";
    ctx.font = `700 ${15 * scale}px ${FONT}`;
    ctx.fillText("LET'S DROP!", w / 2, y + cardH - 36 * scale);
    ctx.restore();
  }
}

function hasSeenHowTo(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markHowToSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage disabled -- the card just shows again next time.
  }
}

export const prizeDropModule: GameModule = {
  id: GAME_ID,
  title: "DAD'S PRIZE DROP",
  shortTitle: "PRIZE DROP",
  progressShort: "P",
  blurb: "Drop toys. Match pairs. Make the grand prize.",
  howToPlay: [
    "Slide to aim. Lift your finger to drop.",
    "Two matching toys become a bigger prize.",
    "Keep the pile below the glowing line.",
    "Can you make the Grand Prize Bot?",
    "On a keyboard, the arrow keys aim and Space drops.",
  ],
  accent: "#45ddf4",
  beta: true,
  drawIcon: drawPrizeDropIcon,
  create: (host: GameHost, start?: StartOptions): GameInstance => new PrizeDrop(host, start),
};

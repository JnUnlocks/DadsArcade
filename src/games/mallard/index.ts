/**
 * NATHAN'S MALLARD CHALLENGE -- a faithful-feeling Duck Hunt.
 *
 * Deliberately keeps the original's shape: a round flushes one or two ducks,
 * you get a fixed magazine to down them all, and the dog either retrieves
 * proudly or pops up to laugh at you. That laugh is the whole joke of the
 * original game, so it's kept front and center rather than smoothed away.
 *
 * Controls are split on purpose: dragging anywhere moves the crosshair (the
 * exact dragX/dragY accumulation Starfighter uses for ship movement -- zero
 * changes to core/input.ts), and a dedicated FIRE button pulls the trigger.
 * Firing on the same touch that aims would burn a shell every time you
 * touched the screen to adjust your aim.
 */

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Particles } from "../../core/particles";
import { Rng } from "../../core/rng";
import {
  drawBackground,
  drawBrush,
  drawCrosshair,
  drawDog,
  drawDuck,
  drawGrassTuft,
  drawScorePopup,
  drawShellIcon,
} from "./render";
import type { Duck, DogPose } from "./types";

const SHELLS_PER_ROUND = 3;
const DOUBLE_DUCK_ROUND = 4;
/**
 * How long a duck wanders before breaking for the sky. Generous on purpose:
 * the fun is in tracking and leading the bird, not in a reflex test.
 */
const ESCAPE_AGE = 5.5;
const HIT_RADIUS = 18;
const BANNER_DURATION = 1.3;
/** How long the dog's success/fail animation holds before the next round. */
const RESOLVE_DURATION = 1.8;
/** The dog is drawn at this multiple of his base art size. */
const DOG_SCALE = 1.55;

// The dog's opening routine, in seconds. Ducks go up at the end of the leap.
const WALK_TIME = 1.0;
const SNIFF_TIME = 0.45;
const LEAP_TIME = 0.4;
const INTRO_TIME = WALK_TIME + SNIFF_TIME + LEAP_TIME;

/**
 * Seconds of hard climb straight after the flush. After this the duck levels
 * off and wanders, which is what makes it trackable.
 */
const CLIMB_TIME = 0.55;

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
}

class MallardChallenge implements GameInstance {
  private readonly rng = new Rng((Math.random() * 0xffffffff) >>> 0);
  private readonly particles = new Particles();
  private readonly fireButton: HTMLButtonElement;

  private readonly grassTop: number;
  private readonly dogX: number;
  private readonly dogY: number;

  private ducks: Duck[] = [];
  private popups: Popup[] = [];

  private crosshairX: number;
  private crosshairY: number;
  private recoil = 0;

  private phase: "intro" | "hunting" | "success" | "fail" = "intro";
  private phaseTime = 0;
  private bannerTimer = 0;
  private roundFailed = false;

  private round = 1;
  private lives = 3;
  private shells = SHELLS_PER_ROUND;

  private dogPose: DogPose = "walking";
  private dogPoseTime = 0;
  private introTimer = 0;
  private dogDrawX = 0;
  /** Vertical offset used to pop the dog up out of, and back into, cover. */
  private dogDrawY = 0;

  private gameEnded = false;

  constructor(private readonly host: GameHost) {
    const { w, h, insetTop } = host.view;
    this.grassTop = insetTop + h * 0.72;
    this.dogX = w * 0.5;
    this.dogY = this.grassTop + (h - this.grassTop) * 0.42;
    this.crosshairX = w / 2;
    this.crosshairY = this.grassTop * 0.5;
    this.dogDrawX = this.dogX;

    this.fireButton = this.buildFireButton();
    this.startRound();
  }

  // ----- Setup -----

  private buildFireButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "fire-btn";
    button.setAttribute("aria-label", "Fire");
    // pointerdown, not click. iOS suppresses the synthesized click while
    // another touch is already down, which is exactly the situation this
    // game creates -- so a click handler goes dead the moment you try to
    // aim and fire at once. pointerdown also fires on press rather than
    // release, which is how a trigger should feel.
    button.addEventListener("pointerdown", () => this.tryFire());
    this.refreshFireButton(button);
    return button;
  }

  extraControls(): HTMLElement {
    return this.fireButton;
  }

  // ----- Round lifecycle -----

  private startRound(): void {
    this.shells = SHELLS_PER_ROUND;
    this.roundFailed = false;
    this.phase = "intro";
    this.introTimer = 0;
    this.bannerTimer = BANNER_DURATION;
    this.ducks = [];

    this.dogPose = "walking";
    this.dogPoseTime = 0;
    this.dogDrawY = 0;
    this.refreshFireButton(this.fireButton);
  }

  /** How much faster things move this round. Gentle ramp, not a cliff. */
  private speedScale(): number {
    return 1 + (this.round - 1) * 0.08;
  }

  private flushDucks(): void {
    const count = this.round >= DOUBLE_DUCK_ROUND ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const spread = count > 1 ? (i === 0 ? -40 : 40) : 0;
      this.ducks.push(this.spawnDuck(spread));
    }
    this.host.sfx("duckFlush");
    this.refreshFireButton(this.fireButton);
  }

  private spawnDuck(xOffset: number): Duck {
    const scale = this.speedScale();
    return {
      x: this.dogX + xOffset + this.rng.range(-8, 8),
      y: this.grassTop - 4,
      vx: this.rng.range(-22, 22) * scale,
      // Round 1 is deliberately gentle. The old value launched birds at
      // ~210 units/sec, which crossed the whole sky in about two seconds --
      // fast enough that round one felt like a reflex test.
      vy: this.rng.range(-150, -120) * scale,
      turnTimer: this.rng.range(0.4, 0.8),
      flapPhase: this.rng.range(0, Math.PI * 2),
      alive: true,
      falling: false,
      fallTimer: 0,
      age: 0,
      escaping: false,
    };
  }

  // ----- Update -----

  update(dt: number, input: InputSnapshot): void {
    this.updateCrosshair(dt, input);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    this.particles.update(dt);
    this.updatePopups(dt);
    this.updateDogPose(dt);

    if (this.phase === "intro") {
      this.updateIntro(dt);
    } else if (this.phase === "hunting") {
      // Aim with one thumb, tap anywhere with the other to shoot -- the
      // FIRE button is the discoverable version of the same action, not the
      // only way in. One shot per frame regardless of how many taps landed,
      // so a fumbled two-finger stab can't drain the magazine.
      if (input.secondaryTaps > 0 || input.firePressed) this.tryFire();
      this.updateDucks(dt);
      if (this.ducks.length === 0) this.resolveRound();
    } else {
      this.phaseTime += dt;
      this.updateDogPopup();
      if (this.phaseTime > RESOLVE_DURATION) this.advanceAfterResolve();
    }
  }

  /** The dog's walk-sniff-leap opening, ending with the birds going up. */
  private updateIntro(dt: number): void {
    this.introTimer += dt;
    const t = this.introTimer;

    if (t < WALK_TIME) {
      this.setDogPose("walking");
      // Trot in from the left and arrive at the brush.
      const progress = t / WALK_TIME;
      this.dogDrawX = this.host.view.w * 0.16 + (this.dogX - this.host.view.w * 0.16) * progress;
      this.dogDrawY = 0;
    } else if (t < WALK_TIME + SNIFF_TIME) {
      this.setDogPose("sniff");
      this.dogDrawX = this.dogX;
    } else if (t < INTRO_TIME) {
      if (this.dogPose !== "leap") this.host.sfx("dogBark");
      this.setDogPose("leap");
      // Arc up into the brush.
      const progress = (t - WALK_TIME - SNIFF_TIME) / LEAP_TIME;
      this.dogDrawY = -Math.sin(progress * Math.PI) * 26;
    } else {
      // He lands in cover and the birds break.
      this.setDogPose("watching");
      this.dogDrawY = 0;
      this.phase = "hunting";
      this.flushDucks();
    }
  }

  private setDogPose(pose: DogPose): void {
    if (this.dogPose === pose) return;
    this.dogPose = pose;
    this.dogPoseTime = 0;
  }

  /** Rise out of cover for the reaction, then drop back before the next round. */
  private updateDogPopup(): void {
    const RISE = 0.25;
    const SINK_AT = RESOLVE_DURATION - 0.3;
    if (this.phaseTime < RISE) {
      this.dogDrawY = 34 * (1 - this.phaseTime / RISE);
    } else if (this.phaseTime > SINK_AT) {
      this.dogDrawY = 34 * ((this.phaseTime - SINK_AT) / 0.3);
    } else {
      this.dogDrawY = 0;
    }
  }

  private updateCrosshair(dt: number, input: InputSnapshot): void {
    const { w, h, insetTop, insetBottom } = this.host.view;
    this.crosshairX += input.dragX + input.axisX * 220 * dt;
    this.crosshairY += input.dragY + input.axisY * 220 * dt;
    this.crosshairX = clamp(this.crosshairX, 12, w - 12);
    this.crosshairY = clamp(this.crosshairY, insetTop + 12, h - insetBottom - 12);
  }

  private updateDogPose(dt: number): void {
    this.dogPoseTime += dt;
  }

  private updateDucks(dt: number): void {
    const { w, insetTop } = this.host.view;
    const topBound = insetTop + 16;

    for (let i = this.ducks.length - 1; i >= 0; i -= 1) {
      const duck = this.ducks[i]!;
      duck.flapPhase += dt * 14;

      if (duck.falling) {
        duck.fallTimer -= dt;
        duck.vy += 480 * dt;
        duck.x += duck.vx * dt * 0.3;
        duck.y += duck.vy * dt;
        if (duck.fallTimer <= 0) removeAt(this.ducks, i);
        continue;
      }

      duck.age += dt;
      const scale = this.speedScale();

      // Out of time -- break hard for the sky. Only now can it actually leave.
      if (duck.age > ESCAPE_AGE && !duck.escaping) {
        duck.escaping = true;
        duck.vy = -260 * scale;
      }

      if (!duck.escaping) {
        duck.turnTimer -= dt;
        if (duck.turnTimer <= 0) {
          duck.turnTimer = this.rng.range(0.45, 0.95);
          duck.vx = clamp(duck.vx + this.rng.range(-70, 70) * scale, -130 * scale, 130 * scale);
          if (duck.age > CLIMB_TIME) {
            // Levelled off: drift up OR down. The old code clamped vy
            // permanently negative, so ducks climbed relentlessly and were
            // gone before you could line one up.
            duck.vy = clamp(duck.vy + this.rng.range(-45, 55) * scale, -85 * scale, 60 * scale);
          }
        }
        // Ease out of the initial climb into level flight.
        if (duck.age > CLIMB_TIME && duck.vy < -95 * scale) {
          duck.vy += 150 * scale * dt;
        }
      }

      duck.x += duck.vx * dt;
      duck.y += duck.vy * dt;

      // Bounce off the side walls rather than vanishing -- reads better on a
      // narrow screen than ducks disappearing off-frame sideways.
      if (duck.x < 14 || duck.x > w - 14) duck.vx *= -1;
      duck.x = clamp(duck.x, 14, w - 14);

      // Ceiling: bounce while it still has time left, so a duck that reaches
      // the top early stays huntable instead of instantly escaping.
      if (duck.y < topBound) {
        if (duck.escaping) {
          this.roundFailed = true;
          removeAt(this.ducks, i);
          continue;
        }
        duck.y = topBound;
        duck.vy = Math.abs(duck.vy) * 0.6;
      }

      // Don't let a levelled-off duck wander back into the grass.
      const floor = this.grassTop - 18;
      if (duck.y > floor) {
        duck.y = floor;
        duck.vy = -Math.abs(duck.vy) * 0.6;
      }
    }
  }

  private resolveRound(): void {
    this.phase = this.roundFailed ? "fail" : "success";
    this.phaseTime = 0;
    this.dogPose = this.roundFailed ? "laugh" : "retrieve";
    this.dogPoseTime = 0;
    this.host.sfx(this.roundFailed ? "roundFail" : "roundClear");
    if (this.roundFailed) {
      this.lives -= 1;
      this.host.shake(4);
    }
    this.refreshFireButton(this.fireButton);
  }

  private advanceAfterResolve(): void {
    if (this.lives <= 0) {
      if (!this.gameEnded) {
        this.gameEnded = true;
        this.host.gameOver({ progress: this.round, progressLabel: "Round" });
      }
      return;
    }
    this.round += 1;
    this.startRound();
  }

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const p = this.popups[i]!;
      p.life -= dt;
      p.y -= 26 * dt;
      if (p.life <= 0) removeAt(this.popups, i);
    }
  }

  // ----- Firing -----

  private tryFire(): void {
    if (this.shells <= 0) return;
    const flying = this.ducks.filter((d) => d.alive && !d.falling);
    if (flying.length === 0) return;

    this.shells -= 1;
    this.recoil = 1;
    this.host.sfx("shotgunBlast");
    this.host.shake(1.5);

    let closest: Duck | null = null;
    let closestDist = HIT_RADIUS;
    for (const duck of flying) {
      const dist = Math.hypot(duck.x - this.crosshairX, duck.y - this.crosshairY);
      if (dist < closestDist) {
        closest = duck;
        closestDist = dist;
      }
    }

    if (closest) {
      closest.alive = false;
      closest.falling = true;
      closest.fallTimer = 0.6;
      closest.vy = 40;
      this.host.sfx("duckHit");
      this.host.hitStop(0.02);
      this.particles.burst(closest.x, closest.y, "#3d6e30", 12, 80);
      this.particles.burst(closest.x, closest.y, "#f4efe4", 8, 60);
      const points = 200 + this.round * 15;
      this.host.addScore(points);
      this.popups.push({ x: closest.x, y: closest.y, text: `+${points}`, life: 0.7 });
    }

    this.refreshFireButton(this.fireButton);
  }

  private refreshFireButton(button: HTMLButtonElement): void {
    const flying = this.ducks.some((d) => d.alive && !d.falling);
    button.disabled = this.shells <= 0 || !flying;
    button.textContent = `FIRE  ${"●".repeat(this.shells)}${"○".repeat(
      Math.max(0, SHELLS_PER_ROUND - this.shells),
    )}`;
  }

  // ----- Render -----

  render(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.host.view;
    drawBackground(ctx, w, h, this.grassTop);
    drawBrush(ctx, this.dogX, this.grassTop + 10);

    for (const duck of this.ducks) {
      drawDuck(ctx, duck.x, duck.y, duck.vx, duck.flapPhase, duck.falling);
    }

    drawDog(
      ctx,
      this.dogDrawX,
      this.dogY + this.dogDrawY,
      this.dogPose,
      this.dogPoseTime,
      DOG_SCALE,
    );

    // Cover drawn *over* the dog, so a head poking out of the grass reads as
    // hiding in it rather than floating above it. Also masks the bottom of
    // the pop-up poses as he rises and sinks.
    if (this.phase !== "intro") {
      drawGrassTuft(ctx, this.dogDrawX, this.dogY + 16, DOG_SCALE);
    }

    this.particles.render(ctx);
    for (const popup of this.popups) {
      drawScorePopup(ctx, popup.x, popup.y, popup.text, Math.min(1, popup.life * 2));
    }

    drawCrosshair(ctx, this.crosshairX, this.crosshairY, this.recoil);

    // Mutually exclusive: a fast double-kill (or, as in testing, a forced
    // escape) can otherwise land inside the still-fading "ROUND N" banner
    // and draw both texts on top of each other.
    if (
      (this.phase === "intro" || this.phase === "hunting") &&
      this.bannerTimer > 0
    ) {
      this.drawBanner(ctx, `ROUND ${this.round}`);
    } else if (this.phase === "fail" && this.phaseTime < 1) {
      this.drawBanner(ctx, "MISSED!");
    } else if (this.phase === "success" && this.phaseTime < 1) {
      this.drawBanner(ctx, "CLEAR!");
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D, text: string): void {
    const { w, h } = this.host.view;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.bannerTimer * 1.4 + 0.4);
    ctx.fillStyle = "#fff6d8";
    ctx.font = '700 22px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, h * 0.18);
    ctx.restore();
  }

  hud(): HudState {
    return {
      lives: Math.max(0, this.lives),
      progress: this.round,
      progressLabel: "Round",
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Swap-and-pop removal -- order doesn't matter for these arrays. */
function removeAt<T>(items: T[], index: number): void {
  items[index] = items[items.length - 1]!;
  items.pop();
}

export const mallardModule: GameModule = {
  id: "mallard-challenge",
  title: "NATHAN'S MALLARD CHALLENGE",
  blurb: "Drag to aim. Tap FIRE, or tap with a second finger.",
  accent: "#e0a53c",

  drawIcon(ctx, size) {
    const scale = size / 32;
    ctx.save();
    ctx.scale(scale, scale);
    drawDuck(ctx, 14, 12, 1, 0, false);
    drawCrosshair(ctx, 22, 20, 0);
    ctx.restore();
  },

  drawLifeIcon(ctx, highContrast) {
    drawShellIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new MallardChallenge(host);
  },
};

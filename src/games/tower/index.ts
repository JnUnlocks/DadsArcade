/**
 * JB'S TOWER TROUBLE -- climb, dodge, fix, rescue, repeat.
 *
 * The Scrap King has taken over a half-built tower and the good boy is stuck on
 * the roof. JB climbs the girders while the robot rolls tyres, cable spools,
 * paint cans and toolboxes down at him. Grab a wrench to smash junk for a few
 * seconds, jump junk for points, and reach the roof to rescue the dog.
 *
 * Kept from the genre (see level.ts for the rules themselves):
 *   - Junk rolls downhill, drops off the open ends, and sometimes takes a
 *     ladder down instead -- the thing that makes a ladder feel unsafe.
 *   - Jumps are committed: direction is fixed at take-off.
 *   - Holding the wrench means you can't climb. Power, with a cost.
 *
 * Tuned for this family:
 *   - Three hearts, as in the mockup, and one more for every rescue (up to five).
 *   - A hit doesn't send JB back to the bottom of a tall tower. He restarts on
 *     the girder he reached, at the ladder he came up, with the junk cleared and
 *     a moment of safety. Losing progress up a tall climb to one tyre is the
 *     part of the genre that makes a seven-year-old put the phone down.
 *   - JB can't walk off a girder's end, and the bonus timer only ever drains
 *     points. Nothing here ends a run except running out of hearts.
 */

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { Rng } from "../../core/rng.ts";
import { DPad } from "./dpad.ts";
import {
  difficulty,
  girderY,
  jumpedOver,
  junkCentre,
  junkHitsPlayer,
  newPlayer,
  POINTS,
  reachesDog,
  spawnJunk,
  START,
  stepJunk,
  stepPlayer,
  touchesRobot,
  wrenchReaches,
  wrenchSpots,
  WORLD_H,
  WORLD_W,
  type Intent,
  type Junk,
  type JunkKind,
  type Player,
} from "./level.ts";
import {
  drawDog,
  drawHeartIcon,
  drawJunk,
  drawPlayer,
  drawRobot,
  drawScene,
  drawSpeech,
  drawTowerIcon,
  drawWrench,
  type RobotPose,
} from "./render.ts";

const START_LIVES = 3;
const MAX_LIVES = 5;

/** Seconds of wrench power from one pickup. */
const WRENCH_SECONDS = 7;
/** Seconds of safety after a hit, while JB blinks. */
const INVULNERABLE_SECONDS = 2.2;
const HURT_SECONDS = 1.1;
const READY_SECONDS = 1.8;
const POPUP_SECONDS = 0.8;
const RESCUE_SECONDS = 2.8;

/** The robot raises its junk this long before throwing, so the throw can be read. */
const WINDUP_SECONDS = 0.55;
const THROW_POSE_SECONDS = 0.3;

/** The bonus drains 100 points every this many seconds. */
const BONUS_TICK_SECONDS = 2;

/**
 * Where the D-pad and JUMP start, in CSS px above the safe area: the top of
 * .tower-controls in style.css (36px up + 128px tall), plus a small gap.
 */
const CONTROLS_TOP = 168;

/**
 * The lowest part of the tower that matters: the underside of the floor
 * girder. Everything below it -- the skyline, the jeep, the scrap bin -- is
 * backdrop, and is allowed to run on behind the controls. Reserving room for
 * it as well left a thick black band under the tower and shrank the whole
 * game to fit, which is what the first D-pad build did.
 */
const PLAY_BOTTOM = 596;

/** Drag-anywhere fallback: drag this far from where the finger landed to move. */
const STICK_DEAD_X = 8;
const STICK_DEAD_Y = 12;
const STICK_MAX = 30;
/** A touch that moved less than this in total is a tap, and a tap jumps. */
const TAP_MAX_DRAG = 10;

const SHOUTS = ["MORE JUNK FOR YOU!", "SCRAP HAPPENS!", "CATCH, JB!"];

type Phase = "ready" | "play" | "hurt" | "rescue" | "over";

export class TowerTrouble implements GameInstance {
  private readonly host: GameHost;
  private readonly particles = new Particles();
  private readonly rng = new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  private phase: Phase = "ready";
  private stage = 1;
  private lives = START_LIVES;
  private player: Player = newPlayer();
  private junk: Junk[] = [];
  private nextJunkId = 1;
  private wrenches: Array<{ level: number; x: number }> = wrenchSpots(1);
  /** Where JB last stepped off a ladder: where he restarts after a hit. */
  private checkpoint: { level: number; x: number } = { level: START.level, x: START.x };

  private time = 0;
  private phaseTimer = READY_SECONDS;
  private invulnerable = 0;
  private bonus = difficulty(1).bonus;
  private bonusTimer = BONUS_TICK_SECONDS;

  private throwTimer = 1.6;
  private robotPose: RobotPose = "idle";
  private poseTimer = 0;
  private holding: JunkKind | null = null;
  private shout = "";
  private shoutTimer = 0;

  private banner = "";
  private bannerTimer = 0;
  private hintCooldown = 0;
  private popups: Array<{ text: string; x: number; y: number; age: number }> = [];

  // Touch: the D-pad, JUMP, and the older drag-anywhere stick as a fallback.
  private readonly dpad = new DPad();
  private stickX = 0;
  private stickY = 0;
  private touchDrag = 0;
  private wasPointerDown = false;
  private jumpQueued = false;

  constructor(host: GameHost) {
    this.host = host;
    this.say("RESCUE THE GOOD BOY!", READY_SECONDS + 0.8);
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.shoutTimer > 0) this.shoutTimer -= dt;
    if (this.hintCooldown > 0) this.hintCooldown -= dt;
    for (const pop of this.popups) pop.age += dt;
    this.popups = this.popups.filter((pop) => pop.age < POPUP_SECONDS);

    const intent = this.readInput(input);

    switch (this.phase) {
      case "over":
        return;
      case "ready":
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.phase = "play";
        return;
      case "hurt":
        this.phaseTimer -= dt;
        this.animateRobot(dt);
        if (this.phaseTimer <= 0) this.afterHurt();
        return;
      case "rescue":
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.nextStage();
        return;
      case "play":
        this.play(dt, intent);
    }
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { scale, ox, oy } = this.layout();

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // Clip to the world so nothing draws over the HUD on a squat screen.
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    drawScene(ctx);

    for (const spot of this.wrenches) {
      const bob = Math.sin(this.time * 4 + spot.x) * 2;
      drawWrench(ctx, spot.x, girderY(spot.level, spot.x) - 14 + bob, 0.6, 1.1, 1);
    }

    drawDog(ctx, this.time, this.phase === "rescue");
    drawRobot(ctx, this.robotPose, this.holding, this.time);
    drawSpeech(ctx, this.shout, Math.min(1, this.shoutTimer * 2));

    for (const j of this.junk) drawJunk(ctx, j);

    const p = this.player;
    drawPlayer(ctx, p, {
      time: this.time,
      hurt: this.phase === "hurt",
      hidden: this.invulnerable > 0 && this.phase === "play" && Math.floor(this.time * 12) % 2 === 0,
      swinging: p.wrench > 0,
    });

    // Wrench time left, as a bar over JB's head.
    if (p.wrench > 0) {
      ctx.fillStyle = "rgba(10,14,28,0.8)";
      ctx.fillRect(p.x - 10, p.y - 36, 20, 3);
      ctx.fillStyle = "#46e0ff";
      ctx.fillRect(p.x - 10, p.y - 36, 20 * (p.wrench / WRENCH_SECONDS), 3);
    }

    this.particles.render(ctx);
    this.drawPopups(ctx);
    this.drawBonus(ctx);
    this.drawBanner(ctx);

    ctx.restore();
  }

  hud(): HudState {
    return { lives: this.lives, progress: this.stage, progressLabel: "Stage" };
  }

  /**
   * A handheld layout: D-pad bottom-left for the left thumb, JUMP bottom-right
   * for the right. Dragging on the tower itself still walks too, but it moves
   * the "centre" wherever the thumb lands, which playtesting found odd for
   * walking a girder -- a fixed pad under a resting thumb is what the genre
   * wants.
   */
  extraControls(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "tower-controls";

    const button = document.createElement("button");
    button.className = "jump-btn";
    button.textContent = "JUMP";
    button.setAttribute("aria-label", "Jump");
    // pointerdown rather than click: a click fires on release, and a jump that
    // waits for the finger to lift arrives a beat too late to clear a tyre.
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.jumpQueued = true;
    });
    button.addEventListener("contextmenu", (event) => event.preventDefault());

    bar.append(this.dpad.element, button);
    return bar;
  }

  onPause(): void {
    this.resetInput();
  }

  onResume(): void {
    this.resetInput();
  }

  // ----- Play -----

  private play(dt: number, intent: Intent): void {
    const p = this.player;
    if (this.invulnerable > 0) this.invulnerable -= dt;

    const events = stepPlayer(p, dt, intent);
    if (p.mode === "walk" && p.level > this.checkpoint.level) {
      this.checkpoint = { level: p.level, x: p.x };
    }
    for (const event of events) {
      if (event === "jump") this.host.sfx("towerJump");
      if (event === "blockedByWrench" && this.hintCooldown <= 0) {
        this.say("WRENCH IN HAND · CAN'T CLIMB", 1.4);
        this.hintCooldown = 2.5;
      }
      if (event === "roof") {
        this.rescue();
        return;
      }
    }
    if (reachesDog(p)) {
      this.rescue();
      return;
    }

    if (p.wrench > 0) p.wrench = Math.max(0, p.wrench - dt);
    this.pickUpWrenches();

    this.bonusTimer -= dt;
    if (this.bonusTimer <= 0) {
      this.bonusTimer += BONUS_TICK_SECONDS;
      this.bonus = Math.max(0, this.bonus - 100);
    }

    this.animateRobot(dt);
    this.robotThrows(dt);

    for (const j of this.junk) {
      stepJunk(j, dt, this.stage, this.rng);

      if (jumpedOver(j, p)) {
        j.jumped = true;
        this.host.addScore(POINTS.jumpOver);
        this.host.sfx("jumpScore");
        this.floatText(`+${POINTS.jumpOver}`, j.x, j.y - 22);
      }

      if (wrenchReaches(j, p)) {
        j.gone = true;
        this.host.addScore(POINTS.smash);
        this.host.sfx("junkSmash");
        const c = junkCentre(j);
        this.particles.burst(c.x, c.y, "#cfd6e4", 12, 70);
        this.floatText(`+${POINTS.smash}`, j.x, j.y - 22);
        continue;
      }

      if (this.invulnerable <= 0 && junkHitsPlayer(j, p)) {
        this.hurt();
        return;
      }
    }
    this.junk = this.junk.filter((j) => !j.gone);

    if (this.invulnerable <= 0 && touchesRobot(p)) this.hurt();
  }

  private pickUpWrenches(): void {
    const p = this.player;
    if (p.mode === "climb") return;
    const before = this.wrenches.length;
    this.wrenches = this.wrenches.filter(
      (spot) => !(spot.level === p.level && Math.abs(spot.x - p.x) < 12),
    );
    if (this.wrenches.length < before) {
      p.wrench = WRENCH_SECONDS;
      this.host.sfx("wrenchGet");
      this.say("WRENCH! SMASH THE JUNK", 1.4);
    }
  }

  // ----- The robot -----

  private robotThrows(dt: number): void {
    this.throwTimer -= dt;

    if (this.throwTimer <= WINDUP_SECONDS && this.robotPose === "idle") {
      this.robotPose = "windup";
      this.holding = this.pickJunk();
    }

    if (this.throwTimer <= 0) {
      const kind = this.holding ?? "tire";
      this.junk.push(spawnJunk(this.nextJunkId++, kind));
      this.holding = null;
      this.robotPose = "throw";
      this.poseTimer = THROW_POSE_SECONDS;
      this.host.sfx("junkThrow");

      const base = difficulty(this.stage).throwInterval;
      this.throwTimer = base * this.rng.range(0.8, 1.2);

      if (this.rng.chance(0.3)) {
        this.shout = this.rng.pick(SHOUTS);
        this.shoutTimer = 1.6;
      }
    }
  }

  private animateRobot(dt: number): void {
    if (this.robotPose === "throw") {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0) this.robotPose = "idle";
    }
  }

  /** Early stages throw mostly slow, readable junk; the fast stuff arrives later. */
  private pickJunk(): JunkKind {
    const roll = this.rng.next();
    if (this.stage === 1) return roll < 0.5 ? "spool" : roll < 0.8 ? "toolbox" : "tire";
    if (roll < 0.3) return "tire";
    if (roll < 0.55) return "paint";
    if (roll < 0.8) return "toolbox";
    return "spool";
  }

  // ----- Hits, rescues, stages -----

  private hurt(): void {
    this.phase = "hurt";
    this.phaseTimer = HURT_SECONDS;
    this.lives -= 1;
    this.host.sfx("towerBonk");
    this.host.shake(4);
    this.particles.burst(this.player.x, this.player.y - 12, "#ffd84d", 14, 80);
    this.say(this.lives > 0 ? "OOF!" : "OUT OF HEARTS", 1.2);
  }

  /**
   * Put JB back on the girder he'd reached, at the foot of the ladder he came
   * up, with the junk cleared. See the note at the top of the file for why he
   * doesn't go back to the bottom.
   */
  private afterHurt(): void {
    if (this.lives <= 0) {
      this.phase = "over";
      this.host.gameOver({ progress: this.stage, progressLabel: "Stage" });
      return;
    }

    const p = newPlayer();
    p.level = this.checkpoint.level;
    p.x = this.checkpoint.x;
    p.y = girderY(p.level, p.x);
    this.player = p;
    this.junk = [];
    this.invulnerable = INVULNERABLE_SECONDS;
    this.robotPose = "idle";
    this.holding = null;
    this.throwTimer = Math.max(this.throwTimer, 1.4);
    this.phase = "play";
  }

  private rescue(): void {
    this.phase = "rescue";
    this.phaseTimer = RESCUE_SECONDS;
    const bonus = this.bonus;
    this.host.addScore(POINTS.rescue + bonus);
    this.lives = Math.min(MAX_LIVES, this.lives + 1);
    this.host.sfx("rescue");
    this.host.sfx("dogBark");
    this.junk = [];
    this.particles.burst(this.player.x, this.player.y - 20, "#ff6b8a", 22, 110);
    this.particles.burst(this.player.x, this.player.y - 20, "#ffd84d", 18, 90);
    this.say(`GOOD BOY RESCUED!  +${POINTS.rescue + bonus}`, RESCUE_SECONDS);
  }

  private nextStage(): void {
    this.stage += 1;
    const d = difficulty(this.stage);
    this.player = newPlayer();
    this.checkpoint = { level: START.level, x: START.x };
    this.junk = [];
    this.wrenches = wrenchSpots(this.stage);
    this.bonus = d.bonus;
    this.bonusTimer = BONUS_TICK_SECONDS;
    this.throwTimer = 1.6;
    this.robotPose = "idle";
    this.holding = null;
    this.invulnerable = 0;
    this.phase = "ready";
    this.phaseTimer = READY_SECONDS;
    this.say(`STAGE ${this.stage}`, READY_SECONDS + 0.4);
  }

  // ----- Input -----

  private resetInput(): void {
    this.stickX = 0;
    this.stickY = 0;
    this.touchDrag = 0;
    this.wasPointerDown = false;
    this.jumpQueued = false;
    this.dpad.reset();
  }

  /**
   * A floating joystick: wherever a finger lands becomes the centre, and
   * dragging away from it walks or climbs. The offset is clamped so reversing
   * direction takes a short drag, not a long one back past the start.
   *
   * Jumping is the JUMP button, a tap with a second finger, a quick tap with
   * no drag, or Space. A tap fires on release -- firing on the press would
   * jump every time a finger landed to start walking.
   */
  private readInput(input: InputSnapshot): Intent {
    const released = this.wasPointerDown && !input.pointerDown;

    if (input.pointerDown) {
      if (!this.wasPointerDown) {
        this.stickX = 0;
        this.stickY = 0;
        this.touchDrag = 0;
      }
      this.stickX = clamp(this.stickX + input.dragX, -STICK_MAX, STICK_MAX);
      this.stickY = clamp(this.stickY + input.dragY, -STICK_MAX, STICK_MAX);
      this.touchDrag += Math.abs(input.dragX) + Math.abs(input.dragY);
    }

    let jump = this.jumpQueued || input.secondaryTaps > 0;
    this.jumpQueued = false;
    if (released) {
      if (this.touchDrag < TAP_MAX_DRAG) jump = true;
      this.stickX = 0;
      this.stickY = 0;
      this.touchDrag = 0;
    }
    this.wasPointerDown = input.pointerDown;

    // Space and the other fire keys. The edge, not `firing`: that's a level
    // autofire keeps permanently on, which would make JB bounce forever.
    if (input.firePressed) jump = true;

    let x = Math.abs(this.stickX) > STICK_DEAD_X ? Math.sign(this.stickX) : 0;
    let y = Math.abs(this.stickY) > STICK_DEAD_Y ? Math.sign(this.stickY) : 0;
    // A diagonal drag means whichever way it leans more.
    if (x !== 0 && y !== 0) {
      if (Math.abs(this.stickY) > Math.abs(this.stickX)) x = 0;
      else y = 0;
    }

    if (this.dpad.x !== 0 || this.dpad.y !== 0) {
      x = this.dpad.x;
      y = this.dpad.y;
    }
    if (input.axisX !== 0) x = Math.sign(input.axisX);
    if (input.axisY !== 0) y = Math.sign(input.axisY);

    return { x, y, jump };
  }

  // ----- Layout and overlays -----

  private layout(): { scale: number; ox: number; oy: number } {
    const { view } = this.host;
    const top = view.insetTop + 54;
    const controlsTop = view.h - view.insetBottom - CONTROLS_TOP;
    const avail = controlsTop - top;
    const scale = Math.min(view.w / WORLD_W, avail / PLAY_BOTTOM);
    // The floor always sits right on top of the controls. On the rare screen
    // taller than the tower needs, the spare room goes above it, under the
    // score, rather than between the game and the thumbs.
    return {
      scale,
      ox: (view.w - WORLD_W * scale) / 2,
      oy: controlsTop - PLAY_BOTTOM * scale,
    };
  }

  private drawBonus(ctx: CanvasRenderingContext2D): void {
    const x = 262;
    const y = 12;
    ctx.save();
    ctx.fillStyle = "rgba(8,10,24,0.85)";
    ctx.strokeStyle = "#46638f";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, 86, 30);
    ctx.strokeRect(x + 0.5, y + 0.5, 85, 29);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#8ea3c8";
    ctx.font = "700 7px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("BONUS", x + 43, y + 4);
    ctx.fillStyle = this.bonus > 0 ? "#ffd84d" : "#ff6b6b";
    ctx.font = "700 13px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(String(this.bonus).padStart(4, "0"), x + 43, y + 13);
    ctx.restore();
  }

  /**
   * Sits in the gap between the third and fourth girders, the one stretch of
   * open wall wide enough for it, so it never hides a girder JB is standing on.
   */
  private drawBanner(ctx: CanvasRenderingContext2D): void {
    if (this.bannerTimer <= 0 || !this.banner) return;
    const hint = this.phase === "ready" && this.stage === 1;
    ctx.save();
    ctx.font = "900 13px ui-monospace, Menlo, Consolas, monospace";
    const textW = Math.max(ctx.measureText(this.banner).width, hint ? 210 : 0);
    const w = Math.min(WORLD_W - 20, textW + 24);
    const h = hint ? 44 : 30;
    const x = (WORLD_W - w) / 2;
    const y = 344;
    ctx.globalAlpha = Math.min(1, this.bannerTimer * 3);
    ctx.fillStyle = "rgba(8,10,24,0.9)";
    ctx.strokeStyle = "#ff6a3d";
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = "#ffd84d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.banner, WORLD_W / 2, y + 15.5);
    if (hint) {
      ctx.fillStyle = "#cfe0ff";
      ctx.font = "700 8px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("D-PAD TO WALK + CLIMB  ·  JUMP TO HOP", WORLD_W / 2, y + 33);
    }
    ctx.restore();
  }

  private say(text: string, seconds: number): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  /** A score popping up where it was earned. */
  private floatText(text: string, x: number, y: number): void {
    this.popups.push({ text, x, y, age: 0 });
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    if (this.popups.length === 0) return;
    ctx.save();
    ctx.font = "900 10px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8,10,24,0.9)";
    ctx.fillStyle = "#ffd84d";
    for (const pop of this.popups) {
      const k = pop.age / POPUP_SECONDS;
      ctx.globalAlpha = 1 - k * k;
      const y = pop.y - k * 18;
      ctx.strokeText(pop.text, pop.x, y);
      ctx.fillText(pop.text, pop.x, y);
    }
    ctx.restore();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const towerModule: GameModule = {
  id: "tower-trouble",
  title: "JB'S TOWER TROUBLE",
  shortTitle: "TOWER",
  progressShort: "ST",
  blurb: "D-pad to walk and climb, JUMP over junk. Rescue the good boy.",
  accent: "#ff6a3d",

  drawIcon(ctx, size) {
    drawTowerIcon(ctx, size);
  },

  drawLifeIcon(ctx, highContrast) {
    drawHeartIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new TowerTrouble(host);
  },
};

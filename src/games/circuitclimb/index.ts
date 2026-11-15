/**
 * CIRCUIT CLIMB.
 *
 * JES COIL is a spring robot who never stops bouncing. Hold either side of
 * the screen to steer him onto higher pads, and land on relays to power the
 * city back up. Rooftops, then the antenna district, then the orbital
 * station; the run ends when he falls off the bottom of the screen.
 *
 * Asked for by a player with the arcade on their iPhone, who wanted a game
 * about jumping upwards. The rules are in run.ts and the climb in level.ts,
 * both without a screen; this file is the hands, the camera and the noise.
 */

import type { GameHost, GameInstance, GameModule, HudState, StartOptions } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { loadBests } from "../../core/storage.ts";
import { padX, type Pad } from "./level.ts";
import {
  drawBreak,
  drawCircuitClimbIcon,
  drawDistrict,
  drawJes,
  drawPad,
  drawScenery,
  drawTrail,
  FONT,
} from "./render.ts";
import { createClimb, heightPoints, score, setViewHeight, stepClimb, type Climb } from "./run.ts";
import { ARENA_W, HEIGHT_PER_POINT, RELAY_BONUS, ZONES, zoneAt, type Mode } from "./tuning.ts";
import "./climb.css";

const GAME_ID = "circuit-climb";
export const JUNIOR_BOARD = "junior";
const MODE_KEY = "hyperdrive.circuitclimb.mode";
const HEIGHTS_KEY = "hyperdrive.circuitclimb.bestHeight";

const TEACHING = "Hold either side to steer. Land on relays to light up the city.";

/** A beat to watch him fall before the results. */
const END_PAUSE = 0.9;
/** Seconds the steering arrows stay on screen at the start of a run. */
const HINT_TIME = 4;
/** Trail points kept while he rises. */
const TRAIL_LENGTH = 14;

type Phase = "title" | "play" | "ending";

interface Breaking {
  x: number;
  y: number;
  w: number;
  t: number;
}

class CircuitClimb implements GameInstance {
  private readonly host: GameHost;
  private readonly root: HTMLDivElement;
  private mode: Mode;
  private phase: Phase;
  private climb: Climb;

  /** Fingers or the mouse holding a side: pointer id to -1 or 1. Newest wins. */
  private held = new Map<number, number>();
  private steer = 0;

  private clock = 0;
  private playTime = 0;
  private endTimer = 0;
  private squash = 0;
  private joy = 0;
  private trail: Array<{ x: number; y: number }> = [];
  private readonly particles = new Particles();
  private breaking: Breaking[] = [];
  /** When each relay was powered, for its district fading up. */
  private litAt = new Map<number, number>();
  private zone = 0;
  private banner = "";
  private bannerTimer = 0;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.mode = loadMode();
    this.climb = createClimb(newSeed(), this.mode, host.view.h);
    this.root = document.createElement("div");
    this.root.className = "climb-root";
    this.phase = start?.again ? "play" : "title";
    if (this.phase === "title") this.buildTitle();

    const canvas = host.view.canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("lostpointercapture", this.onPointerUp);
    window.addEventListener("blur", this.letGo);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  destroy(): void {
    const canvas = this.host.view.canvas;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("lostpointercapture", this.onPointerUp);
    window.removeEventListener("blur", this.letGo);
  }

  onPause(): void {
    this.letGo();
  }

  onResume(): void {
    this.letGo();
  }

  pausesWhenHidden(): boolean {
    return this.phase === "play";
  }

  hud(): HudState {
    return {
      lives: 0,
      progress: heightPoints(this.climb),
      progressLabel: "Height",
      rollScore: true,
    };
  }

  // ----- Title card -----

  private buildTitle(): void {
    const bests = loadBests();
    const heights = loadHeights();
    const card = document.createElement("div");
    card.className = "climb-title";

    const name = document.createElement("h2");
    name.className = "climb-title__name";
    name.textContent = "CIRCUIT CLIMB";
    const hero = document.createElement("p");
    hero.className = "climb-title__hero";
    hero.textContent = "JES COIL never stops bouncing. Help him climb the city and power it back up.";
    const teach = document.createElement("p");
    teach.className = "climb-title__teach";
    teach.textContent = TEACHING;
    card.append(name, hero, teach);

    const option = (mode: Mode, label: string, pitch: string) => {
      const button = document.createElement("button");
      button.className = `climb-mode climb-mode--${mode}`;
      if (mode === this.mode) button.classList.add("is-last");
      const title = document.createElement("span");
      title.className = "climb-mode__name";
      title.textContent = label;
      const desc = document.createElement("span");
      desc.className = "climb-mode__pitch";
      desc.textContent = pitch;
      button.append(title, desc);
      const best = bests[mode === "junior" ? `${GAME_ID}:${JUNIOR_BOARD}` : GAME_ID] ?? 0;
      if (best > 0) {
        const record = document.createElement("span");
        record.className = "climb-mode__best";
        record.textContent = `BEST ${best}  ·  HIGHEST ${heights[mode] ?? 0}`;
        button.append(record);
      }
      button.addEventListener("click", () => this.begin(mode));
      return button;
    };
    card.append(
      option("classic", "PLAY", "The full climb: rooftops, antennas, then space."),
      option("junior", "JUNIOR", "Wider pads and smaller jumps. Same city, same relays."),
    );
    this.root.replaceChildren(card);
  }

  private begin(mode: Mode): void {
    this.mode = mode;
    saveMode(mode);
    this.climb = createClimb(newSeed(), mode, this.host.view.h);
    this.root.replaceChildren();
    this.phase = "play";
    this.playTime = 0;
    this.letGo();
    this.host.sfx("uiSelect");
  }

  // ----- Input -----

  private letGo = (): void => {
    this.held.clear();
    this.steer = 0;
  };

  private sideOf(event: PointerEvent): number {
    return this.host.view.toWorldX(event.clientX) < ARENA_W / 2 ? -1 : 1;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.phase !== "play") return;
    // Re-adding moves it to the end of the map, so the newest touch steers.
    this.held.delete(event.pointerId);
    this.held.set(event.pointerId, this.sideOf(event));
    try {
      this.host.view.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Already captured, or the pointer is gone. Either way, nothing to do.
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    // A thumb slid across the middle changes sides with it.
    if (this.held.has(event.pointerId)) this.held.set(event.pointerId, this.sideOf(event));
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.held.delete(event.pointerId);
  };

  private steering(input: InputSnapshot): number {
    let side = 0;
    for (const value of this.held.values()) side = value;
    if (side !== 0) return side;
    return Math.sign(input.axisX);
  }

  // ----- Update -----

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    if (this.phase === "title") return;
    this.particles.update(dt);
    for (const piece of this.breaking) piece.t += dt;
    this.breaking = this.breaking.filter((piece) => piece.t < 1);
    this.squash = Math.max(0, this.squash - dt * 7);
    this.joy = Math.max(0, this.joy - dt);
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);

    if (this.phase === "ending") {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish();
      return;
    }

    this.playTime += dt;
    if (this.climb.viewH !== this.host.view.h) setViewHeight(this.climb, this.host.view.h);
    this.steer = this.steering(input);

    // Two steps of the climb to one of the arcade's: JES is tuned at 120 a second.
    for (let i = 0; i < 2; i += 1) {
      const landing = stepClimb(this.climb, this.steer, dt / 2);
      if (landing) this.onLanding(landing.pad, landing.powered);
    }

    const jes = this.climb.jes;
    if (!this.host.settings.reducedMotion && jes.vy > 0) {
      this.trail.push({ x: jes.x, y: jes.y + 26 });
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }

    const zone = zoneAt(this.climb.peak);
    if (zone > this.zone) {
      this.zone = zone;
      this.say(ZONES[zone]!.name, 1.6);
      this.host.sfx("climbZone");
    }

    this.addScore();

    if (this.climb.over) {
      this.phase = "ending";
      this.endTimer = END_PAUSE;
      this.letGo();
      this.host.sfx("climbOver");
      this.host.buzz([40, 50, 90]);
    }
  }

  /** The arcade keeps the score; hand it the difference. */
  private addScore(): void {
    const now = score(this.climb);
    if (now > this.host.score) this.host.addScore(now - this.host.score);
  }

  private onLanding(pad: Pad, powered: boolean): void {
    this.squash = 1;
    this.trail = [];
    const calm = this.host.settings.reducedMotion;
    const at = padX(pad, this.climb.time);
    if (pad.kind === "boost") {
      this.host.sfx("climbBoost");
      this.host.buzz(20);
      if (!calm) this.particles.burst(at, pad.y, "#a66bff", 12, 120);
    } else if (pad.kind === "brittle") {
      this.host.sfx("climbBreak");
      this.breaking.push({ x: at, y: pad.y, w: pad.w, t: 0 });
    } else {
      this.host.sfx("climbBounce");
    }
    if (powered) {
      this.joy = 0.6;
      this.litAt.set(pad.id, this.clock);
      this.host.sfx("climbRelay");
      this.host.buzz(25);
      if (!calm) this.particles.burst(at, pad.y - 4, "#ffb53d", 16, 130);
      this.say(`+${RELAY_BONUS}  RELAY ON`, 0.8);
    }
  }

  private say(text: string, seconds: number): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  private finish(): void {
    const climb = this.climb;
    const height = heightPoints(climb);
    const heights = loadHeights();
    if (height > (heights[this.mode] ?? 0)) {
      heights[this.mode] = height;
      saveHeights(heights);
    }
    this.host.gameOver({
      // The scoreboard needs a number of at least one here.
      progress: Math.max(1, height),
      progressLabel: `Relays ${climb.relays}  ·  Height`,
      headline: "OUT OF BOUNCE!",
      durationMs: this.playTime * 1000,
      ...(this.mode === "junior" ? { boardId: JUNIOR_BOARD } : {}),
    });
  }

  // ----- Render -----

  render(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.host.view;
    const climb = this.climb;
    const calm = this.host.settings.reducedMotion;
    const contrast = this.host.settings.highContrast;
    const cam = climb.cameraY;
    const toScreen = (y: number) => h - (y - cam);

    const zoneMix = smoothZone(climb.cameraY + h * 0.5);
    // With reduced motion the scenery holds still; only the pads move.
    drawScenery(ctx, w, h, calm ? 0 : cam, zoneMix, this.clock, calm);

    // Districts the relays power, behind everything that can be landed on.
    for (const pad of climb.level.pads) {
      if (pad.kind !== "relay") continue;
      const sy = toScreen(pad.y);
      if (sy < -140 || sy > h + 80) continue;
      const lit = this.litAt.get(pad.id);
      drawDistrict(ctx, pad, padX(pad, climb.time), sy, lit === undefined ? 0 : this.clock - lit, calm);
    }

    for (const pad of climb.level.pads) {
      if (pad.broken) continue;
      const sy = toScreen(pad.y);
      if (sy < -30 || sy > h + 30) continue;
      drawPad(ctx, pad, padX(pad, climb.time), sy, this.clock, calm);
    }
    for (const piece of this.breaking) drawBreak(ctx, piece.x, toScreen(piece.y), piece.w, piece.t);

    if (this.phase !== "title") {
      drawTrail(ctx, this.trail.map((p) => ({ x: p.x, y: toScreen(p.y) })));
      const jes = climb.jes;
      drawJes(
        ctx,
        { x: jes.x, y: toScreen(jes.y), vx: jes.vx, vy: jes.vy, squash: this.squash, look: this.steer, joy: this.joy },
        contrast,
      );
      this.drawParticles(ctx, h, cam);
      this.drawHints(ctx, w, h);
      this.drawBanner(ctx, w, h);
    } else {
      // On the title card he waits on the roof, bobbing.
      const bob = calm ? 0 : Math.abs(Math.sin(this.clock * 3)) * 18;
      drawJes(ctx, { x: ARENA_W / 2, y: toScreen(0) - bob, vx: 0, vy: 0, squash: 0, look: 0, joy: 0 }, contrast);
    }
  }

  /** Particles live in world height; draw them flipped onto the screen. */
  private drawParticles(ctx: CanvasRenderingContext2D, h: number, cam: number): void {
    ctx.save();
    ctx.translate(0, h + cam);
    ctx.scale(1, -1);
    this.particles.render(ctx);
    ctx.restore();
  }

  /** Arrows in the bottom corners: where to hold, lit while held. */
  private drawHints(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const early = this.playTime < HINT_TIME;
    if (!early && this.steer === 0) return;
    const y = h - this.host.view.insetBottom - 70;
    ctx.save();
    for (const side of [-1, 1]) {
      const on = this.steer === side;
      const fade = early ? Math.min(1, (HINT_TIME - this.playTime) * 1.5) : 0;
      const alpha = on ? 0.55 : 0.28 * fade;
      if (alpha <= 0) continue;
      const x = side < 0 ? 42 : w - 42;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#46e0ff";
      ctx.beginPath();
      ctx.moveTo(x + side * 14, y);
      ctx.lineTo(x - side * 8, y - 16);
      ctx.lineTo(x - side * 8, y + 16);
      ctx.closePath();
      ctx.fill();
    }
    if (early) {
      ctx.globalAlpha = Math.min(1, (HINT_TIME - this.playTime) * 1.5);
      ctx.fillStyle = "#e8f0ff";
      ctx.font = `700 ${11 * (this.host.settings.largeText ? 1.15 : 1)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("HOLD A SIDE TO STEER", w / 2, y + 4);
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.bannerTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.bannerTimer * 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${18 * (this.host.settings.largeText ? 1.15 : 1)}px ${FONT}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(5,7,15,0.9)";
    const y = h * 0.24;
    ctx.strokeText(this.banner, w / 2, y);
    ctx.fillStyle = this.banner.startsWith("+") ? "#ffb53d" : "#7cecff";
    ctx.fillText(this.banner, w / 2, y);
    ctx.restore();
  }
}

/** Districts blend into each other over a stretch of the climb. */
function smoothZone(height: number): number {
  const points = height / HEIGHT_PER_POINT;
  const blend = 120;
  let mix = 0;
  for (let i = 1; i < ZONES.length; i += 1) {
    mix += Math.min(1, Math.max(0, (points - ZONES[i]!.from + blend) / (blend * 2)));
  }
  return mix;
}

function newSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "junior" ? "junior" : "classic";
  } catch {
    return "classic";
  }
}

function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage disabled -- PLAY AGAIN just won't remember.
  }
}

/** Highest height reached, per mode. Kept here because the arcade keeps scores, not heights. */
let memoryHeights: Partial<Record<Mode, number>> = {};

function loadHeights(): Partial<Record<Mode, number>> {
  try {
    const raw = localStorage.getItem(HEIGHTS_KEY);
    if (raw) return { ...memoryHeights, ...(JSON.parse(raw) as Partial<Record<Mode, number>>) };
  } catch {
    // Fall through to what this visit has seen.
  }
  return { ...memoryHeights };
}

function saveHeights(heights: Partial<Record<Mode, number>>): void {
  memoryHeights = { ...heights };
  try {
    localStorage.setItem(HEIGHTS_KEY, JSON.stringify(heights));
  } catch {
    // Storage disabled -- kept in memory until the arcade closes.
  }
}

export const circuitClimbModule: GameModule = {
  id: GAME_ID,
  title: "CIRCUIT CLIMB",
  progressShort: "HT",
  blurb: "Bounce JES COIL up the city. Hold a side to steer.",
  howToPlay: [
    "JES COIL bounces by himself. Hold the left or right side of the screen to steer him onto a higher pad.",
    "On a keyboard, use the arrow keys or A and D.",
    "Land on a relay, the pad with the socket underneath, to light up the city: 50 points, once each.",
    "Violet pads with arrows bounce you higher. Moving pads slide on a rail. Cracked pads break after one bounce.",
    "Every 10 units you climb is a point. Fall off the bottom of the screen and the run is over.",
    "JUNIOR has wider pads and smaller jumps, with its own scores.",
  ],
  accent: "#ff8a2a",
  beta: true,
  extraBoard: { id: JUNIOR_BOARD, label: "JUNIOR", progressShort: "HT" },
  drawIcon: drawCircuitClimbIcon,
  create: (host: GameHost, start?: StartOptions): GameInstance => new CircuitClimb(host, start),
};

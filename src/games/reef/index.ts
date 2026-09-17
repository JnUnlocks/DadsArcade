/**
 * MISS RILEY'S REEF -- a maze chase in the Ms. Pac-Man mould.
 *
 * Keeps the mechanics that make the genre work rather than a surface
 * resemblance:
 *   - Tile-snapped movement with a buffered turn, so a swipe made slightly
 *     early still lands. Without the buffer, maze games feel unresponsive
 *     in a way players can't articulate but immediately dislike.
 *   - Four pursuers with genuinely different targeting. One tails you, one
 *     aims where you're going, one flanks off the tailer's position, and one
 *     loses its nerve when it gets close.
 *   - Alternating scatter and chase phases, so the pressure comes in waves
 *     and you get breathing room to clear a corner.
 *   - Pearls flip them to frightened, and eating them chains 200/400/800/1600.
 *
 * The theme is pitched for a younger player: nothing dies, Riley just gets
 * bumped back to her starting spot, and the jellyfish look startled rather
 * than menacing when you turn the tables on them.
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
  COLS,
  DEN_EXIT_TILE,
  DEN_TILE,
  Maze,
  ROWS,
  SCATTER_CORNERS,
  START_TILE,
} from "./maze";
import {
  PALETTE,
  drawItems,
  drawJelly,
  drawMaze,
  drawPopup,
  drawRiley,
  drawRileyIcon,
  drawShell,
  drawWater,
  tileToPixel,
  type Layout,
} from "./render";
import {
  DIR_VECTORS,
  OPPOSITE,
  type Dir,
  type Jelly,
  type JellyKind,
  type Player,
} from "./types";

const PLAYER_SPEED = 5.6; // tiles per second
const JELLY_SPEED = 4.7;
const FRIGHTENED_SPEED = 3.2;
const EATEN_SPEED = 11;
/** Slower through the tunnel, the way the original punished hiding there. */
const TUNNEL_SPEED_FACTOR = 0.55;

const BUBBLE_POINTS = 10;
const PEARL_POINTS = 50;
const SHELL_POINTS = 300;
/** Chain values for eating jellyfish during one pearl. */
const CHAIN_POINTS = [200, 400, 800, 1600];

const FRIGHTENED_TIME = 7;
const FRIGHTENED_WARN = 2;
const START_LIVES = 3;
const READY_TIME = 1.9;
const BUMPED_TIME = 1.6;
const CLEARED_TIME = 2.0;

/** Alternating scatter/chase, in seconds. Loops on the last entry. */
const PHASES: ReadonlyArray<{ mode: "scatter" | "chase"; seconds: number }> = [
  { mode: "scatter", seconds: 7 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 7 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: Infinity },
];

const KINDS: readonly JellyKind[] = ["tailer", "ambusher", "flanker", "shy"];

/** How long each jellyfish waits in the den before its first launch. */
const DEN_DELAYS: Record<JellyKind, number> = {
  tailer: 0,
  ambusher: 1.5,
  flanker: 4,
  shy: 7,
};

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
}

type Phase = "ready" | "playing" | "bumped" | "cleared";

class RileysReef implements GameInstance {
  private readonly rng = new Rng((Math.random() * 0xffffffff) >>> 0);
  private readonly particles = new Particles();

  private maze = new Maze();
  private layout: Layout;

  private player: Player = freshPlayer();
  private jellies: Jelly[] = [];
  private popups: Popup[] = [];

  private phase: Phase = "ready";
  private phaseTimer = READY_TIME;

  private level = 1;
  private lives = START_LIVES;
  private time = 0;

  private phaseIndex = 0;
  private phaseClock = 0;
  private frightenedFor = 0;
  private chainIndex = 0;

  /** Accumulated swipe, so a flick in one direction turns her. */
  private swipeX = 0;
  private swipeY = 0;

  private shellTimer = 12;
  private shell: { col: number; row: number; life: number } | null = null;

  private gameEnded = false;

  /** View size the current layout was built for, so we can spot a resize. */
  private layoutFor = { w: 0, h: 0 };

  constructor(private readonly host: GameHost) {
    this.layout = this.computeLayout();
    this.resetActors();
  }

  /**
   * The playfield can change size after construction -- Safari settles its
   * viewport once the URL bar collapses, and rotating the device changes it
   * outright. Building the layout once in the constructor left the maze
   * stranded against the top of the screen.
   */
  private ensureLayout(): void {
    const { w, h } = this.host.view;
    if (this.layoutFor.w === w && this.layoutFor.h === h) return;
    this.layout = this.computeLayout();
    this.layoutFor = { w, h };
  }

  private computeLayout(): Layout {
    const { w, h, insetTop, insetBottom } = this.host.view;
    // Leave room for the shared HUD at the top and the lives row at the bottom.
    const top = insetTop + 58;
    const bottom = h - insetBottom - 40;
    const tile = Math.min(w / COLS, (bottom - top) / ROWS);
    return {
      tile,
      originX: (w - tile * COLS) / 2,
      originY: top + (bottom - top - tile * ROWS) / 2,
    };
  }

  // ----- Setup -----

  private resetActors(): void {
    this.player = freshPlayer();
    this.jellies = KINDS.map((kind, i) => ({
      kind,
      col: DEN_TILE.col + (i - 1.5) * 0 + (i === 0 ? 0 : i === 1 ? -1 : i === 2 ? 0 : 1),
      row: i === 0 ? DEN_EXIT_TILE.row : DEN_TILE.row,
      offset: 0,
      dir: i === 0 ? "left" : "up",
      mode: i === 0 ? "scatter" : "den",
      denTimer: DEN_DELAYS[kind],
      phase: i * 1.3,
    }));
    this.phaseIndex = 0;
    this.phaseClock = 0;
    this.frightenedFor = 0;
    this.chainIndex = 0;
    this.swipeX = 0;
    this.swipeY = 0;
  }

  // ----- Update -----

  update(dt: number, input: InputSnapshot): void {
    this.ensureLayout();
    this.time += dt;
    this.particles.update(dt);
    this.updatePopups(dt);
    this.player.phase += dt;
    for (const j of this.jellies) j.phase += dt;

    if (this.phase !== "playing") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.advancePhase();
      return;
    }

    this.readSteering(dt, input);
    this.movePlayer(dt);
    this.updateModes(dt);
    for (const jelly of this.jellies) this.moveJelly(jelly, dt);
    this.updateShell(dt);
    this.checkCollisions();

    if (this.maze.remaining === 0) {
      this.phase = "cleared";
      this.phaseTimer = CLEARED_TIME;
      this.host.sfx("roundClear");
    }
  }

  private advancePhase(): void {
    if (this.phase === "ready") {
      this.phase = "playing";
    } else if (this.phase === "bumped") {
      if (this.lives <= 0) {
        if (!this.gameEnded) {
          this.gameEnded = true;
          this.host.gameOver({ progress: this.level, progressLabel: "Level" });
        }
        return;
      }
      this.resetActors();
      this.phase = "ready";
      this.phaseTimer = READY_TIME;
    } else if (this.phase === "cleared") {
      this.level += 1;
      this.maze = new Maze();
      this.resetActors();
      this.shell = null;
      this.shellTimer = 12;
      this.phase = "ready";
      this.phaseTimer = READY_TIME;
    }
  }

  /**
   * Flick anywhere to turn. Deltas are accumulated and decayed rather than
   * read per-frame: a single frame's drag is far too small to classify, and
   * requiring a full swipe-and-release would make turns feel laggy.
   */
  private readSteering(dt: number, input: InputSnapshot): void {
    this.swipeX += input.dragX;
    this.swipeY += input.dragY;
    const decay = Math.pow(0.02, dt);
    this.swipeX *= decay;
    this.swipeY *= decay;

    const THRESHOLD = 9;
    if (Math.abs(this.swipeX) > THRESHOLD || Math.abs(this.swipeY) > THRESHOLD) {
      this.player.wanted =
        Math.abs(this.swipeX) > Math.abs(this.swipeY)
          ? this.swipeX > 0
            ? "right"
            : "left"
          : this.swipeY > 0
            ? "down"
            : "up";
      this.swipeX = 0;
      this.swipeY = 0;
    }

    if (input.axisX > 0) this.player.wanted = "right";
    else if (input.axisX < 0) this.player.wanted = "left";
    else if (input.axisY > 0) this.player.wanted = "down";
    else if (input.axisY < 0) this.player.wanted = "up";
  }

  private speedAt(row: number, base: number): number {
    return row === DEN_TILE.row ? base * TUNNEL_SPEED_FACTOR : base;
  }

  private movePlayer(dt: number): void {
    const p = this.player;
    // Turning is allowed only at a tile centre, but the *wanted* direction is
    // remembered indefinitely, which is what makes early swipes feel right.
    if (p.offset === 0 && this.canPlayerGo(p.col, p.row, p.wanted)) {
      p.dir = p.wanted;
    }
    if (!this.canPlayerGo(p.col, p.row, p.dir)) {
      p.offset = 0;
      return;
    }

    p.offset += this.speedAt(p.row, PLAYER_SPEED) * dt;
    while (p.offset >= 1) {
      p.offset -= 1;
      const v = DIR_VECTORS[p.dir];
      p.col = this.maze.wrapCol(p.col + v.dc);
      p.row += v.dr;

      const item = this.maze.take(p.col, p.row);
      if (item === "bubble") {
        this.host.addScore(BUBBLE_POINTS);
        this.host.sfx("uiMove");
      } else if (item === "pearl") {
        this.host.addScore(PEARL_POINTS);
        this.eatPearl();
      }

      // Re-evaluate the turn at every new tile centre.
      if (this.canPlayerGo(p.col, p.row, p.wanted)) p.dir = p.wanted;
      if (!this.canPlayerGo(p.col, p.row, p.dir)) {
        p.offset = 0;
        break;
      }
    }
  }

  private canPlayerGo(col: number, row: number, dir: Dir): boolean {
    const v = DIR_VECTORS[dir];
    return this.maze.isOpenForPlayer(this.maze.wrapCol(col + v.dc), row + v.dr);
  }

  private eatPearl(): void {
    this.frightenedFor = FRIGHTENED_TIME;
    this.chainIndex = 0;
    for (const jelly of this.jellies) {
      if (jelly.mode === "chase" || jelly.mode === "scatter") {
        jelly.mode = "frightened";
        jelly.dir = OPPOSITE[jelly.dir];
      }
    }
    this.host.sfx("captureBeam");
  }

  private updateModes(dt: number): void {
    if (this.frightenedFor > 0) {
      this.frightenedFor -= dt;
      if (this.frightenedFor <= 0) {
        for (const jelly of this.jellies) {
          if (jelly.mode === "frightened") jelly.mode = this.currentPhaseMode();
        }
      }
      return; // scatter/chase clock is paused while they're frightened
    }

    this.phaseClock += dt;
    const current = PHASES[this.phaseIndex];
    if (current && this.phaseClock >= current.seconds) {
      this.phaseIndex = Math.min(this.phaseIndex + 1, PHASES.length - 1);
      this.phaseClock = 0;
      const mode = this.currentPhaseMode();
      for (const jelly of this.jellies) {
        if (jelly.mode === "chase" || jelly.mode === "scatter") {
          jelly.mode = mode;
          // Reversing on a phase change is the original's tell that the mood
          // has shifted -- it reads clearly and gives the player a cue.
          jelly.dir = OPPOSITE[jelly.dir];
        }
      }
    }
  }

  private currentPhaseMode(): "scatter" | "chase" {
    return PHASES[this.phaseIndex]?.mode ?? "chase";
  }

  // ----- Jellyfish -----

  private moveJelly(jelly: Jelly, dt: number): void {
    if (jelly.mode === "den") {
      jelly.denTimer -= dt;
      if (jelly.denTimer <= 0) jelly.mode = "leaving";
      return;
    }

    const base =
      jelly.mode === "eaten"
        ? EATEN_SPEED
        : jelly.mode === "frightened"
          ? FRIGHTENED_SPEED
          : JELLY_SPEED + (this.level - 1) * 0.18;
    const speed = jelly.mode === "eaten" ? base : this.speedAt(jelly.row, base);

    jelly.offset += speed * dt;
    while (jelly.offset >= 1) {
      jelly.offset -= 1;
      const v = DIR_VECTORS[jelly.dir];
      jelly.col = this.maze.wrapCol(jelly.col + v.dc);
      jelly.row += v.dr;
      this.pickJellyDirection(jelly);
    }
  }

  private pickJellyDirection(jelly: Jelly): void {
    // Arriving home as a pair of eyes: rejoin the queue.
    if (jelly.mode === "eaten" && jelly.col === DEN_TILE.col && jelly.row === DEN_TILE.row) {
      jelly.mode = "leaving";
      jelly.dir = "up";
      return;
    }
    // Fully out of the den: join whatever the group is doing.
    if (jelly.mode === "leaving" && jelly.row <= DEN_EXIT_TILE.row) {
      jelly.mode = this.frightenedFor > 0 ? "frightened" : this.currentPhaseMode();
    }

    const target = this.targetFor(jelly);
    const options: Dir[] = [];
    for (const dir of ["up", "left", "down", "right"] as Dir[]) {
      // No reversing -- this is what keeps them committed and readable, and
      // stops them jittering back and forth at a junction.
      if (dir === OPPOSITE[jelly.dir]) continue;
      const v = DIR_VECTORS[dir];
      const c = this.maze.wrapCol(jelly.col + v.dc);
      const r = jelly.row + v.dr;
      if (!this.maze.isOpenForGhost(c, r)) continue;
      // Only the den traffic may use the gate.
      if (
        this.maze.tileAt(c, r) === "gate" &&
        jelly.mode !== "leaving" &&
        jelly.mode !== "eaten"
      ) {
        continue;
      }
      options.push(dir);
    }

    if (options.length === 0) {
      jelly.dir = OPPOSITE[jelly.dir]; // dead end: the one legal reversal
      return;
    }

    if (jelly.mode === "frightened") {
      jelly.dir = options[this.rng.int(0, options.length - 1)] ?? jelly.dir;
      return;
    }

    let best = options[0]!;
    let bestDist = Infinity;
    for (const dir of options) {
      const v = DIR_VECTORS[dir];
      const c = this.maze.wrapCol(jelly.col + v.dc);
      const r = jelly.row + v.dr;
      const dist = (c - target.col) ** 2 + (r - target.row) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = dir;
      }
    }
    jelly.dir = best;
  }

  /** The four personalities. */
  private targetFor(jelly: Jelly): { col: number; row: number } {
    if (jelly.mode === "eaten" || jelly.mode === "leaving") return DEN_TILE;

    const corner = SCATTER_CORNERS[KINDS.indexOf(jelly.kind)] ?? SCATTER_CORNERS[0];
    if (jelly.mode === "scatter") return corner;

    const p = this.player;
    const ahead = (n: number) => {
      const v = DIR_VECTORS[p.dir];
      return { col: p.col + v.dc * n, row: p.row + v.dr * n };
    };

    switch (jelly.kind) {
      case "tailer":
        // Straight at her. Relentless, and the one you learn to feel behind you.
        return { col: p.col, row: p.row };
      case "ambusher":
        // Aims where she's heading, so it cuts corners off ahead of her.
        return ahead(4);
      case "flanker": {
        // Reflects the tailer's position through a point ahead of Riley, so it
        // arrives from the opposite side and pinches her between them.
        const tailer = this.jellies.find((j) => j.kind === "tailer");
        const pivot = ahead(2);
        if (!tailer) return pivot;
        return {
          col: pivot.col * 2 - tailer.col,
          row: pivot.row * 2 - tailer.row,
        };
      }
      case "shy": {
        // Charges from a distance, then loses its nerve and bolts for its
        // corner once it gets close. Gives a younger player an escape valve.
        const dist = Math.hypot(jelly.col - p.col, jelly.row - p.row);
        return dist > 7 ? { col: p.col, row: p.row } : corner;
      }
    }
  }

  // ----- Bonus shell -----

  private updateShell(dt: number): void {
    if (this.shell) {
      this.shell.life -= dt;
      if (this.shell.life <= 0) this.shell = null;
      return;
    }
    this.shellTimer -= dt;
    if (this.shellTimer <= 0) {
      this.shellTimer = this.rng.range(18, 28);
      // Drop it somewhere open and away from the den.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const col = this.rng.int(1, COLS - 2);
        const row = this.rng.int(1, ROWS - 2);
        if (this.maze.isOpenForPlayer(col, row) && Math.abs(row - DEN_TILE.row) > 2) {
          this.shell = { col, row, life: 9 };
          break;
        }
      }
    }
  }

  // ----- Collisions -----

  private checkCollisions(): void {
    const p = this.player;

    if (this.shell && this.shell.col === p.col && this.shell.row === p.row) {
      this.host.addScore(SHELL_POINTS);
      const { x, y } = tileToPixel(this.layout, p.col, p.row);
      this.popups.push({ x, y, text: `+${SHELL_POINTS}`, life: 0.9 });
      this.particles.burst(x, y, "#ffc9de", 14, 70);
      this.host.sfx("extraLife");
      this.shell = null;
    }

    for (const jelly of this.jellies) {
      if (jelly.mode === "den" || jelly.mode === "eaten") continue;
      // Same tile is close enough at this scale, and it avoids the
      // pixel-perfect near-misses that feel unfair.
      if (jelly.col !== p.col || jelly.row !== p.row) continue;

      if (jelly.mode === "frightened") {
        const points = CHAIN_POINTS[Math.min(this.chainIndex, CHAIN_POINTS.length - 1)]!;
        this.chainIndex += 1;
        this.host.addScore(points);
        jelly.mode = "eaten";
        const { x, y } = tileToPixel(this.layout, jelly.col, jelly.row);
        this.popups.push({ x, y, text: `+${points}`, life: 0.9 });
        this.particles.burst(x, y, PALETTE.frightened, 16, 90);
        this.host.sfx("rescue");
        this.host.hitStop(0.04);
      } else {
        this.bump();
        return;
      }
    }
  }

  private bump(): void {
    this.lives -= 1;
    this.phase = "bumped";
    this.phaseTimer = BUMPED_TIME;
    const { x, y } = tileToPixel(this.layout, this.player.col, this.player.row);
    this.particles.burst(x, y, PALETTE.riley, 22, 110);
    this.host.sfx("playerExplode");
    this.host.shake(6);
  }

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const popup = this.popups[i]!;
      popup.life -= dt;
      popup.y -= 22 * dt;
      if (popup.life <= 0) {
        this.popups[i] = this.popups[this.popups.length - 1]!;
        this.popups.pop();
      }
    }
  }

  // ----- Render -----

  render(ctx: CanvasRenderingContext2D): void {
    this.ensureLayout();
    const { w, h } = this.host.view;
    const { tile } = this.layout;

    drawWater(ctx, w, h, this.time);
    drawMaze(ctx, this.maze, this.layout);
    drawItems(ctx, this.maze, this.layout, this.time);

    if (this.shell) {
      const { x, y } = tileToPixel(this.layout, this.shell.col, this.shell.row);
      drawShell(ctx, x, y, tile * 0.32);
    }

    if (this.phase !== "bumped") {
      const pos = this.actorPixel(this.player.col, this.player.row, this.player.dir, this.player.offset);
      drawRiley(ctx, pos.x, pos.y, this.player.dir, this.player.phase, tile * 0.42);
    }

    for (const jelly of this.jellies) {
      const pos = this.actorPixel(jelly.col, jelly.row, jelly.dir, jelly.offset);
      drawJelly(
        ctx,
        pos.x,
        pos.y,
        jelly.kind,
        jelly.mode,
        jelly.dir,
        jelly.phase,
        tile * 0.4,
        this.frightenedFor > 0 && this.frightenedFor < FRIGHTENED_WARN,
      );
    }

    this.particles.render(ctx);
    for (const popup of this.popups) {
      drawPopup(ctx, popup.x, popup.y, popup.text, Math.min(1, popup.life * 2));
    }

    if (this.phase === "ready") this.banner(ctx, "GET READY!");
    if (this.phase === "cleared") this.banner(ctx, "REEF CLEARED!");
    if (this.phase === "bumped") this.banner(ctx, "OOPS!");
  }

  /** Interpolates between tile centres so movement is smooth, not steppy. */
  private actorPixel(col: number, row: number, dir: Dir, offset: number): {
    x: number;
    y: number;
  } {
    const v = DIR_VECTORS[dir];
    const from = tileToPixel(this.layout, col, row);
    // Wrapping mid-tile would fling the sprite across the screen, so the
    // tunnel is interpolated in unwrapped space.
    return {
      x: from.x + v.dc * offset * this.layout.tile,
      y: from.y + v.dr * offset * this.layout.tile,
    };
  }

  private banner(ctx: CanvasRenderingContext2D, text: string): void {
    const { w } = this.host.view;
    const y = this.layout.originY + this.layout.tile * (ROWS * 0.62);
    ctx.save();
    ctx.font = '700 20px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#04182a";
    ctx.strokeText(text, w / 2, y);
    ctx.fillStyle = PALETTE.riley;
    ctx.fillText(text, w / 2, y);
    ctx.restore();
  }

  hud(): HudState {
    return {
      lives: Math.max(0, this.lives),
      progress: this.level,
      progressLabel: "Level",
    };
  }
}

function freshPlayer(): Player {
  return {
    col: START_TILE.col,
    row: START_TILE.row,
    offset: 0,
    dir: "left",
    wanted: "left",
    phase: 0,
  };
}

export const reefModule: GameModule = {
  id: "riley-reef",
  title: "MISS RILEY'S REEF",
  shortTitle: "REEF",
  progressShort: "LV",
  blurb: "Swipe to swim. Eat the bubbles, dodge the jellyfish.",
  accent: "#54e0ff",

  drawIcon(ctx, size) {
    const scale = size / 32;
    ctx.save();
    ctx.scale(scale, scale);
    drawRiley(ctx, 12, 16, "right", 0.2, 7);
    drawJelly(ctx, 25, 14, "tailer", "chase", "left", 0.3, 6, false);
    ctx.restore();
  },

  drawLifeIcon(ctx, highContrast) {
    drawRileyIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new RileysReef(host);
  },
};

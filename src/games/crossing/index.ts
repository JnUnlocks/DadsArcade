/**
 * HIGHWAY HOP -- a frog, a road, and a river.
 *
 * Owes its rules to Frogger, and keeps the ones that are actually the game:
 *
 *   - Movement is stepped, not steered. You commit to a hop and then live with
 *     where it put you. Smooth movement would let you feather your way through
 *     traffic and the whole thing collapses into a dodging game.
 *   - The rule inverts halfway up. On the road, being where something *is*
 *     kills you. On the river, being where something *isn't* kills you, and
 *     the platforms that save you also carry you toward the edge.
 *   - Five burrows to fill, not one crossing. Having to go back out and do it
 *     again -- with the easy columns already used up -- is what makes a level
 *     a level.
 *
 * What it deliberately changes, for a seven-year-old and a phone:
 *
 *   - No countdown that kills you. Frogger's timer is a second way to lose
 *     that you can't see coming; here the clock only drains a bonus you were
 *     never owed. Same reason to hurry, nothing taken away.
 *   - Getting hit bounces you back to the kerb with X eyes and a squeak.
 *     Nothing in this arcade dies -- the reef set that rule.
 *   - Tap to hop forward. Crossing is nearly all forward motion, and asking a
 *     child to swipe up forty times is a worse control scheme than a tap.
 */

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { Rng } from "../../core/rng.ts";
import { buildLanes } from "./lanes.ts";
import {
  drawBurrow,
  drawCrossingIcon,
  drawFrog,
  drawFrogLifeIcon,
  drawOccupant,
  drawRowBackground,
  PALETTE,
} from "./render.ts";
import {
  COLS,
  DIR_VECTORS,
  HOME_COLS,
  HOME_ROW,
  occupantPositions,
  overlapsOccupant,
  platformUnder,
  ROWS,
  rowKind,
  START_ROW,
  type Dir,
  type Lane,
} from "./types.ts";

/*
 * Five, not the arcade-standard three.
 *
 * A level here is five crossings of ten hazard lanes -- about fifty risky
 * landings -- where a reef level is one maze. On three lives that needs a
 * ~96% per-landing success rate to clear level 1, which an adult who grew up
 * on this genre can manage and a seven-year-old meeting a new control scheme
 * cannot. Three lives meant Riley would never once hear the level-clear
 * jingle. Clearing a level hands one back, capped, so a good run compounds.
 */
const START_LIVES = 5;
const MAX_LIVES = 5;

/** Seconds a single hop takes. Short enough to feel responsive, long enough to read. */
const HOP_SECONDS = 0.13;

/** How long the frog sits stunned before being put back on the kerb. */
const STUN_SECONDS = 0.9;

/**
 * A beat at the start of a level before the board is live.
 *
 * Dropping straight into moving traffic with input already armed is how you
 * lose a life to the loading screen. The reef opens the same way.
 */
const READY_SECONDS = 1.1;

/** Points for reaching a row further up than you've ever been this life. */
const ROW_POINTS = 10;
const HOME_POINTS = 60;
const LEVEL_POINTS = 800;

/** Seconds before the per-crossing time bonus is gone. Generous on purpose. */
const CROSSING_PAR = 22;
const TIME_BONUS = 120;

/** Drag distance, in virtual units, that counts as a swipe. */
const SWIPE_THRESHOLD = 16;

type Phase = "hopping" | "idle" | "stunned" | "celebrating" | "ready";

interface Frog {
  /** Continuous, because riding a log moves you between columns. */
  col: number;
  row: number;
  facing: Dir;
  /** Interpolation source for the current hop. */
  fromCol: number;
  fromRow: number;
  hop: number;
}

export class HighwayHop implements GameInstance {
  private readonly particles = new Particles();
  private rng = new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  private lanes: Lane[] = [];
  private level = 1;
  private lives = START_LIVES;
  // The very first level gets the same beat every later one does.
  private phase: Phase = "ready";

  private frog: Frog = {
    col: (COLS - 1) / 2,
    row: START_ROW,
    facing: "up",
    fromCol: (COLS - 1) / 2,
    fromRow: START_ROW,
    hop: 1,
  };

  /** Which burrows are filled this level. */
  private filled = new Set<number>();
  /** Highest row reached this life, for the once-per-row score. */
  private best = START_ROW;

  private time = 0;
  private stunTimer = 0;
  private celebrateTimer = 0;
  private readyTimer = READY_SECONDS;
  private crossingElapsed = 0;
  private swipeX = 0;
  private swipeY = 0;
  /** Last frame's keyboard axes, so a held key doesn't repeat-fire. */
  private prevAxisX = 0;
  private prevAxisY = 0;
  private banner = "";
  private bannerTimer = 0;

  private readonly host: GameHost;

  // Assigned explicitly rather than via a parameter property, so this module
  // stays readable by Node's built-in TypeScript stripping -- which is what
  // runs the tests, and which rules.test.ts needs in order to drive the game
  // headlessly. core/loop.ts does the same, for the same reason.
  constructor(host: GameHost) {
    this.host = host;
    this.lanes = buildLanes(this.rng, this.level);
    this.banner = "GET READY";
    this.bannerTimer = READY_SECONDS;
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.bannerTimer > 0) this.bannerTimer -= dt;

    if (this.phase === "ready") {
      // Traffic still moves, so the player can read the lanes before the
      // board goes live -- that reading time is the point of the beat.
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) {
        this.phase = "idle";
        this.banner = "";
      }
      return;
    }

    if (this.phase === "stunned") {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) this.respawn();
      return;
    }

    if (this.phase === "celebrating") {
      this.celebrateTimer -= dt;
      if (this.celebrateTimer <= 0) this.startLevel(this.level + 1);
      return;
    }

    this.crossingElapsed += dt;

    if (this.phase === "hopping") {
      this.frog.hop += dt / HOP_SECONDS;
      if (this.frog.hop >= 1) {
        this.frog.hop = 1;
        this.phase = "idle";
        this.land();
      }
    }

    this.ride(dt);
    this.readInput(input);
    this.checkHazards();
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { view, settings } = this.host;
    const { x0, y0, cell } = this.layout();

    for (let row = 0; row < ROWS; row += 1) {
      const y = y0 + row * cell;
      drawRowBackground(
        ctx,
        rowKind(row),
        x0,
        y,
        cell * COLS,
        cell,
        row,
        this.time,
        settings.reducedMotion,
      );
    }

    // Burrows.
    for (let i = 0; i < HOME_COLS.length; i += 1) {
      drawBurrow(
        ctx,
        x0 + (HOME_COLS[i]! + 0.5) * cell,
        y0 + (HOME_ROW + 0.5) * cell,
        cell,
        this.filled.has(i),
        this.time,
        settings.reducedMotion,
      );
    }

    // Traffic and platforms.
    for (let row = 0; row < ROWS; row += 1) {
      const lane = this.lanes[row];
      if (!lane) continue;
      const y = y0 + row * cell;
      for (const cx of occupantPositions(lane, this.time)) {
        drawOccupant(ctx, lane, x0 + cx * cell, y, lane.width * cell, cell);
      }
    }

    // The frog, interpolated through its hop.
    const eased = easeOutQuad(this.frog.hop);
    const col = this.frog.fromCol + (this.frog.col - this.frog.fromCol) * eased;
    const row = this.frog.fromRow + (this.frog.row - this.frog.fromRow) * eased;
    drawFrog(
      ctx,
      x0 + (col + 0.5) * cell,
      y0 + (row + 0.5) * cell,
      cell * 0.86,
      this.frog.facing,
      this.phase === "hopping" ? this.frog.hop : 0,
      this.phase === "stunned",
    );

    this.particles.render(ctx);

    if (this.bannerTimer > 0 && this.banner) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8f0ff";
      ctx.font = "700 16px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(this.banner, view.w / 2, y0 - 12);
      ctx.restore();
    }
  }

  hud(): HudState {
    return {
      lives: this.lives,
      progress: this.level,
      progressLabel: "Level",
    };
  }

  // ----- Layout -----

  private layout(): { x0: number; y0: number; cell: number } {
    const { view } = this.host;
    // Width-first: nine columns across the playfield, with the board centred
    // in whatever height is left between the HUD and the bottom inset.
    const cell = Math.min(
      view.w / COLS,
      (view.h - view.insetTop - view.insetBottom - 74) / ROWS,
    );
    const boardH = cell * ROWS;
    return {
      x0: (view.w - cell * COLS) / 2,
      y0: view.insetTop + 56 + (view.h - view.insetTop - view.insetBottom - 56 - boardH) / 2,
      cell,
    };
  }

  // ----- Input -----

  private readInput(input: InputSnapshot): void {
    if (this.phase !== "idle") return;

    // Accumulate drag with decay, the same way the reef reads swipes: a single
    // frame's movement is far too small to classify.
    this.swipeX += input.dragX;
    this.swipeY += input.dragY;
    const decay = 0.86;
    this.swipeX *= decay;
    this.swipeY *= decay;

    if (Math.abs(this.swipeX) > SWIPE_THRESHOLD || Math.abs(this.swipeY) > SWIPE_THRESHOLD) {
      const dir: Dir =
        Math.abs(this.swipeX) > Math.abs(this.swipeY)
          ? this.swipeX > 0
            ? "right"
            : "left"
          : this.swipeY > 0
            ? "down"
            : "up";
      this.swipeX = 0;
      this.swipeY = 0;
      this.tryHop(dir);
      return;
    }

    // Keyboard axes are a level, not an edge: they stay set for as long as the
    // key is down. Acting on the level directly would machine-gun the frog
    // across the board for anyone who simply holds Up -- which is both trivial
    // and lethal. One hop per press, so a key has to be released and pressed
    // again, which is what makes the movement genuinely stepped.
    const axisX = Math.sign(input.axisX);
    const axisY = Math.sign(input.axisY);
    const pressedX = axisX !== 0 && axisX !== this.prevAxisX;
    const pressedY = axisY !== 0 && axisY !== this.prevAxisY;
    this.prevAxisX = axisX;
    this.prevAxisY = axisY;

    if (pressedY) return this.tryHop(axisY < 0 ? "up" : "down");
    if (pressedX) return this.tryHop(axisX < 0 ? "left" : "right");

    // A tap with no meaningful drag hops forward. Crossing is almost all
    // forward motion and swiping up forty times is a worse control scheme.
    if (input.justPressed && Math.abs(this.swipeX) + Math.abs(this.swipeY) < 4) {
      this.tryHop("up");
    }
  }

  private tryHop(dir: Dir): void {
    if (this.phase !== "idle") return;

    const vec = DIR_VECTORS[dir];
    const targetRow = this.frog.row + vec.row;

    /*
     * Keep the fractional column when landing in the river; snap to the grid
     * everywhere else.
     *
     * Rounding unconditionally meant "up" wasn't up. Riding a log at column
     * 3.6 and hopping straight up put the frog down at 4.0 -- a drift of
     * nearly half a cell, in a direction the player never asked for and
     * couldn't see coming, onto a target that is itself moving. It made the
     * river read as arbitrary, and it was: the river was killing twice as
     * often as the road, and this was why.
     *
     * Snapping on the way out keeps the land half tidily grid-aligned, which
     * is what makes burrow entry and road lanes feel exact.
     */
    const raw = this.frog.col + vec.col;
    const targetCol = rowKind(targetRow) === "river" ? raw : Math.round(raw);

    this.frog.facing = dir;

    // The kerb is the floor and the burrow row is the ceiling.
    if (targetRow > START_ROW || targetRow < HOME_ROW) return;
    if (targetCol < 0 || targetCol > COLS - 1) return;

    /*
     * You cannot hop into the bank between burrows, or into one already
     * filled -- the hop is simply refused.
     *
     * The original kills you for this, and it is the cruellest death it has:
     * you survive five lanes of traffic and five lanes of river, and then lose
     * the life at the moment of greatest investment for being one column off.
     * Measured against a solver it was the single biggest killer in the game.
     *
     * Refusing the hop instead doesn't make the top row free, because row 1 is
     * river -- you line up while riding a moving log, which is exactly where
     * the tension belonged in the first place.
     */
    if (targetRow === HOME_ROW && this.openBurrowAt(targetCol) === -1) {
      this.host.sfx("uiMove");
      return;
    }

    this.frog.fromCol = this.frog.col;
    this.frog.fromRow = this.frog.row;
    this.frog.col = targetCol;
    this.frog.row = targetRow;
    this.frog.hop = 0;
    this.phase = "hopping";
    this.host.sfx("frogHop");
  }

  // ----- Simulation -----

  /** Being carried by whatever you're standing on. */
  private ride(dt: number): void {
    const lane = this.lanes[this.frog.row];
    if (!lane || lane.kind !== "river") return;
    if (this.phase === "hopping") return;

    if (platformUnder(lane, this.time, this.frog.col) !== null) {
      this.frog.col += lane.dir * lane.speed * dt;
      this.frog.fromCol = this.frog.col;
    }
  }

  private land(): void {
    // Score each new row once per life, so hopping back and forth on the kerb
    // can't farm points.
    if (this.frog.row < this.best) {
      this.host.addScore(ROW_POINTS * (this.best - this.frog.row));
      this.best = this.frog.row;
    }

    if (this.frog.row === HOME_ROW) this.tryEnterBurrow();
  }

  /** Index of an open burrow at this column, or -1. */
  private openBurrowAt(col: number): number {
    const index = HOME_COLS.findIndex((c) => Math.abs(c - col) < 0.6);
    return index === -1 || this.filled.has(index) ? -1 : index;
  }

  private tryEnterBurrow(): void {
    // tryHop refuses any move onto the burrow row that isn't an open burrow,
    // so by here there is always one.
    const index = this.openBurrowAt(this.frog.col);
    if (index === -1) return;

    this.filled.add(index);
    const bonus = Math.round(
      TIME_BONUS * Math.max(0, 1 - this.crossingElapsed / CROSSING_PAR),
    );
    this.host.addScore(HOME_POINTS + bonus);
    this.host.sfx("frogHome");

    const { x0, y0, cell } = this.layout();
    this.particles.burst(
      x0 + (HOME_COLS[index]! + 0.5) * cell,
      y0 + 0.5 * cell,
      PALETTE.homeOpen,
      18,
      90,
    );

    if (this.filled.size === HOME_COLS.length) {
      this.host.addScore(LEVEL_POINTS);
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
      this.host.sfx("levelClear");
      this.say(`LEVEL ${this.level} CLEAR`);
      this.phase = "celebrating";
      this.celebrateTimer = 1.6;
      return;
    }

    this.say(bonus > 0 ? `HOME  +${HOME_POINTS + bonus}` : "HOME");
    this.resetFrog();
  }

  private checkHazards(): void {
    if (this.phase !== "idle") return;

    const row = this.frog.row;
    const lane = this.lanes[row];
    if (!lane) return;

    if (lane.kind === "road") {
      if (overlapsOccupant(lane, this.time, this.frog.col)) {
        this.strike("OOPS!");
      }
      return;
    }

    if (lane.kind === "river") {
      // Carried off the side counts as the water taking you, which is what
      // stops riding a log being a free ride to the top.
      if (this.frog.col < -0.4 || this.frog.col > COLS - 0.6) {
        this.strike("SWEPT AWAY");
        return;
      }
      if (platformUnder(lane, this.time, this.frog.col) === null) {
        this.strike("SPLASH!");
      }
    }
  }

  private strike(reason: string): void {
    this.phase = "stunned";
    this.stunTimer = STUN_SECONDS;
    this.lives -= 1;
    this.say(reason);
    this.host.sfx("frogSplat");
    this.host.shake(4);

    const { x0, y0, cell } = this.layout();
    this.particles.burst(
      x0 + (this.frog.col + 0.5) * cell,
      y0 + (this.frog.row + 0.5) * cell,
      this.lanes[this.frog.row]?.kind === "river" ? "#7fc7ff" : PALETTE.frog,
      14,
      70,
    );
  }

  private respawn(): void {
    if (this.lives <= 0) {
      this.host.gameOver({ progress: this.level, progressLabel: "Level" });
      return;
    }
    this.resetFrog();
  }

  private resetFrog(): void {
    this.frog.col = (COLS - 1) / 2;
    this.frog.row = START_ROW;
    this.frog.fromCol = this.frog.col;
    this.frog.fromRow = this.frog.row;
    this.frog.facing = "up";
    this.frog.hop = 1;
    this.best = START_ROW;
    this.crossingElapsed = 0;
    this.swipeX = 0;
    this.swipeY = 0;
    this.phase = "idle";
  }

  /** Forget held keys, so resuming or respawning doesn't fire a stale hop. */
  onResume(): void {
    this.prevAxisX = 0;
    this.prevAxisY = 0;
    this.swipeX = 0;
    this.swipeY = 0;
  }

  private startLevel(level: number): void {
    this.level = level;
    this.lanes = buildLanes(this.rng, level);
    this.filled.clear();
    this.resetFrog();
    this.phase = "ready";
    this.readyTimer = READY_SECONDS;
    this.say(`LEVEL ${level}  ·  GET READY`);
  }

  private say(text: string): void {
    this.banner = text;
    this.bannerTimer = 1.5;
  }
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export const crossingModule: GameModule = {
  id: "highway-hop",
  title: "HIGHWAY HOP",
  blurb: "Tap to hop. Cross the road, ride the logs, fill all five burrows.",
  accent: "#7ddc4f",

  drawIcon(ctx, size) {
    drawCrossingIcon(ctx, size);
  },

  drawLifeIcon(ctx, highContrast) {
    drawFrogLifeIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new HighwayHop(host);
  },
};

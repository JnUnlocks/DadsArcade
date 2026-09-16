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
} from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Particles } from "../../core/particles";
import { Rng } from "../../core/rng";
import { buildLanes } from "./lanes";
import {
  drawBurrow,
  drawCrossingIcon,
  drawFrog,
  drawFrogLifeIcon,
  drawOccupant,
  drawRowBackground,
  PALETTE,
} from "./render";
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
} from "./types";

const START_LIVES = 3;

/** Seconds a single hop takes. Short enough to feel responsive, long enough to read. */
const HOP_SECONDS = 0.13;

/** How long the frog sits stunned before being put back on the kerb. */
const STUN_SECONDS = 0.9;

/** Points for reaching a row further up than you've ever been this life. */
const ROW_POINTS = 10;
const HOME_POINTS = 60;
const LEVEL_POINTS = 800;

/** Seconds before the per-crossing time bonus is gone. Generous on purpose. */
const CROSSING_PAR = 22;
const TIME_BONUS = 120;

/** Drag distance, in virtual units, that counts as a swipe. */
const SWIPE_THRESHOLD = 16;

type Phase = "hopping" | "idle" | "stunned" | "celebrating";

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
  private phase: Phase = "idle";

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
  private crossingElapsed = 0;
  private swipeX = 0;
  private swipeY = 0;
  /** Last frame's keyboard axes, so a held key doesn't repeat-fire. */
  private prevAxisX = 0;
  private prevAxisY = 0;
  private banner = "";
  private bannerTimer = 0;

  constructor(private readonly host: GameHost) {
    this.lanes = buildLanes(this.rng, this.level);
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.bannerTimer > 0) this.bannerTimer -= dt;

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
    const targetCol = Math.round(this.frog.col) + vec.col;

    this.frog.facing = dir;

    // The kerb is the floor and the burrow row is the ceiling.
    if (targetRow > START_ROW || targetRow < HOME_ROW) return;
    if (targetCol < 0 || targetCol > COLS - 1) return;

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

  private tryEnterBurrow(): void {
    const index = HOME_COLS.findIndex(
      (c) => Math.abs(c - this.frog.col) < 0.6,
    );

    // Missing a burrow is the one way the top row hurts: you're in the bank,
    // not in a hole.
    if (index === -1 || this.filled.has(index)) {
      this.strike("MISSED THE BURROW");
      return;
    }

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
        this.strike("SQUASHED!");
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
    this.say(`LEVEL ${level}`);
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

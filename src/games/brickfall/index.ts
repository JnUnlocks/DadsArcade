/**
 * BRICKFALL -- twenty-five levels of falling blocks.
 *
 * Owes its rules to the falling-block puzzle genre, and is careful about where
 * it gets them from. Tetris Holding v. Xio Interactive (2012) is the one case
 * in this whole arcade's lineage where a clone actually lost: the court agreed
 * that game *rules* are free to use, then found against the clone for copying
 * protectable *expression* -- the distinctive piece colours and overall look.
 * So the mechanics here are the genre's, and everything you can see or hear is
 * this arcade's own. See the notes in pieces.ts and core/music.ts.
 *
 * What the genre gets right, and is kept:
 *
 *   - Pieces come from a shuffled bag of all seven, not from a uniform roll.
 *     Waiting twenty pieces for a straight one isn't difficulty, it's a grudge.
 *   - Four rows at once is worth more than four singles, which is the only
 *     reason to build a well and wait instead of shaving the top.
 *   - Rotation kicks off walls and off the stack, so a piece in a tight spot
 *     turns instead of refusing, which otherwise reads as broken controls.
 *
 * Tuned for this family:
 *
 *   - Twenty-five levels, geometric from a very generous 0.9s a row down to
 *     0.05s, every level measurably different from the one before.
 *   - A lock delay, so a piece that lands next to a gap can still be slid into
 *     it. Without one, the last fraction of a second before a piece sets is
 *     pure punishment for being slow.
 *   - The landing guide is on permanently. An adult counts columns; a
 *     seven-year-old should be able to see where the piece is going.
 */

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { KOROBEINIKI } from "../../core/music.ts";
import { Particles } from "../../core/particles.ts";
import { Rng } from "../../core/rng.ts";
import {
  clearLines,
  COLS,
  dropDistance,
  emptyGrid,
  fallInterval,
  fits,
  levelForLines,
  linesUntilNextLevel,
  lineScore,
  MAX_LEVEL,
  ROWS,
  settle,
  SPAWN_ROWS,
  type Grid,
  type Piece,
} from "./board.ts";
import {
  cellsFor,
  kickOffsets,
  PIECE_COLOURS,
  refillBag,
  type PieceKind,
} from "./pieces.ts";
import {
  drawBrickfallIcon,
  drawBlockLifeIcon,
  drawGrid,
  drawLandingGuide,
  drawPanel,
  drawPiece,
  drawWell,
  type Layout,
} from "./render.ts";

/**
 * How long a landed piece can still be nudged before it sets.
 *
 * The single most important kindness in the genre. Without it, the instant a
 * piece touches down it is frozen, and every "I could see the gap and couldn't
 * reach it" moment is a rule rather than a mistake.
 */
const LOCK_DELAY = 0.5;

/** Rows a piece may be slid along after landing before it sets regardless. */
const MAX_LOCK_RESETS = 8;

/** Virtual units of horizontal drag that move the piece one column. */
const DRAG_PER_CELL = 13;

/** Drag during one touch that still counts as a tap (a rotate) rather than a swipe. */
const TAP_MAX_DRAG = 10;

/** Downward drag, in units, that soft-drops one row. */
const DRAG_PER_SOFT_DROP = 16;

/** How long cleared rows flash before the stack falls. */
const CLEAR_FLASH = 0.32;

const SOFT_DROP_POINTS = 1;
const HARD_DROP_POINTS = 2;

type Phase = "falling" | "clearing" | "over";

export class Brickfall implements GameInstance {
  private readonly host: GameHost;
  private readonly particles = new Particles();
  private readonly rng = new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  private grid: Grid = emptyGrid();
  private bag: PieceKind[] = [];
  private piece: Piece;
  private next: PieceKind;

  private phase: Phase = "falling";
  private level = 1;
  private lines = 0;
  private fallTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private landed = false;

  private clearing: number[] = [];
  private clearTimer = 0;

  // Gesture state.
  private dragX = 0;
  private dragY = 0;
  private touchDrag = 0;
  private wasPointerDown = false;
  private prevAxisX = 0;
  private prevAxisY = 0;
  private prevFire = false;

  private banner = "";
  private bannerTimer = 0;

  constructor(host: GameHost) {
    this.host = host;
    this.next = this.draw();
    this.piece = this.spawn();
    this.host.playMusic(KOROBEINIKI);
    // Say the goal once, up front, in plain words.
    this.say(`CLEAR ${linesUntilNextLevel(0)} LINES TO LEVEL UP`);
    this.bannerTimer = 3;
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    this.particles.update(dt);

    if (this.phase === "over") return;

    if (this.phase === "clearing") {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.finishClear();
      return;
    }

    this.readInput(input);
    this.applyGravity(dt);
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { settings } = this.host;
    const layout = this.layout();

    drawWell(ctx, layout);
    drawGrid(
      ctx,
      layout,
      this.grid,
      new Set(this.clearing),
      // Flashing rows blink twice across the clear window.
      this.phase === "clearing" && Math.floor(this.clearTimer * 12) % 2 === 0,
    );

    if (this.phase === "falling") {
      drawLandingGuide(ctx, layout, this.piece, dropDistance(this.grid, this.piece));
      drawPiece(ctx, layout, this.piece, this.landed ? 0.75 : 1);
    }

    drawPanel(
      ctx,
      layout,
      this.next,
      this.level,
      MAX_LEVEL,
      this.lines,
      linesUntilNextLevel(this.lines),
      settings.largeText,
    );

    this.particles.render(ctx);

    if (this.bannerTimer > 0 && this.banner) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffc14d";
      ctx.font = "700 15px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(this.banner, layout.x0 + (layout.cell * COLS) / 2, layout.y0 - 10);
      ctx.restore();
    }
  }

  hud(): HudState {
    // No lives in this genre; the well filling up is the whole failure state.
    return { lives: 0, progress: this.level, progressLabel: "Level" };
  }

  /** A hard-drop button, because the gesture for it is the least discoverable. */
  extraControls(): HTMLElement {
    const button = document.createElement("button");
    button.className = "drop-btn";
    button.textContent = "DROP";
    button.setAttribute("aria-label", "Hard drop");
    button.addEventListener("click", () => this.hardDrop());
    return button;
  }

  onPause(): void {
    this.resetGestures();
  }

  onResume(): void {
    this.resetGestures();
  }

  destroy(): void {
    this.host.stopMusic();
  }

  // ----- Layout -----

  private layout(): Layout {
    const { view } = this.host;
    const panelW = 76;
    const top = view.insetTop + 62;
    const bottom = view.insetBottom + 76; // room for the DROP button
    const cell = Math.min(
      (view.w - panelW - 16) / COLS,
      (view.h - top - bottom) / ROWS,
    );
    const wellW = cell * COLS;
    const totalW = wellW + 10 + panelW;
    const x0 = Math.max(6, (view.w - totalW) / 2);
    return {
      x0,
      y0: top + (view.h - top - bottom - cell * ROWS) / 2,
      cell,
      panelX: x0 + wellW + 10,
    };
  }

  // ----- Pieces -----

  private draw(): PieceKind {
    if (this.bag.length === 0) {
      this.bag = refillBag((items) => {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = this.rng.int(0, i);
          const a = copy[i]!;
          copy[i] = copy[j]!;
          copy[j] = a;
        }
        return copy;
      });
    }
    return this.bag.pop()!;
  }

  private spawn(): Piece {
    const kind = this.next;
    this.next = this.draw();
    this.landed = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.fallTimer = 0;

    // Spawn above the lip so a piece is never drawn half-embedded in the wall
    // of the well on the frame it appears.
    const piece: Piece = { kind, rotation: 0, col: 3, row: 0 };

    if (!fits(this.grid, piece)) {
      this.phase = "over";
      this.host.stopMusic();
      this.host.sfx("playerExplode");
      this.host.gameOver({ progress: this.level, progressLabel: "Level" });
    }
    return piece;
  }

  // ----- Input -----

  private resetGestures(): void {
    this.dragX = 0;
    this.dragY = 0;
    this.touchDrag = 0;
    this.wasPointerDown = false;
    this.prevAxisX = 0;
    this.prevAxisY = 0;
    this.prevFire = false;
  }

  private readInput(input: InputSnapshot): void {
    const released = this.wasPointerDown && !input.pointerDown;
    this.wasPointerDown = input.pointerDown;

    if (input.pointerDown) {
      this.touchDrag += Math.abs(input.dragX) + Math.abs(input.dragY);
      this.dragX += input.dragX;
      this.dragY += input.dragY;
    }

    // Dragging moves the piece a column at a time rather than a swipe firing a
    // single step: on a board this wide you often want to travel four or five
    // columns, and five separate swipes to do it is exhausting.
    while (Math.abs(this.dragX) >= DRAG_PER_CELL) {
      const dir = this.dragX > 0 ? 1 : -1;
      this.dragX -= dir * DRAG_PER_CELL;
      this.move(dir);
    }

    while (this.dragY >= DRAG_PER_SOFT_DROP) {
      this.dragY -= DRAG_PER_SOFT_DROP;
      this.softDrop();
    }
    if (this.dragY < 0) this.dragY = 0; // upward drag isn't a control

    if (released) {
      // A touch that never became a drag is a tap, and a tap rotates.
      if (this.touchDrag < TAP_MAX_DRAG) this.rotate();
      this.touchDrag = 0;
      this.dragX = 0;
      this.dragY = 0;
    }

    // Keyboard axes are levels, not edges -- act on the change or a held key
    // machine-guns the piece across the well.
    const axisX = Math.sign(input.axisX);
    const axisY = Math.sign(input.axisY);
    if (axisX !== 0 && axisX !== this.prevAxisX) this.move(axisX);
    if (axisY > 0 && axisY !== this.prevAxisY) this.softDrop();
    if (axisY < 0 && axisY !== this.prevAxisY) this.rotate();
    this.prevAxisX = axisX;
    this.prevAxisY = axisY;

    // Space is hard drop. Edge-triggered: autofire makes `firing` a level that
    // is permanently true, so using it directly would slam every piece down
    // the instant it spawned.
    if (input.firePressed && !this.prevFire) this.hardDrop();
    this.prevFire = input.firePressed;
  }

  // ----- Moves -----

  private move(dir: number): void {
    if (this.phase !== "falling") return;
    const moved = { ...this.piece, col: this.piece.col + dir };
    if (!fits(this.grid, moved)) return;
    this.piece = moved;
    this.host.sfx("pieceMove");
    this.touchLock();
  }

  private rotate(): void {
    if (this.phase !== "falling") return;
    const rotation = (this.piece.rotation + 1) % 4;

    for (const [dc, dr] of kickOffsets()) {
      const candidate = {
        ...this.piece,
        rotation,
        col: this.piece.col + dc,
        row: this.piece.row + dr,
      };
      if (fits(this.grid, candidate)) {
        this.piece = candidate;
        this.host.sfx("pieceRotate");
        this.touchLock();
        return;
      }
    }
  }

  private softDrop(): void {
    if (this.phase !== "falling") return;
    const moved = { ...this.piece, row: this.piece.row + 1 };
    if (!fits(this.grid, moved)) return;
    this.piece = moved;
    this.fallTimer = 0;
    this.host.addScore(SOFT_DROP_POINTS);
  }

  private hardDrop(): void {
    if (this.phase !== "falling") return;
    const distance = dropDistance(this.grid, this.piece);
    this.piece = { ...this.piece, row: this.piece.row + distance };
    this.host.addScore(distance * HARD_DROP_POINTS);
    this.host.sfx("pieceLand");
    this.lockPiece();
  }

  /**
   * Restart the lock countdown after a successful nudge.
   *
   * Capped, or a piece could be slid back and forth on the floor forever and
   * the well would never fill.
   */
  private touchLock(): void {
    if (!this.landed) return;
    if (this.lockResets >= MAX_LOCK_RESETS) return;
    this.lockResets += 1;
    this.lockTimer = 0;
  }

  // ----- Gravity -----

  private applyGravity(dt: number): void {
    const resting = !fits(this.grid, { ...this.piece, row: this.piece.row + 1 });

    if (resting) {
      if (!this.landed) {
        this.landed = true;
        this.lockTimer = 0;
        this.host.sfx("pieceLand");
      }
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
      return;
    }

    this.landed = false;
    this.fallTimer += dt;
    const interval = fallInterval(this.level);
    while (this.fallTimer >= interval) {
      this.fallTimer -= interval;
      const moved = { ...this.piece, row: this.piece.row + 1 };
      if (!fits(this.grid, moved)) break;
      this.piece = moved;
    }
  }

  private lockPiece(): void {
    settle(this.grid, this.piece);

    const full: number[] = [];
    for (let row = 0; row < this.grid.length; row += 1) {
      if (this.grid[row]!.every((cell) => cell !== null)) full.push(row);
    }

    if (full.length === 0) {
      this.piece = this.spawn();
      return;
    }

    this.clearing = full;
    this.clearTimer = CLEAR_FLASH;
    this.phase = "clearing";
    this.host.sfx(full.length >= 4 ? "fourLines" : "lineClear");
    if (full.length >= 4) this.host.shake(5);

    const layout = this.layout();
    for (const row of full) {
      this.particles.burst(
        layout.x0 + (layout.cell * COLS) / 2,
        layout.y0 + (row - SPAWN_ROWS + 0.5) * layout.cell,
        PIECE_COLOURS[this.piece.kind],
        16,
        110,
      );
    }
  }

  private finishClear(): void {
    const { grid } = clearLines(this.grid);
    this.grid = grid;

    const count = this.clearing.length;
    this.clearing = [];
    this.lines += count;
    this.host.addScore(lineScore(count, this.level));

    const nextLevel = levelForLines(this.lines);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.host.sfx("levelUp");
      this.say(this.level >= MAX_LEVEL ? "MAX LEVEL!" : `LEVEL ${this.level}`);
      // The music tightens as the climb steepens -- the cheapest way to make a
      // board feel like it's closing in.
      this.host.setMusicTempo(1 + (this.level - 1) * 0.028);
    } else if (count >= 4) {
      this.say("FOUR ROWS!");
    }

    this.phase = "falling";
    this.piece = this.spawn();
  }

  private say(text: string): void {
    this.banner = text;
    this.bannerTimer = 1.4;
  }
}

export const brickfallModule: GameModule = {
  id: "brickfall",
  title: "BRICKFALL",
  progressShort: "LV",
  blurb: "Drag to slide, tap to turn. Fill a row to clear it. 25 levels.",
  accent: "#8e7bff",

  drawIcon(ctx, size) {
    drawBrickfallIcon(ctx, size);
  },

  drawLifeIcon(ctx, highContrast) {
    drawBlockLifeIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new Brickfall(host);
  },
};

export { cellsFor };

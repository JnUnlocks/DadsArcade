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
 *
 * Two ways to play, chosen on the way in:
 *
 *   CLASSIC      Brickfall as it has always been, untouched: the same rules,
 *                the same scoring, and the board its high scores were set on.
 *
 *   BRICK BLAST  The same well and the same pieces with a lot more going on.
 *                Rows break apart, the points float up, the score counts up
 *                to meet them and the phone buzzes. Clearing with piece after
 *                piece builds a combo, and emptying the well is an ALL CLEAR.
 *                Those bonuses mean its scores aren't the same kind of number
 *                as a Classic score, so it keeps a board of its own. See
 *                blast.ts.
 */

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
  StartOptions,
} from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { KOROBEINIKI } from "../../core/music.ts";
import { Particles } from "../../core/particles.ts";
import { Rng } from "../../core/rng.ts";
import { loadBests } from "../../core/storage.ts";
import { BlastFx } from "./blast.ts";
import {
  boardClearBonus,
  clearLines,
  COLS,
  comboBonus,
  dropDistance,
  dropPerRow,
  emptyAfterClear,
  emptyGrid,
  fallInterval,
  fits,
  levelForLines,
  linesUntilNextLevel,
  lineScore,
  MAX_LEVEL,
  occupiedCells,
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
  drawTitleCard,
  drawWell,
  type BlockLook,
  type Layout,
} from "./render.ts";
import "./brickfall.css";

const GAME_ID = "brickfall";

type Mode = "classic" | "blast";

/** Brick Blast runs are filed here, apart from the Classic board. */
export const BLAST_BOARD = "blast";
const MODE_KEY = "hyperdrive.brickfall.mode";

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

/** CLASSIC: how long cleared rows flash before the stack falls. */
const CLEAR_FLASH = 0.32;

/** BRICK BLAST: how long a blast takes, from the piece setting to the stack falling. */
const CLEAR_TIME = 0.4;

/**
 * Seconds the blast takes to cross one column, and to step down one row.
 *
 * It starts under the piece that set it off and runs out to both walls, so
 * the bricks break in a wave rather than all on the same frame. Across the
 * full width that is under a quarter of a second: quick enough that the next
 * piece is never kept waiting on a firework.
 */
const BLAST_PER_COL = 0.022;
const BLAST_PER_ROW = 0.035;

/** How long the stack takes to fall into the space the rows left. */
const STACK_DROP_TIME = 0.14;

/** How long the rim of the well stays lit after a big moment. */
const GLOW_TIME = 0.7;

/** What a clear is called, by how many rows went at once. */
const SHOUTS = ["", "NICE!", "GREAT!", "AWESOME!", "BRICK BLAST!"] as const;
const SHOUT_COLOURS = ["", "#46e0ff", "#3ddc97", "#ffc14d", "#ff5fae"] as const;

/** The phone's part in it, by rows: a tick for one, a drum roll for four. */
const CLEAR_BUZZ: ReadonlyArray<number | readonly number[]> = [
  0,
  20,
  35,
  [40, 40, 70],
  [70, 50, 70, 50, 160],
];

const SOFT_DROP_POINTS = 1;
const HARD_DROP_POINTS = 2;

type Phase = "choosing" | "falling" | "clearing" | "over";

export class Brickfall implements GameInstance {
  private readonly host: GameHost;
  private readonly particles = new Particles();
  private readonly root: HTMLElement;
  private mode: Mode = loadLastMode();
  private readonly rng = new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  private grid: Grid = emptyGrid();
  private bag: PieceKind[] = [];
  private piece: Piece;
  private next: PieceKind;

  private phase: Phase = "choosing";
  private level = 1;
  private lines = 0;
  private fallTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private landed = false;

  private clearing: number[] = [];
  private clearTimer = 0;

  // The blast. Only BRICK BLAST sets any of it going.
  private readonly fx = new BlastFx();
  /** Pieces in a row that have each cleared something. */
  private combo = 0;
  private blastElapsed = 0;
  private blastOrigin = COLS / 2;
  private readonly blasted = new Set<number>();
  private stackDrops: number[] = [];
  private stackDropTimer = 0;
  private glowColour = "#ffffff";
  private glowTimer = 0;

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

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.root = document.createElement("div");
    this.root.className = "brickfall-root";
    this.next = this.draw();
    this.piece = this.spawn();
    // PLAY AGAIN goes straight back into the mode just played; opening the
    // cabinet asks which.
    if (start?.again) this.begin(this.mode, false);
    else this.buildChooser();
  }

  // ----- Title card -----

  private buildChooser(): void {
    const bests = loadBests();
    const panel = document.createElement("div");
    panel.className = "brickfall-panel";

    const option = (mode: Mode, name: string, pitch: string, best: number) => {
      const button = document.createElement("button");
      button.className = `brickfall-mode brickfall-mode--${mode}`;
      const title = document.createElement("span");
      title.className = "brickfall-mode__name";
      title.textContent = name;
      const desc = document.createElement("span");
      desc.className = "brickfall-mode__pitch";
      desc.textContent = pitch;
      button.append(title, desc);
      if (best > 0) {
        const record = document.createElement("span");
        record.className = "brickfall-mode__best";
        record.textContent = `YOUR BEST ${String(best).padStart(6, "0")}`;
        button.append(record);
      }
      button.addEventListener("click", () => this.begin(mode, true));
      return button;
    };

    panel.append(
      option(
        "classic",
        "CLASSIC",
        "Brickfall as it has always been. Same rules, same scoring, same high scores.",
        bests[GAME_ID] ?? 0,
      ),
      option(
        "blast",
        "BRICK BLAST",
        "Rows shatter, points fly and the phone buzzes. Combos and ALL CLEAR score extra. Its own high scores.",
        bests[`${GAME_ID}:${BLAST_BOARD}`] ?? 0,
      ),
    );
    this.root.replaceChildren(panel);
  }

  private begin(mode: Mode, chosen: boolean): void {
    this.mode = mode;
    saveLastMode(mode);
    if (chosen) this.host.sfx("uiSelect");

    // A hard-drop button, because the gesture for it is the least discoverable.
    const button = document.createElement("button");
    button.className = "drop-btn";
    button.textContent = "DROP";
    button.setAttribute("aria-label", "Hard drop");
    button.addEventListener("click", () => this.hardDrop());
    this.root.classList.add("brickfall-root--playing");
    this.root.replaceChildren(button);

    this.resetGestures();
    this.phase = "falling";
    this.host.playMusic(KOROBEINIKI);
    // Say the goal once, up front, in plain words.
    this.say(`CLEAR ${linesUntilNextLevel(0)} LINES TO LEVEL UP`);
    this.bannerTimer = 3;
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    this.particles.update(dt);
    this.fx.calm = this.host.settings.reducedMotion;
    this.fx.update(dt);
    if (this.stackDropTimer > 0) this.stackDropTimer -= dt;
    if (this.glowTimer > 0) this.glowTimer -= dt;

    if (this.phase === "over" || this.phase === "choosing") return;

    if (this.phase === "clearing") {
      if (this.mode === "blast") {
        this.blastElapsed += dt;
        this.blastDueBricks();
      }
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

    if (this.phase === "choosing") {
      drawWell(ctx, layout);
      drawTitleCard(ctx, layout, settings.largeText);
      return;
    }

    drawWell(
      ctx,
      layout,
      this.glowTimer > 0
        ? { colour: this.glowColour, alpha: this.glowTimer / GLOW_TIME }
        : null,
    );

    const clearing = this.clearing;
    // CLASSIC rows blink white twice across the clear window, as they always
    // have. BRICK BLAST rows glow, then go a brick at a time.
    const blinkOn = Math.floor(this.clearTimer * 12) % 2 === 0;
    const look = (col: number, row: number): BlockLook => {
      if (!clearing.includes(row)) return "solid";
      if (this.mode === "classic") return blinkOn ? "white" : "gone";
      return this.blasted.has(row * COLS + col) ? "gone" : "hot";
    };
    // Eased so the stack accelerates into place like something falling.
    const settling = Math.max(0, this.stackDropTimer / STACK_DROP_TIME);
    const lift = (row: number): number =>
      settling > 0 ? (this.stackDrops[row] ?? 0) * settling * settling : 0;
    drawGrid(ctx, layout, this.grid, look, lift);
    this.fx.renderUnder(ctx);

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
      this.combo,
      settings.largeText,
    );

    this.particles.render(ctx);
    this.fx.renderOver(ctx);

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
    return {
      lives: 0,
      progress: this.level,
      progressLabel: "Level",
      rollScore: this.mode === "blast",
    };
  }

  /** The mode buttons on the title card, then the DROP button. */
  extraControls(): HTMLElement {
    return this.root;
  }

  /** Nothing moves on the title card, so there is nothing to pause. */
  pausesWhenHidden(): boolean {
    return this.phase !== "choosing";
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
      if (this.mode === "blast") this.host.buzz(260);
      this.host.gameOver({
        progress: this.level,
        progressLabel: "Level",
        changeLabel: "CHANGE MODE",
        ...(this.mode === "blast" ? { boardId: BLAST_BOARD } : {}),
      });
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
    const from = this.piece;
    this.piece = { ...this.piece, row: this.piece.row + distance };
    this.host.addScore(distance * HARD_DROP_POINTS);
    this.host.sfx("pieceLand");
    if (this.mode === "blast") this.dropTrail(from, distance);
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

  /** A streak down each column a dropped piece fell through, and a thump. */
  private dropTrail(from: Piece, distance: number): void {
    if (distance < 2) return;
    const layout = this.layout();
    const colour = PIECE_COLOURS[from.kind];

    // The lowest cell of the piece in each column is where its trail ends.
    const lowest = new Map<number, number>();
    for (const [col, row] of occupiedCells(from)) {
      lowest.set(col, Math.max(lowest.get(col) ?? -Infinity, row));
    }
    for (const [col, row] of lowest) {
      const top = layout.y0 + Math.max(0, row - SPAWN_ROWS) * layout.cell;
      const bottom = layout.y0 + (row + distance - SPAWN_ROWS) * layout.cell;
      this.fx.streak(layout.x0 + col * layout.cell, top, bottom, layout.cell, colour);
    }

    this.host.buzz(12);
    if (distance >= 8) this.host.shake(1.5);
  }

  /** Break every brick the blast has reached since the last frame. */
  private blastDueBricks(): void {
    const layout = this.layout();
    for (let i = 0; i < this.clearing.length; i += 1) {
      const row = this.clearing[i]!;
      for (let col = 0; col < COLS; col += 1) {
        const key = row * COLS + col;
        if (this.blasted.has(key)) continue;
        const due =
          Math.abs(col + 0.5 - this.blastOrigin) * BLAST_PER_COL + i * BLAST_PER_ROW;
        if (this.blastElapsed < due) continue;

        this.blasted.add(key);
        const kind = this.grid[row]![col];
        if (!kind) continue;
        this.fx.shatter(
          layout.x0 + col * layout.cell,
          layout.y0 + (row - SPAWN_ROWS) * layout.cell,
          layout.cell,
          PIECE_COLOURS[kind],
        );
      }
    }
  }

  private glow(colour: string): void {
    this.glowColour = colour;
    this.glowTimer = GLOW_TIME;
  }

  private lockPiece(): void {
    settle(this.grid, this.piece);

    const layout = this.layout();
    if (this.mode === "blast") {
      // A blink where it set, so a piece locking is a thing you see happen.
      for (const [col, row] of occupiedCells(this.piece)) {
        if (row < SPAWN_ROWS) continue;
        this.fx.flash(
          layout.x0 + col * layout.cell,
          layout.y0 + (row - SPAWN_ROWS) * layout.cell,
          layout.cell,
        );
      }
    }

    const full: number[] = [];
    for (let row = 0; row < this.grid.length; row += 1) {
      if (this.grid[row]!.every((cell) => cell !== null)) full.push(row);
    }

    if (full.length === 0) {
      this.combo = 0;
      this.piece = this.spawn();
      return;
    }

    this.clearing = full;
    this.phase = "clearing";

    if (this.mode === "classic") {
      this.clearTimer = CLEAR_FLASH;
      this.host.sfx(full.length >= 4 ? "fourLines" : "lineClear");
      if (full.length >= 4) this.host.shake(5);
      for (const row of full) {
        this.particles.burst(
          layout.x0 + (layout.cell * COLS) / 2,
          layout.y0 + (row - SPAWN_ROWS + 0.5) * layout.cell,
          PIECE_COLOURS[this.piece.kind],
          16,
          110,
        );
      }
      return;
    }

    this.combo += 1;
    this.clearTimer = CLEAR_TIME;
    this.blasted.clear();
    this.blastElapsed = 0;
    // The blast starts under the middle of the piece that caused it.
    const cols = occupiedCells(this.piece).map(([col]) => col);
    this.blastOrigin = (Math.min(...cols) + Math.max(...cols) + 1) / 2;

    this.celebrate(full, layout);
  }

  /**
   * Pay for a clear and make a fuss of it.
   *
   * The points land now, as the bricks start to go, rather than when the
   * stack has finished falling: the score counting up while the row is still
   * breaking is what ties the two together.
   */
  private celebrate(full: readonly number[], layout: Layout): void {
    const rows = Math.min(full.length, 4);
    const cleared = emptyAfterClear(this.grid);
    const points =
      lineScore(rows, this.level) +
      comboBonus(this.combo, this.level) +
      (cleared ? boardClearBonus(this.level) : 0);
    this.host.addScore(points);

    const wellW = layout.cell * COLS;
    const midX = layout.x0 + wellW / 2;
    const midRow = (full[0]! + full[full.length - 1]!) / 2;
    const midY = layout.y0 + (midRow - SPAWN_ROWS + 0.5) * layout.cell;
    const colour = SHOUT_COLOURS[rows]!;

    for (const row of full) {
      this.fx.sweep(layout.x0, layout.y0 + (row - SPAWN_ROWS) * layout.cell, wellW, layout.cell);
    }
    this.fx.popup(
      midX,
      // Kept clear of the lettering when both are near the top of the well.
      Math.max(layout.y0 + layout.cell * 2, midY - layout.cell),
      `+${points}`,
      colour,
      layout.cell * (0.85 + rows * 0.12),
    );

    // A lone single is the bread and butter and gets the points alone; the
    // lettering is for a clear worth a name, or for keeping a combo going.
    const comboText = this.combo >= 2 ? `COMBO x${this.combo}` : "";
    if (cleared || rows >= 2 || comboText) {
      const text = cleared ? "ALL CLEAR!" : SHOUTS[rows]!;
      this.fx.shout(
        midX,
        layout.y0 + layout.cell * ROWS * 0.36,
        text,
        comboText,
        cleared ? "#ffffff" : colour,
        // Sized so the longest of them still fits inside the well.
        Math.min(layout.cell * 1.7, (wellW * 0.94) / (text.length * 0.62)),
      );
    }

    this.host.sfx(rows >= 4 ? "fourLines" : "lineClear");
    if (cleared) this.host.sfx("boardClear");
    else if (this.combo >= 3) this.host.sfx("comboHot");
    else if (this.combo === 2) this.host.sfx("comboUp");

    if (cleared) {
      this.host.buzz([80, 50, 80, 50, 80, 50, 220]);
    } else if (rows < 3 && this.combo >= 2) {
      // A small clear that keeps a combo alive still earns a double tap.
      this.host.buzz([25, 40, 45]);
    } else {
      this.host.buzz(CLEAR_BUZZ[rows]!);
    }

    if (rows >= 4 || cleared) {
      this.host.shake(7);
      this.host.hitStop(0.07);
      this.fx.ring(midX, midY, wellW * 0.75, colour);
      this.glow(colour);
    } else {
      if (rows >= 2) this.host.shake(rows === 3 ? 3.5 : 2);
      if (this.combo >= 3) this.glow("#ff5fae");
    }
  }

  private finishClear(): void {
    const blast = this.mode === "blast";
    if (blast) {
      // The stack falls into the gap over a few frames instead of jumping.
      this.stackDrops = dropPerRow(this.grid.length, this.clearing);
      this.stackDropTimer = STACK_DROP_TIME;
    }

    const { grid } = clearLines(this.grid);
    this.grid = grid;

    const count = this.clearing.length;
    this.clearing = [];
    this.blasted.clear();
    this.lines += count;
    // BRICK BLAST was paid as the bricks started to go, in celebrate().
    if (!blast) this.host.addScore(lineScore(count, this.level));

    const nextLevel = levelForLines(this.lines);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.host.sfx("levelUp");
      this.say(this.level >= MAX_LEVEL ? "MAX LEVEL!" : `LEVEL ${this.level}`);
      // The music tightens as the climb steepens -- the cheapest way to make a
      // board feel like it's closing in.
      this.host.setMusicTempo(1 + (this.level - 1) * 0.028);

      if (blast) {
        const layout = this.layout();
        this.glow("#ffc14d");
        this.fx.confetti(layout.x0, layout.y0, layout.cell * COLS, Object.values(PIECE_COLOURS));
        this.host.buzz([30, 40, 30, 40, 90]);
      }
    } else if (!blast && count >= 4) {
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

function loadLastMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "blast" ? "blast" : "classic";
  } catch {
    return "classic";
  }
}

function saveLastMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage disabled -- PLAY AGAIN just won't remember.
  }
}

export const brickfallModule: GameModule = {
  id: GAME_ID,
  title: "BRICKFALL",
  progressShort: "LV",
  blurb: "Drag to slide, tap to turn. Fill a row to clear it. CLASSIC or BRICK BLAST.",
  howToPlay: [
    "Drag left or right to slide the piece. Tap to turn it. The outline shows where it will land.",
    "Drag down to move it down faster, or tap DROP to send it straight to the bottom.",
    "Fill a row all the way across to clear it. Four rows at once scores the most.",
    "A piece that has just landed can still be slid for a moment before it sets.",
    "Each level is faster, up to level 25. The game ends when the stack reaches the top.",
    "BRICK BLAST plays the same, with extras: clear rows with piece after piece for a COMBO bonus, and empty the well for an ALL CLEAR.",
  ],
  accent: "#8e7bff",
  extraBoard: { id: BLAST_BOARD, label: "BLAST" },

  drawIcon(ctx, size) {
    drawBrickfallIcon(ctx, size);
  },

  drawLifeIcon(ctx, highContrast) {
    drawBlockLifeIcon(ctx, highContrast);
  },

  create(host: GameHost, start?: StartOptions): GameInstance {
    return new Brickfall(host, start);
  },
};

export { cellsFor };

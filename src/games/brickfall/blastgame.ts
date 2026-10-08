/**
 * BRICK BLAST -- Brickfall's second game.
 *
 * Nothing falls. Three pieces wait in a tray under an eight-by-eight board;
 * tap one to turn it, drag it on, and any row or column it finishes is
 * blasted away. When all three are down, three more arrive. The game ends
 * when nothing in the tray fits anywhere, however it is turned.
 *
 * This is the children's game. The deal is kind, and a player who has been
 * looking at the board for a few seconds is shown somewhere a piece could go.
 *
 * It began as Classic with fireworks on top -- the same falling pieces, with
 * shattering rows and a combo. Riley's verdict was that the pieces shouldn't
 * fall at all: you should be choosing from the ones at the bottom. She was
 * describing a different game, and this is it. The rules are in puzzle.ts;
 * the fireworks survived and are in blast.ts.
 */

import type { GameHost, HudState } from "../../core/game.ts";
import { KOROBEINIKI } from "../../core/music.ts";
import { Rng } from "../../core/rng.ts";
import { BlastFx } from "./blast.ts";
import { PIECE_COLOURS } from "./pieces.ts";
import {
  anyMoves,
  bestMove,
  boardClearBonus,
  canPlace,
  clearLines,
  clearScore,
  COMBO_GRACE,
  deal,
  emptyBoard,
  fitsTurned,
  fullLines,
  isEmpty,
  levelForLines,
  linesUntilNextLevel,
  MAX_LEVEL,
  place,
  placeScore,
  rotate,
  SIZE,
  type Board,
  type Cleared,
  type Lines,
  type Move,
  type Shape,
} from "./puzzle.ts";
import { drawBlock, PALETTE } from "./render.ts";

/** Runs are filed here, apart from the Classic board. */
export const BLAST_BOARD = "blast";

const FONT = "ui-monospace, Menlo, Consolas, monospace";

/** Seconds the blast takes to travel one square out from the piece that set it off. */
const BLAST_PER_CELL = 0.03;

/** How long the rim of the board stays lit after a big moment. */
const GLOW_TIME = 0.7;

/** A beat between the last piece going down and the game-over card. */
const END_PAUSE = 1.1;

/** Tray pieces are drawn at this share of a board square. */
const TRAY_SCALE = 0.5;

/**
 * How far a touch on a tray piece can wander and still be a tap. A tap turns
 * the piece; anything further picks it up.
 */
const TAP_SLOP = 9;

/** How long a turned piece takes to settle after its little jump. */
const TURN_POP = 0.16;

/**
 * Seconds without a touch before the game shows somewhere a piece could go.
 *
 * Long enough that a player who is thinking gets to finish the thought, and
 * short enough that a stuck six-year-old is helped before they give up.
 */
const HINT_AFTER = 5;

/** What a clear is called, by how many lines went with one piece. */
const SHOUTS = ["", "NICE!", "GREAT!", "AWESOME!", "BRICK BLAST!"] as const;
const SHOUT_COLOURS = ["", "#46e0ff", "#3ddc97", "#ffc14d", "#ff5fae"] as const;

/** The phone's part in it, by lines: a tick for one, a drum roll for four. */
const CLEAR_BUZZ: ReadonlyArray<number | readonly number[]> = [
  0,
  25,
  [35, 40, 55],
  [40, 40, 40, 40, 90],
  [70, 50, 70, 50, 160],
];

interface Layout {
  x0: number;
  y0: number;
  cell: number;
  trayTop: number;
  trayH: number;
  slotW: number;
}

interface Drag {
  slot: number;
  pointerId: number;
  /** Where the finger is, in virtual units. */
  x: number;
  y: number;
  /** Where it first came down. */
  startX: number;
  startY: number;
  /** False until the touch has gone far enough to be a drag and not a tap. */
  lifted: boolean;
}

/** A square that has been cleared by the rules and is waiting for the blast to reach it. */
interface Dying extends Cleared {
  due: number;
}

export class BlastPuzzle {
  private readonly host: GameHost;
  private readonly fx = new BlastFx();
  private readonly rng = new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  private board: Board = emptyBoard();
  private tray: Array<Shape | null> = [];
  private level = 1;
  private lines = 0;

  /** Clears in a row, and pieces placed since the last one. */
  private combo = 0;
  private sinceClear = 0;

  private drag: Drag | null = null;
  /** Counts down in a slot whose piece has just been turned. */
  private readonly turnPop = [0, 0, 0];
  private clock = 0;
  private idle = 0;
  private hint: Move | null = null;
  private dying: Dying[] = [];
  private blastClock = 0;

  private glowColour = "#ffffff";
  private glowTimer = 0;
  private banner = "DRAG A PIECE ON. TAP IT TO TURN IT.";
  private bannerTimer = 6;

  private ending = false;
  private endTimer = 0;
  private over = false;

  constructor(host: GameHost) {
    this.host = host;
    this.tray = deal(this.board, this.level, () => this.rng.next());
    this.host.playMusic(KOROBEINIKI);

    const { canvas } = host.view;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
  }

  destroy(): void {
    const { canvas } = this.host.view;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
  }

  /** Put a held piece back, e.g. when the game is paused mid-drag. */
  cancelDrag(): void {
    this.drag = null;
  }

  hud(): HudState {
    return { lives: 0, progress: this.level, progressLabel: "Level", rollScore: true };
  }

  // ----- Loop -----

  update(dt: number): void {
    this.fx.calm = this.host.settings.reducedMotion;
    this.fx.update(dt);
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.glowTimer > 0) this.glowTimer -= dt;
    this.clock += dt;
    for (let slot = 0; slot < this.turnPop.length; slot += 1) {
      if (this.turnPop[slot]! > 0) this.turnPop[slot]! -= dt;
    }

    // Left alone for a while, show somewhere a piece could go. Any touch
    // takes the hint away and starts the wait again.
    if (!this.drag && !this.ending) {
      this.idle += dt;
      if (this.idle >= HINT_AFTER && !this.hint) this.hint = bestMove(this.board, this.tray);
    }

    if (this.dying.length > 0) {
      this.blastClock += dt;
      this.blastDue();
    }

    if (this.ending && !this.over) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.over = true;
        this.host.gameOver({
          progress: this.level,
          progressLabel: "Level",
          boardId: BLAST_BOARD,
          changeLabel: "CHANGE MODE",
        });
      }
    }
  }

  /** Break every square the blast has reached since the last frame. */
  private blastDue(): void {
    const layout = this.layout();
    this.dying = this.dying.filter((square) => {
      if (this.blastClock < square.due) return true;
      this.fx.shatter(
        layout.x0 + square.col * layout.cell,
        layout.y0 + square.row * layout.cell,
        layout.cell,
        PIECE_COLOURS[square.tone],
      );
      return false;
    });
  }

  // ----- Layout -----

  private layout(): Layout {
    const { view } = this.host;
    const top = view.insetTop + 92;
    const bottom = view.insetBottom + 14;
    const gap = 22;
    // The tray is five tray-squares tall, so the longest piece fits upright.
    const trayRows = 5 * TRAY_SCALE;
    const cell = Math.min(
      (view.w - 20) / SIZE,
      (view.h - top - bottom - gap) / (SIZE + trayRows),
    );
    const boardW = cell * SIZE;
    const used = boardW + gap + cell * trayRows;
    const y0 = top + Math.max(0, (view.h - top - bottom - used) / 2);
    return {
      x0: (view.w - boardW) / 2,
      y0,
      cell,
      trayTop: y0 + boardW + gap,
      trayH: cell * trayRows,
      slotW: view.w / 3,
    };
  }

  /**
   * Where a held piece is drawn: above the finger, not under it.
   *
   * Under the finger is the one place on a phone you can't see. The piece
   * rides a little more than its own height above the touch, so the whole of
   * it -- and the squares it is about to cover -- stay in view.
   */
  private heldOrigin(layout: Layout, shape: Shape, drag: Drag): { x: number; y: number } {
    return {
      x: drag.x - (shape.w * layout.cell) / 2,
      y: drag.y - layout.cell * 1.4 - shape.h * layout.cell,
    };
  }

  /** The board square a held piece's top-left corner is nearest to. */
  private target(layout: Layout, shape: Shape, drag: Drag): { col: number; row: number } {
    const origin = this.heldOrigin(layout, shape, drag);
    return {
      col: Math.round((origin.x - layout.x0) / layout.cell),
      row: Math.round((origin.y - layout.y0) / layout.cell),
    };
  }

  // ----- Touch -----

  private onPointerDown = (event: PointerEvent): void => {
    if (this.drag || this.ending) return;
    const { view } = this.host;
    const x = view.toWorldX(event.clientX);
    const y = view.toWorldY(event.clientY);
    const layout = this.layout();

    // Generous above and below: the pieces are small and thumbs are not.
    if (y < layout.trayTop - 12 || y > layout.trayTop + layout.trayH + 28) return;
    const slot = Math.max(0, Math.min(2, Math.floor(x / layout.slotW)));
    if (!this.tray[slot]) return;

    this.drag = { slot, pointerId: event.pointerId, x, y, startX: x, startY: y, lifted: false };
    this.bannerTimer = 0;
    this.idle = 0;
    this.hint = null;
  };

  private onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = this.host.view.toWorldX(event.clientX);
    drag.y = this.host.view.toWorldY(event.clientY);
    if (!drag.lifted && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > TAP_SLOP) {
      drag.lifted = true;
      this.host.sfx("pieceMove");
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;

    const shape = this.tray[drag.slot];
    if (!shape) return;
    this.idle = 0;

    // A touch that never went anywhere is a tap, and a tap turns the piece.
    if (!drag.lifted) {
      this.tray[drag.slot] = rotate(shape);
      this.turnPop[drag.slot] = TURN_POP;
      this.host.sfx("pieceRotate");
      this.host.buzz(8);
      return;
    }

    drag.x = this.host.view.toWorldX(event.clientX);
    drag.y = this.host.view.toWorldY(event.clientY);
    const { col, row } = this.target(this.layout(), shape, drag);
    // Let go anywhere it doesn't fit and it simply goes back to the tray.
    if (canPlace(this.board, shape, col, row)) this.put(drag.slot, shape, col, row);
    else this.host.sfx("pieceMove");
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) this.drag = null;
  };

  // ----- Moves -----

  private put(slot: number, shape: Shape, col: number, row: number): void {
    const layout = this.layout();
    place(this.board, shape, col, row);
    this.tray[slot] = null;
    this.idle = 0;
    this.hint = null;
    this.host.addScore(placeScore(shape));
    this.host.sfx("pieceLand");
    this.host.buzz(10);
    for (const [c, r] of shape.cells) {
      this.fx.flash(
        layout.x0 + (col + c) * layout.cell,
        layout.y0 + (row + r) * layout.cell,
        layout.cell,
      );
    }

    const lines = fullLines(this.board);
    const count = lines.rows.length + lines.cols.length;
    if (count > 0) {
      this.blast(lines, count, col + shape.w / 2, row + shape.h / 2, layout);
    } else {
      this.sinceClear += 1;
      if (this.sinceClear >= COMBO_GRACE) this.combo = 0;
    }

    if (this.tray.every((piece) => piece === null)) {
      this.tray = deal(this.board, this.level, () => this.rng.next());
    }

    if (!anyMoves(this.board, this.tray)) {
      this.ending = true;
      this.endTimer = END_PAUSE;
      this.say("NO MORE MOVES", END_PAUSE);
      this.host.stopMusic();
      this.host.sfx("playerExplode");
      this.host.buzz(260);
    }
  }

  /**
   * Clear the lines, pay for them and make a fuss.
   *
   * The rules are settled at once -- the squares are free the moment the
   * piece lands, so the next piece can go straight into them -- and the
   * squares that went are handed to `dying` to be broken up a moment later,
   * in a wave out from where the piece was put.
   */
  private blast(lines: Lines, count: number, fromCol: number, fromRow: number, layout: Layout): void {
    const tier = Math.min(count, 4);
    const gone = clearLines(this.board, lines);
    this.combo += 1;
    this.sinceClear = 0;
    this.lines += count;

    const cleared = isEmpty(this.board);
    const points =
      clearScore(count, this.combo, this.level) + (cleared ? boardClearBonus(this.level) : 0);
    this.host.addScore(points);

    this.blastClock = 0;
    this.dying.push(
      ...gone.map((square) => ({
        ...square,
        due: Math.hypot(square.col + 0.5 - fromCol, square.row + 0.5 - fromRow) * BLAST_PER_CELL,
      })),
    );

    const boardW = layout.cell * SIZE;
    for (const row of lines.rows) {
      this.fx.sweep(layout.x0, layout.y0 + row * layout.cell, boardW, layout.cell);
    }
    for (const col of lines.cols) {
      this.fx.sweep(layout.x0 + col * layout.cell, layout.y0, layout.cell, boardW);
    }

    const midX = layout.x0 + boardW / 2;
    const colour = SHOUT_COLOURS[tier]!;
    const popX = Math.max(
      layout.x0 + layout.cell * 1.5,
      Math.min(layout.x0 + boardW - layout.cell * 1.5, layout.x0 + fromCol * layout.cell),
    );
    this.fx.popup(
      popX,
      Math.max(layout.y0 + layout.cell, layout.y0 + fromRow * layout.cell - layout.cell * 0.6),
      `+${points}`,
      colour,
      layout.cell * (0.6 + tier * 0.08),
    );

    // A single line on its own gets the points alone; the lettering is for a
    // clear worth a name, or for keeping a combo going.
    const comboText = this.combo >= 2 ? `COMBO x${this.combo}` : "";
    if (cleared || count >= 2 || comboText) {
      const text = cleared ? "ALL CLEAR!" : SHOUTS[tier]!;
      this.fx.shout(
        midX,
        layout.y0 + boardW * 0.4,
        text,
        comboText,
        cleared ? "#ffffff" : colour,
        // Sized so the longest of them still fits across the board.
        Math.min(layout.cell * 1.1, (boardW * 0.94) / (text.length * 0.62)),
      );
    }

    this.host.sfx(count >= 3 ? "fourLines" : "lineClear");
    if (cleared) this.host.sfx("boardClear");
    else if (this.combo >= 3) this.host.sfx("comboHot");
    else if (this.combo === 2) this.host.sfx("comboUp");

    if (cleared) this.host.buzz([80, 50, 80, 50, 80, 50, 220]);
    else if (count === 1 && this.combo >= 2) this.host.buzz([25, 40, 45]);
    else this.host.buzz(CLEAR_BUZZ[tier]!);

    if (count >= 3 || cleared) {
      this.host.shake(7);
      this.host.hitStop(0.07);
      this.fx.ring(midX, layout.y0 + boardW / 2, boardW * 0.75, colour);
      this.glow(colour);
    } else {
      if (count === 2) this.host.shake(3);
      if (this.combo >= 3) this.glow("#ff5fae");
    }

    const nextLevel = levelForLines(this.lines);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.host.sfx("levelUp");
      this.say(this.level >= MAX_LEVEL ? "MAX LEVEL!" : `LEVEL ${this.level}`, 1.6);
      this.host.setMusicTempo(1 + (this.level - 1) * 0.02);
      this.glow("#ffc14d");
      this.fx.confetti(layout.x0, layout.y0, boardW, Object.values(PIECE_COLOURS));
      this.host.buzz([30, 40, 30, 40, 90]);
    }
  }

  private glow(colour: string): void {
    this.glowColour = colour;
    this.glowTimer = GLOW_TIME;
  }

  private say(text: string, seconds: number): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  // ----- Drawing -----

  render(ctx: CanvasRenderingContext2D): void {
    const layout = this.layout();
    const { x0, y0, cell } = layout;
    const boardW = cell * SIZE;
    const { largeText } = this.host.settings;

    this.drawStatus(ctx, layout, largeText);

    // The board: a dark tray with a pale socket for every square, so the
    // empty space reads as somewhere to put things rather than as nothing.
    ctx.save();
    ctx.fillStyle = PALETTE.well;
    ctx.beginPath();
    ctx.roundRect(x0 - 4, y0 - 4, boardW + 8, boardW + 8, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.wellEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.glowTimer > 0) {
      ctx.globalAlpha = Math.min(1, this.glowTimer / GLOW_TIME);
      ctx.strokeStyle = this.glowColour;
      ctx.shadowColor = this.glowColour;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(142,163,200,0.07)";
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        ctx.beginPath();
        ctx.roundRect(x0 + col * cell + 1.5, y0 + row * cell + 1.5, cell - 3, cell - 3, cell * 0.14);
        ctx.fill();
      }
    }
    ctx.restore();

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const tone = this.board[row]![col];
        if (tone) drawBlock(ctx, x0 + col * cell, y0 + row * cell, cell, tone);
      }
    }

    // Squares the rules have cleared and the blast hasn't reached yet.
    for (const square of this.dying) {
      const x = x0 + square.col * cell;
      const y = y0 + square.row * cell;
      drawBlock(ctx, x, y, cell, square.tone);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.restore();
    }

    this.fx.renderUnder(ctx);

    // A piece is "held" once the touch has become a drag; until then it is
    // still sitting in the tray, waiting to find out if this is a tap.
    const drag = this.drag?.lifted ? this.drag : null;
    const held = drag ? this.tray[drag.slot] : null;
    if (drag && held) this.drawPreview(ctx, layout, held, drag);
    else if (this.hint) this.drawHint(ctx, layout, this.hint);

    this.drawTray(ctx, layout);

    if (drag && held) {
      const origin = this.heldOrigin(layout, held, drag);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;
      for (const [c, r] of held.cells) {
        drawBlock(ctx, origin.x + c * cell, origin.y + r * cell, cell, held.tone);
      }
      ctx.restore();
    }

    this.fx.renderOver(ctx);

    if (this.ending) {
      ctx.save();
      ctx.fillStyle = "rgba(5,7,15,0.45)";
      ctx.fillRect(x0 - 4, y0 - 4, boardW + 8, boardW + 8);
      ctx.restore();
    }
  }

  /** Where the held piece will go, and what it would clear. */
  private drawPreview(ctx: CanvasRenderingContext2D, layout: Layout, shape: Shape, drag: Drag): void {
    const { x0, y0, cell } = layout;
    const { col, row } = this.target(layout, shape, drag);
    if (!canPlace(this.board, shape, col, row)) return;

    // Light up the lines this would finish, before it is put down: seeing the
    // clear coming is most of the fun of lining one up.
    const trial = this.board.map((line) => [...line]);
    place(trial, shape, col, row);
    const lines = fullLines(trial);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    for (const r of lines.rows) ctx.fillRect(x0, y0 + r * cell, cell * SIZE, cell);
    for (const c of lines.cols) ctx.fillRect(x0 + c * cell, y0, cell, cell * SIZE);
    ctx.restore();

    for (const [c, r] of shape.cells) {
      drawBlock(ctx, x0 + (col + c) * cell, y0 + (row + r) * cell, cell, shape.tone, 0.45);
    }
  }

  /**
   * Somewhere a piece could go: a breathing outline on the board, and the
   * piece it means bobbing in the tray.
   *
   * An outline and not a ghost of the piece, so it reads as a suggestion and
   * not as something already there. If the piece has to be turned to fit, the
   * outline shows it the way it needs to be and the status line says to tap.
   */
  private drawHint(ctx: CanvasRenderingContext2D, layout: Layout, hint: Move): void {
    const { x0, y0, cell } = layout;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4.5);
    ctx.save();
    ctx.strokeStyle = PIECE_COLOURS[hint.shape.tone];
    ctx.fillStyle = PIECE_COLOURS[hint.shape.tone];
    ctx.lineWidth = Math.max(2, cell * 0.08);
    for (const [c, r] of hint.shape.cells) {
      const x = x0 + (hint.col + c) * cell;
      const y = y0 + (hint.row + r) * cell;
      ctx.globalAlpha = 0.1 + 0.16 * pulse;
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      ctx.globalAlpha = 0.45 + 0.5 * pulse;
      ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
    }
    ctx.restore();
  }

  private drawTray(ctx: CanvasRenderingContext2D, layout: Layout): void {
    const base = layout.cell * TRAY_SCALE;
    this.tray.forEach((shape, slot) => {
      if (!shape || (this.drag?.lifted && this.drag.slot === slot)) return;

      // A turned piece jumps a little, so the tap visibly did something.
      const pop = Math.max(0, this.turnPop[slot]! / TURN_POP);
      const size = base * (1 + 0.22 * pop);
      const hinted = this.hint?.slot === slot && !this.drag;
      const bob = hinted && !this.fx.calm ? Math.sin(this.clock * 4.5) * 3 : 0;

      const left = layout.slotW * (slot + 0.5) - (shape.w * size) / 2;
      const top = layout.trayTop + (layout.trayH - shape.h * size) / 2 - bob;
      // A piece with nowhere to go, however it is turned, is dimmed, so a
      // tight board shows which of the three is the problem.
      const alpha = fitsTurned(this.board, shape) ? 1 : 0.3;
      for (const [c, r] of shape.cells) {
        drawBlock(ctx, left + c * size, top + r * size, size, shape.tone, alpha);
      }
    });
  }

  /** Lines, the countdown to the next level, and the combo while one runs. */
  private drawStatus(ctx: CanvasRenderingContext2D, layout: Layout, largeText: boolean): void {
    const scale = largeText ? 1.15 : 1;
    const y = layout.y0 - 12;
    const right = layout.x0 + layout.cell * SIZE;
    const toGo = linesUntilNextLevel(this.lines);

    ctx.save();
    ctx.textBaseline = "alphabetic";

    // The hint's second step, when it has one, takes the line over.
    const turnHint = this.hint?.turned && !this.drag ? "TAP THE PIECE TO TURN IT" : "";
    const banner = this.bannerTimer > 0 && this.banner ? this.banner : turnHint;
    if (banner) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffc14d";
      ctx.font = `700 ${13 * scale}px ${FONT}`;
      ctx.fillText(banner, (layout.x0 + right) / 2, y);
      ctx.restore();
      return;
    }

    ctx.font = `700 ${11 * scale}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = PALETTE.panel;
    ctx.fillText(`LINES ${this.lines}`, layout.x0, y);

    ctx.textAlign = "right";
    ctx.fillStyle = toGo === null ? "#ffc14d" : "#46e0ff";
    ctx.fillText(toGo === null ? "MAX LEVEL" : `LEVEL UP IN ${toGo}`, right, y);

    // Only while one is running: a permanent "COMBO x1" is noise.
    if (this.combo >= 2) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff5fae";
      ctx.fillText(`COMBO x${this.combo}`, (layout.x0 + right) / 2, y);
    }
    ctx.restore();
  }
}

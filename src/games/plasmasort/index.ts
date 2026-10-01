/**
 * PLASMA SORT -- a daily colour-sort puzzle.
 *
 * Tap a tube, tap another, and the run of colour on top pours across. Get every
 * tube down to one colour. That's the whole game, and it's the one cabinet in
 * the arcade where nothing is moving unless you moved it.
 *
 * It exists for the reason the slime shop's TODAY'S SPECIAL does: a puzzle
 * that is the same for everyone on a given day is a reason to come back
 * tomorrow, and a board where every score answers the same question.
 *
 * The same puzzle has to be easy for a seven-year-old and worth an adult's
 * time, and the way it manages both is by separating finishing from scoring:
 *
 *   - Finishing is safe. There is no timer running out, no lives, and UNDO
 *     and RESET always work, so a puzzle can never be lost -- only unfinished.
 *   - Scoring is strict. Every puzzle has a par, found by search (puzzle.ts),
 *     and each pour over it costs points. A pour taken back still counts, so
 *     the board rewards seeing the solution rather than feeling for it.
 *
 * Three modes, one engine:
 *   TODAY     six colours seeded from the date, ranked on that day's own board
 *   FREE PLAY a random six-colour puzzle, ranked on the all-time board
 *   WARM-UP   four colours, no score
 *
 * TODAY ranks the first solve only. The puzzle is identical on a second go, so
 * a board of best attempts would just be a board of people who replayed until
 * they'd memorised it. The attempt is saved after every pour (progress.ts), so
 * quitting or restarting picks it back up rather than wiping the counter.
 */

import "./plasmasort.css";

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Particles } from "../../core/particles";
import { playLink } from "../../core/share";
import { dailyKey, dailySeed } from "../../core/rng";
import { loadDailySeen, markDailySeen } from "../../core/storage";
import { shareButton } from "../../ui/shareButton";
import {
  advanceStreak,
  liveStreak,
  loadDailyAttempt,
  loadStreak,
  saveDailyAttempt,
  saveStreak,
  type DailyAttempt,
  type DailyResult,
} from "./progress";
import {
  CAPACITY,
  cloneBoard,
  generatePuzzle,
  isComplete,
  isSolved,
  isStuck,
  pour,
  pourCount,
  scoreSolve,
  starsFor,
  topRun,
  unpour,
  type Board,
  type Pour,
} from "./puzzle";
import {
  ACCENT,
  DIM,
  INK,
  WARM,
  cellCentre,
  computeLayout,
  drawBackdrop,
  drawCell,
  drawPlasmaIcon,
  drawRack,
  drawStar,
  drawText,
  drawTitleArt,
  drawTubeBack,
  drawTubeFront,
  plasmaColour,
  tubeAt,
  type Layout,
} from "./render";
import { dailyShareText } from "./share";

type Mode = "daily" | "free" | "warmup";
type Phase = "choosing" | "playing" | "solved";

const COLOURS: Record<Mode, number> = { daily: 6, free: 6, warmup: 4 };

/** Salts this game's daily seed so two daily challenges never correlate. */
const SEED_SALT = 0x504c41;

/** One cell's trip from tube to tube. Quick enough that nobody waits on it. */
const FLIGHT_SECONDS = 0.3;
/** Gap between the cells of a run setting off, so a run reads as a stream. */
const FLIGHT_STAGGER = 0.05;

/** How long the result card holds before it can be tapped away, and its limit. */
const RESULT_MIN_SECONDS = 0.9;
const RESULT_MAX_SECONDS = 6;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A cell in the air. The board already has it at its destination. */
interface Flight {
  colour: number;
  fromX: number;
  fromY: number;
  tube: number;
  slot: number;
  /** Negative while waiting its turn in the stagger. */
  t: number;
}

export class PlasmaSort implements GameInstance {
  private readonly root = document.createElement("div");
  private readonly particles = new Particles();

  private phase: Phase = "choosing";
  private mode: Mode = "daily";

  private board: Board = [];
  /** The deal as it was, for RESET. */
  private initial: Board = [];
  private par = 0;
  /** Every pour made this attempt. Taking one back doesn't lower it. */
  private pours = 0;
  private seconds = 0;
  private history: Pour[] = [];

  private ranked = false;
  /**
   * The daily board this run belongs to, and the date it was dealt for --
   * both captured at the start, so a puzzle begun at 23:58 isn't filed
   * against tomorrow's.
   */
  private boardId: string | undefined;
  private dateKey = "";
  private dateLabel = "";

  private selected: number | null = null;
  private flights: Flight[] = [];
  /** 0..1 per tube: how far its top run has risen. */
  private lift: number[] = [];
  /** Seconds left on a refused tap's shake, per tube. */
  private shake: number[] = [];
  /** Which tubes show as finished. Lags the board until the last cell lands. */
  private sealed: boolean[] = [];
  private sealPulse: number[] = [];
  /** Seconds until a just-completed tube seals, or -1. */
  private sealIn: number[] = [];
  /** Landing squash per cell, keyed tube * CAPACITY + slot. */
  private squash = new Map<number, number>();

  private toast = "";
  private toastTimer = 0;
  private warnedAboutUndo = false;

  private stars = 0;
  private finalScore = 0;
  private resultTime = 0;
  private streak = 0;
  /**
   * True on the card for the day's ranked solve: the result is offered for
   * sharing, so the card waits for SHARE or DONE instead of timing out.
   */
  private offerShare = false;
  /** The streak going into today, read once for the title card. */
  private readonly titleStreak = liveStreak(loadStreak(), dailyKey(), yesterdayKey());

  private time = 0;
  private paused = false;

  private undoButton: HTMLButtonElement | null = null;
  private resetButton: HTMLButtonElement | null = null;

  /**
   * Panel height in CSS pixels, converted to virtual units at read time (the
   * conversion depends on the viewport, so a stored converted value would go
   * stale on rotation).
   */
  private panelPx = 80;
  private panelObserver: ResizeObserver | null = null;

  private readonly host: GameHost;

  constructor(host: GameHost) {
    this.host = host;
    this.root.className = "plasma-root";
    this.buildModeChooser();
    this.watchPanelHeight();
    // pointerdown, not click: the tube should answer the instant it's touched.
    host.view.canvas.addEventListener("pointerdown", this.onPointerDown);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- Loop -----

  update(dt: number, _input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    this.toastTimer = Math.max(0, this.toastTimer - dt);

    if (this.phase === "choosing") return;

    const reduced = this.host.settings.reducedMotion;
    for (let i = 0; i < this.board.length; i += 1) {
      const target = this.selected === i ? 1 : 0;
      const current = this.lift[i] ?? 0;
      this.lift[i] = reduced ? target : current + (target - current) * Math.min(1, dt * 22);
      this.shake[i] = Math.max(0, (this.shake[i] ?? 0) - dt);
      this.sealPulse[i] = Math.max(0, (this.sealPulse[i] ?? 0) - dt * 1.4);

      const wait = this.sealIn[i] ?? -1;
      if (wait >= 0) {
        this.sealIn[i] = wait - dt;
        if (wait - dt < 0) this.seal(i);
      }
    }

    for (const [key, value] of this.squash) {
      if (value - dt * 7 <= 0) this.squash.delete(key);
      else this.squash.set(key, value - dt * 7);
    }

    for (let i = this.flights.length - 1; i >= 0; i -= 1) {
      const flight = this.flights[i]!;
      flight.t += dt / FLIGHT_SECONDS;
      if (flight.t >= 1) {
        this.squash.set(flight.tube * CAPACITY + flight.slot, 1);
        this.flights.splice(i, 1);
      }
    }

    if (this.phase === "playing") {
      this.seconds += dt;
      const settled = this.flights.length === 0 && this.sealIn.every((s) => s < 0);
      if (settled && isSolved(this.board)) this.finish();
      return;
    }

    this.resultTime += dt;
    if (this.offerShare) {
      // Held back until the stars have landed, so a tap meant for the card
      // can't land on SHARE.
      if (this.resultTime >= RESULT_MIN_SECONDS) this.root.style.visibility = "";
    } else if (this.resultTime >= RESULT_MAX_SECONDS) {
      this.leave();
    }
  }

  hud(): HudState {
    return { lives: 0, progress: this.pours, progressLabel: "Pours" };
  }

  onPause(): void {
    this.paused = true;
    this.saveAttempt();
  }

  onResume(): void {
    this.paused = false;
  }

  /** Only a puzzle in progress has a clock worth stopping. */
  pausesWhenHidden(): boolean {
    return this.phase === "playing";
  }

  destroy(): void {
    this.saveAttempt();
    this.panelObserver?.disconnect();
    this.host.view.canvas.removeEventListener("pointerdown", this.onPointerDown);
  }

  // ----- Input -----

  private onPointerDown = (event: PointerEvent): void => {
    if (this.paused) return;
    const { view } = this.host;
    const x = view.toWorldX(event.clientX);
    const y = view.toWorldY(event.clientY);

    if (this.phase === "solved") {
      if (this.resultTime >= RESULT_MIN_SECONDS) this.leave();
      return;
    }
    if (this.phase !== "playing") return;

    const index = tubeAt(this.layout(), x, y);
    if (index < 0) {
      // A tap on empty space puts the run back down.
      if (this.selected !== null) {
        this.selected = null;
        this.host.sfx("plasmaDrop");
      }
      return;
    }
    this.tapTube(index);
  };

  private tapTube(index: number): void {
    const tube = this.board[index]!;

    if (this.selected === null) {
      if (tube.length === 0 || isComplete(tube)) {
        this.refuse(index);
        return;
      }
      this.selected = index;
      this.host.sfx("plasmaLift");
      return;
    }

    if (this.selected === index) {
      this.selected = null;
      this.host.sfx("plasmaDrop");
      return;
    }

    if (pourCount(this.board, this.selected, index) > 0) {
      this.pourInto(this.selected, index);
      return;
    }

    // Not a legal pour. If the tapped tube has something to lift, the player
    // has most likely changed their mind about what to move, so pick that up
    // instead of making them tap twice more.
    if (tube.length > 0 && !isComplete(tube)) {
      this.selected = index;
      this.host.sfx("plasmaLift");
    } else {
      this.refuse(index);
    }
  }

  private refuse(index: number): void {
    this.shake[index] = 0.28;
    this.host.sfx("plasmaDeny");
  }

  // ----- Moves -----

  private pourInto(from: number, to: number): void {
    const layout = this.layout();
    const srcLen = this.board[from]!.length;
    const dstLen = this.board[to]!.length;
    const liftPx = (this.lift[from] ?? 0) * layout.lift;
    const colour = this.board[from]![srcLen - 1]!;

    const move = pour(this.board, from, to);
    if (!move) return;

    this.history.push(move);
    this.pours += 1;
    this.selected = null;
    this.lift[from] = 0;

    this.launch(move.count, colour, (k) => {
      const start = cellCentre(layout, from, srcLen - 1 - k);
      return { x: start.x, y: start.y - liftPx, tube: to, slot: dstLen + k };
    });
    this.host.sfx("plasmaPour");

    if (isComplete(this.board[to]!)) {
      this.sealIn[to] = this.travelSeconds(move.count);
    }

    this.afterChange();
    if (isStuck(this.board)) this.say("NO POURS LEFT -- TRY UNDO");
  }

  private undo(): void {
    if (this.phase !== "playing") return;
    const move = this.history.pop();
    if (!move) return;

    const layout = this.layout();
    const fromLen = this.board[move.to]!.length;
    const backLen = this.board[move.from]!.length;
    const colour = this.board[move.to]![fromLen - 1]!;

    unpour(this.board, move);
    this.selected = null;
    this.unsealOpened();

    this.launch(move.count, colour, (k) => {
      const start = cellCentre(layout, move.to, fromLen - 1 - k);
      return { x: start.x, y: start.y, tube: move.from, slot: backLen + k };
    });
    this.host.sfx("plasmaUndo");

    if (this.ranked && !this.warnedAboutUndo) {
      this.warnedAboutUndo = true;
      this.say("UNDONE -- THE POUR STILL COUNTS");
    }
    this.afterChange();
  }

  private reset(): void {
    if (this.phase !== "playing" || this.history.length === 0) return;
    this.board = cloneBoard(this.initial);
    this.history = [];
    this.selected = null;
    this.flights = [];
    this.squash.clear();
    this.unsealOpened();
    this.host.sfx("plasmaUndo");
    this.afterChange();
  }

  /** Put `count` cells in the air towards where the board already has them. */
  private launch(
    count: number,
    colour: number,
    route: (k: number) => { x: number; y: number; tube: number; slot: number },
  ): void {
    // Anything still flying lands now: the board is ahead of the animation,
    // and a second pour shouldn't have to wait for the first to finish.
    this.flights = [];
    if (this.host.settings.reducedMotion) return;
    for (let k = 0; k < count; k += 1) {
      const leg = route(k);
      this.flights.push({
        colour,
        fromX: leg.x,
        fromY: leg.y,
        tube: leg.tube,
        slot: leg.slot,
        t: (-k * FLIGHT_STAGGER) / FLIGHT_SECONDS,
      });
    }
  }

  private travelSeconds(count: number): number {
    if (this.host.settings.reducedMotion) return 0;
    return FLIGHT_SECONDS + (count - 1) * FLIGHT_STAGGER;
  }

  private seal(index: number): void {
    this.sealIn[index] = -1;
    if (!isComplete(this.board[index]!)) return;
    this.sealed[index] = true;
    this.sealPulse[index] = 1;
    this.host.sfx("plasmaSeal");

    if (this.host.settings.reducedMotion) return;
    const layout = this.layout();
    const tube = layout.tubes[index]!;
    this.particles.burst(
      tube.x,
      tube.bottom - layout.tubeH,
      plasmaColour(this.board[index]![0]!),
      14,
      70,
    );
  }

  /** A tube that's been poured out of is no longer finished. */
  private unsealOpened(): void {
    for (let i = 0; i < this.board.length; i += 1) {
      if (!isComplete(this.board[i]!)) {
        this.sealed[i] = false;
        this.sealIn[i] = -1;
      }
    }
  }

  private afterChange(): void {
    this.refreshControls();
    this.saveAttempt();
  }

  private say(text: string): void {
    this.toast = text;
    this.toastTimer = 2.6;
  }

  // ----- Starting and finishing -----

  private begin(mode: Mode): void {
    this.mode = mode;
    this.host.sfx("uiSelect");

    // One reading of the clock for the seed, the board id and the saved
    // attempt, so they cannot disagree however long the puzzle takes.
    const now = new Date();
    this.dateKey = dailyKey(now);
    this.dateLabel = `${MONTHS[now.getMonth()]} ${now.getDate()}`;

    const seed =
      mode === "daily"
        ? (dailySeed(now) ^ SEED_SALT) >>> 0
        : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const puzzle = generatePuzzle(seed, COLOURS[mode]);

    this.initial = cloneBoard(puzzle.board);
    this.board = cloneBoard(puzzle.board);
    this.par = puzzle.par;
    this.pours = 0;
    this.seconds = 0;
    this.history = [];
    this.ranked = mode !== "warmup";
    this.boardId = undefined;

    if (mode === "daily") {
      // Clears the cabinet's "TODAY" badge -- for actually opening the day's
      // puzzle, not just the cabinet.
      markDailySeen(plasmaSortModule.id, this.dateKey);
      this.boardId = `daily-${this.dateKey}`;

      const saved = loadDailyAttempt(this.dateKey);
      if (saved?.result) {
        // Already on today's board. Playing it again is practice.
        this.ranked = false;
      } else if (saved && sameCells(saved.board, puzzle.board)) {
        this.board = cloneBoard(saved.board);
        this.pours = saved.pours;
        this.seconds = saved.seconds;
        this.history = saved.history.slice();
      }
    }

    const count = this.board.length;
    this.selected = null;
    this.flights = [];
    this.squash.clear();
    this.lift = new Array<number>(count).fill(0);
    this.shake = new Array<number>(count).fill(0);
    this.sealPulse = new Array<number>(count).fill(0);
    this.sealIn = new Array<number>(count).fill(-1);
    this.sealed = this.board.map(isComplete);
    this.toastTimer = 0;
    this.warnedAboutUndo = false;

    this.phase = "playing";
    this.root.style.visibility = "";
    this.buildPlayControls();
    this.saveAttempt();
  }

  private finish(): void {
    this.phase = "solved";
    this.selected = null;
    this.resultTime = 0;
    this.toastTimer = 0;
    this.offerShare = false;
    this.stars = starsFor(this.pours, this.par);
    this.finalScore = scoreSolve(this.pours, this.par, this.seconds);
    // Hidden, not removed: the rack is fitted to the space above this panel,
    // and taking it out would slide every tube down at the moment of winning.
    this.root.style.visibility = "hidden";

    if (this.ranked) this.host.addScore(this.finalScore);

    if (this.mode === "daily" && this.ranked) {
      saveDailyAttempt({
        ...this.attempt(),
        result: {
          score: this.finalScore,
          pours: this.pours,
          par: this.par,
          seconds: Math.round(this.seconds),
        },
      });
      const next = advanceStreak(loadStreak(), this.dateKey, yesterdayKey());
      saveStreak(next);
      this.streak = next.count;
      this.offerShare = true;
      this.buildResultControls();
    }

    this.host.sfx(this.stars === 3 ? "plasmaPerfect" : "plasmaSolved");
    if (!this.host.settings.reducedMotion) {
      const { w, h } = this.host.view;
      for (let colour = 1; colour <= COLOURS[this.mode]; colour += 1) {
        this.particles.burst(w / 2, h * 0.4, plasmaColour(colour), 10, 190);
      }
    }
  }

  /** Hand over to the shell's result screen. */
  private leave(): void {
    this.host.gameOver({
      progress: Math.max(1, this.pours),
      progressLabel: "Pours",
      ranked: this.ranked,
      headline: !this.ranked ? "NICELY SORTED" : this.stars === 3 ? "PERFECT SORT" : "SORTED",
      ...(this.boardId && this.ranked ? { boardId: this.boardId } : {}),
    });
  }

  private attempt(): DailyAttempt {
    return {
      date: this.dateKey,
      board: this.board,
      pours: this.pours,
      seconds: this.seconds,
      history: this.history,
      result: null,
    };
  }

  /** Only the ranked daily is worth keeping; everything else is disposable. */
  private saveAttempt(): void {
    if (this.phase !== "playing" || this.mode !== "daily" || !this.ranked) return;
    saveDailyAttempt(this.attempt());
  }

  // ----- Rendering -----

  private layout(): Layout {
    const { view } = this.host;
    const panelUnits = view.toWorldDistance(this.panelPx);
    // Clears the HUD and the shell's 56px pause button.
    const top = view.insetTop + 96;
    const bottom = view.h - panelUnits - 30;
    return computeLayout(this.board.length, view.w, top, Math.max(top + 200, bottom));
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { view, settings } = this.host;
    const reduced = settings.reducedMotion;

    drawBackdrop(ctx, view.w, view.h, this.time, reduced);

    if (this.phase === "choosing") {
      this.renderTitle(ctx);
      return;
    }

    this.renderLabel(ctx);

    const layout = this.layout();
    drawRack(ctx, layout);

    const inFlight = new Set<number>();
    for (const flight of this.flights) inFlight.add(flight.tube * CAPACITY + flight.slot);

    this.board.forEach((tube, i) => {
      const shake = this.shake[i] ?? 0;
      const style = {
        sealed: this.sealed[i] ? (tube[0] ?? 0) : 0,
        sealPulse: this.sealPulse[i] ?? 0,
        selected: this.selected === i,
        target:
          this.selected !== null &&
          this.selected !== i &&
          pourCount(this.board, this.selected, i) > 0,
        offsetX: shake > 0 ? Math.sin(shake * 60) * 3.5 * (shake / 0.28) : 0,
        time: this.time,
        reducedMotion: reduced,
      };

      drawTubeBack(ctx, layout, i, style);

      const lift = (this.lift[i] ?? 0) * layout.lift;
      const run = lift > 0.01 ? topRun(tube) : 0;
      const drawSlot = (slot: number, lifted: boolean) => {
        if (inFlight.has(i * CAPACITY + slot)) return;
        const centre = cellCentre(layout, i, slot);
        drawCell(
          ctx,
          centre.x + style.offsetX,
          centre.y - (lifted ? lift : 0),
          layout.cellW,
          layout.cellH,
          tube[slot]!,
          {
            highContrast: settings.highContrast,
            glow: lifted ? (this.lift[i] ?? 0) : 0,
            squash: this.squash.get(i * CAPACITY + slot) ?? 0,
          },
        );
      };

      // The lifted run goes on top of the glass: it has left the tube, and a
      // rim drawn across it makes it look stuck in the neck.
      for (let slot = 0; slot < tube.length - run; slot += 1) drawSlot(slot, false);
      drawTubeFront(ctx, layout, i, style);
      for (let slot = tube.length - run; slot < tube.length; slot += 1) drawSlot(slot, true);
    });

    for (const flight of this.flights) this.renderFlight(ctx, layout, flight);

    this.particles.render(ctx);
    this.renderToast(ctx);

    if (this.phase === "solved") this.renderResult(ctx);
    // Last, so it stays level with the shell's own readouts over the card.
    this.renderPar(ctx);
  }

  /**
   * A cell on its way over: straight up out of its tube, across above the
   * rims, straight down into the next. The three legs overlap so it reads as
   * one arc, but it never cuts through the glass.
   */
  private renderFlight(ctx: CanvasRenderingContext2D, layout: Layout, flight: Flight): void {
    const end = cellCentre(layout, flight.tube, flight.slot);
    if (flight.t <= 0) {
      drawCell(ctx, flight.fromX, flight.fromY, layout.cellW, layout.cellH, flight.colour, {
        highContrast: this.host.settings.highContrast,
        glow: 1,
      });
      return;
    }
    const t = Math.min(1, flight.t);
    const destTop = layout.tubes[flight.tube]!.bottom - layout.tubeH;
    const apex = Math.min(flight.fromY, destTop) - layout.cellH * 0.9;

    const x = flight.fromX + (end.x - flight.fromX) * smooth((t - 0.15) / 0.6);
    const rise = smooth(t / 0.4);
    const fall = smooth((t - 0.6) / 0.4);
    const y = flight.fromY + (apex - flight.fromY) * rise + (end.y - apex) * fall;

    drawCell(ctx, x, y, layout.cellW, layout.cellH, flight.colour, {
      highContrast: this.host.settings.highContrast,
      glow: 1 - fall,
    });
  }

  /** PAR sits beside the shell's POURS readout, in the same type, as its twin. */
  private renderPar(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const scale = settings.largeText ? 1.2 : 1;
    const top = view.insetTop + 14;
    const x = view.w / 2 + 38;

    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.font = `${9 * scale}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillStyle = "rgba(142,163,200,0.75)";
    ctx.fillText("PAR", x, top);
    ctx.font = `700 ${17 * scale}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillStyle = settings.highContrast ? "#ffffff" : WARM;
    ctx.fillText(String(this.par), x, top + 9 * scale + 4);
    ctx.restore();
  }

  private renderLabel(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const scale = settings.largeText ? 1.2 : 1;
    const label =
      this.mode === "daily"
        ? `${this.ranked ? "TODAY'S PUZZLE" : "TODAY'S PUZZLE · PRACTICE"} · ${this.dateLabel}`
        : this.mode === "free"
          ? "FREE PLAY"
          : "WARM-UP";
    drawText(ctx, label, view.w / 2, view.insetTop + 76, 10 * scale, DIM, { spacing: 1.5 });
  }

  private renderToast(ctx: CanvasRenderingContext2D): void {
    if (this.toastTimer <= 0) return;
    const { view, settings } = this.host;
    const y = view.h - view.toWorldDistance(this.panelPx) - 16;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.toastTimer / 0.4);
    drawText(ctx, this.toast, view.w / 2, y, settings.largeText ? 12 : 10, WARM, {
      bold: true,
      spacing: 1,
    });
    ctx.restore();
  }

  private renderTitle(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const panelUnits = view.toWorldDistance(this.panelPx);
    const top = view.insetTop + 70;
    const centre = top + (view.h - panelUnits - top) / 2;

    drawText(ctx, "PLASMA SORT", view.w / 2, centre - 112, 26, INK, { bold: true, spacing: 4 });
    drawText(ctx, "ONE COLOUR PER TUBE", view.w / 2, centre - 86, 10, DIM, { spacing: 2 });
    drawTitleArt(ctx, view.w, centre + 6, this.time, settings.highContrast, settings.reducedMotion);

    if (this.titleStreak > 1) {
      drawText(ctx, `${this.titleStreak}-DAY STREAK`, view.w / 2, centre + 104, 11, WARM, {
        bold: true,
        spacing: 2,
      });
    }
  }

  private renderResult(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const t = this.resultTime;
    const reduced = settings.reducedMotion;
    const fade = reduced ? 1 : Math.min(1, t / 0.35);
    const cx = view.w / 2;
    const cy = view.h * 0.4;

    ctx.save();
    ctx.globalAlpha = fade * 0.84;
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = fade;

    this.particles.render(ctx);

    const headline = this.stars === 3 ? "PERFECT SORT" : "SORTED";
    drawText(ctx, headline, cx, cy - 74, 24, this.stars === 3 ? WARM : INK, {
      bold: true,
      spacing: 4,
    });

    for (let i = 0; i < 3; i += 1) {
      const delay = 0.3 + i * 0.22;
      const earned = i < this.stars;
      const age = reduced ? 1 : (t - delay) / 0.3;
      // Overshoot, then settle: each star lands rather than appearing.
      const pop = !earned || age >= 1 ? 1 : age <= 0 ? 0 : 1 + 0.35 * Math.sin(age * Math.PI);
      const shown = earned && age > 0;
      drawStar(ctx, cx + (i - 1) * 54, cy - 14 - (i === 1 ? 8 : 0), 20 * (shown ? pop : 1), shown);
    }

    const over = this.pours - this.par;
    drawText(ctx, `${this.pours} POURS  ·  PAR ${this.par}`, cx, cy + 40, 13, INK, {
      bold: true,
      spacing: 1.5,
    });
    drawText(
      ctx,
      over <= 0 ? "NOT A POUR WASTED" : `${over} OVER PAR  ·  ${formatClock(this.seconds)}`,
      cx,
      cy + 62,
      10,
      DIM,
      { spacing: 1.5 },
    );

    if (this.ranked) {
      drawText(ctx, this.finalScore.toLocaleString("en-US"), cx, cy + 104, 30, ACCENT, {
        bold: true,
        spacing: 2,
      });
      drawText(ctx, "POINTS", cx, cy + 128, 9, DIM, { spacing: 2 });
    }
    if (this.streak > 1) {
      drawText(ctx, `${this.streak}-DAY STREAK`, cx, cy + 156, 11, WARM, {
        bold: true,
        spacing: 2,
      });
    }

    // With SHARE and DONE on screen, the buttons are the prompt.
    if (t >= RESULT_MIN_SECONDS && !this.offerShare) {
      const blink = reduced ? 1 : 0.55 + 0.45 * Math.sin(this.time * 4);
      ctx.globalAlpha = fade * blink;
      drawText(ctx, "TAP TO CONTINUE", cx, view.h - view.insetBottom - 44, 10, INK, {
        spacing: 2,
      });
    }
    ctx.restore();
  }

  // ----- DOM panels -----

  private buildModeChooser(): void {
    const today = dailyKey();
    const saved = loadDailyAttempt(today);
    const fresh = loadDailySeen()[plasmaSortModule.id] !== today;

    const dailyHint = saved?.result
      ? `Solved: ${saved.result.score.toLocaleString("en-US")} pts in ${saved.result.pours} pours. Replay for practice.`
      : saved && saved.pours > 0
        ? `In progress: ${saved.pours} ${saved.pours === 1 ? "pour" : "pours"} so far.`
        : "Same puzzle for everyone. Your first solve counts.";

    // Once today is solved, SHARE sits on the same row as the puzzle it's
    // about -- the share is available all day, not just on the result card,
    // because the moment someone solves it is rarely the moment the family
    // chat is open.
    const daily = modeButton("TODAY'S PUZZLE", dailyHint, "daily", () => this.begin("daily"), fresh);
    let dailyRow: HTMLElement = daily;
    if (saved?.result) {
      dailyRow = div("plasma-daily-row");
      const result = saved.result;
      dailyRow.append(
        daily,
        shareButton("plasma-share plasma-share--tile", () =>
          this.shareMessage(result, today),
        ),
      );
    }

    const panel = div("plasma-panel plasma-panel--modes");
    panel.append(
      dailyRow,
      modeButton("FREE PLAY", "A fresh six-colour puzzle. Ranked.", "free", () =>
        this.begin("free"),
      ),
      modeButton("WARM-UP", "Four colours. No score, no hurry.", "warmup", () =>
        this.begin("warmup"),
      ),
    );
    this.root.replaceChildren(panel);
  }

  private buildPlayControls(): void {
    const panel = div("plasma-panel plasma-panel--play");

    this.undoButton = actionButton("UNDO", () => this.undo());
    this.resetButton = actionButton("RESET", () => this.reset());
    panel.append(this.undoButton, this.resetButton);

    if (this.mode !== "daily") {
      panel.append(actionButton("NEW PUZZLE", () => this.begin(this.mode)));
    }

    this.root.replaceChildren(panel);
    this.refreshControls();
  }

  /**
   * SHARE and DONE under the day's result card. Same height as the UNDO row it
   * replaces, so the rack behind the card doesn't move. Kept hidden until the
   * card has settled (update()).
   */
  private buildResultControls(): void {
    const panel = div("plasma-panel plasma-panel--play");
    const result = {
      score: this.finalScore,
      pours: this.pours,
      par: this.par,
      seconds: Math.round(this.seconds),
    };
    panel.append(
      shareButton("plasma-act plasma-share", () =>
        this.shareMessage(result, this.dateKey, this.streak),
      ),
      actionButton("DONE", () => this.leave()),
    );
    this.root.replaceChildren(panel);
    this.root.style.visibility = "hidden";
  }

  private shareMessage(result: DailyResult, dateKey: string, streak?: number): string {
    return dailyShareText(
      result,
      dateKey,
      streak ?? liveStreak(loadStreak(), dailyKey(), yesterdayKey()),
      playLink(plasmaSortModule.id),
    );
  }

  private refreshControls(): void {
    const none = this.history.length === 0;
    if (this.undoButton) this.undoButton.disabled = none;
    if (this.resetButton) this.resetButton.disabled = none;
  }

  private watchPanelHeight(): void {
    const measure = () => {
      this.panelPx = this.root.offsetHeight;
    };
    if (typeof ResizeObserver !== "undefined") {
      this.panelObserver = new ResizeObserver(measure);
      this.panelObserver.observe(this.root);
    }
    // The observer doesn't fire until the element is in the document, and the
    // shell mounts it after construction.
    requestAnimationFrame(measure);
  }
}

/** Ease in and out, clamped to 0..1. */
function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function yesterdayKey(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dailyKey(date);
}

/**
 * True when a saved board is today's deal rearranged -- same tubes, same
 * number of each colour. Guards against resuming an attempt saved by a build
 * that dealt the day differently.
 */
function sameCells(saved: Board, dealt: Board): boolean {
  if (saved.length !== dealt.length) return false;
  if (saved.some((tube) => !Array.isArray(tube) || tube.length > CAPACITY)) return false;
  const tally = (board: Board) =>
    board
      .flat()
      .sort((a, b) => a - b)
      .join(",");
  return tally(saved) === tally(dealt);
}

function modeButton(
  title: string,
  hint: string,
  mode: Mode,
  onPick: () => void,
  freshBadge = false,
): HTMLElement {
  const button = document.createElement("button");
  button.className = `plasma-mode plasma-mode--${mode}`;
  const name = div("plasma-mode-name");
  name.textContent = title;
  if (freshBadge) {
    const badge = document.createElement("span");
    badge.className = "badge-new";
    badge.textContent = "TODAY";
    name.append(badge);
  }
  const sub = div("plasma-mode-hint");
  sub.textContent = hint;
  button.append(name, sub);
  button.addEventListener("click", onPick);
  return button;
}

function actionButton(label: string, onPick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "plasma-act";
  button.textContent = label;
  button.addEventListener("click", onPick);
  return button;
}

function div(className: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

export const plasmaSortModule: GameModule = {
  id: "plasma-sort",
  title: "PLASMA SORT",
  progressShort: "P",
  blurb: "Tap a tube, tap another to pour. One colour each.",
  accent: "#d96bff",
  hasDailyChallenge: true,

  drawIcon(ctx, size) {
    drawPlasmaIcon(ctx, size);
  },

  create(host: GameHost): GameInstance {
    return new PlasmaSort(host);
  },
};

/**
 * SOLITAIRE -- Klondike, the way the office PC played it.
 *
 * Seven columns, four foundations, draw one or draw three, standard scoring
 * with the clock taking two points every ten seconds and a bonus for a fast
 * win, and the cards bouncing off the table when you get them all home.
 *
 * Made to be played with the phone on its side. The cabinet draws its own
 * table on its own canvas, across the whole screen, and lays it out for
 * whichever way round the screen is. A phone that won't rotate (rotation
 * lock on, or an installed Android app held upright) gets the table turned
 * sideways for it, so it still plays wide.
 *
 *   rules.ts    the deal, legal moves, scoring, all without a screen
 *   render.ts   cards, backs, felt, the cabinet art
 *   index.ts    this: layout, fingers, animation, the menus
 */

import "./solitaire.css";

import type { GameHost, GameInstance, GameModule, HudState, StartOptions } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import {
  autoFinishMove,
  canAutoFinish,
  cardsHome,
  chargeTime,
  clone,
  deal,
  drawFromStock,
  isWon,
  liftable,
  move,
  pile,
  smartMove,
  timePenaltyAt,
  winBonus,
  type Card,
  type DrawCount,
  type Game,
  type PileRef,
} from "./rules.ts";
import {
  BACKS,
  CardArt,
  drawBackPreview,
  drawSlot,
  drawSolitaireIcon,
  drawStockMark,
  FELT_DARK,
  type BackId,
} from "./render.ts";

const GAME_ID = "solitaire";
/** Draw One scores on its own board: it's the easier game. */
const DRAW_ONE_BOARD = "solitaire-draw1";
const PREFS_KEY = "hyperdrive.solitaire";

/** Seconds a card takes to slide to where it's going. */
const SLIDE = 0.16;
/** Seconds between cards as a new deal goes out. */
const DEAL_STAGGER = 0.03;
/** Seconds a card takes to turn over. */
const FLIP = 0.16;
/** A finger that moves less than this (CSS px) is a tap, not a drag. */
const DRAG_START = 7;
/** Seconds between cards when the game finishes itself. */
const AUTO_STEP = 0.11;

interface Prefs {
  draw: DrawCount;
  back: BackId;
  /** Turn the table sideways on a phone held (or stuck) upright. */
  sideways: boolean;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { draw: 3, back: "blue", sideways: true };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!raw) return fallback;
    return {
      draw: raw.draw === 1 ? 1 : 3,
      back: BACKS.some((b) => b.id === raw.back) ? (raw.back as BackId) : "blue",
      sideways: raw.sideways !== false,
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the choice lasts the session, which is fine.
  }
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  /** The table, in CSS px of the cabinet. */
  W: number;
  H: number;
  cw: number;
  ch: number;
  /** Left edge of each of the seven columns. */
  cols: number[];
  topY: number;
  tabY: number;
  /** The bottom a column may reach before it squeezes up. */
  bottom: number;
  fanX: number;
  wide: boolean;
  /** Safe-area insets in the table's own directions. */
  inset: { l: number; r: number; t: number; b: number };
}

interface Placed {
  card: Card;
  x: number;
  y: number;
}

interface Slide {
  fx: number;
  fy: number;
  start: number;
  dur: number;
}

interface Drag {
  pointerId: number;
  from: PileRef;
  start: number;
  /** Where the finger went down, and where it is now. */
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** The finger's offset from the top card's corner. */
  gx: number;
  gy: number;
  /** False until the finger has moved far enough to be a drag. */
  moving: boolean;
  /** What was under the finger: the stock, a card, or an empty place. */
  hit: Hit;
}

type Hit =
  | { kind: "stock" }
  | { kind: "card"; ref: PileRef; index: number }
  | { kind: "none" };

interface Bouncer {
  card: Card;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Remembered for PLAY AGAIN, which skips the title. */
let lastDraw: DrawCount | null = null;

const now = () => performance.now() / 1000;

class Solitaire implements GameInstance {
  private readonly host: GameHost;
  private readonly prefs = loadPrefs();
  private readonly root = el("div", "sol-root");
  private readonly canvas = el("canvas", "sol-canvas") as HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly art = new CardArt();
  private readonly scoreText = el("span", "sol-stat-value", "0");
  private readonly timeText = el("span", "sol-stat-value", "0:00");
  private readonly drawText = el("span", "sol-draw", "");
  private readonly undoBtn = button("sol-btn", "UNDO");
  private readonly dealBtn = button("sol-btn", "DEAL");
  private readonly finishBtn = button("sol-finish", "FINISH");
  private overlay: HTMLElement | null = null;

  private game: Game | null = null;
  /** Each move's starting point, with the clock's points taken by then. */
  private history: { game: Game; timeTaken: number }[] = [];
  private seconds = 0;
  /** Time penalty already taken off the score, so undo can't refund it. */
  private timeTaken = 0;
  private clockRunning = false;
  private phase: "title" | "play" | "auto" | "cascade" | "done" = "title";
  private autoTimer = 0;

  private layout: Layout | null = null;
  private dpr = 1;
  private slides = new Map<number, Slide>();
  private flips = new Map<number, number>();
  private drag: Drag | null = null;
  private dirty = true;
  private sideways = false;
  private dealConfirm = 0;

  private bouncers: Bouncer[] = [];
  private launchOrder: { card: Card; f: number }[] = [];
  private cascadeAcc = 0;
  private cascadeDrawn = false;
  private shownScore = -1;
  private shownTime = -1;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.ctx = this.canvas.getContext("2d")!;
    // A handle for poking at a game from the console while developing.
    if (import.meta.env.DEV) (window as unknown as { __solitaire: Solitaire }).__solitaire = this;
    this.buildChrome();
    this.lockLandscape();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onCancel);
    // The root is mounted by the shell after this returns; measure then.
    requestAnimationFrame(() => this.onResize());
    if (start?.again && lastDraw) {
      this.prefs.draw = lastDraw;
      this.newDeal();
    } else {
      this.showTitle(false);
    }
  }

  // ----- GameInstance -----

  extraControls(): HTMLElement {
    return this.root;
  }

  update(dt: number, _input: InputSnapshot): void {
    if (this.clockRunning && this.phase === "play" && !this.overlay && this.game) {
      this.seconds += dt;
      const owed = timePenaltyAt(this.seconds);
      if (owed > this.timeTaken) {
        chargeTime(this.game, owed - this.timeTaken);
        this.timeTaken = owed;
      }
    }
    if (this.phase === "auto") {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.autoTimer = AUTO_STEP;
        this.autoStep();
      }
    }
    if (this.dealConfirm > 0) {
      this.dealConfirm -= dt;
      if (this.dealConfirm <= 0) this.dealBtn.textContent = "DEAL";
    }
    if (this.phase === "cascade") this.cascadeAcc += dt;
    this.updateStats();
  }

  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {
    // The last card lands first; the bouncing starts after.
    if (this.phase === "cascade" && this.cascadeAcc >= 0) {
      this.drawCascade();
      return;
    }
    const t = now();
    if (!this.dirty && this.slides.size === 0 && this.flips.size === 0 && !this.drag?.moving) return;
    this.dirty = false;
    this.draw(t);
  }

  hud(): HudState {
    return { lives: 0, progress: 0, progressLabel: "" };
  }

  /** A deal nobody has touched, a menu, or the bouncing cards: nothing to protect. */
  pausesWhenHidden(): boolean {
    return this.phase === "play" && this.clockRunning && !this.overlay;
  }

  onPause(): void {
    this.cancelDrag();
  }

  onResume(): void {
    this.onResize();
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    this.setSideways(false);
    try {
      (screen.orientation as unknown as { unlock?: () => void } | undefined)?.unlock?.();
    } catch {
      // Not supported here; nothing was locked.
    }
  }

  // ----- Chrome -----

  private buildChrome(): void {
    const left = el("div", "sol-rail sol-rail--left");
    const score = el("div", "sol-stat");
    score.append(el("span", "sol-stat-label", "SCORE"), this.scoreText);
    const time = el("div", "sol-stat");
    time.append(el("span", "sol-stat-label", "TIME"), this.timeText);
    left.append(score, time, this.drawText);

    const right = el("div", "sol-rail sol-rail--right");
    const pause = button("sol-btn sol-btn--pause", "");
    pause.setAttribute("aria-label", "Pause");
    pause.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    pause.addEventListener("click", () => {
      this.cancelDrag();
      if (this.host.pause) this.host.pause();
      else this.host.exitToArcade?.();
    });
    this.undoBtn.addEventListener("click", () => this.undo());
    this.dealBtn.addEventListener("click", () => this.onDealButton());
    const options = button("sol-btn", "GAME");
    options.addEventListener("click", () => this.showTitle(true));
    right.append(pause, this.undoBtn, this.dealBtn, options);

    this.finishBtn.hidden = true;
    this.finishBtn.addEventListener("click", () => this.startAutoFinish());

    this.root.append(this.canvas, left, right, this.finishBtn);
  }

  private onDealButton(): void {
    if (this.phase === "cascade" || this.phase === "done") return;
    const inProgress = this.game && this.game.moves > 0 && !isWon(this.game);
    if (inProgress && this.dealConfirm <= 0) {
      this.dealConfirm = 3;
      this.dealBtn.textContent = "SURE?";
      this.host.sfx("uiMove");
      return;
    }
    this.dealConfirm = 0;
    this.dealBtn.textContent = "DEAL";
    this.newDeal();
  }

  private updateStats(): void {
    const score = this.game?.score ?? 0;
    if (score !== this.shownScore) {
      this.shownScore = score;
      this.scoreText.textContent = String(score);
    }
    const secs = Math.floor(this.seconds);
    if (secs !== this.shownTime) {
      this.shownTime = secs;
      this.timeText.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    }
    const canUndo = this.history.length > 0 && this.phase === "play";
    if (this.undoBtn.disabled === canUndo) this.undoBtn.disabled = !canUndo;
    const finish = this.phase === "play" && !!this.game && canAutoFinish(this.game);
    if (this.finishBtn.hidden === finish) this.finishBtn.hidden = !finish;
  }

  /** The title card, and the same panel mid-game for changing the game. */
  private showTitle(midGame: boolean): void {
    this.cancelDrag();
    this.overlay?.remove();
    const panel = el("div", "sol-panel");
    const box = el("div", "sol-panel-box");
    box.append(el("h2", "sol-title", "SOLITAIRE"));
    box.append(el("p", "sol-sub", "Klondike, like the old office computer."));

    const drawRow = el("div", "sol-choice");
    const drawButtons: HTMLButtonElement[] = [];
    for (const n of [1, 3] as const) {
      const b = button("sol-pill", n === 1 ? "DRAW ONE" : "DRAW THREE");
      b.setAttribute("aria-pressed", String(this.prefs.draw === n));
      b.addEventListener("click", () => {
        this.prefs.draw = n;
        savePrefs(this.prefs);
        for (const other of drawButtons) other.setAttribute("aria-pressed", String(other === b));
        this.host.sfx("uiMove");
      });
      drawButtons.push(b);
      drawRow.append(b);
    }
    box.append(drawRow);
    if (midGame) box.append(el("p", "sol-note", "A new draw starts with the next deal."));

    const backRow = el("div", "sol-backs");
    const backButtons: HTMLButtonElement[] = [];
    for (const back of BACKS) {
      const b = button("sol-back", "");
      b.setAttribute("aria-label", `${back.label} card back`);
      b.setAttribute("aria-pressed", String(this.prefs.back === back.id));
      const preview = el("canvas", "") as HTMLCanvasElement;
      drawBackPreview(preview, back.id);
      b.append(preview);
      b.addEventListener("click", () => {
        this.prefs.back = back.id;
        savePrefs(this.prefs);
        for (const other of backButtons) other.setAttribute("aria-pressed", String(other === b));
        this.dirty = true;
        this.host.sfx("uiMove");
      });
      backButtons.push(b);
      backRow.append(b);
    }
    box.append(backRow);

    if (isTouch()) {
      const side = el("label", "sol-toggle");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = this.prefs.sideways;
      check.addEventListener("change", () => {
        this.prefs.sideways = check.checked;
        savePrefs(this.prefs);
        this.onResize();
      });
      side.append(check, el("span", "", "Turn the table sideways when the phone is upright"));
      box.append(side);
    }

    const actions = el("div", "sol-actions");
    if (midGame && this.game && !isWon(this.game)) {
      const back = button("sol-big", "BACK TO GAME");
      back.addEventListener("click", () => {
        this.closeOverlay();
        this.host.sfx("uiSelect");
      });
      const fresh = button("sol-big sol-big--ghost", "NEW DEAL");
      fresh.addEventListener("click", () => {
        this.closeOverlay();
        this.newDeal();
      });
      actions.append(back, fresh);
    } else {
      const go = button("sol-big", "DEAL");
      go.addEventListener("click", () => {
        this.closeOverlay();
        this.newDeal();
      });
      actions.append(go);
    }
    if (this.host.exitToArcade) {
      const out = button("sol-link", "BACK TO ARCADE");
      out.addEventListener("click", () => this.host.exitToArcade?.());
      actions.append(out);
    }
    box.append(actions);
    if (!midGame) box.append(el("p", "sol-note", "Best with the phone on its side."));
    panel.append(box);
    this.overlay = panel;
    this.root.append(panel);
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.dirty = true;
  }

  // ----- The game -----

  private newDeal(): void {
    this.closeOverlay();
    lastDraw = this.prefs.draw;
    this.game = deal(Math.floor(Math.random() * 2 ** 31), this.prefs.draw);
    this.history = [];
    this.seconds = 0;
    this.timeTaken = 0;
    this.clockRunning = false;
    this.phase = "play";
    this.drawText.textContent = this.prefs.draw === 1 ? "DRAW 1" : "DRAW 3";
    this.slides.clear();
    this.flips.clear();
    this.drag = null;
    // Every card flies out from the stock, in the order a person deals.
    const layout = this.layout;
    if (layout) {
      const t = now();
      const sx = layout.cols[0]!;
      const sy = layout.topY;
      let i = 0;
      for (let row = 0; row < 7; row += 1) {
        for (let col = row; col < 7; col += 1) {
          const card = this.game.tableau[col]![row]!;
          this.slides.set(card.id, { fx: sx, fy: sy, start: t + i * DEAL_STAGGER, dur: SLIDE * 1.4 });
          i += 1;
        }
      }
    }
    this.host.sfx("cardDeal");
    this.dirty = true;
  }

  /**
   * Make a change to the game with undo and animation: everything that moved
   * slides from where it was drawn to where it now belongs, and anything that
   * turned over flips.
   */
  private act(change: (game: Game) => boolean): boolean {
    const game = this.game;
    if (!game) return false;
    const before = this.displayed();
    const wasUp = new Map<number, boolean>();
    for (const p of before.values()) wasUp.set(p.card.id, p.card.up);
    const snapshot = clone(game);
    if (!change(game)) return false;
    this.history.push({ game: snapshot, timeTaken: this.timeTaken });
    if (this.history.length > 500) this.history.shift();
    this.clockRunning = true;
    this.slideFrom(before, wasUp);
    this.afterMove();
    return true;
  }

  private slideFrom(before: Map<number, Placed>, wasUp?: Map<number, boolean>): void {
    const t = now();
    for (const p of this.placed()) {
      const old = before.get(p.card.id);
      if (old && (Math.abs(old.x - p.x) > 0.5 || Math.abs(old.y - p.y) > 0.5)) {
        this.slides.set(p.card.id, { fx: old.x, fy: old.y, start: t, dur: SLIDE });
      }
      if (wasUp && wasUp.get(p.card.id) === false && p.card.up) this.flips.set(p.card.id, t);
    }
    this.dirty = true;
  }

  private afterMove(): void {
    const game = this.game;
    if (!game) return;
    if (isWon(game)) {
      this.win();
      return;
    }
  }

  private undo(): void {
    if (this.phase !== "play" || !this.game) return;
    const previous = this.history.pop();
    if (!previous) return;
    const before = this.displayed();
    const wasUp = new Map<number, boolean>();
    for (const p of before.values()) wasUp.set(p.card.id, p.card.up);
    // Undo rewinds the cards, not the clock: points the time has taken
    // since that move stay taken.
    const restored = previous.game;
    restored.score = Math.max(0, restored.score - (this.timeTaken - previous.timeTaken));
    this.game = restored;
    this.slideFrom(before, wasUp);
    this.host.sfx("cardUndo");
  }

  private tapStock(): void {
    const game = this.game;
    if (!game) return;
    const result = { what: "none" as ReturnType<typeof drawFromStock> };
    this.act((g) => {
      result.what = drawFromStock(g);
      return result.what !== "none";
    });
    if (result.what === "draw") this.host.sfx("cardFlick");
    else if (result.what === "recycle") this.host.sfx("cardPlace");
    else this.deny();
  }

  private tryMove(from: PileRef, start: number, to: PileRef): boolean {
    const home = to.kind === "foundation";
    const moved = this.act((g) => move(g, from, start, to));
    if (moved && this.phase === "play") this.host.sfx(home ? "cardHome" : "cardPlace");
    return moved;
  }

  private tapCard(ref: PileRef, index: number): void {
    const game = this.game;
    if (!game) return;
    const to = smartMove(game, ref, index);
    if (to && this.tryMove(ref, index, to)) return;
    this.deny();
  }

  private deny(): void {
    this.host.sfx("cardDeny");
    this.host.buzz(12);
  }

  private startAutoFinish(): void {
    if (this.phase !== "play" || !this.game || !canAutoFinish(this.game)) return;
    this.phase = "auto";
    this.autoTimer = 0;
    this.finishBtn.hidden = true;
  }

  private autoStep(): void {
    const game = this.game;
    if (!game) return;
    const next = autoFinishMove(game);
    if (!next) {
      this.phase = "play";
      return;
    }
    this.act((g) => move(g, next.from, next.start, next.to));
    this.host.sfx("cardHome");
  }

  private win(): void {
    const game = this.game;
    if (!game) return;
    this.clockRunning = false;
    const bonus = winBonus(this.seconds);
    game.score += bonus;
    this.cancelDrag();
    this.host.sfx("cardWin");
    this.host.buzz([20, 60, 20, 60, 40]);
    if (this.host.settings.reducedMotion) {
      this.phase = "done";
      this.dirty = true;
      window.setTimeout(() => this.finish(), 900);
      return;
    }
    // Let the last card land, then let them go.
    this.phase = "cascade";
    this.root.classList.add("sol-cascading");
    this.cascadeDrawn = false;
    this.cascadeAcc = -SLIDE - 0.25;
    this.bouncers = [];
    this.launchOrder = [];
    for (let rank = 13; rank >= 1; rank -= 1) {
      for (let f = 0; f < 4; f += 1) {
        const card = game.foundations[f]![rank - 1];
        if (card) this.launchOrder.push({ card, f });
      }
    }
  }

  private finish(): void {
    if (!this.game || this.phase === "title") return;
    if (this.phaseDone) return;
    this.phaseDone = true;
    this.phase = "done";
    const game = this.game;
    this.host.addScore(game.score);
    this.host.gameOver({
      progress: cardsHome(game),
      progressLabel: "Cards home",
      headline: "YOU WIN!",
      durationMs: Math.max(3000, Math.round(this.seconds * 1000)),
      ...(game.draw === 1 ? { boardId: DRAW_ONE_BOARD } : {}),
      changeLabel: "CHANGE GAME",
    });
  }

  private phaseDone = false;

  // ----- Fingers -----

  private toTable(event: PointerEvent): { x: number; y: number } {
    if (this.sideways) return { x: event.clientY, y: window.innerWidth - event.clientX };
    const r = this.root.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  private onDown = (event: PointerEvent): void => {
    if (this.phase === "cascade") {
      this.finish();
      return;
    }
    if (this.phase !== "play" || this.overlay || this.drag || !this.layout) return;
    const p = this.toTable(event);
    const hit = this.hitTest(p.x, p.y);
    if (hit.kind === "none") return;
    event.preventDefault();
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests can't be captured; the drag still works.
    }
    const drag: Drag = {
      pointerId: event.pointerId,
      from: { kind: "stock" },
      start: 0,
      x0: p.x,
      y0: p.y,
      x: p.x,
      y: p.y,
      gx: 0,
      gy: 0,
      moving: false,
      hit,
    };
    if (hit.kind === "card") {
      drag.from = hit.ref;
      drag.start = hit.index;
      const placed = this.displayed().get(pile(this.game!, hit.ref)[hit.index]!.id);
      if (placed) {
        drag.gx = p.x - placed.x;
        drag.gy = p.y - placed.y;
      }
    }
    this.drag = drag;
  };

  private onMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId || !this.game) return;
    const p = this.toTable(event);
    drag.x = p.x;
    drag.y = p.y;
    if (!drag.moving && drag.hit.kind === "card") {
      if (Math.hypot(p.x - drag.x0, p.y - drag.y0) >= DRAG_START && liftable(this.game, drag.from, drag.start) > 0) {
        drag.moving = true;
        // Anything still sliding is where it was going.
        for (const card of pile(this.game, drag.from).slice(drag.start)) this.slides.delete(card.id);
        this.host.sfx("cardFlick");
      }
    }
    if (drag.moving) this.dirty = true;
  };

  private onUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moving) {
      this.drag = null;
      if (drag.hit.kind === "stock") this.tapStock();
      else if (drag.hit.kind === "card") this.tapCard(drag.hit.ref, drag.hit.index);
      return;
    }
    this.drop(drag);
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) this.cancelDrag();
  };

  /** Put a dragged run back where it came from. */
  private cancelDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    const before = this.displayed();
    this.drag = null;
    if (drag.moving) this.slideFrom(before);
  }

  private drop(drag: Drag): void {
    const game = this.game;
    const layout = this.layout;
    if (!game || !layout) {
      this.cancelDrag();
      return;
    }
    // The dragged top card's rectangle, as it lies under the finger.
    const card = { x: drag.x - drag.gx, y: drag.y - drag.gy, w: layout.cw, h: layout.ch };
    let best: { to: PileRef; area: number } | null = null;
    for (const target of this.dropTargets()) {
      if (!canMoveSafe(game, drag.from, drag.start, target.to)) continue;
      const area = overlap(card, target.rect);
      if (area > 0 && (!best || area > best.area)) best = { to: target.to, area };
    }
    if (best) {
      const to = best.to;
      // Measured while the cards are still under the finger, so they settle
      // from where they were dropped rather than from where they started.
      const dropped = this.displayed();
      this.drag = null;
      if (this.act((g) => move(g, drag.from, drag.start, to))) {
        this.slideFrom(dropped);
        if (this.phase === "play") this.host.sfx(to.kind === "foundation" ? "cardHome" : "cardPlace");
        return;
      }
      this.drag = drag;
    }
    this.cancelDrag();
  }

  private dropTargets(): { to: PileRef; rect: Rect }[] {
    const layout = this.layout!;
    const game = this.game!;
    const targets: { to: PileRef; rect: Rect }[] = [];
    for (let f = 0; f < 4; f += 1) {
      targets.push({
        to: { kind: "foundation", index: f },
        rect: { x: layout.cols[f + 3]!, y: layout.topY, w: layout.cw, h: layout.ch },
      });
    }
    for (let c = 0; c < 7; c += 1) {
      const ys = this.columnYs(game.tableau[c]!);
      const lastY = ys.length > 0 ? ys[ys.length - 1]! : layout.tabY;
      targets.push({
        to: { kind: "tableau", index: c },
        // The whole column counts, down to its last card and a bit past it.
        rect: { x: layout.cols[c]!, y: layout.tabY, w: layout.cw, h: lastY - layout.tabY + layout.ch * 1.3 },
      });
    }
    return targets;
  }

  private hitTest(x: number, y: number): Hit {
    const layout = this.layout;
    const game = this.game;
    if (!layout || !game) return { kind: "none" };
    const { cw, ch, cols, topY } = layout;
    const inside = (rx: number, ry: number, rw = cw, rh = ch) => x >= rx && x < rx + rw && y >= ry && y < ry + rh;

    if (inside(cols[0]!, topY)) return { kind: "stock" };
    if (game.waste.length > 0) {
      const top = game.waste.length - 1;
      const p = this.wastePos(top);
      if (inside(p.x, p.y)) return { kind: "card", ref: { kind: "waste" }, index: top };
    }
    for (let f = 0; f < 4; f += 1) {
      const cards = game.foundations[f]!;
      if (cards.length > 0 && inside(cols[f + 3]!, topY)) {
        return { kind: "card", ref: { kind: "foundation", index: f }, index: cards.length - 1 };
      }
    }
    for (let c = 0; c < 7; c += 1) {
      const cards = game.tableau[c]!;
      const ys = this.columnYs(cards);
      for (let i = cards.length - 1; i >= 0; i -= 1) {
        const bottom = i === cards.length - 1 ? ys[i]! + ch : ys[i + 1]!;
        if (inside(cols[c]!, ys[i]!, cw, bottom - ys[i]!)) {
          if (!cards[i]!.up) return { kind: "none" };
          return { kind: "card", ref: { kind: "tableau", index: c }, index: i };
        }
      }
    }
    return { kind: "none" };
  }

  // ----- Layout -----

  private onResize = (): void => {
    this.setSideways(this.prefs.sideways && isTouch() && window.innerHeight > window.innerWidth);
    const W = this.sideways ? window.innerHeight : this.root.clientWidth || window.innerWidth;
    const H = this.sideways ? window.innerWidth : this.root.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;

    const probe = readInsets();
    const inset = this.sideways
      ? { l: probe.top, r: probe.bottom, t: probe.right, b: probe.left }
      : { l: probe.left, r: probe.right, t: probe.top, b: probe.bottom };
    this.root.style.setProperty("--sol-l", `${inset.l}px`);
    this.root.style.setProperty("--sol-r", `${inset.r}px`);
    this.root.style.setProperty("--sol-t", `${inset.t}px`);
    this.root.style.setProperty("--sol-b", `${inset.b}px`);

    const wide = W >= H;
    this.root.classList.toggle("sol-wide", wide);
    this.root.classList.toggle("sol-tall", !wide);
    let cw: number;
    let x0: number;
    let x1: number;
    let topY: number;
    let bottom: number;
    let gapR: number;
    if (wide) {
      const rail = Math.min(84, Math.max(64, W * 0.09));
      x0 = inset.l + rail;
      x1 = W - inset.r - rail;
      topY = inset.t + 8;
      bottom = H - inset.b - 6;
      gapR = 0.14;
      const byWidth = (x1 - x0) / (7 + 6 * gapR);
      const byHeight = (bottom - topY) / 2.75 / 1.4;
      cw = Math.min(byWidth, byHeight, 120);
    } else {
      x0 = inset.l + 5;
      x1 = W - inset.r - 5;
      topY = inset.t + 62;
      bottom = H - inset.b - 8;
      gapR = 0.09;
      cw = Math.min((x1 - x0) / (7 + 6 * gapR), 100);
    }
    cw = Math.floor(cw);
    const ch = Math.round(cw * 1.4);
    const gap = cw * gapR;
    const total = cw * 7 + gap * 6;
    const left = x0 + (x1 - x0 - total) / 2;
    const cols = Array.from({ length: 7 }, (_, i) => Math.round(left + i * (cw + gap)));
    this.layout = {
      W,
      H,
      cw,
      ch,
      cols,
      topY: Math.round(topY),
      tabY: Math.round(topY + ch + ch * (wide ? 0.14 : 0.2)),
      bottom,
      fanX: Math.round(cw * 0.3),
      wide,
      inset,
    };
    this.art.setSize(cw, ch, this.dpr);
    this.slides.clear();
    this.dirty = true;
    if (this.phase === "cascade") this.cascadeDrawn = false;
  }

  /** Turn the whole cabinet (and the pause and game-over screens with it) on its side. */
  private setSideways(on: boolean): void {
    const ui = document.getElementById("ui");
    this.sideways = on;
    if (!ui) return;
    ui.classList.toggle("sol-sideways", on);
    if (on) {
      ui.style.width = `${window.innerHeight}px`;
      ui.style.height = `${window.innerWidth}px`;
      ui.style.transform = `translateX(${window.innerWidth}px) rotate(90deg)`;
    } else {
      ui.style.width = "";
      ui.style.height = "";
      ui.style.transform = "";
    }
  }

  /** Ask for landscape where a browser allows it (an installed Android app). */
  private lockLandscape(): void {
    try {
      const orientation = screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined;
      orientation?.lock?.("landscape").catch(() => {});
    } catch {
      // iPhones say no; the sideways table covers them.
    }
  }

  /** The y of each card in a column, squeezed up if it would run off the table. */
  private columnYs(cards: readonly Card[]): number[] {
    const layout = this.layout!;
    const { ch, tabY, bottom, wide } = layout;
    let down = ch * 0.1;
    let up = ch * (wide ? 0.27 : 0.3);
    let nDown = 0;
    let nUp = 0;
    for (let i = 0; i < cards.length - 1; i += 1) {
      if (cards[i]!.up) nUp += 1;
      else nDown += 1;
    }
    const room = bottom - tabY - ch;
    if (nDown * down + nUp * up > room) {
      down = Math.max(ch * 0.04, Math.min(down, nDown > 0 ? (room - nUp * up) / nDown : down));
      if (nDown * down + nUp * up > room && nUp > 0) up = Math.max(ch * 0.13, (room - nDown * down) / nUp);
    }
    const ys: number[] = [];
    let y = tabY;
    for (const card of cards) {
      ys.push(Math.round(y));
      y += card.up ? up : down;
    }
    return ys;
  }

  private wastePos(i: number): { x: number; y: number } {
    const layout = this.layout!;
    const game = this.game!;
    const fanned = Math.min(game.fan, game.waste.length);
    const firstFanned = game.waste.length - fanned;
    const k = i >= firstFanned ? i - firstFanned : 0;
    return { x: layout.cols[1]! + k * (game.draw === 3 ? layout.fanX : 0), y: layout.topY };
  }

  /** Every card where it belongs, in drawing order. */
  private placed(): Placed[] {
    const layout = this.layout;
    const game = this.game;
    if (!layout || !game) return [];
    const out: Placed[] = [];
    for (const card of game.stock) out.push({ card, x: layout.cols[0]!, y: layout.topY });
    game.waste.forEach((card, i) => out.push({ card, ...this.wastePos(i) }));
    game.foundations.forEach((cards, f) => {
      for (const card of cards) out.push({ card, x: layout.cols[f + 3]!, y: layout.topY });
    });
    game.tableau.forEach((cards, c) => {
      const ys = this.columnYs(cards);
      cards.forEach((card, i) => out.push({ card, x: layout.cols[c]!, y: ys[i]! }));
    });
    return out;
  }

  /** Where each card is on screen right now: mid-slide or under a finger. */
  private displayed(): Map<number, Placed> {
    const t = now();
    const map = new Map<number, Placed>();
    const dragged = this.draggedIds();
    for (const p of this.placed()) {
      let { x, y } = p;
      const slide = this.slides.get(p.card.id);
      if (slide) {
        const k = ease((t - slide.start) / slide.dur);
        x = slide.fx + (x - slide.fx) * k;
        y = slide.fy + (y - slide.fy) * k;
      }
      const d = dragged.get(p.card.id);
      if (d !== undefined && this.drag) {
        x = this.drag.x - this.drag.gx;
        y = this.drag.y - this.drag.gy + d * this.dragStep();
      }
      map.set(p.card.id, { card: p.card, x, y });
    }
    return map;
  }

  /** The dragged cards, by id, with their place in the run. */
  private draggedIds(): Map<number, number> {
    const ids = new Map<number, number>();
    const drag = this.drag;
    if (!drag?.moving || !this.game) return ids;
    pile(this.game, drag.from)
      .slice(drag.start)
      .forEach((card, i) => ids.set(card.id, i));
    return ids;
  }

  private dragStep(): number {
    const layout = this.layout!;
    return layout.ch * (layout.wide ? 0.27 : 0.3);
  }

  // ----- Drawing -----

  private draw(t: number): void {
    const ctx = this.ctx;
    const layout = this.layout;
    if (!layout) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paintFelt(0, 0, layout.W, layout.H);
    const game = this.game;
    if (!game) return;
    const { cw, ch, cols, topY, tabY } = layout;

    drawSlot(ctx, cols[0]!, topY, cw, ch);
    if (game.stock.length === 0) drawStockMark(ctx, cols[0]!, topY, cw, ch, game.waste.length > 0);
    drawSlot(ctx, cols[1]!, topY, cw, ch);
    for (let f = 0; f < 4; f += 1) drawSlot(ctx, cols[f + 3]!, topY, cw, ch);
    for (let c = 0; c < 7; c += 1) drawSlot(ctx, cols[c]!, tabY, cw, ch);

    const shown = this.displayed();
    const dragged = this.draggedIds();
    const moving: Placed[] = [];
    const lifted: Placed[] = [];
    // Only the stock's top couple of cards can be seen; skip drawing the rest.
    const stockHidden = new Set(game.stock.slice(0, -2).map((c) => c.id));
    for (const p of this.placed()) {
      const at = shown.get(p.card.id)!;
      if (dragged.has(p.card.id)) lifted.push(at);
      else if (this.slides.has(p.card.id)) moving.push(at);
      else if (!stockHidden.has(p.card.id)) this.drawCard(at, t);
    }
    moving.sort((a, b) => this.slides.get(a.card.id)!.start - this.slides.get(b.card.id)!.start);
    for (const p of moving) this.drawCard(p, t);
    for (const p of lifted) this.drawCard(p, t, true);

    // Finished slides and flips stop being animations.
    for (const [id, slide] of this.slides) if (t >= slide.start + slide.dur) this.slides.delete(id);
    for (const [id, start] of this.flips) if (t >= start + FLIP) this.flips.delete(id);
    if (this.slides.size > 0 || this.flips.size > 0) this.dirty = true;
  }

  private drawCard(p: Placed, t: number, lifted = false): void {
    const ctx = this.ctx;
    const { cw, ch } = this.layout!;
    const slide = this.slides.get(p.card.id);
    // A card dealt later than now is still in the stock.
    if (slide && t < slide.start && this.phase === "play" && this.game?.moves === 0) {
      ctx.drawImage(this.art.back(this.prefs.back), slide.fx, slide.fy, cw, ch);
      return;
    }
    let face = p.card.up;
    let squeeze = 1;
    const flip = this.flips.get(p.card.id);
    if (flip !== undefined) {
      const k = Math.min(1, Math.max(0, (t - flip) / FLIP));
      squeeze = Math.abs(Math.cos(k * Math.PI));
      face = k >= 0.5;
    }
    const img = face ? this.art.face(p.card) : this.art.back(this.prefs.back);
    if (lifted) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = cw * 0.15;
      ctx.shadowOffsetY = cw * 0.06;
      ctx.drawImage(img, p.x, p.y, cw, ch);
      ctx.restore();
      return;
    }
    if (squeeze < 1) {
      const w = Math.max(1, cw * squeeze);
      ctx.drawImage(img, p.x + (cw - w) / 2, p.y, w, ch);
    } else {
      ctx.drawImage(img, p.x, p.y, cw, ch);
    }
  }

  private feltFill: CanvasGradient | null = null;
  private feltFor = "";

  /** The felt, painted with one gradient so a patch matches the whole. */
  private paintFelt(x: number, y: number, w: number, h: number): void {
    const layout = this.layout!;
    const key = `${layout.W}x${layout.H}`;
    if (!this.feltFill || this.feltFor !== key) {
      const g = this.ctx.createRadialGradient(
        layout.W / 2,
        layout.H * 0.4,
        0,
        layout.W / 2,
        layout.H * 0.4,
        Math.max(layout.W, layout.H) * 0.75,
      );
      g.addColorStop(0, "#119a38");
      g.addColorStop(1, FELT_DARK);
      this.feltFill = g;
      this.feltFor = key;
    }
    this.ctx.fillStyle = this.feltFill;
    this.ctx.fillRect(x, y, w, h);
  }

  /**
   * The cards leaving the foundations one at a time and bouncing off the
   * bottom of the screen, every frame drawn over the last so each one leaves
   * its trail. Tap to skip to the score.
   */
  private drawCascade(): void {
    const layout = this.layout;
    const game = this.game;
    if (!layout || !game) return;
    const ctx = this.ctx;
    const { cw, ch, cols, topY } = layout;
    if (!this.cascadeDrawn) {
      // The board as it stands, once; everything after is drawn on top.
      this.slides.clear();
      this.flips.clear();
      this.draw(now());
      this.cascadeDrawn = true;
      // Nothing launched yet if this is a redraw after a resize mid-bounce.
      this.bouncers = [];
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const s = cw / 71;
    const floor = layout.H - layout.inset.b - ch;
    const STEP = 1 / 60;
    let steps = 0;
    while (this.cascadeAcc >= STEP && steps < 6) {
      this.cascadeAcc -= STEP;
      steps += 1;
      if (this.bouncers.length === 0) {
        const next = this.launchOrder.shift();
        if (!next) {
          this.finish();
          return;
        }
        const x = cols[next.f + 3]!;
        // Uncover the card underneath on its foundation.
        this.paintFelt(x - 2, topY - 2, cw + 4, ch + 4);
        drawSlot(ctx, x, topY, cw, ch);
        const under = game.foundations[next.f]![next.card.rank - 2];
        if (under) ctx.drawImage(this.art.face(under), x, topY, cw, ch);
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.bouncers.push({
          card: next.card,
          x,
          y: topY,
          vx: dir * (2 + Math.random() * 5) * s,
          vy: -Math.random() * 8 * s,
        });
      }
      const b = this.bouncers[0]!;
      b.vy += 0.6 * s;
      b.x += b.vx;
      b.y += b.vy;
      if (b.y > floor) {
        b.y = floor;
        b.vy = -b.vy * 0.78;
      }
      ctx.drawImage(this.art.face(b.card), b.x, b.y, cw, ch);
      if (b.x < -cw || b.x > layout.W) this.bouncers.shift();
    }
  }
}

function canMoveSafe(game: Game, from: PileRef, start: number, to: PileRef): boolean {
  const copy = clone(game);
  return move(copy, from, start, to);
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function ease(k: number): number {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return 1 - (1 - k) * (1 - k) * (1 - k);
}

function isTouch(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

function readInsets(): { top: number; bottom: number; left: number; right: number } {
  const probe = document.getElementById("safe-area-probe");
  if (!probe) return { top: 0, bottom: 0, left: 0, right: 0 };
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
    right: parseFloat(style.paddingRight) || 0,
  };
}

function el(tag: string, className: string, text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const b = el("button", className, text) as HTMLButtonElement;
  b.type = "button";
  return b;
}

export const solitaireModule: GameModule = {
  id: GAME_ID,
  title: "SOLITAIRE",
  blurb: "Klondike on green felt, like the old office computer.",
  howToPlay: [
    "Build the four piles at the top up from ace to king, one suit each.",
    "On the table, stack cards down in alternating colours. Only a king goes in an empty column.",
    "Tap a card to send it where it fits, or drag it. Tap the deck to turn over more.",
    "Score like the PC: points for each move, two off every ten seconds, and a bonus for a fast win.",
    "Draw One and Draw Three have their own high scores. Only won games go on the board.",
    "Best with the phone on its side. GAME changes the draw and the card back.",
  ],
  accent: "#2fbf4a",
  progressShort: "C",
  extraBoard: { id: DRAW_ONE_BOARD, label: "DRAW 1" },
  beta: true,
  drawIcon: drawSolitaireIcon,
  create: (host, start) => new Solitaire(host, start),
};

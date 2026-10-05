/**
 * LETTER LOCK -- a daily five-letter word game.
 *
 * A five-letter combination and six tries to crack it. After each guess every
 * tile says one of three things: this letter is locked in place, this letter
 * is in the word but somewhere else, or this letter isn't in it at all.
 *
 * It exists for the share button. Plasma Sort proved the idea -- a result in
 * the family chat reaches the people who haven't opened the arcade today --
 * but a colour-sort result is one line of squares. A word game's result is a
 * little picture of how the solve went, and it's the thing people actually
 * post. So the day's word is the same for everyone, the grid can be sent
 * without giving a single letter away, and the link in it opens straight here.
 *
 * Three modes, one engine:
 *   TODAY     the day's word, ranked on that day's own board
 *   FREE PLAY a random word, ranked on the all-time board
 *   PRACTICE  a random word, no score
 *
 * TODAY counts the first attempt only. It is saved after every guess
 * (progress.ts), so quitting or RESTART resumes it rather than handing back
 * six fresh tries. Once it's over, opening it again that day shows the
 * finished board -- there's nothing to practise on a word you now know, and
 * PRACTICE is one button down.
 *
 * Nobody loses. Running out of tries shows the word, says so kindly, and
 * sends nothing to the board. The only thing a miss costs is the streak.
 *
 * The grid is drawn on the canvas, so it can be fitted to whatever is left
 * between the HUD and the keyboard. The keyboard is DOM, for the reason the
 * slime counter is: real tap targets that grow with the large-text setting.
 */

import "./letterlock.css";

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Particles } from "../../core/particles";
import { dailyKey, dailySeed, previousDailyKey, shortDate } from "../../core/rng";
import { playLink } from "../../core/share";
import { loadDailySeen, markDailySeen } from "../../core/storage";
import { shareButton } from "../../ui/shareButton";
import {
  advanceStreak,
  breakStreak,
  liveStreak,
  loadDailyAttempt,
  loadStreak,
  saveDailyAttempt,
  saveStreak,
  type DailyAttempt,
  type DailyResult,
} from "./progress";
import {
  CLOSE,
  DIM,
  INK,
  LOCKED,
  MINT,
  computeLayout,
  drawBackdrop,
  drawLockIcon,
  drawText,
  drawTile,
  drawTitleArt,
  tileCentre,
  titleArtHeight,
  type Face,
  type Layout,
} from "./render";
import {
  MAX_GUESSES,
  WORD_LENGTH,
  bestMarks,
  dailyWord,
  isOver,
  isSolved,
  markGuess,
  randomWord,
  scoreSolve,
  type Mark,
} from "./rules";
import { dailyShareText } from "./share";
import { isAllowedGuess } from "./words";

type Mode = "daily" | "free" | "practice";
type Phase = "choosing" | "playing" | "done";

/** One tile turning over, and the gap before the next one starts. */
const FLIP_SECONDS = 0.3;
const FLIP_STAGGER = 0.14;

const SHAKE_SECONDS = 0.32;

/**
 * How long the keyboard's space stays empty before the result takes it. The
 * buttons land exactly where the keys were, and without the pause the last
 * tap of a fast typist would press DONE.
 */
const RESULT_HOLD_SECONDS = 0.9;

/**
 * The hold for an attempt that was already complete when it was opened. The
 * scoreboard refuses any run shorter than three seconds (worker/index.ts),
 * and this one would otherwise be over in the time it takes to tap DONE.
 */
const RESUMED_HOLD_SECONDS = 3.2;

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

const MARK_SAYS: Record<Mark, string> = {
  locked: "right spot",
  close: "in the word, wrong spot",
  out: "not in the word",
};

/** The curved-arrow-in-a-tab both phone keyboards use for delete. */
const DELETE_ICON =
  '<svg class="lock-key-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/></svg>';

export class LetterLock implements GameInstance {
  private readonly root = document.createElement("div");
  private readonly particles = new Particles();

  private phase: Phase = "choosing";
  private mode: Mode = "daily";

  private answer = "";
  private guesses: string[] = [];
  /** One row of marks per guess, kept in step with `guesses`. */
  private marks: Mark[][] = [];
  /** The letters typed on the row in progress. */
  private current = "";
  private seconds = 0;

  private ranked = false;
  private solved = false;
  /**
   * The daily board this run belongs to, and the date its word was picked
   * for -- both captured at the start, so a game begun at 23:58 isn't filed
   * against tomorrow's board or checked against tomorrow's word.
   */
  private boardId: string | undefined;
  private dateKey = "";
  private dateLabel = "";

  /** The row whose tiles are turning over, or -1. Typing waits for it. */
  private revealRow = -1;
  private revealTime = 0;
  /** How many of that row's tiles have made their sound. */
  private revealTicked = 0;

  private shake = 0;
  /** 0..1 per column of the row in progress: a letter that has just landed. */
  private pop: number[] = new Array<number>(WORD_LENGTH).fill(0);
  /** Seconds since the winning row started its hop. */
  private winTime = 0;

  private toast = "";
  private toastTimer = 0;

  private finalScore = 0;
  private streak = 0;
  private offerShare = false;
  private resultTime = 0;
  /** Seconds the result stays out of sight after the game ends. */
  private resultHold = RESULT_HOLD_SECONDS;

  /** The day the chooser was drawn for, so it can be redrawn past midnight. */
  private chooserDate = "";
  private chooserCheck = 0;
  /** The streak going into today, for the title card. */
  private titleStreak = 0;

  private time = 0;
  private paused = false;

  private readonly keys = new Map<string, HTMLButtonElement>();

  /**
   * Panel height in CSS pixels, converted to virtual units at read time (the
   * conversion depends on the viewport, so a stored converted value would go
   * stale on rotation).
   */
  private panelPx = 170;
  private panelObserver: ResizeObserver | null = null;
  /**
   * The keyboard's height, held from the moment the game ends. The result
   * card that replaces it can be a line taller, and a grid refitted to that
   * would shrink a notch at the instant of winning.
   */
  private heldPanelPx: number | null = null;

  private readonly host: GameHost;

  constructor(host: GameHost) {
    this.host = host;
    this.root.className = "lock-root";
    // The canvas reads the setting every frame; the DOM keys need telling.
    this.root.classList.toggle("lock-root--contrast", host.settings.highContrast);
    this.buildModeChooser();
    this.watchPanelHeight();
    window.addEventListener("keydown", this.onKeyDown);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- Loop -----

  update(dt: number, _input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    this.toastTimer = Math.max(0, this.toastTimer - dt);

    if (this.phase === "choosing") {
      // Left open overnight, the chooser would still be offering yesterday's
      // word and yesterday's result. A glance at the date once a second is
      // cheaper than being wrong about what day it is.
      this.chooserCheck += dt;
      if (this.chooserCheck >= 1) {
        this.chooserCheck = 0;
        if (dailyKey() !== this.chooserDate) this.buildModeChooser();
      }
      return;
    }

    this.shake = Math.max(0, this.shake - dt);
    for (let i = 0; i < this.pop.length; i += 1) {
      this.pop[i] = Math.max(0, (this.pop[i] ?? 0) - dt * 9);
    }

    if (this.revealRow >= 0) this.advanceReveal(dt);

    if (this.phase === "playing") {
      this.seconds += dt;
      return;
    }

    this.resultTime += dt;
    this.winTime += dt;
    if (this.resultTime >= this.resultHold) this.root.style.visibility = "";
  }

  hud(): HudState {
    return { lives: 0, progress: this.guesses.length, progressLabel: "Guesses" };
  }

  onPause(): void {
    this.paused = true;
    this.saveAttempt();
  }

  onResume(): void {
    this.paused = false;
  }

  /** Only a word in progress has a clock worth stopping. */
  pausesWhenHidden(): boolean {
    return this.phase === "playing";
  }

  destroy(): void {
    this.saveAttempt();
    this.panelObserver?.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
  }

  // ----- Input -----

  /**
   * A real keyboard, for a laptop or a tablet with one attached. The shell's
   * own key handling (core/input.ts) only ever reads these as steering, so
   * there is nothing to fight over.
   */
  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.paused || this.phase !== "playing") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTextEntry(event.target)) return;

    if (event.key === "Enter") {
      // Otherwise Enter also "clicks" whichever on-screen key has focus.
      event.preventDefault();
      // A held Enter is one press, not a stream of refusals.
      if (!event.repeat) this.submit();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      this.erase();
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      this.type(event.key.toLowerCase());
    }
  };

  /**
   * True when a key press should do something. Not while a row is turning
   * over, and not while paused -- which includes the 3-2-1 countdown, when
   * the keyboard is back on screen but the clock hasn't restarted.
   */
  private canType(): boolean {
    return this.phase === "playing" && !this.paused && this.revealRow < 0;
  }

  private type(letter: string): void {
    if (!this.canType()) return;
    if (this.current.length >= WORD_LENGTH) return;
    this.pop[this.current.length] = 1;
    this.current += letter;
    this.host.sfx("lockKey");
  }

  private erase(): void {
    if (!this.canType()) return;
    if (this.current.length === 0) return;
    this.current = this.current.slice(0, -1);
    this.host.sfx("lockBack");
  }

  private submit(): void {
    if (!this.canType()) return;
    if (this.current.length < WORD_LENGTH) {
      this.refuse("NOT ENOUGH LETTERS");
      return;
    }
    if (!isAllowedGuess(this.current)) {
      // Not a word, so not a guess: the row stays, and so does the try.
      this.refuse("NOT IN THE LIST");
      return;
    }

    this.guesses.push(this.current);
    this.marks.push(markGuess(this.current, this.answer));
    this.current = "";
    this.toastTimer = 0;
    this.host.sfx("lockTurn");
    // Saved before the tiles turn, not after: a guess counts from the moment
    // it's entered, and quitting mid-reveal mustn't hand it back.
    this.saveAttempt();

    if (this.host.settings.reducedMotion) {
      this.endReveal();
      return;
    }
    this.revealRow = this.guesses.length - 1;
    this.revealTime = 0;
    this.revealTicked = 0;
  }

  private refuse(why: string): void {
    this.shake = SHAKE_SECONDS;
    this.toast = why;
    this.toastTimer = 2.2;
    this.host.sfx("lockDeny");
  }

  // ----- The reveal -----

  /** 0..1 through tile `col`'s turn, for the row being revealed. */
  private flip(col: number): number {
    return (this.revealTime - col * FLIP_STAGGER) / FLIP_SECONDS;
  }

  private advanceReveal(dt: number): void {
    this.revealTime += dt;
    const marks = this.marks[this.revealRow]!;

    // Each tile clicks as its face comes round, halfway through its turn.
    while (this.revealTicked < WORD_LENGTH && this.flip(this.revealTicked) >= 0.5) {
      const mark = marks[this.revealTicked]!;
      this.host.sfx(mark === "locked" ? "lockLocked" : mark === "close" ? "lockClose" : "lockOut");
      this.revealTicked += 1;
    }

    if (this.flip(WORD_LENGTH - 1) >= 1) this.endReveal();
  }

  private endReveal(): void {
    this.revealRow = -1;
    this.refreshKeys();
    if (isOver(this.guesses, this.answer)) this.finish();
  }

  // ----- Starting and finishing -----

  private begin(mode: Mode): void {
    this.mode = mode;
    this.host.sfx("uiSelect");

    // One reading of the clock for the word, the board id and the saved
    // attempt, so they cannot disagree however long the game takes.
    const now = new Date();
    this.dateKey = dailyKey(now);
    this.dateLabel = shortDate(this.dateKey).toUpperCase();
    const todaysWord = dailyWord(dailySeed(now));

    this.guesses = [];
    this.current = "";
    this.seconds = 0;
    this.solved = false;
    this.ranked = mode !== "practice";
    this.boardId = undefined;
    this.revealRow = -1;
    this.shake = 0;
    this.pop.fill(0);
    this.toastTimer = 0;
    this.offerShare = false;
    this.particles.clear();

    let finished: DailyResult | null = null;
    if (mode === "daily") {
      // Clears the cabinet's "TODAY" badge -- for actually opening the day's
      // word, not just the cabinet.
      markDailySeen(letterLockModule.id, this.dateKey);
      this.boardId = `daily-${this.dateKey}`;
      this.answer = todaysWord;

      const saved = loadDailyAttempt(this.dateKey);
      if (saved) {
        // The word they started on, even if an update has since changed the
        // list: the tiles already on their screen have to stay true.
        this.answer = saved.answer;
        this.guesses = saved.guesses.slice();
        this.seconds = saved.seconds;
        finished = saved.result;
      }
    } else {
      this.answer = randomWord(Math.random, todaysWord);
    }
    this.marks = this.guesses.map((guess) => markGuess(guess, this.answer));

    this.root.style.minHeight = "";
    this.root.style.visibility = "";
    this.heldPanelPx = null;

    if (finished) {
      this.showFinished(finished);
      return;
    }

    this.phase = "playing";
    this.buildKeyboard();
    // An attempt saved with its last guess already in -- the app was closed
    // while the final row was still turning over. Finish it now.
    if (isOver(this.guesses, this.answer)) this.finish(RESUMED_HOLD_SECONDS);
    else this.saveAttempt();
  }

  private finish(hold = RESULT_HOLD_SECONDS): void {
    this.phase = "done";
    this.solved = isSolved(this.guesses, this.answer);
    this.current = "";
    this.resultTime = 0;
    this.winTime = 0;
    this.toastTimer = 0;
    this.offerShare = false;
    this.streak = 0;
    this.finalScore = this.solved ? scoreSolve(this.guesses.length, this.seconds) : 0;

    // A miss scores nothing and goes nowhere: see leave().
    if (this.ranked && this.solved) this.host.addScore(this.finalScore);

    if (this.mode === "daily" && this.ranked) {
      saveDailyAttempt({
        ...this.attempt(),
        result: {
          solved: this.solved,
          guesses: this.guesses.length,
          score: this.finalScore,
          seconds: Math.round(this.seconds),
        },
      });
      const next = this.solved
        ? advanceStreak(loadStreak(), this.dateKey, previousDailyKey(this.dateKey))
        : breakStreak(this.dateKey);
      saveStreak(next);
      this.streak = next.count;
      this.offerShare = true;
    }

    this.host.sfx(this.solved ? "lockOpen" : "lockMiss");
    if (this.solved && !this.host.settings.reducedMotion) {
      const layout = this.layout();
      const row = this.guesses.length - 1;
      for (let col = 0; col < WORD_LENGTH; col += 1) {
        const at = tileCentre(layout, row, col);
        this.particles.burst(at.x, at.y, col % 2 === 0 ? LOCKED : MINT, 10, 150);
      }
    }

    this.buildResultControls(hold);
  }

  /** Today's attempt, already over: put the board back and say how it went. */
  private showFinished(result: DailyResult): void {
    this.phase = "done";
    this.ranked = false;
    this.solved = result.solved;
    this.finalScore = result.score;
    this.seconds = result.seconds;
    this.streak = liveStreak(loadStreak(), this.dateKey, previousDailyKey(this.dateKey));
    this.offerShare = true;
    // Long past: the winning row has already had its moment.
    this.winTime = 99;
    this.buildResultControls(0);
  }

  /** Hand over to the shell's result screen. */
  private leave(): void {
    // Only a solve is a score. A miss, a practice round and a second look at
    // a finished daily all end without the board hearing about it.
    const counts = this.ranked && this.solved;
    this.host.gameOver({
      progress: Math.max(1, this.guesses.length),
      progressLabel: "Guesses",
      ranked: counts,
      headline: this.solved ? "UNLOCKED" : "NICE TRY",
      ...(this.boardId && counts ? { boardId: this.boardId } : {}),
    });
  }

  private attempt(): DailyAttempt {
    return {
      date: this.dateKey,
      answer: this.answer,
      guesses: this.guesses,
      seconds: this.seconds,
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
    const panelUnits = view.toWorldDistance(this.heldPanelPx ?? this.panelPx);
    // Clears the HUD, the shell's 56px pause button and the mode label.
    const top = view.insetTop + 92;
    // The gap under the grid is where NOT IN THE LIST appears.
    const bottom = view.h - panelUnits - 28;
    return computeLayout(view.w, top, Math.max(top + 200, bottom));
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { view, settings } = this.host;
    drawBackdrop(ctx, view.w, view.h, this.time, settings.reducedMotion);

    if (this.phase === "choosing") {
      this.renderTitle(ctx);
      return;
    }

    this.renderLabel(ctx);
    this.renderBoard(ctx);
    this.particles.render(ctx);
    this.renderToast(ctx);
  }

  private renderBoard(ctx: CanvasRenderingContext2D): void {
    const { settings } = this.host;
    const layout = this.layout();
    const highContrast = settings.highContrast;
    const shakeX =
      this.shake > 0 && !settings.reducedMotion
        ? Math.sin(this.shake * 58) * 5 * (this.shake / SHAKE_SECONDS)
        : 0;
    const winRow = this.phase === "done" && this.solved ? this.guesses.length - 1 : -1;

    for (let row = 0; row < MAX_GUESSES; row += 1) {
      for (let col = 0; col < WORD_LENGTH; col += 1) {
        const at = tileCentre(layout, row, col);

        if (row < this.guesses.length) {
          const letter = this.guesses[row]![col]!;
          const mark = this.marks[row]![col]!;
          let face: Face = mark;
          let scaleY = 1;
          if (row === this.revealRow) {
            const t = this.flip(col);
            if (t < 0.5) face = "typed";
            if (t > 0 && t < 1) scaleY = Math.max(0.04, Math.abs(Math.cos(t * Math.PI)));
          }

          let lift = 0;
          let glow = 0;
          if (row === winRow) {
            glow = 0.6;
            const hop = (this.winTime - col * 0.08) / 0.42;
            if (hop > 0 && hop < 1 && !settings.reducedMotion) {
              lift = Math.sin(hop * Math.PI) * layout.tile * 0.28;
            }
          }
          drawTile(ctx, at.x, at.y - lift, layout.tile, letter, face, {
            highContrast,
            scaleY,
            glow,
          });
          continue;
        }

        const typing = row === this.guesses.length && this.phase === "playing";
        const letter = typing ? (this.current[col] ?? "") : "";
        drawTile(ctx, at.x + (typing ? shakeX : 0), at.y, layout.tile, letter, letter ? "typed" : "empty", {
          highContrast,
          scale: typing && !settings.reducedMotion ? 1 + 0.1 * (this.pop[col] ?? 0) : 1,
        });
      }
    }
  }

  private renderLabel(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const scale = settings.largeText ? 1.2 : 1;
    const label =
      this.mode === "daily"
        ? `TODAY'S WORD · ${this.dateLabel}`
        : this.mode === "free"
          ? "FREE PLAY"
          : "PRACTICE";
    drawText(ctx, label, view.w / 2, view.insetTop + 74, 10 * scale, DIM, { spacing: 1.5 });
  }

  private renderToast(ctx: CanvasRenderingContext2D): void {
    if (this.toastTimer <= 0) return;
    const { view, settings } = this.host;
    const y = view.h - view.toWorldDistance(this.panelPx) - 14;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.toastTimer / 0.4);
    drawText(ctx, this.toast, view.w / 2, y, settings.largeText ? 13 : 11, CLOSE, {
      bold: true,
      spacing: 1.5,
    });
    ctx.restore();
  }

  private renderTitle(ctx: CanvasRenderingContext2D): void {
    const { view, settings } = this.host;
    const scale = settings.largeText ? 1.2 : 1;
    const top = view.insetTop + 66;
    const bottom = view.h - view.toWorldDistance(this.panelPx);
    const showStreak = this.titleStreak > 1;

    const artTop = 66;
    const blockH = artTop + titleArtHeight(scale) + (showStreak ? 26 : 0);
    const y = top + Math.max(0, (bottom - top - blockH) / 2);

    drawText(ctx, "LETTER LOCK", view.w / 2, y + 14, 26, INK, { bold: true, spacing: 4 });
    drawText(ctx, "CRACK THE FIVE-LETTER CODE", view.w / 2, y + 40, 10, DIM, { spacing: 2 });
    drawTitleArt(
      ctx,
      view.w,
      y + artTop,
      this.time,
      settings.highContrast,
      settings.reducedMotion,
      scale,
    );

    if (showStreak) {
      drawText(ctx, `${this.titleStreak}-DAY STREAK`, view.w / 2, y + blockH - 8, 11, CLOSE, {
        bold: true,
        spacing: 2,
      });
    }
  }

  // ----- DOM panels -----

  private buildModeChooser(): void {
    const today = dailyKey();
    this.chooserDate = today;
    this.titleStreak = liveStreak(loadStreak(), today, previousDailyKey(today));

    const saved = loadDailyAttempt(today);
    const fresh = loadDailySeen()[letterLockModule.id] !== today;

    const dailyHint = saved?.result
      ? saved.result.solved
        ? `Solved in ${saved.result.guesses}/${MAX_GUESSES} for ${saved.result.score.toLocaleString("en-US")} pts. Tap to see your board.`
        : "Today's word got away. Tap to see your board."
      : saved && saved.guesses.length > 0
        ? `In progress: ${saved.guesses.length} of ${MAX_GUESSES} guesses used.`
        : "Same word for everyone. Your first go counts.";

    // Once today is over, SHARE sits on the same row as the word it's about
    // -- available all day, not just on the result card, because the moment
    // someone finishes is rarely the moment the family chat is open.
    const daily = modeButton("TODAY'S WORD", dailyHint, "daily", () => this.begin("daily"), fresh);
    let dailyRow: HTMLElement = daily;
    if (saved?.result) {
      dailyRow = div("lock-daily-row");
      const { guesses, answer } = saved;
      const solved = saved.result.solved;
      dailyRow.append(
        daily,
        shareButton("lock-share lock-share--tile", () =>
          this.shareMessage(guesses, answer, solved, today),
        ),
      );
    }

    const panel = div("lock-panel lock-panel--modes");
    panel.append(
      dailyRow,
      modeButton("FREE PLAY", "A random word. Ranked.", "free", () => this.begin("free")),
      modeButton("PRACTICE", "A random word. No score, no hurry.", "practice", () =>
        this.begin("practice"),
      ),
    );
    this.root.replaceChildren(panel);
  }

  private buildKeyboard(): void {
    this.keys.clear();
    const panel = div("lock-panel lock-panel--keys");

    KEY_ROWS.forEach((letters, index) => {
      const row = div("lock-keys");
      if (index === KEY_ROWS.length - 1) {
        row.append(keyButton("ENTER", "lock-key lock-key--wide", "Enter", () => this.submit()));
      }
      for (const letter of letters) {
        const key = keyButton(letter.toUpperCase(), "lock-key", letter.toUpperCase(), () =>
          this.type(letter),
        );
        this.keys.set(letter, key);
        row.append(key);
      }
      if (index === KEY_ROWS.length - 1) {
        const del = keyButton("", "lock-key lock-key--wide", "Delete", () => this.erase());
        del.innerHTML = DELETE_ICON;
        row.append(del);
      }
      panel.append(row);
    });

    this.root.replaceChildren(panel);
    this.refreshKeys();
  }

  /** Each key shows the best thing learned about its letter so far. */
  private refreshKeys(): void {
    // A row still turning over hasn't told the player anything yet.
    const shown = this.revealRow >= 0 ? this.guesses.slice(0, this.revealRow) : this.guesses;
    const best = bestMarks(shown, this.answer);
    for (const [letter, key] of this.keys) {
      const mark = best.get(letter);
      if (mark) key.dataset.mark = mark;
      else delete key.dataset.mark;
      key.setAttribute(
        "aria-label",
        mark ? `${letter.toUpperCase()}, ${MARK_SAYS[mark]}` : letter.toUpperCase(),
      );
    }
  }

  /**
   * What happened, and SHARE / DONE. It takes the keyboard's place, and the
   * grid stays fitted to the keyboard's height so nothing above moves at the
   * moment of winning. `hold` keeps it out of sight until taps have stopped.
   */
  private buildResultControls(hold: number): void {
    this.resultHold = hold;
    // Measured before the keyboard goes. A finished daily opened from the
    // chooser never had one, and its grid simply fits the card.
    if (this.keys.size > 0) {
      this.heldPanelPx = this.root.offsetHeight;
      this.root.style.minHeight = `${this.heldPanelPx}px`;
    }
    this.keys.clear();

    const card = div("lock-card");
    if (this.solved) {
      const tries = this.guesses.length;
      card.append(
        text("lock-card-head", tries === 1 ? "FIRST TRY!" : "UNLOCKED!"),
        text(
          "lock-card-sub",
          `IN ${tries} ${tries === 1 ? "GUESS" : "GUESSES"}  ·  ${formatClock(this.seconds)}`,
        ),
      );
      if (this.mode !== "practice") {
        const score = text("lock-card-score", this.finalScore.toLocaleString("en-US"));
        score.append(text("lock-card-unit", "POINTS"));
        card.append(score);
      }
    } else {
      // The kind version of game over: no red, no buzzer, and the answer
      // straight away so nobody is left wondering.
      card.append(
        text("lock-card-head lock-card-head--miss", "SO CLOSE!"),
        text("lock-card-sub", "THE WORD WAS"),
        text("lock-card-word", this.answer.toUpperCase()),
      );
      if (this.mode === "daily") card.append(text("lock-card-sub", "A NEW WORD TOMORROW"));
    }
    if (this.streak > 1) card.append(text("lock-card-streak", `${this.streak}-DAY STREAK`));

    const actions = div("lock-actions");
    if (this.offerShare) {
      const { guesses, answer, solved, dateKey, streak } = this;
      actions.append(
        shareButton("lock-act lock-share", () =>
          this.shareMessage(guesses, answer, solved, dateKey, streak),
        ),
      );
    }
    actions.append(actionButton("DONE", () => this.leave()));

    const panel = div("lock-panel lock-panel--result");
    panel.append(card, actions);
    this.root.replaceChildren(panel);
    this.root.style.visibility = hold > 0 ? "hidden" : "";
  }

  /** Built from the marks alone: the letters never reach the share text. */
  private shareMessage(
    guesses: readonly string[],
    answer: string,
    solved: boolean,
    dateKey: string,
    streak?: number,
  ): string {
    return dailyShareText(
      { rows: guesses.map((guess) => markGuess(guess, answer)), solved },
      dateKey,
      streak ?? liveStreak(loadStreak(), dailyKey(), previousDailyKey(dailyKey())),
      playLink(letterLockModule.id),
    );
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

function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** True when the event came from somewhere the player is typing. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function modeButton(
  title: string,
  hint: string,
  mode: Mode,
  onPick: () => void,
  freshBadge = false,
): HTMLElement {
  const button = document.createElement("button");
  button.className = `lock-mode lock-mode--${mode}`;
  const name = div("lock-mode-name");
  name.textContent = title;
  if (freshBadge) {
    const badge = document.createElement("span");
    badge.className = "badge-new";
    badge.textContent = "TODAY";
    name.append(badge);
  }
  const sub = div("lock-mode-hint");
  sub.textContent = hint;
  button.append(name, sub);
  button.addEventListener("click", onPick);
  return button;
}

function keyButton(
  label: string,
  className: string,
  name: string,
  onPress: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.textContent = label;
  button.setAttribute("aria-label", name);
  button.addEventListener("click", () => {
    onPress();
    // Don't keep focus: a real keyboard's Enter would then press this key
    // again as well as entering the guess.
    button.blur();
  });
  return button;
}

function actionButton(label: string, onPick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "lock-act";
  button.textContent = label;
  button.addEventListener("click", onPick);
  return button;
}

function div(className: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function text(className: string, content: string): HTMLElement {
  const node = div(className);
  node.textContent = content;
  return node;
}

export const letterLockModule: GameModule = {
  id: "letter-lock",
  title: "LETTER LOCK",
  progressShort: "G",
  blurb: "Type a word, tap ENTER. Tiles show which letters fit.",
  howToPlay: [
    "Find the five-letter word in six tries. Type a word and tap ENTER.",
    "Each tile then tells you one of three things: the letter is locked in the right place, it's in the word but somewhere else, or it isn't in the word.",
    "TODAY's word is the same for everyone, and only your first go at it counts.",
    "FREE PLAY and PRACTICE give you a random word whenever you like.",
    "Run out of tries and the word is shown. The only thing a miss costs is your streak.",
  ],
  accent: MINT,
  hasDailyChallenge: true,

  drawIcon(ctx, size) {
    drawLockIcon(ctx, size);
  },

  create(host: GameHost): GameInstance {
    return new LetterLock(host);
  },
};

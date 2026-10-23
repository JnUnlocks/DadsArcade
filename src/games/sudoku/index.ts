/**
 * UNCLE POTATO HEAD NUMBER GAME -- it's Sudoku: a daily number puzzle, built
 * for one thumb, with a potato in a bow tie to cheer you on.
 *
 * One new puzzle a day, the same grid for the whole family, and one play of
 * it: the first attempt is the one the day's board ranks. The week climbs the
 * way a newspaper's does, gentle on Monday and the hard one on Sunday
 * (rules.ts). Free play makes a fresh puzzle at any of four difficulties.
 *
 * Nobody loses. A wrong digit shows red the moment it lands and adds time to
 * the clock; a hint fills a square and adds more. A solve is a solve; a clean
 * one just ranks higher.
 *
 * Built for a phone held in one hand, so everything to press is at the bottom
 * and there are two ways to play:
 *
 *   digit first   tap a number on the pad to arm it, then tap every square it
 *                 goes in. The pad stays under the thumb.
 *   square first  tap a square, then the number for it.
 *
 * Which one is in use is simply whether a square is selected. Nothing is
 * selected to begin with, so the first tap on the pad arms a digit; tapping a
 * square first selects it instead. Tap either again to let go of it.
 *
 * Every mode is saved after every move (progress.ts), and a pause blanks the
 * grid, so the clock is honest and a phone call costs nothing.
 *
 * It's all DOM, the way the crossword is.
 */

import "./sudoku.css";

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game";
import { buzz } from "../../core/haptics";
import type { InputSnapshot } from "../../core/input";
import { dailyKey, dailySeed, previousDailyKey, shortDate } from "../../core/rng";
import { playLink } from "../../core/share";
import { loadDailySeen, markDailyDone, markDailySeen } from "../../core/storage";
import { shareButton } from "../../ui/shareButton";
import {
  CELLS,
  DIFFICULTIES,
  boxOf,
  colOf,
  generatePuzzle,
  rowOf,
  toCells,
  type Difficulty,
  type Puzzle,
} from "./generate";
import {
  advanceStreak,
  clearGame,
  liveStreak,
  loadBestTimes,
  loadGame,
  loadStreak,
  recordBestTime,
  saveGame,
  saveStreak,
  type SaveSlot,
  type SavedGame,
} from "./progress";
import { drawSudokuIcon, uncleCanvas } from "./render";
import {
  HINT_SECONDS,
  MISTAKE_SECONDS,
  autoNotes,
  boxMarks,
  dailyDifficulty,
  dailyPuzzleSeed,
  finishedUnits,
  formatClock,
  hasNote,
  isRight,
  isSolved,
  notesAfterPlacing,
  remaining,
  scoreSolve,
  toggleNote,
} from "./rules";
import { GAME_NAME, HOST_NAME, dailyShareText } from "./share";

type Phase = "choosing" | "playing" | "done";

/** What the pad has armed: a digit, the eraser, or nothing. */
const NOTHING = 0;
const ERASER = 10;

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const FREE_BLURB: Record<Difficulty, string> = {
  easy: "Plenty to go on. About five minutes.",
  medium: "Fewer givens, same tricks. About ten.",
  hard: "You'll want pencil marks.",
  expert: "The Sunday puzzle, any day.",
};

/**
 * What Uncle Potato Head has to say. One a day on the title card, by the date,
 * so the whole family gets the same one with the same puzzle.
 */
const SAYINGS: readonly string[] = [
  "YOU GOT THIS!",
  "SMALL STEPS, BIG WINS.",
  "NUMBERS MAKE A BRIGHTER DAY!",
  "LOGIC SOLVES THINGS.",
  "PATIENCE BUILDS BRIGHTER DAYS.",
  "GOOD PUZZLES, BRIGHTER PEOPLE.",
  "PUZZLES BRING US TOGETHER.",
];

const ERASE_ICON =
  '<svg class="sd-key-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/></svg>';

export class Sudoku implements GameInstance {
  private readonly root = document.createElement("div");
  private readonly host: GameHost;

  private phase: Phase = "choosing";
  private slot: SaveSlot = "daily";
  private dateKey = "";
  private boardId: string | undefined;

  private puzzle: Puzzle | null = null;
  private givens: number[] = [];
  private solution: number[] = [];
  private values: number[] = [];
  private notes: number[] = [];

  private seconds = 0;
  private penalty = 0;
  private mistakes = 0;
  private hints = 0;
  /** Squares a hint filled in. */
  private readonly helped = new Set<number>();
  /** Squares a wrong digit went into, for the share picture. */
  private readonly slipped = new Set<number>();

  /** The selected square, or -1: square-first play. */
  private selected = -1;
  /** What the pad has armed: digit-first play. */
  private armed = NOTHING;
  private notesMode = false;
  private autoOn = false;

  private ranked = false;
  private finalScore = 0;
  private newBest = false;
  private streak = 0;
  private paused = false;

  private shownSecond = -1;
  private toastTimer = 0;

  /** The day the chooser was drawn for, so it can be redrawn past midnight. */
  private chooserDate = "";
  private chooserCheck = 0;

  // The play screen's parts, rebuilt for each puzzle.
  private cellEls: HTMLButtonElement[] = [];
  private digitEls: HTMLElement[] = [];
  private noteEls: HTMLElement[][] = [];
  private padEls: HTMLButtonElement[] = [];
  private leftEls: HTMLElement[] = [];
  private eraseEl: HTMLButtonElement | null = null;
  private notesEl: HTMLButtonElement | null = null;
  private autoEl: HTMLButtonElement | null = null;
  private clockEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private sideEl: HTMLElement | null = null;
  private gridObserver: ResizeObserver | null = null;

  constructor(host: GameHost) {
    this.host = host;
    this.root.className = "sd-root";
    this.buildChooser();
    window.addEventListener("keydown", this.onKeyDown);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- Loop -----

  update(dt: number, _input: InputSnapshot): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl?.classList.remove("sd-toast--on");
    }

    if (this.phase === "choosing") {
      // Left open overnight, the chooser would still be offering yesterday's
      // puzzle. Same once-a-second glance at the date the crossword takes.
      this.chooserCheck += dt;
      if (this.chooserCheck >= 1) {
        this.chooserCheck = 0;
        if (dailyKey() !== this.chooserDate) this.buildChooser();
      }
      return;
    }

    if (this.phase === "playing" && !this.paused) {
      this.seconds += dt;
      this.paintClock();
    }
  }

  /** Nothing to draw: the whole cabinet is DOM, and it covers the canvas. */
  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}

  hud(): HudState {
    return { lives: 0, progress: this.mistakes, progressLabel: "Slips" };
  }

  /** The grid goes blank, so a pause can't be used to think for free. */
  onPause(): void {
    this.paused = true;
    this.root.classList.add("sd-root--paused");
    this.save();
  }

  onResume(): void {
    this.paused = false;
    this.root.classList.remove("sd-root--paused");
  }

  /** Only a puzzle in progress has a clock worth stopping. */
  pausesWhenHidden(): boolean {
    return this.phase === "playing";
  }

  destroy(): void {
    this.save();
    this.gridObserver?.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
  }

  // ----- Input -----

  /** A real keyboard: a laptop, or a tablet with one attached. */
  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.canPlay()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const { key } = event;
    if (/^[1-9]$/.test(key)) this.pressDigit(Number(key));
    else if (key === "Backspace" || key === "Delete" || key === "0") {
      event.preventDefault();
      this.pressErase();
    } else if (key === "ArrowLeft") this.step(0, -1);
    else if (key === "ArrowRight") this.step(0, 1);
    else if (key === "ArrowUp") this.step(-1, 0);
    else if (key === "ArrowDown") this.step(1, 0);
    else if (key === "n" || key === "N") this.toggleNotesMode();
  };

  /** Not while paused, which includes the 3-2-1 countdown back in. */
  private canPlay(): boolean {
    return this.phase === "playing" && !this.paused;
  }

  /** A square the player can still change: not a given, not one got right. */
  private open(cell: number): boolean {
    return !isRight(this.values, this.solution, cell);
  }

  /** An arrow key moves the selection, which puts the pad in square-first play. */
  private step(dRow: number, dCol: number): void {
    const from = this.selected >= 0 ? this.selected : 40 - dRow * 9 - dCol;
    const row = Math.min(8, Math.max(0, rowOf(from) + dRow));
    const col = Math.min(8, Math.max(0, colOf(from) + dCol));
    this.selected = row * 9 + col;
    this.armed = NOTHING;
    this.paint();
  }

  private pressCell(cell: number): void {
    if (!this.canPlay()) return;
    if (this.armed === NOTHING) {
      this.selected = this.selected === cell ? -1 : cell;
      this.host.sfx("uiMove");
      this.paint();
      return;
    }
    if (this.armed === ERASER) {
      this.erase(cell);
      return;
    }
    // With a digit armed, a finished square is a quick way to switch digit.
    if (!this.open(cell)) {
      this.armed = this.values[cell]!;
      this.host.sfx("uiMove");
      this.paint();
      return;
    }
    this.enter(cell, this.armed);
  }

  private pressDigit(digit: number): void {
    if (!this.canPlay()) return;
    if (this.selected >= 0) {
      if (this.open(this.selected)) this.enter(this.selected, digit);
      else this.say("THAT SQUARE IS DONE. TAP AN EMPTY ONE.");
      return;
    }
    this.armed = this.armed === digit ? NOTHING : digit;
    this.host.sfx("uiMove");
    this.paint();
  }

  private pressErase(): void {
    if (!this.canPlay()) return;
    if (this.selected >= 0) {
      this.erase(this.selected);
      return;
    }
    this.armed = this.armed === ERASER ? NOTHING : ERASER;
    this.host.sfx("uiMove");
    this.paint();
  }

  /** A digit into a square: a pencil mark in notes mode, otherwise an answer. */
  private enter(cell: number, digit: number): void {
    if (this.notesMode) {
      // A slip sitting in the square would hide the marks; take it off first.
      this.values[cell] = 0;
      this.notes = toggleNote(this.notes, cell, digit);
      this.host.sfx("uiMove");
      this.afterChange();
      return;
    }
    if (this.values[cell] === digit) return;

    if (digit === this.solution[cell]) {
      this.place(cell, digit);
      this.host.sfx("lockKey");
      buzz(8);
    } else {
      this.values[cell] = digit;
      this.mistakes += 1;
      this.slipped.add(cell);
      this.charge(MISTAKE_SECONDS);
      this.say(`NOT THERE  +${MISTAKE_SECONDS}s`);
      this.host.sfx("lockDeny");
      buzz([40, 30, 40]);
    }
    this.afterChange();
  }

  /** The right digit goes in, by the player's hand or a hint's. */
  private place(cell: number, digit: number): void {
    this.values[cell] = digit;
    this.notes = notesAfterPlacing(this.notes, cell, digit);
    this.flash(finishedUnits(this.values, this.solution, cell));
    // All nine of a digit placed: nothing left to arm it for.
    if (this.armed === digit && remaining(this.values, this.solution)[digit] === 0) {
      this.armed = NOTHING;
    }
  }

  /** Takes a slip off the board, or failing that the square's pencil marks. */
  private erase(cell: number): void {
    if (!this.open(cell)) return;
    if (this.values[cell] !== 0) this.values[cell] = 0;
    else if (this.notes[cell] !== 0) this.notes[cell] = 0;
    else return;
    this.host.sfx("lockBack");
    this.afterChange();
  }

  private toggleNotesMode(): void {
    if (!this.canPlay()) return;
    this.notesMode = !this.notesMode;
    this.host.sfx("uiMove");
    this.paint();
  }

  /**
   * AUTO pencils in every digit each square could still hold. They stay true
   * from then on without help, because placing a digit always rubs it out of
   * its row, column and box. Turning it off clears the marks.
   */
  private toggleAuto(): void {
    if (!this.canPlay()) return;
    this.autoOn = !this.autoOn;
    this.notes = this.autoOn
      ? autoNotes(this.values, this.solution)
      : new Array<number>(CELLS).fill(0);
    this.host.sfx("uiSelect");
    this.afterChange();
  }

  /** Fills in the selected square, or the first one still to do. */
  private useHint(): void {
    if (!this.canPlay()) return;
    const cell =
      this.selected >= 0 && this.open(this.selected)
        ? this.selected
        : this.values.findIndex((_, at) => this.open(at));
    if (cell < 0) return;
    this.hints += 1;
    this.helped.add(cell);
    this.charge(HINT_SECONDS);
    this.place(cell, this.solution[cell]!);
    this.say(`+${HINT_SECONDS}s`);
    this.host.sfx("uiSelect");
    this.afterChange();
  }

  private charge(seconds: number): void {
    this.penalty += seconds;
    this.shownSecond = -1;
  }

  /** Save, redraw, and see whether that was the last square. */
  private afterChange(): void {
    this.save();
    this.paint();
    if (isSolved(this.values, this.solution)) this.finish();
  }

  /** Lights up a row, column or box as it's completed. */
  private flash(units: readonly (readonly number[])[]): void {
    if (units.length === 0 || this.host.settings.reducedMotion) return;
    const cells = new Set(units.flat());
    for (const cell of cells) {
      const el = this.cellEls[cell];
      if (!el) continue;
      el.classList.remove("sd-cell--flash");
      // Reading a layout property restarts the animation on a second flash.
      void el.offsetWidth;
      el.classList.add("sd-cell--flash");
    }
    this.host.sfx("levelClear");
  }

  // ----- Starting and finishing -----

  private begin(slot: SaveSlot, fresh = false): void {
    this.host.sfx("uiSelect");
    this.slot = slot;

    // One reading of the clock for the puzzle, the board id and the save, so
    // they cannot disagree however long the solve takes.
    const now = new Date();
    this.dateKey = slot === "daily" ? dailyKey(now) : "";
    this.boardId = slot === "daily" ? `daily-${this.dateKey}` : undefined;
    if (slot === "daily") markDailySeen(sudokuModule.id, this.dateKey);

    const saved = fresh ? null : loadGame(slot, this.dateKey);
    if (saved) {
      this.puzzle = saved.puzzle;
      this.values = toCells(saved.values);
      this.notes = saved.notes.slice();
    } else {
      this.puzzle =
        slot === "daily"
          ? generatePuzzle(dailyPuzzleSeed(dailySeed(now)), dailyDifficulty(now))
          : generatePuzzle(Math.floor(Math.random() * 2 ** 32), freeDifficulty(slot));
      this.values = toCells(this.puzzle.givens);
      this.notes = new Array<number>(CELLS).fill(0);
    }
    this.givens = toCells(this.puzzle.givens);
    this.solution = toCells(this.puzzle.solution);
    this.seconds = saved?.seconds ?? 0;
    this.penalty = saved?.penalty ?? 0;
    this.mistakes = saved?.mistakes ?? 0;
    this.hints = saved?.hints ?? 0;
    this.autoOn = saved?.autoNotes ?? false;
    this.helped.clear();
    for (const cell of saved?.helped ?? []) this.helped.add(cell);
    this.slipped.clear();
    for (const cell of saved?.slipped ?? []) this.slipped.add(cell);

    this.ranked = true;
    this.newBest = false;
    this.streak = 0;
    this.paused = false;
    this.shownSecond = -1;
    this.selected = -1;
    this.armed = NOTHING;
    this.notesMode = false;

    this.buildPlayScreen();

    if (saved?.result) {
      this.showFinished(saved);
      return;
    }
    this.phase = "playing";
    this.paint();
    // Saved with its last digit already in: the app closed on the winning
    // tap. Finish it now.
    if (isSolved(this.values, this.solution)) this.finish();
    else this.save();
  }

  private total(): number {
    return this.seconds + this.penalty;
  }

  private finish(): void {
    const { difficulty } = this.puzzle!;
    this.phase = "done";
    this.selected = -1;
    this.armed = NOTHING;
    this.finalScore = scoreSolve(difficulty, this.total());
    if (this.ranked) this.host.addScore(this.finalScore);
    this.newBest = recordBestTime(difficulty, Math.round(this.total()));

    if (this.slot === "daily") {
      saveGame(this.slot, {
        ...this.snapshot(),
        result: {
          score: this.finalScore,
          seconds: Math.round(this.total()),
          mistakes: this.mistakes,
          hints: this.hints,
        },
      });
      const next = advanceStreak(loadStreak(), this.dateKey, previousDailyKey(this.dateKey));
      saveStreak(next);
      this.streak = next.count;
      markDailyDone(sudokuModule.id, this.dateKey);
    } else {
      clearGame(this.slot);
    }

    this.toastEl?.classList.remove("sd-toast--on");
    this.host.sfx("lockOpen");
    buzz([20, 40, 20, 40, 60]);
    this.paint();
    this.buildResult();
  }

  /** Today's puzzle, already solved: show the grid and say how it went. */
  private showFinished(saved: SavedGame): void {
    this.phase = "done";
    this.ranked = false;
    this.finalScore = saved.result!.score;
    this.streak = liveStreak(loadStreak(), this.dateKey, previousDailyKey(this.dateKey));
    this.paint();
    this.buildResult();
  }

  /** Hand over to the shell's result screen. */
  private leave(): void {
    this.host.gameOver({
      progress: DIFFICULTIES.indexOf(this.puzzle!.difficulty) + 1,
      progressLabel: "Level",
      ranked: this.ranked,
      headline: "SOLVED",
      durationMs: Math.max(3000, Math.round(this.total() * 1000)),
      ...(this.boardId && this.ranked ? { boardId: this.boardId } : {}),
    });
  }

  private snapshot(): SavedGame {
    return {
      date: this.dateKey,
      puzzle: this.puzzle!,
      values: this.values.join(""),
      notes: this.notes.slice(),
      autoNotes: this.autoOn,
      seconds: this.seconds,
      penalty: this.penalty,
      mistakes: this.mistakes,
      hints: this.hints,
      helped: [...this.helped],
      slipped: [...this.slipped],
      result: null,
    };
  }

  private save(): void {
    if (this.phase !== "playing" || !this.puzzle) return;
    saveGame(this.slot, this.snapshot());
  }

  private shareMessage(): string {
    return dailyShareText(
      {
        difficulty: this.puzzle!.difficulty,
        boxes: boxMarks(this.slipped, this.helped),
        seconds: Math.round(this.total()),
        mistakes: this.mistakes,
        hints: this.hints,
      },
      this.dateKey,
      this.streak,
      playLink(sudokuModule.id),
    );
  }

  // ----- Painting -----

  private say(message: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add("sd-toast--on");
    this.toastTimer = 2.4;
  }

  private paintClock(): void {
    const second = Math.floor(this.total());
    if (second === this.shownSecond || !this.clockEl) return;
    this.shownSecond = second;
    this.clockEl.textContent = formatClock(second);
  }

  /** Bring every square, the pad and the tools up to date. */
  private paint(): void {
    if (!this.puzzle) return;
    const playing = this.phase === "playing";
    const sel = playing ? this.selected : -1;
    // The digit to light up across the board: the armed one, or the one in
    // the selected square.
    const focus =
      !playing ? 0 : this.armed >= 1 && this.armed <= 9 ? this.armed : sel >= 0 ? this.values[sel]! : 0;

    this.cellEls.forEach((cellEl, cell) => {
      const digit = this.values[cell]!;
      const wrong = digit !== 0 && digit !== this.solution[cell];
      this.digitEls[cell]!.textContent = digit === 0 ? "" : String(digit);
      // Every digit has its own ink, the colour of its key on the pad.
      cellEl.dataset.d = String(digit);
      this.noteEls[cell]!.forEach((noteEl, at) => {
        const on = digit === 0 && hasNote(this.notes, cell, at + 1);
        noteEl.textContent = on ? String(at + 1) : "";
        noteEl.classList.toggle("sd-note--same", on && at + 1 === focus);
      });
      const near =
        sel >= 0 &&
        cell !== sel &&
        (rowOf(cell) === rowOf(sel) || colOf(cell) === colOf(sel) || boxOf(cell) === boxOf(sel));
      cellEl.classList.toggle("sd-cell--near", near);
      cellEl.classList.toggle("sd-cell--selected", cell === sel);
      cellEl.classList.toggle("sd-cell--same", focus !== 0 && digit === focus && !wrong);
      cellEl.classList.toggle("sd-cell--wrong", wrong);
      cellEl.classList.toggle("sd-cell--helped", this.helped.has(cell) && !wrong && digit !== 0);
      cellEl.setAttribute(
        "aria-label",
        `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}, ${digit === 0 ? "blank" : digit}${wrong ? ", wrong" : ""}`,
      );
    });

    const left = remaining(this.values, this.solution);
    this.padEls.forEach((padEl, at) => {
      const digit = at + 1;
      padEl.classList.toggle("sd-key--armed", playing && this.armed === digit);
      padEl.classList.toggle("sd-key--spent", left[digit] === 0);
      this.leftEls[at]!.textContent = left[digit] === 0 ? "" : String(left[digit]);
      padEl.setAttribute("aria-label", `${digit}, ${left[digit]} left to place`);
    });
    this.eraseEl?.classList.toggle("sd-key--armed", playing && this.armed === ERASER);
    this.root.classList.toggle("sd-root--notes", this.notesMode);
    this.notesEl?.classList.toggle("sd-tool--on", this.notesMode);
    this.notesEl?.setAttribute("aria-pressed", String(this.notesMode));
    this.autoEl?.classList.toggle("sd-tool--on", this.autoOn);
    this.autoEl?.setAttribute("aria-pressed", String(this.autoOn));
    this.paintClock();
  }

  // ----- DOM: the chooser -----

  private buildChooser(): void {
    this.phase = "choosing";
    this.gridObserver?.disconnect();
    const now = new Date();
    const today = dailyKey(now);
    this.chooserDate = today;
    this.root.className = "sd-root sd-root--chooser";

    const streak = liveStreak(loadStreak(), today, previousDailyKey(today));
    const daily = loadGame("daily", today);
    const fresh = loadDailySeen()[sudokuModule.id] !== today;
    const level = (daily?.puzzle.difficulty ?? dailyDifficulty(now)).toUpperCase();

    const title = div("sd-title");
    const host = div("sd-title-host");
    host.append(
      uncleCanvas(116),
      text("sd-title-say", SAYINGS[dailySeed(now) % SAYINGS.length]!),
    );
    const name = div("sd-title-name");
    name.setAttribute("role", "heading");
    name.setAttribute("aria-label", `${GAME_NAME}. It's Sudoku!`);
    name.append(
      text("sd-title-uncle", "UNCLE"),
      text("sd-title-potato", "POTATO HEAD"),
      text("sd-title-game", "NUMBER GAME"),
    );
    title.append(
      host,
      name,
      text("sd-title-tag", "IT'S SUDOKU!"),
      text("sd-title-sub", "SAME RULES. BRIGHTER DAYS."),
    );
    if (streak > 1) title.append(text("sd-title-streak", `${streak}-DAY STREAK`));

    const dailyHint = daily?.result
      ? `Solved in ${formatClock(daily.result.seconds)} for ${daily.result.score.toLocaleString("en-US")} pts. Tap to see your grid.`
      : daily
        ? `In progress: ${progressOf(daily)}. Tap to carry on.`
        : "Same grid for everyone, and one go at it. Easy on Monday, hardest on Sunday.";

    const panel = div("sd-modes");
    panel.append(
      modeButton(`TODAY'S PUZZLE  ·  ${level}`, dailyHint, "daily", () => this.begin("daily"), fresh),
    );

    const bests = loadBestTimes();
    for (const difficulty of DIFFICULTIES) {
      const slot: SaveSlot = `free-${difficulty}`;
      const name = difficulty.toUpperCase();
      const best = bests[difficulty];
      const record = best === undefined ? "" : `  Best ${formatClock(best)}.`;
      const saved = loadGame(slot);
      if (!saved) {
        panel.append(
          modeButton(name, `${FREE_BLURB[difficulty]}${record}`, "free", () => this.begin(slot)),
        );
        continue;
      }
      // One in progress: the tile carries on with it, and NEW sits beside it.
      const row = div("sd-mode-row");
      const fresher = document.createElement("button");
      fresher.className = "sd-mode-new";
      fresher.textContent = "NEW";
      fresher.setAttribute("aria-label", `Start a new ${name} puzzle`);
      fresher.addEventListener("click", () => this.begin(slot, true));
      row.append(
        modeButton(name, `In progress: ${progressOf(saved)}. Tap to carry on.`, "free", () =>
          this.begin(slot),
        ),
        fresher,
      );
      panel.append(row);
    }

    const note = text(
      "sd-modes-note",
      `Tap a number, then every square it goes in. Or tap a square, then its number. A wrong one adds ${MISTAKE_SECONDS} seconds; a hint adds ${HINT_SECONDS}.`,
    );
    this.root.replaceChildren(title, panel, note);
  }

  // ----- DOM: the puzzle -----

  private buildPlayScreen(): void {
    const daily = this.slot === "daily";
    const level = this.puzzle!.difficulty.toUpperCase();
    this.root.className = "sd-root";

    const head = div("sd-head");
    const masthead = div("sd-masthead");
    masthead.append(
      text("sd-name", HOST_NAME.toUpperCase()),
      text("sd-dateline", daily ? `${shortDate(this.dateKey).toUpperCase()}  ·  ${level}` : `FREE PLAY  ·  ${level}`),
    );
    this.clockEl = text("sd-clock", "0:00");
    this.clockEl.setAttribute("aria-label", "Time");
    head.append(uncleCanvas(46), masthead, this.clockEl);

    const grid = div("sd-grid");
    grid.setAttribute("role", "grid");
    this.cellEls = [];
    this.digitEls = [];
    this.noteEls = [];
    for (let cell = 0; cell < CELLS; cell += 1) {
      const button = document.createElement("button");
      button.className = this.givens[cell] === 0 ? "sd-cell" : "sd-cell sd-cell--given";
      const notes = div("sd-notes");
      const marks = DIGITS.map(() => {
        const mark = document.createElement("span");
        mark.className = "sd-note";
        notes.append(mark);
        return mark;
      });
      const digit = text("sd-digit", "");
      button.append(notes, digit);
      button.addEventListener("click", () => this.pressCell(cell));
      grid.append(button);
      this.cellEls.push(button);
      this.digitEls.push(digit);
      this.noteEls.push(marks);
    }
    const wrap = div("sd-gridwrap");
    wrap.append(grid, text("sd-veil", "PAUSED"));
    this.fitGrid(wrap, grid);

    this.toastEl = div("sd-toast");
    this.toastEl.setAttribute("aria-live", "polite");

    const board = div("sd-board");
    board.append(wrap, this.toastEl);

    this.sideEl = div("sd-side");
    this.sideEl.append(this.buildTools(), this.buildPad());

    const body = div("sd-body");
    body.append(board, this.sideEl);
    this.root.replaceChildren(head, body);
  }

  /** The grid is the biggest square that fits the space it's been given. */
  private fitGrid(wrap: HTMLElement, grid: HTMLElement): void {
    const fit = (): void => {
      const side = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
      if (side <= 0) return;
      grid.style.width = `${side}px`;
      grid.style.height = `${side}px`;
      grid.style.setProperty("--sd-cell", `${side / 9}px`);
    };
    this.gridObserver?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this.gridObserver = new ResizeObserver(fit);
      this.gridObserver.observe(wrap);
    }
    // The observer doesn't fire until the element is in the document, and the
    // shell mounts it after construction.
    requestAnimationFrame(fit);
  }

  private buildTools(): HTMLElement {
    const tools = div("sd-tools");
    const tool = (label: string, sub: string, says: string, onPress: () => void): HTMLButtonElement => {
      const button = document.createElement("button");
      button.className = "sd-tool";
      button.append(text("sd-tool-name", label), text("sd-tool-sub", sub));
      button.setAttribute("aria-label", says);
      button.addEventListener("click", onPress);
      tools.append(button);
      return button;
    };
    this.notesEl = tool("NOTES", "PENCIL", "Pencil marks: numbers go in as notes", () =>
      this.toggleNotesMode(),
    );
    this.autoEl = tool("AUTO", "NOTES", "Fill in every pencil mark automatically", () =>
      this.toggleAuto(),
    );
    tool("HINT", `+${HINT_SECONDS}s`, `Fill in one square. Adds ${HINT_SECONDS} seconds.`, () =>
      this.useHint(),
    );
    return tools;
  }

  /** Two rows of five, so each key is a thumb wide: 1-5, then 6-9 and erase. */
  private buildPad(): HTMLElement {
    const pad = div("sd-pad");
    this.padEls = [];
    this.leftEls = [];
    for (const digit of DIGITS) {
      const key = document.createElement("button");
      key.className = "sd-key";
      key.dataset.d = String(digit);
      const left = text("sd-key-left", "");
      key.append(text("sd-key-digit", String(digit)), left);
      key.addEventListener("click", () => this.pressDigit(digit));
      pad.append(key);
      this.padEls.push(key);
      this.leftEls.push(left);
    }
    const erase = document.createElement("button");
    erase.className = "sd-key sd-key--erase";
    erase.innerHTML = ERASE_ICON;
    erase.setAttribute("aria-label", "Erase");
    erase.addEventListener("click", () => this.pressErase());
    pad.append(erase);
    this.eraseEl = erase;
    return pad;
  }

  /** What happened, and SHARE / DONE, where the tools and the pad were. */
  private buildResult(): void {
    const side = this.sideEl;
    if (!side) return;
    this.root.classList.add("sd-root--done");

    const card = div("sd-card");
    card.append(
      text("sd-card-head", "SOLVED!"),
      text(
        "sd-card-sub",
        `${formatClock(this.total())}  ·  ${tally(this.mistakes, "SLIP")}  ·  ${tally(this.hints, "HINT")}`,
      ),
    );
    const score = text("sd-card-score", this.finalScore.toLocaleString("en-US"));
    score.append(text("sd-card-unit", "POINTS"));
    card.append(score);
    if (this.newBest) {
      card.append(text("sd-card-streak", `BEST ${this.puzzle!.difficulty.toUpperCase()} TIME`));
    }
    if (this.streak > 1) card.append(text("sd-card-streak", `${this.streak}-DAY STREAK`));
    card.append(
      text("sd-card-sub", this.slot === "daily" ? "A NEW PUZZLE TOMORROW" : "GOOD NUMBERS, GOOD PEOPLE"),
    );

    const actions = div("sd-actions");
    if (this.slot === "daily") {
      actions.append(shareButton("sd-act sd-share", () => this.shareMessage()));
    }
    const done = document.createElement("button");
    done.className = "sd-act";
    done.textContent = "DONE";
    done.addEventListener("click", () => this.leave());
    actions.append(done);

    const result = div("sd-result");
    result.append(card, actions);
    side.replaceChildren(result);
  }
}

function freeDifficulty(slot: SaveSlot): Difficulty {
  return DIFFICULTIES.find((difficulty) => slot === `free-${difficulty}`) ?? "easy";
}

/** "NO SLIPS", "1 SLIP", "3 SLIPS". */
function tally(count: number, noun: string): string {
  return count === 0 ? `NO ${noun}S` : `${count} ${noun}${count === 1 ? "" : "S"}`;
}

/** "23 of 51 squares", for a saved puzzle on the chooser. */
function progressOf(saved: SavedGame): string {
  let blanks = 0;
  let filled = 0;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (saved.puzzle.givens[cell] !== "0") continue;
    blanks += 1;
    if (saved.values[cell] === saved.puzzle.solution[cell]) filled += 1;
  }
  return `${filled} of ${blanks} squares`;
}

function modeButton(
  title: string,
  hint: string,
  kind: "daily" | "free",
  onPick: () => void,
  freshBadge = false,
): HTMLElement {
  const button = document.createElement("button");
  button.className = `sd-mode sd-mode--${kind}`;
  const name = div("sd-mode-name");
  name.textContent = title;
  if (freshBadge) {
    const badge = document.createElement("span");
    badge.className = "badge-new";
    badge.textContent = "TODAY";
    name.append(badge);
  }
  button.append(name, text("sd-mode-hint", hint));
  button.addEventListener("click", onPick);
  return button;
}

function div(className: string): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function text(className: string, content: string): HTMLDivElement {
  const node = div(className);
  node.textContent = content;
  return node;
}

export const sudokuModule: GameModule = {
  id: "sudoku",
  title: GAME_NAME.toUpperCase(),
  shortTitle: "SUDOKU",
  progressShort: "LV",
  blurb: "It's Sudoku! A new number puzzle every day, built for one thumb.",
  howToPlay: [
    "It's Sudoku: every row, column and 3x3 box holds each number from 1 to 9 once.",
    "Tap a number, then every square it goes in. Or tap a square, then its number.",
    "NOTES pencils small numbers into a square. AUTO pencils in every one that still fits.",
    "A wrong number shows red and adds 30 seconds. HINT fills in a square and adds 60. Nobody loses.",
    "Today's puzzle is the same for everyone, with one go at it. Easy on Monday, hardest on Sunday. It counts toward the arcade's daily streak.",
    "Every puzzle is saved as you go, so you can put it down and come back.",
  ],
  accent: "#ffc928",
  hasDailyChallenge: true,
  drawIcon: drawSudokuIcon,
  create: (host) => new Sudoku(host),
};

/**
 * MOM MOM'S CROSSWORD -- a daily crossword, made for Mom Mom Stec.
 *
 * One new puzzle a day, the same grid for the whole family, laid out like the
 * crossword in a newspaper: THE STEC GAZETTE, with a date, an issue number
 * and clues in two columns. Free play makes a fresh puzzle whenever one is
 * wanted, in the arcade's own colours.
 *
 * Three ways in, one engine:
 *   TODAY'S PUZZLE  11x11, the day's grid, ranked on that day's own board
 *   QUICK           9x9, a random grid, ranked on the all-time board
 *   CLASSIC         11x11, a random grid, ranked on the all-time board
 *
 * Nobody loses. There's no way to fail a crossword except to stop, and the
 * hints make sure nobody has to: CHECK, LETTER, WORD and the Word Finder are
 * always there, and each adds seconds to the clock instead of taking anything
 * away (rules.ts). A solve is a solve; a clean one just ranks higher.
 *
 * Every mode is saved after every letter (progress.ts). The daily counts the
 * first attempt, so RESTART on the pause menu resumes it rather than handing
 * back a clean clock, and once it's solved, opening it again that day shows
 * the finished grid.
 *
 * It's all DOM, the way Black Disc is, and for a reason beyond tap targets:
 * the shell's canvas is a phone-shaped column, and this was built for a
 * tablet first. On a wide screen the grid and the clue lists sit side by
 * side; on a phone the grid takes the top, the current clue sits above it,
 * and the full list is one button away.
 */

import "./crossword.css";

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { dailyKey, dailySeed, previousDailyKey } from "../../core/rng";
import { playLink } from "../../core/share";
import { loadDailySeen, markDailySeen } from "../../core/storage";
import { shareButton } from "../../ui/shareButton";
import { buildFinder } from "./finder";
import {
  BLACK,
  clueCells,
  generatePuzzle,
  solutionOf,
  type Direction,
  type Puzzle,
  type PuzzleClue,
  type PuzzleSize,
} from "./generate";
import {
  advanceStreak,
  clearGame,
  liveStreak,
  loadGame,
  loadStreak,
  saveGame,
  saveStreak,
  type SaveSlot,
  type SavedGame,
} from "./progress";
import { drawCrosswordIcon } from "./render";
import {
  EMPTY,
  HINT_SECONDS,
  cluePattern,
  dailyPuzzleSeed,
  emptyFill,
  formatClock,
  isFull,
  isSolved,
  issueNumber,
  scoreSolve,
  setLetter,
  unsolvedCells,
  wrongCells,
  type Hint,
} from "./rules";
import { GAME_NAME, dailyShareText, type ShareSquare } from "./share";

type Phase = "choosing" | "playing" | "done";

/** The newspaper the daily puzzle is printed in. */
const PAPER_NAME = "THE STEC GAZETTE";

const DAILY_SIZE: PuzzleSize = 11;

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

const DELETE_ICON =
  '<svg class="xw-key-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/></svg>';

const HINT_BUTTONS: ReadonlyArray<{ hint: Hint; label: string; says: string }> = [
  { hint: "check", label: "CHECK", says: "Check this word" },
  { hint: "letter", label: "LETTER", says: "Fill in one letter" },
  { hint: "word", label: "WORD", says: "Fill in this word" },
  { hint: "finder", label: "FINDER", says: "Open the Word Finder on this word" },
];

export class Crossword implements GameInstance {
  private readonly root = document.createElement("div");
  private readonly host: GameHost;

  private phase: Phase = "choosing";
  private slot: SaveSlot = "daily";
  private dateKey = "";
  private boardId: string | undefined;

  private puzzle: Puzzle | null = null;
  private solution = "";
  private fill = "";
  /** For each square, the index of the clue through it each way, or -1. */
  private across: number[] = [];
  private down: number[] = [];

  private seconds = 0;
  private penalty = 0;
  private hints = 0;
  /** Squares a hint filled in: they can't be typed over. */
  private readonly helped = new Set<number>();
  /** Squares CHECK has marked wrong, until they're changed. */
  private readonly wrong = new Set<number>();

  private cursor = 0;
  private dir: Direction = "across";

  private ranked = false;
  private finalScore = 0;
  private streak = 0;
  private paused = false;

  private shownSecond = -1;
  private toastTimer = 0;

  /** The day the chooser was drawn for, so it can be redrawn past midnight. */
  private chooserDate = "";
  private chooserCheck = 0;

  // The play screen's parts, rebuilt for each puzzle.
  private cellEls: Array<HTMLButtonElement | null> = [];
  private letterEls: Array<HTMLElement | null> = [];
  private clueEls: HTMLButtonElement[] = [];
  private clockEl: HTMLElement | null = null;
  private barLabel: HTMLElement | null = null;
  private barText: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private sideEl: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private gridObserver: ResizeObserver | null = null;

  constructor(host: GameHost) {
    this.host = host;
    this.root.className = "xw-root";
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
      if (this.toastTimer <= 0) this.toastEl?.classList.remove("xw-toast--on");
    }

    if (this.phase === "choosing") {
      // Left open overnight, the chooser would still be offering yesterday's
      // puzzle. Same once-a-second glance at the date Letter Lock takes.
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
    return { lives: 0, progress: this.hints, progressLabel: "Hints" };
  }

  onPause(): void {
    this.paused = true;
    this.save();
  }

  onResume(): void {
    this.paused = false;
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
    if (!this.canType() || this.sheet) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTextEntry(event.target)) return;

    const { key } = event;
    if (/^[a-zA-Z]$/.test(key)) {
      this.type(key.toLowerCase());
    } else if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      this.erase();
    } else if (key === "ArrowLeft") this.step(0, -1);
    else if (key === "ArrowRight") this.step(0, 1);
    else if (key === "ArrowUp") this.step(-1, 0);
    else if (key === "ArrowDown") this.step(1, 0);
    else if (key === "Tab" || key === "Enter") {
      // Otherwise Enter also "clicks" whichever on-screen key has focus.
      event.preventDefault();
      this.moveClue(event.shiftKey ? -1 : 1);
    } else if (key === " ") {
      event.preventDefault();
      this.flip();
    }
  };

  /** Not while paused, which includes the 3-2-1 countdown back in. */
  private canType(): boolean {
    return this.phase === "playing" && !this.paused;
  }

  private clueAt(cell: number, dir: Direction): number {
    return (dir === "across" ? this.across[cell] : this.down[cell]) ?? -1;
  }

  /** The clue the cursor is working on. */
  private activeClue(): number {
    const index = this.clueAt(this.cursor, this.dir);
    return index >= 0 ? index : this.clueAt(this.cursor, other(this.dir));
  }

  /** Tap a square: move there, or turn the word round if already there. */
  private select(cell: number): void {
    if (this.phase === "choosing") return;
    if (cell === this.cursor) {
      this.flip();
      return;
    }
    this.cursor = cell;
    if (this.clueAt(cell, this.dir) < 0) this.dir = other(this.dir);
    this.host.sfx("uiMove");
    this.paint();
  }

  private flip(): void {
    if (this.clueAt(this.cursor, other(this.dir)) < 0) return;
    this.dir = other(this.dir);
    this.host.sfx("uiMove");
    this.paint();
  }

  /** An arrow key: the next white square that way, skipping black ones. */
  private step(dRow: number, dCol: number): void {
    const size = this.puzzle!.size;
    let row = Math.floor(this.cursor / size) + dRow;
    let col = (this.cursor % size) + dCol;
    while (row >= 0 && row < size && col >= 0 && col < size) {
      const cell = row * size + col;
      if (this.solution[cell] !== BLACK) {
        this.cursor = cell;
        const wanted: Direction = dRow === 0 ? "across" : "down";
        this.dir = this.clueAt(cell, wanted) >= 0 ? wanted : other(wanted);
        this.paint();
        return;
      }
      row += dRow;
      col += dCol;
    }
  }

  private gotoClue(index: number): void {
    const clue = this.puzzle!.clues[index];
    if (!clue) return;
    const cells = clueCells(this.puzzle!, clue);
    this.dir = clue.dir;
    this.cursor = cells.find((cell) => this.fill[cell] === EMPTY) ?? cells[0]!;
    this.paint();
  }

  private moveClue(by: number): void {
    const count = this.puzzle!.clues.length;
    this.gotoClue((this.activeClue() + by + count) % count);
    this.host.sfx("uiMove");
  }

  private type(letter: string): void {
    if (!this.canType()) return;
    const cell = this.cursor;
    const wasFull = isFull(this.fill);
    if (!this.helped.has(cell)) {
      this.fill = setLetter(this.fill, cell, letter);
      this.wrong.delete(cell);
      this.host.sfx("lockKey");
    }

    // On to the next square of the word; the last square stays put.
    const cells = clueCells(this.puzzle!, this.puzzle!.clues[this.activeClue()]!);
    const next = cells[cells.indexOf(cell) + 1];
    if (next !== undefined) this.cursor = next;

    this.afterChange(wasFull);
  }

  private erase(): void {
    if (!this.canType()) return;
    const cells = clueCells(this.puzzle!, this.puzzle!.clues[this.activeClue()]!);
    let cell = this.cursor;
    // An empty square deletes the one before it, like any text box.
    if (this.fill[cell] === EMPTY || this.helped.has(cell)) {
      const previous = cells[cells.indexOf(cell) - 1];
      if (previous === undefined) return;
      cell = previous;
      this.cursor = cell;
    }
    if (!this.helped.has(cell) && this.fill[cell] !== EMPTY) {
      this.fill = setLetter(this.fill, cell, EMPTY);
      this.wrong.delete(cell);
      this.host.sfx("lockBack");
    }
    this.afterChange(false);
  }

  /** Save, redraw, and see whether that was the last letter. */
  private afterChange(wasFull: boolean): void {
    this.save();
    this.paint();
    if (!isFull(this.fill)) return;
    if (isSolved(this.fill, this.puzzle!)) this.finish();
    else if (!wasFull) {
      this.say("NOT QUITE. SOMETHING DOESN'T FIT.");
      this.host.sfx("lockDeny");
    }
  }

  // ----- Hints -----

  private useHint(hint: Hint): void {
    if (!this.canType()) return;
    const puzzle = this.puzzle!;
    const clue = puzzle.clues[this.activeClue()]!;
    const cost = `+${HINT_SECONDS[hint]}s`;

    if (hint === "finder") {
      this.charge(hint);
      this.openFinder(clue);
      return;
    }

    if (hint === "check") {
      const cells = clueCells(puzzle, clue);
      if (cells.every((cell) => this.fill[cell] === EMPTY)) {
        this.say("NOTHING TO CHECK YET");
        return;
      }
      this.charge(hint);
      const bad = wrongCells(this.fill, puzzle, clue);
      for (const cell of bad) this.wrong.add(cell);
      this.say(
        bad.length === 0
          ? `ALL GOOD SO FAR  ${cost}`
          : `${bad.length} ${bad.length === 1 ? "LETTER" : "LETTERS"} TO FIX  ${cost}`,
      );
      this.host.sfx(bad.length === 0 ? "uiSelect" : "lockDeny");
      this.save();
      this.paint();
      return;
    }

    const open = unsolvedCells(this.fill, puzzle, clue);
    if (open.length === 0) {
      this.say("THIS WORD IS ALREADY RIGHT");
      return;
    }
    this.charge(hint);
    const wasFull = isFull(this.fill);
    // LETTER fills the square the cursor is on if it needs it, else the first
    // one in the word that does.
    const targets = hint === "word" ? open : [open.includes(this.cursor) ? this.cursor : open[0]!];
    for (const cell of targets) {
      this.fill = setLetter(this.fill, cell, this.solution[cell]!);
      this.helped.add(cell);
      this.wrong.delete(cell);
    }
    this.say(cost);
    this.host.sfx("uiSelect");
    this.afterChange(wasFull);
  }

  private charge(hint: Hint): void {
    this.penalty += HINT_SECONDS[hint];
    this.hints += 1;
    this.shownSecond = -1;
    this.paintClock();
  }

  private openFinder(clue: PuzzleClue): void {
    const puzzle = this.puzzle!;
    const close = (): void => {
      this.sheet?.remove();
      this.sheet = null;
    };
    // A letter CHECK has already called wrong is a blank, not a known letter.
    let known = this.fill;
    for (const cell of this.wrong) known = setLetter(known, cell, EMPTY);
    const finder = buildFinder({
      pattern: cluePattern(known, puzzle, clue),
      wordsOnly: true,
      onClose: close,
      onPick: (word) => {
        close();
        const cells = clueCells(puzzle, clue);
        if (word.length !== cells.length) return;
        const wasFull = isFull(this.fill);
        cells.forEach((cell, at) => {
          if (this.helped.has(cell)) return;
          this.fill = setLetter(this.fill, cell, word[at]!);
          this.wrong.delete(cell);
        });
        this.host.sfx("lockKey");
        this.afterChange(wasFull);
      },
    });
    const sheet = div("xw-sheet");
    const label = div("xw-sheet-clue");
    label.textContent = `${clue.number} ${clue.dir.toUpperCase()}  ·  ${clue.clue}`;
    sheet.append(label, finder);
    this.sheet = sheet;
    this.root.append(sheet);
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
    if (slot === "daily") markDailySeen(crosswordModule.id, this.dateKey);

    const saved = fresh ? null : loadGame(slot, this.dateKey);
    if (saved) {
      this.puzzle = saved.puzzle;
      this.fill = saved.fill;
      this.seconds = saved.seconds;
      this.penalty = saved.penalty;
      this.hints = saved.hints;
    } else {
      const size: PuzzleSize = slot === "daily" ? DAILY_SIZE : slot === "free-9" ? 9 : 11;
      const seed =
        slot === "daily" ? dailyPuzzleSeed(dailySeed(now)) : Math.floor(Math.random() * 2 ** 32);
      this.puzzle = generatePuzzle(seed, size);
      this.fill = emptyFill(this.puzzle);
      this.seconds = 0;
      this.penalty = 0;
      this.hints = 0;
    }
    this.helped.clear();
    for (const cell of saved?.helped ?? []) this.helped.add(cell);
    this.wrong.clear();
    this.solution = solutionOf(this.puzzle);
    this.mapClues();

    this.ranked = true;
    this.streak = 0;
    this.paused = false;
    this.shownSecond = -1;
    this.dir = "across";
    this.cursor = 0;

    this.buildPlayScreen();
    this.gotoClue(0);

    if (saved?.result) {
      this.showFinished(saved);
      return;
    }
    this.phase = "playing";
    this.paint();
    // Saved with its last letter already in: the app closed on the winning
    // keystroke. Finish it now.
    if (isSolved(this.fill, this.puzzle)) this.finish();
    else this.save();
  }

  private mapClues(): void {
    const puzzle = this.puzzle!;
    const cells = puzzle.size * puzzle.size;
    this.across = new Array<number>(cells).fill(-1);
    this.down = new Array<number>(cells).fill(-1);
    puzzle.clues.forEach((clue, index) => {
      const map = clue.dir === "across" ? this.across : this.down;
      for (const cell of clueCells(puzzle, clue)) map[cell] = index;
    });
  }

  private total(): number {
    return this.seconds + this.penalty;
  }

  private finish(): void {
    const puzzle = this.puzzle!;
    this.phase = "done";
    this.sheet?.remove();
    this.sheet = null;
    this.finalScore = scoreSolve(puzzle.size, this.total());
    if (this.ranked) this.host.addScore(this.finalScore);

    if (this.slot === "daily") {
      saveGame(this.slot, {
        ...this.snapshot(),
        result: { score: this.finalScore, seconds: Math.round(this.total()), hints: this.hints },
      });
      const next = advanceStreak(loadStreak(), this.dateKey, previousDailyKey(this.dateKey));
      saveStreak(next);
      this.streak = next.count;
    } else {
      clearGame(this.slot);
    }

    this.host.sfx("lockOpen");
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
      progress: this.puzzle!.clues.length,
      progressLabel: "Words",
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
      fill: this.fill,
      seconds: this.seconds,
      penalty: this.penalty,
      hints: this.hints,
      helped: [...this.helped],
      result: null,
    };
  }

  private save(): void {
    if (this.phase !== "playing" || !this.puzzle) return;
    saveGame(this.slot, this.snapshot());
  }

  private shareMessage(): string {
    const squares: ShareSquare[] = [...this.solution].map((letter, cell) =>
      letter === BLACK ? "black" : this.helped.has(cell) ? "helped" : "clean",
    );
    return dailyShareText(
      {
        size: this.puzzle!.size,
        squares,
        seconds: Math.round(this.total()),
        hints: this.hints,
      },
      this.dateKey,
      this.streak,
      playLink(crosswordModule.id),
    );
  }

  // ----- Painting -----

  private say(message: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add("xw-toast--on");
    this.toastTimer = 2.4;
  }

  private paintClock(): void {
    const second = Math.floor(this.total());
    if (second === this.shownSecond || !this.clockEl) return;
    this.shownSecond = second;
    this.clockEl.textContent = formatClock(second);
  }

  /** Bring every square, the clue bar and the clue lists up to date. */
  private paint(): void {
    const puzzle = this.puzzle;
    if (!puzzle) return;
    const active = this.activeClue();
    const clue = puzzle.clues[active]!;
    const word = new Set(clueCells(puzzle, clue));
    const playing = this.phase === "playing";

    this.cellEls.forEach((cellEl, cell) => {
      const letterEl = this.letterEls[cell];
      if (!cellEl || !letterEl) return;
      const letter = this.fill[cell] === EMPTY ? "" : this.fill[cell]!.toUpperCase();
      letterEl.textContent = letter;
      cellEl.classList.toggle("xw-cell--word", playing && word.has(cell));
      cellEl.classList.toggle("xw-cell--cursor", playing && cell === this.cursor);
      cellEl.classList.toggle("xw-cell--helped", this.helped.has(cell));
      cellEl.classList.toggle("xw-cell--wrong", this.wrong.has(cell));
      const size = puzzle.size;
      cellEl.setAttribute(
        "aria-label",
        `Row ${Math.floor(cell / size) + 1}, column ${(cell % size) + 1}, ${letter || "blank"}`,
      );
    });

    if (this.barLabel) this.barLabel.textContent = `${clue.number} ${clue.dir.toUpperCase()}`;
    if (this.barText) this.barText.textContent = clue.clue;

    this.clueEls.forEach((clueEl, index) => {
      const on = playing && index === active;
      clueEl.classList.toggle("xw-clue--on", on);
      const cells = clueCells(puzzle, puzzle.clues[index]!);
      clueEl.classList.toggle("xw-clue--done", cells.every((cell) => this.fill[cell] !== EMPTY));
      // Keeps the current clue in view in a list longer than its box.
      if (on) clueEl.scrollIntoView({ block: "nearest" });
    });
    this.paintClock();
  }

  // ----- DOM: the chooser -----

  private buildChooser(): void {
    this.phase = "choosing";
    this.gridObserver?.disconnect();
    const today = dailyKey();
    this.chooserDate = today;
    this.root.className = "xw-root xw-root--chooser";

    const streak = liveStreak(loadStreak(), today, previousDailyKey(today));
    const daily = loadGame("daily", today);
    const fresh = loadDailySeen()[crosswordModule.id] !== today;

    const title = div("xw-title");
    title.append(
      text("xw-title-over", "FOR MOM MOM STEC"),
      text("xw-title-name", "MOM MOM'S CROSSWORD"),
      text("xw-title-sub", "A NEW PUZZLE EVERY DAY"),
    );
    if (streak > 1) title.append(text("xw-title-streak", `${streak}-DAY STREAK`));

    const dailyHint = daily?.result
      ? `Solved in ${formatClock(daily.result.seconds)} for ${daily.result.score.toLocaleString("en-US")} pts. Tap to see your grid.`
      : daily
        ? `In progress: ${progressOf(daily)}. Tap to carry on.`
        : "Today's paper. Same grid for everyone, and your first go counts.";

    const panel = div("xw-modes");
    panel.append(modeButton("TODAY'S PUZZLE", dailyHint, "daily", () => this.begin("daily"), fresh));

    const free: ReadonlyArray<{ slot: SaveSlot; name: string; blurb: string }> = [
      { slot: "free-9", name: "QUICK  9x9", blurb: "A fresh small puzzle. About five minutes." },
      { slot: "free-11", name: "CLASSIC  11x11", blurb: "A fresh full-size puzzle. About ten minutes." },
    ];
    for (const { slot, name, blurb } of free) {
      const saved = loadGame(slot);
      if (!saved) {
        panel.append(modeButton(name, blurb, "free", () => this.begin(slot)));
        continue;
      }
      // One in progress: the tile carries on with it, and NEW sits beside it.
      const row = div("xw-mode-row");
      const fresher = document.createElement("button");
      fresher.className = "xw-mode-new";
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
      "xw-modes-note",
      "Stuck? CHECK, LETTER, WORD and FINDER are always there. Each one adds a little time.",
    );
    this.root.replaceChildren(title, panel, note);
  }

  // ----- DOM: the puzzle -----

  private buildPlayScreen(): void {
    const puzzle = this.puzzle!;
    const daily = this.slot === "daily";
    this.root.className = `xw-root ${daily ? "xw-root--paper" : "xw-root--neon"}`;
    this.root.style.setProperty("--xw-size", String(puzzle.size));

    // Masthead.
    const head = div("xw-head");
    const masthead = div("xw-masthead");
    if (daily) {
      const day = dailySeed(dateFromKey(this.dateKey));
      masthead.append(
        text("xw-paper-name", PAPER_NAME),
        text("xw-dateline", `${longDate(this.dateKey)}  ·  No. ${issueNumber(day)}  ·  ${GAME_NAME}`),
      );
    } else {
      masthead.append(
        text("xw-paper-name", "MOM MOM'S CROSSWORD"),
        text("xw-dateline", `FREE PLAY  ·  ${puzzle.size === 9 ? "QUICK 9x9" : "CLASSIC 11x11"}`),
      );
    }
    this.clockEl = text("xw-clock", "0:00");
    this.clockEl.setAttribute("aria-label", "Time");
    head.append(masthead, this.clockEl);

    // The current clue, with a way to the ones either side.
    const bar = div("xw-cluebar");
    this.barLabel = text("xw-cluebar-label", "");
    this.barText = text("xw-cluebar-text", "");
    const barBody = document.createElement("button");
    barBody.className = "xw-cluebar-body";
    barBody.setAttribute("aria-label", "Switch between across and down");
    barBody.append(this.barLabel, this.barText);
    barBody.addEventListener("click", () => this.flip());
    bar.append(
      arrowButton("‹", "Previous clue", () => this.moveClue(-1)),
      barBody,
      arrowButton("›", "Next clue", () => this.moveClue(1)),
    );

    // The grid.
    const grid = div("xw-grid");
    grid.setAttribute("role", "grid");
    const numbers = new Map<number, number>();
    for (const clue of puzzle.clues) numbers.set(clue.row * puzzle.size + clue.col, clue.number);
    this.cellEls = [];
    this.letterEls = [];
    [...this.solution].forEach((letter, cell) => {
      if (letter === BLACK) {
        grid.append(div("xw-block"));
        this.cellEls.push(null);
        this.letterEls.push(null);
        return;
      }
      const button = document.createElement("button");
      button.className = "xw-cell";
      const number = numbers.get(cell);
      if (number !== undefined) button.append(text("xw-cell-num", String(number)));
      const letterEl = text("xw-cell-letter", "");
      button.append(letterEl);
      button.addEventListener("click", () => this.select(cell));
      grid.append(button);
      this.cellEls.push(button);
      this.letterEls.push(letterEl);
    });
    const wrap = div("xw-gridwrap");
    wrap.append(grid);
    this.fitGrid(wrap, grid);

    this.toastEl = div("xw-toast");
    this.toastEl.setAttribute("aria-live", "polite");

    const board = div("xw-board");
    board.append(bar, wrap, this.toastEl);

    // The clue lists.
    const clues = div("xw-clues");
    this.clueEls = [];
    for (const dir of ["across", "down"] as const) {
      const column = div("xw-cluecol");
      column.append(text("xw-cluecol-head", dir.toUpperCase()));
      puzzle.clues.forEach((clue, index) => {
        if (clue.dir !== dir) return;
        const button = document.createElement("button");
        button.className = "xw-clue";
        button.append(
          text("xw-clue-num", String(clue.number)),
          text("xw-clue-text", `${clue.clue} (${clue.answer.length})`),
        );
        button.addEventListener("click", () => {
          this.gotoClue(index);
          this.host.sfx("uiMove");
          this.root.classList.remove("xw-root--list");
        });
        this.clueEls[index] = button;
        column.append(button);
      });
      clues.append(column);
    }

    this.sideEl = div("xw-side");
    this.sideEl.append(clues, this.buildTools(), this.buildKeyboard());

    const body = div("xw-body");
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
      grid.style.setProperty("--xw-cell", `${side / this.puzzle!.size}px`);
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
    const tools = div("xw-tools");
    for (const { hint, label, says } of HINT_BUTTONS) {
      const button = document.createElement("button");
      button.className = "xw-tool";
      button.append(text("xw-tool-name", label), text("xw-tool-cost", `+${HINT_SECONDS[hint]}s`));
      button.setAttribute("aria-label", `${says}. Adds ${HINT_SECONDS[hint]} seconds.`);
      button.addEventListener("click", () => this.useHint(hint));
      tools.append(button);
    }
    // Phones only (crossword.css): swaps the keyboard for the full clue list.
    const list = document.createElement("button");
    list.className = "xw-tool xw-tool--list";
    list.append(text("xw-tool-name", "CLUES"), text("xw-tool-cost", "ALL"));
    list.setAttribute("aria-label", "Show or hide the full list of clues");
    list.addEventListener("click", () => {
      this.root.classList.toggle("xw-root--list");
      this.host.sfx("uiMove");
    });
    tools.append(list);
    return tools;
  }

  private buildKeyboard(): HTMLElement {
    const keys = div("xw-keys");
    KEY_ROWS.forEach((letters, index) => {
      const row = div("xw-keyrow");
      for (const letter of letters) {
        const key = document.createElement("button");
        key.className = "xw-key";
        key.textContent = letter.toUpperCase();
        key.addEventListener("click", () => this.type(letter));
        row.append(key);
      }
      if (index === KEY_ROWS.length - 1) {
        const del = document.createElement("button");
        del.className = "xw-key xw-key--wide";
        del.innerHTML = DELETE_ICON;
        del.setAttribute("aria-label", "Delete");
        del.addEventListener("click", () => this.erase());
        row.append(del);
      }
      keys.append(row);
    });
    return keys;
  }

  /** What happened, and SHARE / DONE, where the hints and keyboard were. */
  private buildResult(): void {
    const side = this.sideEl;
    if (!side) return;
    this.root.classList.remove("xw-root--list");
    this.root.classList.add("xw-root--done");

    const card = div("xw-card");
    card.append(
      text("xw-card-head", "SOLVED!"),
      text(
        "xw-card-sub",
        `${formatClock(this.total())}  ·  ${
          this.hints === 0 ? "NO HINTS" : `${this.hints} ${this.hints === 1 ? "HINT" : "HINTS"}`
        }`,
      ),
    );
    const score = text("xw-card-score", this.finalScore.toLocaleString("en-US"));
    score.append(text("xw-card-unit", "POINTS"));
    card.append(score);
    if (this.streak > 1) card.append(text("xw-card-streak", `${this.streak}-DAY STREAK`));
    if (this.slot === "daily") card.append(text("xw-card-sub", "A NEW PUZZLE TOMORROW"));

    const actions = div("xw-actions");
    if (this.slot === "daily") {
      actions.append(shareButton("xw-act xw-share", () => this.shareMessage()));
    }
    const done = document.createElement("button");
    done.className = "xw-act";
    done.textContent = "DONE";
    done.addEventListener("click", () => this.leave());
    actions.append(done);

    const result = div("xw-result");
    result.append(card, actions);
    side.querySelector(".xw-tools")?.remove();
    side.querySelector(".xw-keys")?.remove();
    side.append(result);
  }
}

function other(dir: Direction): Direction {
  return dir === "across" ? "down" : "across";
}

/** "14 of 61 squares", for a saved puzzle on the chooser. */
function progressOf(saved: SavedGame): string {
  const white = [...saved.fill].filter((square) => square !== BLACK);
  const filled = white.filter((square) => square !== EMPTY).length;
  return `${filled} of ${white.length} squares`;
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Local noon, so a daylight-saving shift can't tip it into the wrong day.
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

/** "SATURDAY, OCTOBER 3, 2026", the way a masthead prints it. */
function longDate(dateKey: string): string {
  return dateFromKey(dateKey)
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase();
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
  kind: "daily" | "free",
  onPick: () => void,
  freshBadge = false,
): HTMLElement {
  const button = document.createElement("button");
  button.className = `xw-mode xw-mode--${kind}`;
  const name = div("xw-mode-name");
  name.textContent = title;
  if (freshBadge) {
    const badge = document.createElement("span");
    badge.className = "badge-new";
    badge.textContent = "TODAY";
    name.append(badge);
  }
  button.append(name, text("xw-mode-hint", hint));
  button.addEventListener("click", onPick);
  return button;
}

function arrowButton(glyph: string, label: string, onPress: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "xw-cluebar-arrow";
  button.textContent = glyph;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onPress);
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

export const crosswordModule: GameModule = {
  id: "crossword",
  title: "MOM MOM'S CROSSWORD",
  shortTitle: "CROSSWORD",
  progressShort: "WD",
  blurb: "A new crossword every day. Tap a square, type the word.",
  accent: "#e9dcb8",
  hasDailyChallenge: true,
  beta: true,
  drawIcon: drawCrosswordIcon,
  create: (host) => new Crossword(host),
};

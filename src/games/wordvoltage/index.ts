/**
 * WORD VOLTAGE -- connect letters, charge up.
 *
 * Drag across a wheel of letters to spell words; every word fills its row or
 * column of a small crossword, and crossing words share their squares. Fill
 * the board and it's Powered Up. Two paths, Family and Challenge, of a
 * hundred levels each in five circuits, and Daily Charge: one shared puzzle
 * a day on each path, the same for the whole family wherever they are.
 *
 * Nobody loses and nothing is timed. Wrong words cost nothing, hints are
 * free and unlimited, and stars only say how many hints a finish took. There
 * is no score to post, so the cabinet keeps no leaderboard: progress, stars
 * and a shelf of bolts and badges are kept on the phone.
 *
 * Where things are:
 *   types.ts / board.ts / letters.ts   the puzzle model
 *   validate.ts                        the strict validator every puzzle passes
 *   play.ts                            a level's rules, as a pure reducer
 *   wheel.ts                           paths of letter tokens, hit testing
 *   rewards.ts / save.ts               the ledger, the save, merging tabs
 *   daily.ts                           Daily Charge's New York calendar, sharing
 *   pack.ts                            the content pack in public/word-voltage
 *   levelview.ts                       a level on screen, and its input
 *   index.ts                           this: the cabinet's screens
 * The puzzles themselves are made offline by scripts/word-voltage/.
 */

import "./wordvoltage.css";

import type { GameHost, GameInstance, GameModule, HudState, StartOptions } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { dailyKey } from "../../core/rng";
import { playLink, shareText as sendText } from "../../core/share";
import { markDailyDone, markDailySeen } from "../../core/storage";
import { ICONS, badgeSvg, boltSvg, drawWordVoltageIcon } from "./art";
import { dailyDate, dailyPuzzleId, lastDailyDate, longDate, shareText } from "./daily";
import { button, div, text } from "./dom";
import { LevelView, type CoachStep } from "./levelview";
import { loadPack } from "./pack";
import { FRESH_ATTEMPT, makeLevel, restoreAttempt, starsFor, type Attempt } from "./play";
import {
  BADGES,
  boltsIn,
  CIRCUITS,
  circuitOf,
  COSMETICS,
  cosmeticById,
  describeNew,
  LEVELS_PER_CIRCUIT,
  PATH_NAMES,
} from "./rewards";
import {
  attemptKey,
  bonusIdentity,
  browserStorage,
  creditBonus,
  dailyKeyOf,
  recordFinish,
  SaveStore,
  type AttemptRecord,
  type InputMode,
  type Mode,
  type Motion,
  type Save,
} from "./save";
import type { Difficulty, Pack, Puzzle } from "./types";
import { initialOrder, validOrder } from "./wheel";

const GAME_ID = "word-voltage";

/** Which level is open, so RESTART on the pause menu can come back to it. */
interface LevelRef {
  mode: Mode;
  difficulty: Difficulty;
  puzzleId: string;
  /** Campaign: 0-based level index. */
  index?: number;
  /** Daily: the date the attempt belongs to. */
  date?: string;
}

let lastLevel: LevelRef | null = null;

const TUTORIAL_STEPS: readonly CoachStep[] = [
  {
    id: "connect",
    when: (a) => a.solved.length === 0,
    text: (mode) =>
      mode === "tap"
        ? "Tap letters to spell a word, then tap ✓. Try S, T, A, R."
        : "Drag from letter to letter to spell a word, then let go. Try S, T, A, R.",
  },
  {
    id: "fill",
    when: (a) => a.solved.length === 1,
    text: () => "Every word fills its place on the board. Crossing words share a square, so one word helps the next.",
  },
  {
    id: "shuffle",
    when: (a) => a.solved.length >= 1 && !a.completed,
    text: () => "Stuck? SHUFFLE moves the letters round the wheel. They're always the same letters.",
  },
  {
    id: "hint",
    when: (a) => a.solved.length >= 1 && !a.completed,
    text: () => "HINT lights up one square. Hints are free and never run out; they only change this level's stars.",
  },
];

class WordVoltage implements GameInstance {
  private readonly host: GameHost;
  private readonly root = div("wv-root");
  private readonly store = new SaveStore(browserStorage());
  private pack: Pack | null = null;
  private view: LevelView | null = null;
  private screen: "loading" | "home" | "level" | "other" = "loading";
  /** Local `dailyKey()` the open level was opened on. */
  private openedOn = dailyKey();
  private homeDate = "";
  private dateCheck = 0;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.applyCalm();
    this.root.append(div("wv-loading", boltText("Charging up…")));
    window.addEventListener("storage", this.onStorage);
    loadPack()
      .then((pack) => {
        this.pack = pack;
        if (start?.again && lastLevel && pack.puzzles[lastLevel.puzzleId]) this.openLevel(lastLevel);
        else this.showHome();
      })
      .catch(() => this.showLoadError());
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- GameInstance -----

  update(dt: number, _input: InputSnapshot): void {
    // Left on the home screen past midnight in New York, the Daily Charge
    // card would still offer yesterday's. A once-a-second glance fixes it.
    if (this.screen !== "home") return;
    this.dateCheck += dt;
    if (this.dateCheck < 1) return;
    this.dateCheck = 0;
    if (dailyDate() !== this.homeDate) this.showHome();
  }

  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}

  hud(): HudState {
    return { lives: 0, progress: 0, progressLabel: "" };
  }

  /** Nothing is timed, so a phone call or a share sheet never needs a pause. */
  pausesWhenHidden(): boolean {
    return false;
  }

  onPause(): void {
    this.view?.cancelGesture();
  }

  onResume(): void {
    this.applyCalm();
  }

  destroy(): void {
    this.view?.destroy();
    this.view = null;
    window.removeEventListener("storage", this.onStorage);
  }

  // ----- Plumbing -----

  private get save(): Save {
    return this.store.current;
  }

  private write(save: Save): Save {
    return this.store.write(save);
  }

  private prefs(patch: Partial<Save["prefs"]>): void {
    const save = structuredClone(this.save);
    save.prefs = { ...save.prefs, ...patch, updatedAt: Date.now() };
    this.write(save);
  }

  /** Another tab saved: take its progress, and redraw a menu showing old numbers. */
  private onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== "hyperdrive.wordvoltage") return;
    this.store.refresh();
    if (this.screen === "home") this.showHome();
  };

  private isCalm(): boolean {
    const motion = this.save.prefs.motion;
    if (motion === "reduced") return true;
    if (motion === "full") return false;
    let system = false;
    try {
      system = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      system = false;
    }
    return this.host.settings.reducedMotion || system;
  }

  private applyCalm(): void {
    const calm = this.isCalm();
    this.root.classList.toggle("wv-calm", calm);
    this.view?.setCalm(calm);
  }

  private mount(...children: HTMLElement[]): void {
    this.view?.destroy();
    this.view = null;
    this.root.replaceChildren(...children);
    this.root.scrollTop = 0;
    const first = this.root.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus({ preventScroll: true });
  }

  private go(action: () => void): () => void {
    return () => {
      this.host.sfx("uiMove");
      action();
    };
  }

  private exitToArcade(): void {
    this.host.sfx("uiMove");
    if (this.host.exitToArcade) this.host.exitToArcade();
  }

  // ----- Progress, worked out from the save -----

  private completedCount(difficulty: Difficulty): number {
    const ids = this.pack!.campaign[difficulty];
    return ids.filter((id) => this.save.campaign[difficulty][id]).length;
  }

  /** The first level not yet finished: what CONTINUE opens. */
  private currentIndex(difficulty: Difficulty): number {
    const ids = this.pack!.campaign[difficulty];
    const index = ids.findIndex((id) => !this.save.campaign[difficulty][id]);
    return index < 0 ? ids.length : index;
  }

  private unlocked(difficulty: Difficulty, index: number): boolean {
    const ids = this.pack!.campaign[difficulty];
    return index === 0 || Boolean(this.save.campaign[difficulty][ids[index - 1]!]);
  }

  private attemptFor(ref: LevelRef): AttemptRecord | undefined {
    return this.save.attempts[attemptKey(ref.mode, ref.difficulty, ref.puzzleId, this.pack!.version, ref.date)];
  }

  // ----- Home -----

  private showHome(): void {
    const pack = this.pack!;
    this.screen = "home";
    this.homeDate = dailyDate();
    const difficulty = this.save.prefs.difficulty;

    const top = div("wv-menutop");
    top.append(
      button("wv-backbtn", "", () => this.exitToArcade(), {
        html: `${ICONS.back}<span>ARCADE</span>`,
        aria: "Back to Arcade",
      }),
      div("wv-pause-space"),
    );

    const brand = div("wv-brand");
    const arcade = div("wv-arcade-id");
    const icon = document.createElement("img");
    icon.src = "/icon-192.png";
    icon.alt = "";
    icon.width = 28;
    icon.height = 28;
    arcade.append(icon, text("wv-arcade-name", "DAD'S ARCADE", "span"));
    const logo = div("wv-logo");
    logo.innerHTML = `<span class="wv-logo-word">WORD</span>${boltSvg("wv-logo-bolt")}<span class="wv-logo-word wv-logo-word--b">VOLTAGE</span>`;
    logo.setAttribute("role", "heading");
    logo.setAttribute("aria-level", "1");
    logo.setAttribute("aria-label", "Word Voltage");
    brand.append(arcade, logo, text("wv-tagline", "Connect letters. Charge up."));

    // Family / Challenge, each with its own progress.
    const paths = div("wv-paths");
    paths.setAttribute("role", "radiogroup");
    paths.setAttribute("aria-label", "Path");
    for (const d of ["family", "challenge"] as const) {
      const done = this.completedCount(d);
      const total = pack.campaign[d].length;
      const on = d === difficulty;
      const pick = button(`wv-path${on ? " wv-path--on" : ""}`, "", () => {
        if (d === difficulty) return;
        this.host.sfx("uiMove");
        this.prefs({ difficulty: d });
        this.showHome();
      });
      pick.setAttribute("role", "radio");
      pick.setAttribute("aria-checked", on ? "true" : "false");
      pick.setAttribute(
        "aria-label",
        `${PATH_NAMES[d]} path, ${d === "family" ? "4 to 6" : "5 to 7"} letters, ${done} of ${total} levels done`,
      );
      pick.append(
        text("wv-path-name", PATH_NAMES[d].toUpperCase(), "span"),
        text("wv-path-sub", d === "family" ? "4-6 letters" : "5-7 letters", "span"),
        text("wv-path-prog", `${done} of ${total} done`, "span"),
      );
      paths.append(pick);
    }

    // The big button.
    const current = this.currentIndex(difficulty);
    const total = pack.campaign[difficulty].length;
    const tutorialFirst = !this.save.tutorial.done && this.completedCount("family") + this.completedCount("challenge") === 0;
    const started = current > 0 || Boolean(this.attemptFor(this.campaignRef(difficulty, Math.min(current, total - 1)))?.solved.length);
    let playLabel: string;
    let playSub: string;
    if (tutorialFirst) {
      playLabel = "PLAY";
      playSub = "Starts with a quick practice board";
    } else if (current >= total) {
      playLabel = "ALL DONE!";
      playSub = `Every ${PATH_NAMES[difficulty]} level finished. Replay any from LEVELS.`;
    } else {
      playLabel = started ? `CONTINUE · LEVEL ${current + 1}` : `PLAY · LEVEL ${current + 1}`;
      playSub = `${PATH_NAMES[difficulty]} · ${CIRCUITS[circuitOf(current)]!.name}`;
    }
    const play = button("wv-play-btn", "", () => {
      this.host.sfx("uiSelect");
      if (tutorialFirst) this.openTutorial();
      else if (current >= total) this.showLevels();
      else this.openLevel(this.campaignRef(difficulty, current));
    });
    play.dataset.autofocus = "";
    play.setAttribute("aria-label", `${playLabel.replace("·", "")}. ${playSub}`);
    play.append(text("wv-play-label", playLabel, "span"), text("wv-play-sub", playSub, "span"));

    const panel = div("wv-home-panel", paths, play, this.dailyCard(difficulty));

    const grid = div("wv-home-grid");
    const bolts = boltsIn(this.save.ledger);
    grid.append(
      button("wv-btn", "LEVELS", this.go(() => this.showLevels())),
      button("wv-btn", "", this.go(() => this.showCollection()), {
        html: `COLLECTION <span class="wv-btn-count">${boltSvg("wv-inline-bolt")}${bolts}</span>`,
        aria: `Collection: ${bolts} ${bolts === 1 ? "bolt" : "bolts"}`,
      }),
      button("wv-btn", "HOW TO PLAY", this.go(() => this.showHowTo())),
      button("wv-btn", "SETTINGS", this.go(() => this.showSettings(null))),
    );
    panel.append(grid);

    if (!this.store.persistent) {
      panel.append(
        text(
          "wv-warn",
          "This browser isn't letting the arcade save, so progress lasts until you close it. (Private browsing does this.)",
        ),
      );
    }
    this.mount(div("wv-screen wv-home", top, brand, panel, div("wv-floor")));
  }

  private campaignRef(difficulty: Difficulty, index: number): LevelRef {
    return { mode: "campaign", difficulty, puzzleId: this.pack!.campaign[difficulty][index]!, index };
  }

  /** Today's Daily Charge for this path: ready, under way, or done. */
  private dailyCard(difficulty: Difficulty): HTMLElement {
    const pack = this.pack!;
    const date = this.homeDate;
    const id = dailyPuzzleId(pack, date, difficulty);
    const card = div("wv-daily");
    const head = div("wv-daily-head");
    head.innerHTML = `${boltSvg("wv-daily-bolt")}<span>DAILY CHARGE</span>`;
    card.append(head);

    if (!id) {
      card.append(
        text("wv-daily-line", "Today's Daily Charge needs an update. Campaign levels are ready to play."),
      );
      return card;
    }
    const ref: LevelRef = { mode: "daily", difficulty, puzzleId: id, date };
    const result = this.save.daily[dailyKeyOf(date, difficulty)];
    const attempt = this.attemptFor(ref);
    card.append(text("wv-daily-date", `${longDate(date)} · ${PATH_NAMES[difficulty]}`));

    const actions = div("wv-daily-actions");
    if (result) {
      card.append(text("wv-daily-line", `Powered up! ${"★".repeat(result.stars)}${"☆".repeat(3 - result.stars)}`));
      actions.append(
        button("wv-btn wv-btn--small", "", () => this.share(date, difficulty), {
          html: `<span class="share-label">SHARE</span>`,
          aria: "Share today's result",
        }),
        button("wv-btn wv-btn--small", "SEE BOARD", this.go(() => this.openLevel(ref))),
      );
    } else {
      const solved = attempt?.solved.length ?? 0;
      const words = pack.puzzles[id]!.words.length;
      card.append(
        text(
          "wv-daily-line",
          solved > 0 ? `${solved} of ${words} words. Pick up where you left off.` : "One shared board for the whole family today.",
        ),
      );
      actions.append(
        button("wv-btn wv-btn--daily", solved > 0 ? "CONTINUE DAILY" : "PLAY DAILY", () => {
          this.host.sfx("uiSelect");
          this.openLevel(ref);
        }),
      );
    }
    card.append(actions);

    // An older daily left half done, still waiting to be finished.
    const older = Object.values(this.save.attempts)
      .filter((a) => a.mode === "daily" && a.difficulty === difficulty && !a.completed && a.date && a.date < date)
      .filter((a) => a.solved.length > 0 && pack.puzzles[a.puzzleId] && a.pack === pack.version)
      .filter((a) => !this.save.daily[dailyKeyOf(a.date!, difficulty)])
      .sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];
    if (older) {
      card.append(
        button("wv-linkbtn", `Finish ${longDate(older.date!)}'s Daily Charge`, this.go(() =>
          this.openLevel({ mode: "daily", difficulty, puzzleId: older.puzzleId, date: older.date! }),
        )),
      );
    }
    return card;
  }

  private share(date: string, difficulty: Difficulty): void {
    const record = this.save.daily[dailyKeyOf(date, difficulty)];
    if (!record) return;
    const message = shareText(
      { date, difficulty, stars: record.stars, hints: record.hints, bonusWords: record.bonus },
      playLink(GAME_ID),
    );
    void sendText(message).then((outcome) => {
      if (outcome === "copied") this.toast("Copied. Paste it into the family chat!");
      else if (outcome === "failed") this.toast("Sharing isn't available here.");
    });
  }

  private toast(message: string): void {
    const el = text("wv-toast", message);
    el.setAttribute("role", "status");
    this.root.append(el);
    window.setTimeout(() => el.remove(), 2600);
  }

  // ----- Opening a level -----

  private openTutorial(): void {
    this.openLevel({ mode: "tutorial", difficulty: "family", puzzleId: this.pack!.tutorial }, true);
  }

  private openLevel(ref: LevelRef, fresh = false): void {
    const pack = this.pack!;
    const puzzle = pack.puzzles[ref.puzzleId];
    if (!puzzle) {
      this.showHome();
      return;
    }
    lastLevel = ref;
    this.screen = "level";
    if (ref.mode === "daily") markDailySeen(GAME_ID, dailyKey());
    // The arcade's streak runs on the phone's own day, not New York's, and a
    // charge finished after midnight counts for the day it was opened.
    this.openedOn = dailyKey();

    const key = attemptKey(ref.mode, ref.difficulty, puzzle.id, pack.version, ref.date);
    let record = this.save.attempts[key];
    // A finished campaign level opens as a replay. A finished daily opens on
    // its finished board, with the result, until REPLAY is asked for.
    if (fresh || (record?.completed && ref.mode !== "daily")) record = undefined;
    const level = makeLevel(puzzle);
    const attempt = record ? restoreAttempt(level, record) : FRESH_ATTEMPT;
    const order = record && validOrder(record.order, puzzle.letters.length) ? record.order : initialOrder(puzzle.letters.length);
    if (!record) this.saveAttempt(ref, puzzle, FRESH_ATTEMPT, order);

    const identity = bonusIdentity(ref.mode, puzzle.id, ref.date);
    const credited = ref.mode === "tutorial" ? [...attempt.bonus] : [...(this.save.credited[identity] ?? [])];
    const { heading, subheading, colors } = this.describe(ref);

    const view = new LevelView({
      host: this.host,
      puzzle,
      heading,
      subheading,
      colors,
      attempt,
      order,
      inputMode: this.save.prefs.inputMode,
      cosmetic: cosmeticById(this.save.prefs.cosmetic),
      calm: this.isCalm(),
      credited,
      ...(ref.mode === "tutorial"
        ? { coach: { steps: TUTORIAL_STEPS, dismissed: this.save.tutorial.dismissed } }
        : {}),
      hooks: {
        save: (next, nextOrder) => this.saveAttempt(ref, puzzle, next, nextOrder),
        bonus: (word) => this.creditBonus(ref, puzzle, word),
        complete: (finished) => this.complete(ref, puzzle, finished),
        setInputMode: (mode: InputMode) => this.prefs({ inputMode: mode }),
        menu: () => this.showSettings(ref),
        back: () => this.showHome(),
        firstHint: () => {
          if (this.save.notes.includes("hints-free")) return false;
          const save = structuredClone(this.save);
          save.notes.push("hints-free");
          this.write(save);
          return true;
        },
        dismissCoach: (id) => {
          const save = structuredClone(this.save);
          if (!save.tutorial.dismissed.includes(id)) save.tutorial.dismissed.push(id);
          this.write(save);
        },
        skipTutorial: () => {
          const save = structuredClone(this.save);
          save.tutorial.done = true;
          this.write(save);
          this.host.sfx("uiMove");
          this.openLevel(this.campaignRef("family", 0));
        },
      },
    });
    this.mount(view.el);
    this.view = view;
    view.setCalm(this.isCalm());
    view.mounted();
    if (attempt.completed) view.showCard(this.complete(ref, puzzle, attempt));
  }

  private describe(ref: LevelRef): { heading: string; subheading: string; colors: readonly [string, string] } {
    if (ref.mode === "tutorial") {
      return { heading: "PRACTICE", subheading: "Your first charge", colors: CIRCUITS[0]!.colors };
    }
    if (ref.mode === "daily") {
      return {
        heading: "DAILY CHARGE",
        subheading: `${longDate(ref.date!)} · ${PATH_NAMES[ref.difficulty]}`,
        colors: ["#ff3bd4", "#ffd52a"],
      };
    }
    const circuit = CIRCUITS[circuitOf(ref.index ?? 0)]!;
    return {
      heading: `LEVEL ${(ref.index ?? 0) + 1}`,
      subheading: `${PATH_NAMES[ref.difficulty]} · ${circuit.name}`,
      colors: circuit.colors,
    };
  }

  private saveAttempt(ref: LevelRef, puzzle: Puzzle, attempt: Attempt, order: number[]): void {
    const pack = this.pack!;
    const save = structuredClone(this.save);
    save.attempts[attemptKey(ref.mode, ref.difficulty, puzzle.id, pack.version, ref.date)] = {
      puzzleId: puzzle.id,
      pack: pack.version,
      mode: ref.mode,
      difficulty: ref.difficulty,
      ...(ref.date ? { date: ref.date } : {}),
      solved: [...attempt.solved],
      revealed: [...attempt.revealed],
      bonus: [...attempt.bonus],
      hints: attempt.hints,
      order: [...order],
      completed: attempt.completed,
      updatedAt: Date.now(),
    };
    this.write(save);
  }

  private creditBonus(ref: LevelRef, puzzle: Puzzle, word: string): { charged: boolean; credited: number } {
    // Practice words are celebrated but never credited: the tutorial gives
    // no collection rewards, and replaying it mustn't farm them.
    if (ref.mode === "tutorial") return { charged: false, credited: 0 };
    const identity = bonusIdentity(ref.mode, puzzle.id, ref.date);
    const result = creditBonus(this.save, identity, word);
    if (result.save !== this.save) this.write(result.save);
    return { charged: result.earned.length > 0, credited: this.save.credited[identity]?.length ?? 0 };
  }

  /**
   * Record a finish -- completion, stars, rewards, all in one write -- and
   * build the card that says so. Safe to call twice for the same finish.
   */
  private complete(ref: LevelRef, puzzle: Puzzle, attempt: Attempt): HTMLElement {
    const pack = this.pack!;
    const stars = starsFor(attempt.hints);
    let save = structuredClone(this.save);
    const key = attemptKey(ref.mode, ref.difficulty, puzzle.id, pack.version, ref.date);
    const existing = save.attempts[key];
    // Only the moment it's finished: reopening a finished charge shows this card too.
    if (ref.mode === "daily" && !existing?.completed) markDailyDone(GAME_ID, this.openedOn);
    save.attempts[key] = {
      ...(existing ?? {
        puzzleId: puzzle.id,
        pack: pack.version,
        mode: ref.mode,
        difficulty: ref.difficulty,
        ...(ref.date ? { date: ref.date } : {}),
        order: initialOrder(puzzle.letters.length),
      }),
      solved: [...attempt.solved],
      revealed: [...attempt.revealed],
      bonus: [...attempt.bonus],
      hints: attempt.hints,
      completed: true,
      updatedAt: Date.now(),
    };
    const before = new Set(save.ledger);
    const recorded = recordFinish(save, {
      mode: ref.mode,
      difficulty: ref.difficulty,
      puzzleId: puzzle.id,
      stars,
      hints: attempt.hints,
      bonus: attempt.bonus.length,
      ...(ref.date ? { date: ref.date } : {}),
      ...(ref.mode === "campaign" ? { campaignIds: pack.campaign[ref.difficulty] } : {}),
      now: new Date(),
    });
    save = this.write(recorded.save);
    const rewards = describeNew(recorded.earned, before);
    return this.resultCard(ref, puzzle, attempt, stars, rewards);
  }

  private resultCard(
    ref: LevelRef,
    puzzle: Puzzle,
    attempt: Attempt,
    stars: number,
    rewards: string[],
  ): HTMLElement {
    const pack = this.pack!;
    const card = div("wv-result-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Powered Up!");
    if (!this.isCalm()) card.append(confetti());

    const { heading } = this.describe(ref);
    const where =
      ref.mode === "daily"
        ? `Daily Charge · ${longDate(ref.date!)} · ${PATH_NAMES[ref.difficulty]}`
        : ref.mode === "tutorial"
          ? "Practice board"
          : `${heading} · ${PATH_NAMES[ref.difficulty]} · ${CIRCUITS[circuitOf(ref.index ?? 0)]!.name}`;
    const starRow = div("wv-stars");
    starRow.setAttribute("role", "img");
    starRow.setAttribute("aria-label", `${stars} of 3 stars`);
    for (let i = 0; i < 3; i += 1) {
      const star = div(i < stars ? "wv-star wv-star--on" : "wv-star");
      star.innerHTML = ICONS.star;
      starRow.append(star);
    }
    const inner = div("wv-result-inner");
    inner.append(text("wv-result-head", "Powered Up!", "h2"), text("wv-result-where", where), starRow);
    inner.append(text("wv-result-caption", "Stars reflect hints used. Every finish counts."));

    const best =
      ref.mode === "campaign"
        ? this.save.campaign[ref.difficulty][puzzle.id]?.stars
        : ref.mode === "daily"
          ? this.save.daily[dailyKeyOf(ref.date!, ref.difficulty)]?.stars
          : undefined;
    const stats = div("wv-result-stats");
    const stat = (value: string, label: string) => div("wv-stat", text("wv-stat-value", value), text("wv-stat-label", label));
    stats.append(
      stat(String(puzzle.words.length), "WORDS"),
      stat(String(attempt.bonus.length), "BONUS"),
      stat(String(attempt.hints), attempt.hints === 1 ? "HINT" : "HINTS"),
    );
    inner.append(stats);
    if (best && best > stars) inner.append(text("wv-result-best", `Your best here: ${"★".repeat(best)}`));
    if (rewards.length > 0) {
      const list = div("wv-rewards");
      for (const line of rewards) list.append(text("wv-reward", line));
      inner.append(list);
    }

    const actions = div("wv-result-actions");
    if (ref.mode === "campaign") {
      const next = (ref.index ?? 0) + 1;
      if (next < pack.campaign[ref.difficulty].length) {
        const go = button("wv-btn wv-btn--primary", "NEXT LEVEL", () => {
          this.host.sfx("uiSelect");
          this.openLevel(this.campaignRef(ref.difficulty, next));
        });
        go.dataset.autofocus = "";
        actions.append(go);
      } else {
        inner.append(text("wv-result-best", `That's every ${PATH_NAMES[ref.difficulty]} level. Voltage Legend!`));
        const home = button("wv-btn wv-btn--primary", "BACK TO WORD VOLTAGE", this.go(() => this.showHome()));
        home.dataset.autofocus = "";
        actions.append(home);
      }
    } else if (ref.mode === "daily") {
      const back = button("wv-btn wv-btn--primary", "BACK TO DAILY CHARGE", this.go(() => this.showHome()));
      back.dataset.autofocus = "";
      actions.append(
        back,
        button("wv-btn", "", () => this.share(ref.date!, ref.difficulty), {
          html: `<span class="share-label">SHARE RESULT</span>`,
          aria: "Share this Daily Charge result",
        }),
      );
    } else {
      const start = button("wv-btn wv-btn--primary", "PLAY LEVEL 1", () => {
        this.host.sfx("uiSelect");
        this.openLevel(this.campaignRef("family", 0));
      });
      start.dataset.autofocus = "";
      actions.append(start);
    }
    const quiet = div("wv-result-quiet");
    quiet.append(
      button("wv-btn wv-btn--ghost", ref.mode === "tutorial" ? "PRACTICE AGAIN" : "REPLAY", this.go(() => this.openLevel(ref, true))),
      button("wv-btn wv-btn--ghost", "BACK TO ARCADE", () => this.exitToArcade()),
    );
    actions.append(quiet);
    inner.append(actions);
    card.append(inner);
    return card;
  }

  // ----- Level select -----

  private showLevels(): void {
    const pack = this.pack!;
    this.screen = "other";
    const difficulty = this.save.prefs.difficulty;
    const ids = pack.campaign[difficulty];
    const current = this.currentIndex(difficulty);

    const switcher = div("wv-tabs");
    for (const d of ["family", "challenge"] as const) {
      const tab = button(`wv-tab${d === difficulty ? " wv-tab--on" : ""}`, PATH_NAMES[d].toUpperCase(), () => {
        if (d === difficulty) return;
        this.host.sfx("uiMove");
        this.prefs({ difficulty: d });
        this.showLevels();
      });
      tab.setAttribute("aria-pressed", d === difficulty ? "true" : "false");
      switcher.append(tab);
    }

    const sections: HTMLElement[] = [];
    CIRCUITS.forEach((circuit, c) => {
      const slice = ids.slice(c * LEVELS_PER_CIRCUIT, (c + 1) * LEVELS_PER_CIRCUIT);
      if (slice.length === 0) return;
      const done = slice.filter((id) => this.save.campaign[difficulty][id]).length;
      const section = div("wv-circuit");
      section.style.setProperty("--wv-a", circuit.colors[0]);
      section.style.setProperty("--wv-b", circuit.colors[1]);
      section.append(
        div("wv-circuit-head", text("wv-circuit-name", circuit.name, "h3"), text("wv-circuit-prog", `${done}/${slice.length}`, "span")),
      );
      const grid = div("wv-levelgrid");
      slice.forEach((id, i) => {
        const index = c * LEVELS_PER_CIRCUIT + i;
        const record = this.save.campaign[difficulty][id];
        const open = this.unlocked(difficulty, index);
        const isCurrent = index === current;
        const cell = button(
          `wv-lvl${record ? " wv-lvl--done" : ""}${isCurrent ? " wv-lvl--current" : ""}${open ? "" : " wv-lvl--locked"}`,
          "",
          () => {
            this.host.sfx("uiSelect");
            this.openLevel(this.campaignRef(difficulty, index));
          },
          { disabled: !open },
        );
        cell.innerHTML = open
          ? `<span class="wv-lvl-num">${index + 1}</span><span class="wv-lvl-stars">${record ? "★".repeat(record.stars) + "☆".repeat(3 - record.stars) : isCurrent ? "PLAY" : ""}</span>`
          : `${ICONS.lock}<span class="wv-lvl-num">${index + 1}</span>`;
        cell.setAttribute(
          "aria-label",
          `Level ${index + 1}. ${record ? `Finished, ${record.stars} of 3 stars.` : open ? "Ready to play." : "Locked: finish the level before it."}`,
        );
        if (isCurrent) cell.dataset.autofocus = "";
        grid.append(cell);
      });
      section.append(grid);
      sections.push(section);
    });

    this.mount(
      div(
        "wv-screen wv-list",
        this.pageHead("LEVELS", () => this.showHome()),
        switcher,
        text("wv-note", "Levels open one at a time. Replay any finished level to try for more stars."),
        ...sections,
      ),
    );
    this.root.querySelector(".wv-lvl--current")?.scrollIntoView({ block: "center" });
  }

  private pageHead(title: string, onBack: () => void): HTMLElement {
    return div(
      "wv-pagehead",
      button("wv-backbtn", "", this.go(onBack), { html: `${ICONS.back}<span>BACK</span>`, aria: "Back" }),
      text("wv-pagetitle", title, "h2"),
      div("wv-pause-space"),
    );
  }

  // ----- Collection -----

  private showCollection(): void {
    this.screen = "other";
    const ledger = new Set(this.save.ledger);
    const bolts = boltsIn(ledger);

    const hero = div("wv-bolts");
    hero.innerHTML = `${boltSvg("wv-bolts-icon")}<span class="wv-bolts-count">${bolts}</span><span class="wv-bolts-label">${bolts === 1 ? "BOLT" : "BOLTS"}</span>`;
    const how = text(
      "wv-note",
      "A bolt for every level finished the first time, every Daily Charge, and every five bonus words found on a puzzle. They're for show: hints and levels never cost any.",
    );

    const earned = BADGES.filter((badge) => badge.earned(ledger));
    const badges = div("wv-badges");
    if (earned.length === 0) badges.append(text("wv-note", "No badges yet. Finish your first level to earn First Spark."));
    for (const badge of earned) {
      const item = div("wv-badge");
      item.innerHTML = badgeSvg(badge.color);
      item.append(text("wv-badge-name", badge.name), text("wv-badge-says", badge.says));
      badges.append(item);
    }
    const left = BADGES.length - earned.length;

    const styles = div("wv-styles");
    for (const style of COSMETICS) {
      const unlocked = style.unlocked(ledger);
      const chosen = this.save.prefs.cosmetic === style.id;
      const pick = button(
        `wv-style${chosen ? " wv-style--on" : ""}${unlocked ? "" : " wv-style--locked"}`,
        "",
        () => {
          this.host.sfx("uiSelect");
          this.prefs({ cosmetic: style.id });
          this.showCollection();
        },
        { disabled: !unlocked },
      );
      pick.style.setProperty("--wv-tile", style.tile);
      pick.style.setProperty("--wv-rim", style.rim);
      pick.style.setProperty("--wv-trail", style.trail);
      pick.innerHTML = `<span class="wv-style-swatch"><i></i><i></i><i></i></span>`;
      pick.append(text("wv-style-name", style.name, "span"), text("wv-style-says", unlocked ? (chosen ? "In use" : "Tap to use") : style.says, "span"));
      pick.setAttribute("aria-pressed", chosen ? "true" : "false");
      styles.append(pick);
    }

    this.mount(
      div(
        "wv-screen wv-list",
        this.pageHead("COLLECTION", () => this.showHome()),
        hero,
        how,
        text("wv-section", "BADGES", "h3"),
        badges,
        ...(left > 0 && earned.length > 0 ? [text("wv-note", `${left} more to earn by finishing circuits.`)] : []),
        text("wv-section", "WHEEL STYLES", "h3"),
        styles,
      ),
    );
  }

  // ----- How to play -----

  private showHowTo(): void {
    this.screen = "other";
    const pack = this.pack!;
    const last = lastDailyDate(pack);
    const rule = (title: string, body: string) => div("wv-rule", text("wv-rule-title", title, "h3"), text("wv-rule-body", body, "p"));
    this.mount(
      div(
        "wv-screen wv-list",
        this.pageHead("HOW TO PLAY", () => this.showHome()),
        rule("Connect letters", "Drag from letter to letter round the wheel to spell a word, then let go. Go back one letter to take it off. Each letter on the wheel can be used once per word, so two Es means two Es."),
        rule("Tap or type instead", "Switch the wheel to TAP to tap letters, then ✓ to check. On a keyboard, type the letters, press Enter to check, Backspace to take one off and Esc to clear."),
        rule("Fill the board", "Every board word fills its place. Crossing words share a square, so one word gives you letters of the next. Fill every word and the level is Powered Up. There's no timer and no way to lose."),
        rule("Shuffle and hints", "SHUFFLE moves the letters round to help you see new words. HINT lights up one square of a word: tap a square first to choose which word. Hints are free and never run out."),
        rule("Stars", "Three stars with no hints, two with one or two, one with three or more. Wrong words never cost anything. Replay a level any time to try for more."),
        rule("Bonus words", "Real words that aren't on the board count as bonus words. Every five you find on a puzzle fills a bolt for your collection. You never need them to finish."),
        rule("Which words count", "Board words are everyday words a family knows. Bonus words come from a big public word list, with rude words, slurs and the like taken out. Names, short forms and two-letter words don't count. Not every English word is in it, so if a real word doesn't count, try another."),
        rule("Daily Charge", `One new board a day on each path, the same for everyone. It changes at midnight New York time, so the whole family gets the same puzzle wherever they are.${last ? ` This version has Daily Charges up to ${longDate(last)}.` : ""}`),
        button("wv-btn", "PLAY THE PRACTICE BOARD", () => {
          this.host.sfx("uiSelect");
          this.openTutorial();
        }),
      ),
    );
  }

  // ----- Settings -----

  /** From the home screen (`level` null) or over a level, with its extras. */
  private showSettings(level: LevelRef | null): void {
    const sheet = div("wv-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Settings");
    const card = div("wv-sheet-card wv-settings");
    const close = () => {
      this.host.sfx("uiMove");
      sheet.remove();
      this.applyCalm();
    };

    card.append(text("wv-sheet-title", level ? "MENU" : "SETTINGS"));
    if (level) {
      const resume = button("wv-btn wv-btn--primary", "RESUME", close);
      resume.dataset.autofocus = "";
      card.append(resume);
    }

    const settings = this.host.settings;
    const toggle = (label: string, note: string, on: boolean, flip: (on: boolean) => void) => {
      const row = div("wv-setrow");
      const control = button(`wv-switch${on ? " wv-switch--on" : ""}`, on ? "ON" : "OFF", () => {
        const next = !control.classList.contains("wv-switch--on");
        flip(next);
        control.classList.toggle("wv-switch--on", next);
        control.textContent = next ? "ON" : "OFF";
        control.setAttribute("aria-checked", next ? "true" : "false");
        this.host.sfx("uiMove");
      });
      control.setAttribute("role", "switch");
      control.setAttribute("aria-checked", on ? "true" : "false");
      control.setAttribute("aria-label", label);
      row.append(div("wv-setlabel", text("wv-setname", label, "span"), text("wv-setnote", note, "span")), control);
      return row;
    };
    const choice = <T extends string>(label: string, note: string, options: Array<[T, string]>, value: T, pick: (v: T) => void) => {
      const row = div("wv-setrow wv-setrow--stack");
      const group = div("wv-seg");
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", label);
      for (const [v, name] of options) {
        const opt = button(`wv-seg-opt${v === value ? " wv-seg-opt--on" : ""}`, name, () => {
          pick(v);
          for (const sibling of group.children) sibling.classList.remove("wv-seg-opt--on");
          for (const sibling of group.children) sibling.setAttribute("aria-checked", "false");
          opt.classList.add("wv-seg-opt--on");
          opt.setAttribute("aria-checked", "true");
          this.host.sfx("uiMove");
        });
        opt.setAttribute("role", "radio");
        opt.setAttribute("aria-checked", v === value ? "true" : "false");
        group.append(opt);
      }
      row.append(div("wv-setlabel", text("wv-setname", label, "span"), text("wv-setnote", note, "span")), group);
      return row;
    };

    if (this.host.updateSettings) {
      card.append(
        toggle("Sound", "For the whole arcade", !settings.muted, (on) => this.host.updateSettings!({ muted: !on })),
        toggle("Vibration", "Where the phone supports it", settings.haptics, (on) => this.host.updateSettings!({ haptics: on })),
      );
    }
    card.append(
      choice<InputMode>("Letters", "Swipe across them, or tap one at a time", [["swipe", "SWIPE"], ["tap", "TAP"]], this.save.prefs.inputMode, (v) => {
        this.prefs({ inputMode: v });
        this.view?.setInputMode(v);
      }),
      choice<Motion>("Motion", "System follows your phone's reduce-motion setting", [["system", "SYSTEM"], ["reduced", "LESS"], ["full", "FULL"]], this.save.prefs.motion, (v) => {
        this.prefs({ motion: v });
        this.applyCalm();
      }),
      text("wv-setnote wv-setnote--block", "Keyboard: type letters, Enter to check, Backspace to undo, Esc to clear."),
      text("wv-setnote wv-setnote--block", "Daily Charge changes at midnight New York time, so the whole family gets the same puzzle wherever they are."),
    );

    if (level) {
      const restart = button("wv-btn", "RESTART THIS LEVEL", () => {
        this.confirm(
          "Restart this level?",
          "This clears only this level's unfinished go: the words found and hints used so far. Stars and rewards you've already earned stay.",
          "RESTART",
          () => {
            sheet.remove();
            this.openLevel(level, true);
          },
        );
      });
      card.append(
        restart,
        button("wv-btn", "LEVELS", () => {
          sheet.remove();
          this.host.sfx("uiMove");
          this.showLevels();
        }),
        button("wv-btn", "WORD VOLTAGE HOME", () => {
          sheet.remove();
          this.host.sfx("uiMove");
          this.showHome();
        }),
        button("wv-btn wv-btn--ghost", "BACK TO ARCADE", () => this.exitToArcade()),
      );
    } else {
      card.append(
        button("wv-btn wv-btn--danger", "RESET WORD VOLTAGE PROGRESS", () => {
          this.confirm(
            "Reset Word Voltage?",
            "This removes every Word Voltage level finished, all stars, Daily Charge results, bolts, badges, wheel styles and saved boards, on this device. Other games, high scores and arcade settings aren't touched.",
            "RESET",
            () => {
              this.store.reset();
              sheet.remove();
              this.showHome();
            },
          );
        }),
      );
      const done = button("wv-btn wv-btn--primary", "DONE", close);
      done.dataset.autofocus = "";
      card.append(done);
    }

    sheet.append(card);
    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    this.root.append(sheet);
    card.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }

  private confirm(title: string, body: string, yes: string, onYes: () => void): void {
    const dialog = div("wv-sheet wv-confirm");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-label", title);
    const cancel = button("wv-btn wv-btn--primary", "CANCEL", () => {
      this.host.sfx("uiMove");
      dialog.remove();
    });
    cancel.dataset.autofocus = "";
    const ok = button("wv-btn wv-btn--danger", yes, () => {
      this.host.sfx("uiSelect");
      dialog.remove();
      onYes();
    });
    dialog.append(div("wv-sheet-card", text("wv-sheet-title", title.toUpperCase()), text("wv-sheet-note", body, "p"), cancel, ok));
    this.root.append(dialog);
    cancel.focus({ preventScroll: true });
  }

  private showLoadError(): void {
    this.screen = "other";
    this.mount(
      div(
        "wv-screen wv-home",
        div("wv-menutop", button("wv-backbtn", "", () => this.exitToArcade(), { html: `${ICONS.back}<span>ARCADE</span>`, aria: "Back to Arcade" }), div("wv-pause-space")),
        div("wv-brand", text("wv-result-head", "No connection", "h2")),
        text("wv-note", "Word Voltage needs a connection the first time it opens, to fetch its puzzles. After that it plays with no signal."),
        button("wv-btn wv-btn--primary", "TRY AGAIN", () => {
          this.mount(div("wv-loading", boltText("Charging up…")));
          loadPack()
            .then((pack) => {
              this.pack = pack;
              this.showHome();
            })
            .catch(() => this.showLoadError());
        }),
      ),
    );
  }
}

function boltText(message: string): HTMLElement {
  const node = div("wv-loading-inner");
  node.innerHTML = `${boltSvg("wv-loading-bolt")}<span>${message}</span>`;
  return node;
}

/** A short burst of square "pixels", for the result card. CSS does the rest. */
function confetti(): HTMLElement {
  const box = div("wv-confetti");
  box.setAttribute("aria-hidden", "true");
  const colors = ["#19dfff", "#ff3bd4", "#ffd52a", "#7748ff", "#f8fbff"];
  for (let i = 0; i < 28; i += 1) {
    const bit = document.createElement("i");
    bit.style.setProperty("--x", `${Math.round((Math.random() * 2 - 1) * 160)}px`);
    bit.style.setProperty("--y", `${Math.round(-60 - Math.random() * 160)}px`);
    bit.style.setProperty("--r", `${Math.round(Math.random() * 360)}deg`);
    bit.style.setProperty("--d", `${Math.round(Math.random() * 160)}ms`);
    bit.style.background = colors[i % colors.length]!;
    box.append(bit);
  }
  return box;
}

export const wordVoltageModule: GameModule = {
  id: GAME_ID,
  title: "WORD VOLTAGE",
  shortTitle: "VOLTAGE",
  blurb: "Swipe letters, solve crosswords, and power up the arcade.",
  howToPlay: [
    "Drag across the letters on the wheel to spell a word, then let go. Each letter tile can be used once per word.",
    "Every word fills its place on the board, and crossing words share a square. Fill every word to finish.",
    "SHUFFLE moves the letters round. HINT lights one square; tap a square first to pick the word.",
    "Hints are free and never run out. Stars only count hints: three with none, two with one or two.",
    "Prefer tapping? Switch the wheel to TAP. On a keyboard, type the letters and press Enter.",
    "Daily Charge is one board a day for everyone, changing at midnight New York time. It counts toward the arcade's daily streak.",
  ],
  accent: "#ffd52a",
  noLeaderboard: true,
  dailyWithoutBoard: true,
  beta: true,
  drawIcon: drawWordVoltageIcon,
  create: (host, start) => new WordVoltage(host, start),
};

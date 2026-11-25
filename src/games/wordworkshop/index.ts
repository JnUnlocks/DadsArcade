/**
 * Word Workshop: second-grade spelling and grammar with Digit at the
 * letterpress, on the LEARN & PLAY shelf beside Fact Frenzy.
 *
 * Two untimed modes of five items. Build a Word: Digit says a word and a
 * sentence, and the child sets wooden letter blocks in a row. Fix a
 * Sentence: one thing is wrong; tap it and choose what it should be. A point
 * is for getting it right on your own the first time, and the score to beat
 * is your own.
 *
 * The players and Digit's closet are the same ones Fact Frenzy uses, so a
 * child set up in one game is ready in the other, and the Red Cap won here is
 * worn there. Word Workshop's own scores live in records.ts.
 *
 * All DOM, like Fact Frenzy: real buttons and live text, read by VoiceOver.
 */

import "./wordworkshop.css";

import type { GameHost, GameInstance, GameModule, HudState, StartOptions } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Rng } from "../../core/rng";
import { GRADES, GRADE_NAMES, type Grade } from "../factfrenzy/decks";
import { digitImg, reaction, warmDigit } from "../factfrenzy/digit";
import {
  FURS,
  NAME_MAX,
  OUTFITS,
  cleanName,
  currentKid,
  furUnlocked,
  loadSave,
  newKid,
  storeSave,
  withKid,
  type Kid,
  type Outfit,
  type Save,
} from "../factfrenzy/profiles";
import tileArt from "./art/tile.webp";
import workshopArt from "./art/workshop.webp";
import {
  ROUND_ITEMS,
  benchFor,
  bestKey,
  commitRound,
  loadWorkSave,
  nextStampPrize,
  outcomeLine,
  storeWorkSave,
  withBench,
  type ActiveRound,
  type Bench,
  type Mode,
  type WorkOutcome,
  type WorkSave,
} from "./records";
import { canSpeak, hush, say, spelledOut, warmVoice } from "./speech";
import { BuildTask, FixTask, type ItemResult } from "./tasks";
import {
  FIX_DECKS,
  SPELL_DECKS,
  TUTORIAL,
  choicesFor,
  clue,
  deal,
  fixDeck,
  fixedParts,
  sentenceText,
  spellDeck,
  trayFor,
  type FixDeck,
  type FixItem,
  type SpellDeck,
  type SpellWord,
  type Tile,
} from "./words";

const GAME_ID = "word-workshop";

/** What PLAY AGAIN and RESTART start. */
let lastPlay: { kidId: string; mode: Mode; deckId: string } | null = null;

type Screen = "edit" | "welcome" | "home" | "players" | "decks" | "closet" | "lesson" | "play" | "results" | "pencil";

type Deck = SpellDeck | FixDeck;

interface RoundState {
  id: string;
  kidId: string;
  mode: Mode;
  deck: Deck;
  grade: Grade;
  words: SpellWord[];
  sentences: FixItem[];
  results: ItemResult[];
}

const MODE_NAMES: Record<Mode, string> = { build: "Build a Word", fix: "Fix a Sentence" };

// ----- DOM helpers -----

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) if (child) node.append(child);
  return node;
}

function button(className: string, onClick: () => void, ...children: Child[]): HTMLButtonElement {
  const b = h("button", className, ...children);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

function markName(mark: string): string {
  return mark === "?" ? "a question mark" : mark === "!" ? "an exclamation mark" : "a period";
}

function deckFor(mode: Mode, id: string): Deck | undefined {
  return mode === "build" ? spellDeck(id) : fixDeck(id);
}

function decksOf(mode: Mode): readonly Deck[] {
  return mode === "build" ? SPELL_DECKS : FIX_DECKS;
}

function deckSample(deck: Deck): string {
  return deck.sample;
}

// ----- The game -----

class WordWorkshop implements GameInstance {
  private readonly host: GameHost;
  private readonly root = h("div", "ww-root");
  private players: Save;
  private work: WorkSave;
  private screen: Screen = "home";
  private timers: number[] = [];
  private readonly rng = new Rng((Math.random() * 2 ** 32) >>> 0);

  // A round in play.
  private round: RoundState | null = null;
  private task: BuildTask | FixTask | null = null;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.players = loadSave();
    this.work = loadWorkSave();
    warmVoice();
    this.applyCalm();
    window.addEventListener("keydown", this.onKey);

    const kid = currentKid(this.players);
    if (kid) warmDigit(kid.fur, [kid.outfit, reaction(kid.outfit, "jump").pose, "cap", "cape"]);
    const again = start?.again && lastPlay ? this.players.kids.find((k) => k.id === lastPlay!.kidId) : null;
    const deck = lastPlay ? deckFor(lastPlay.mode, lastPlay.deckId) : undefined;
    if (again && deck && lastPlay) this.startRound(again, lastPlay.mode, deck, null);
    else if (!kid) this.showEdit();
    else if (!this.bench(kid).tutorial) this.showWelcome();
    else this.showHome();
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  update(_dt: number, _input: InputSnapshot): void {}

  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}

  hud(): HudState {
    return { lives: 0, progress: 0, progressLabel: "", hidden: true };
  }

  /** Nothing here runs on a clock, so there's nothing a background pause protects. */
  pausesWhenHidden(): boolean {
    return false;
  }

  onPause(): void {
    hush();
  }

  onResume(): void {
    this.applyCalm();
    this.paintToggles();
  }

  destroy(): void {
    hush();
    this.clearTimers();
    window.removeEventListener("keydown", this.onKey);
  }

  feedbackContext(): string {
    if (this.round) {
      return `${MODE_NAMES[this.round.mode]}, ${this.round.deck.title}, item ${this.round.results.length + 1} of ${ROUND_ITEMS}`;
    }
    return `${this.screen} screen`;
  }

  // ----- Plumbing -----

  private get calm(): boolean {
    let system = false;
    try {
      system = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      system = false;
    }
    return this.host.settings.reducedMotion || system;
  }

  private applyCalm(): void {
    this.root.classList.toggle("ww-calm", this.calm);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  private mount(screen: Screen, ...children: Child[]): void {
    this.clearTimers();
    hush();
    this.screen = screen;
    if (screen !== "play") {
      this.round = screen === "results" || screen === "pencil" ? this.round : null;
      this.task = null;
    }
    this.root.style.setProperty("--ww-backdrop", `url("${workshopArt}")`);
    const page = h("div", `ww-page ww-page--${screen}`, ...children);
    this.root.replaceChildren(page);
    this.root.scrollTop = 0;
    this.root.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }

  private bench(kid: Kid): Bench {
    return benchFor(this.work, kid);
  }

  private storeBench(kid: Kid, bench: Bench): void {
    this.storeWork(withBench(this.work, kid.id, bench));
  }

  private storeWork(save: WorkSave): void {
    this.work = save;
    storeWorkSave(save);
  }

  /**
   * Save a player into the shared LEARN & PLAY players, reading them fresh
   * first so nothing Fact Frenzy saved is ever written over.
   */
  private storeKid(kid: Kid): void {
    const fresh = loadSave();
    const save = fresh.kids.some((k) => k.id === kid.id) ? withKid(fresh, kid) : { ...fresh, kids: [...fresh.kids, kid] };
    this.players = { ...save, current: kid.id };
    storeSave(this.players);
  }

  /** The player as saved now, which Fact Frenzy may have changed since we loaded. */
  private freshKid(id: string): Kid | null {
    this.players = loadSave();
    return this.players.kids.find((k) => k.id === id) ?? null;
  }

  private tap(sound: "uiMove" | "uiSelect" | "wordTile" = "uiMove"): void {
    this.host.sfx(sound);
  }

  /** Digit's voice, when it's switched on and the device has one. */
  private get voiceOn(): boolean {
    return this.work.voice && canSpeak();
  }

  private speak(text: string): void {
    if (this.voiceOn) void say(text);
  }

  private topBar(...left: Child[]): HTMLElement {
    return h("div", "ww-top", h("div", "ww-top-left", ...left), h("div", "ww-pause-space"));
  }

  private soundButton(): HTMLButtonElement {
    const b = button("ww-icon-btn ww-sound", () => {
      this.host.updateSettings?.({ muted: !this.host.settings.muted });
      this.paintToggles();
      if (!this.host.settings.muted) this.tap();
    });
    return b;
  }

  private voiceButton(): HTMLButtonElement | null {
    if (!canSpeak()) return null;
    return button("ww-icon-btn ww-voice", () => {
      this.storeWork({ ...this.work, voice: !this.work.voice });
      if (!this.work.voice) hush();
      this.tap();
      this.paintToggles();
      if (this.work.voice) this.speak("Hi! I'll read the words.");
      if (this.screen === "play") this.paintClue();
    });
  }

  /** The sound-effects and voice buttons wherever they are on screen. */
  private paintToggles(): void {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".ww-sound")) {
      const muted = this.host.settings.muted;
      b.textContent = muted ? "🔇" : "🔊";
      b.setAttribute("aria-label", muted ? "Sound effects are off. Turn them on." : "Sound effects are on. Turn them off.");
      b.setAttribute("aria-pressed", String(muted));
    }
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".ww-voice")) {
      const on = this.work.voice;
      b.replaceChildren(h("span", "", "🗣️"), h("span", "ww-voice-word", on ? "Voice on" : "Voice off"));
      b.setAttribute("aria-label", on ? "Digit's voice is on. Turn it off." : "Digit's voice is off. Turn it on.");
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("is-off", !on);
    }
  }

  private marquee(): HTMLElement {
    const lights = h("div", "ww-lights");
    for (let i = 0; i < 12; i += 1) lights.append(h("span", "ww-light"));
    return h("div", "ww-marquee", lights, h("span", "ww-marquee-plaque", "DAD'S ARCADE"), h("h1", "ww-marquee-title", "WORD WORKSHOP"));
  }

  private onKey = (event: KeyboardEvent): void => {
    if (!this.root.isConnected || event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
    const task = this.task;
    if (this.screen !== "play" || !(task instanceof BuildTask) || task.solved) return;
    const key = event.key.toLowerCase();
    if (/^[a-z]$/.test(key)) {
      const tile = task.tiles.find((t) => t.letter === key && !task.placed(t.id));
      if (tile) this.placeTile(tile.id);
      event.preventDefault();
    } else if (event.key === "Backspace") {
      const last = task.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0).pop();
      if (last !== undefined) this.liftSlot(last);
      event.preventDefault();
    } else if (event.key === "Enter" && task.full) {
      this.checkBuild();
      event.preventDefault();
    }
  };

  // ----- Players -----

  private showEdit(): void {
    const first = this.players.kids.length === 0;
    let grade: Grade = "2";
    let fur = "purple";

    const input = h("input", "ww-input");
    input.type = "text";
    input.maxLength = NAME_MAX;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.enterKeyHint = "done";
    input.placeholder = "Your name";
    input.id = "ww-name";
    if (!first) input.dataset.autofocus = "";
    const label = h("label", "ww-label", "Name");
    label.htmlFor = "ww-name";

    const gradeNote = h("p", "ww-note");
    const grades = h("div", "ww-chips");
    const paintGrades = () => {
      for (const chip of grades.children) chip.setAttribute("aria-pressed", String((chip as HTMLElement).dataset.grade === grade));
      gradeNote.textContent = GRADE_NAMES[grade];
    };
    for (const g of GRADES) {
      const chip = button("ww-chip", () => {
        grade = g;
        this.tap();
        paintGrades();
      }, g);
      chip.dataset.grade = g;
      chip.setAttribute("aria-label", GRADE_NAMES[g]);
      grades.append(chip);
    }
    paintGrades();

    const colors = h("div", "ww-colors");
    const paintColors = () => {
      for (const c of colors.children) c.setAttribute("aria-pressed", String((c as HTMLElement).dataset.fur === fur));
    };
    for (const f of FURS.filter((x) => x.rounds === 0)) {
      const c = button("ww-color", () => {
        fur = f.id;
        this.tap();
        paintColors();
      }, digitImg("overalls", f.id, "ww-color-digit"), h("span", "ww-color-name", f.name));
      c.dataset.fur = f.id;
      colors.append(c);
    }
    paintColors();

    const go = button("ww-btn ww-btn--go", () => {
      const name = cleanName(input.value);
      if (!name) {
        input.focus();
        input.classList.add("is-empty");
        return;
      }
      this.tap("uiSelect");
      const kid = newKid(newId(), name, grade, fur);
      this.storeKid(kid);
      warmDigit(kid.fur, [kid.outfit, "cap", "cape"]);
      this.showWelcome();
    }, "Let's go!");
    input.addEventListener("input", () => input.classList.remove("is-empty"));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    this.mount(
      "edit",
      this.topBar(),
      first ? this.marquee() : h("h2", "ww-title", "New player"),
      first ? h("p", "ww-welcome", "Hi! I'm Digit. Who's building words with me?") : null,
      h("div", "ww-card ww-form", label, input, h("span", "ww-label", "Grade"), grades, gradeNote, h("span", "ww-label", "Digit's color"), colors),
      go,
      first ? null : button("ww-btn ww-btn--quiet", () => (this.tap(), this.showPlayers()), "Cancel"),
    );
  }

  private showPlayers(): void {
    const list = h("div", "ww-players");
    for (const kid of this.players.kids) {
      const bench = this.bench(kid);
      const pick = button(
        "ww-player",
        () => {
          this.tap("uiSelect");
          this.players = { ...loadSave(), current: kid.id };
          storeSave(this.players);
          warmDigit(kid.fur, [kid.outfit, "cap", "cape"]);
          if (this.bench(kid).tutorial) this.showHome();
          else this.showWelcome();
        },
        digitImg(kid.outfit, kid.fur, "ww-player-digit"),
        h("span", "ww-player-name", kid.name),
        h("span", "ww-player-note", `${GRADE_NAMES[kid.grade]} · ${bench.stamps} ${bench.stamps === 1 ? "stamp" : "stamps"}`),
      );
      if (kid.id === this.players.current) pick.classList.add("is-current");
      list.append(pick);
    }
    this.mount(
      "players",
      this.topBar(button("ww-btn ww-btn--small", () => (this.tap(), this.showHome()), "‹ Back")),
      h("h2", "ww-title", "Who's building?"),
      list,
      button("ww-btn", () => (this.tap(), this.showEdit()), "+ Add a player"),
      h("p", "ww-note", "Players are shared with Fact Frenzy. Change a name there."),
    );
  }

  private kidOrEdit(): Kid | null {
    this.players = loadSave();
    const kid = currentKid(this.players);
    if (!kid) this.showEdit();
    return kid;
  }

  private whoButton(kid: Kid): HTMLButtonElement {
    const who = button("ww-btn ww-btn--small ww-who", () => (this.tap(), this.showPlayers()), `${kid.name} ▾`);
    who.setAttribute("aria-label", `Playing as ${kid.name}. Change player.`);
    return who;
  }

  // ----- First visit -----

  private showWelcome(): void {
    const kid = this.kidOrEdit();
    if (!kid) return;
    const start = button("ww-btn ww-btn--go", () => {
      this.tap("uiSelect");
      this.showLesson();
    }, h("span", "ww-play-icon", "▶"), h("span", "", "Start"));
    start.dataset.autofocus = "";
    this.mount(
      "welcome",
      this.topBar(this.whoButton(kid)),
      this.marquee(),
      h("div", "ww-stage", h("div", "ww-bubble", `Hi ${kid.name}! I fix words at my letterpress. Want to help?`), digitImg(kid.outfit, kid.fur, "ww-stage-digit")),
      start,
    );
  }

  /**
   * Digit's lesson: build cap, add an e to make cape, and hear how the e
   * changes the a. Not scored; it can be played again from the workshop.
   */
  private showLesson(): void {
    const kid = this.kidOrEdit();
    if (!kid) return;
    const picture = h("div", "ww-lesson-digit");
    const showDigit = (pose: "cap" | "cape", pop = false) => picture.replaceChildren(digitImg(pose, kid.fur, `ww-lesson-pose${pop ? " is-pop" : ""}`));
    showDigit("cap");
    const said = h("p", "ww-lesson-say", "");
    said.setAttribute("aria-live", "polite");
    const board = h("div", "ww-board");
    const extra = h("div", "ww-lesson-extra");

    const capWord: SpellWord = { id: "lesson-cap", word: "cap", sentence: "Digit wears a red cap.", hint: "Listen: c, a, p." };
    const capeWord: SpellWord = { id: "lesson-cape", word: "cape", sentence: "A cape can flutter behind you.", hint: "Add the quiet e." };
    const capTiles: Tile[] = [
      { id: "l1", letter: "p" },
      { id: "l0", letter: "c" },
      { id: "l2", letter: "a" },
    ];

    const step2 = () => {
      const tiles: Tile[] = [
        { id: "l0", letter: "c" },
        { id: "l1", letter: "p" },
        { id: "l2", letter: "a" },
        ...TUTORIAL.spares.map((letter, i) => ({ id: `s${i}`, letter })),
      ];
      const task = new BuildTask(capeWord, tiles);
      task.slots[0] = "l0";
      task.slots[1] = "l2";
      task.slots[2] = "l1";
      said.textContent = "Now make cape. A cape can flutter behind you.";
      this.speak(TUTORIAL.cape.say);
      this.buildBoard(board, task, {
        lesson: true,
        onRight: () => {
          showDigit("cape", true);
          this.host.sfx("factPrize");
          board.querySelectorAll(".ww-slot")[1]?.classList.add("is-glow");
          board.querySelectorAll(".ww-slot")[3]?.classList.add("is-glow");
          said.textContent = TUTORIAL.done;
          this.speak(TUTORIAL.done);
          this.storeBench(kid, { ...this.bench(kid), tutorial: true });
          const hearCap = button("ww-btn ww-btn--small ww-btn--teal", () => (this.tap(), this.speak("cap")), "🔊 cap");
          const hearCape = button("ww-btn ww-btn--small ww-btn--teal", () => (this.tap(), this.speak("cape")), "🔊 cape");
          hearCap.setAttribute("aria-label", "Hear cap again");
          hearCape.setAttribute("aria-label", "Hear cape again");
          const go = button("ww-btn ww-btn--go", () => {
            this.tap("uiSelect");
            const fresh = this.freshKid(kid.id) ?? kid;
            const bench = this.bench(fresh);
            const mode = bench.mode;
            const deck = deckFor(mode, mode === "build" ? bench.spellDeck : bench.fixDeck) ?? decksOf(mode)[0]!;
            this.startRound(fresh, mode, deck, null);
          }, h("span", "ww-play-icon", "▶"), h("span", "", "Start a round"));
          extra.replaceChildren(
            h("div", "ww-row", hearCap, hearCape),
            go,
            button("ww-btn ww-btn--quiet", () => (this.tap(), this.showHome()), "Back to the workshop"),
          );
          go.focus({ preventScroll: true });
        },
      });
    };

    const capTask = new BuildTask(capWord, capTiles);
    said.textContent = "Cap. Digit wears a red cap. Tap the letters, then Check.";
    this.buildBoard(board, capTask, {
      lesson: true,
      onRight: () => {
        this.host.sfx("factRight");
        extra.replaceChildren();
        this.later(this.calm ? 300 : 700, step2);
      },
    });
    this.mount(
      "lesson",
      this.topBar(button("ww-btn ww-btn--small", () => (this.tap(), this.showHome()), "‹ Workshop")),
      h("h2", "ww-title", "Digit's lesson"),
      picture,
      said,
      board,
      extra,
    );
    // The Start tap that opened the lesson is the gesture the first words ride on.
    this.speak(TUTORIAL.cap.say);
  }

  // ----- The workshop -----

  private showHome(): void {
    const kid = this.kidOrEdit();
    if (!kid) return;
    let bench = this.bench(kid);
    const mode = bench.mode;
    const deck = deckFor(mode, mode === "build" ? bench.spellDeck : bench.fixDeck) ?? decksOf(mode)[0]!;
    const best = bench.bests[bestKey(mode, deck.id, deck.grade)];
    const bubble =
      best === undefined
        ? mode === "build"
          ? `Let's build some words, ${kid.name}!`
          : `Let's fix some sentences, ${kid.name}!`
        : best === ROUND_ITEMS
          ? `5 of 5! Want to try a new deck, ${kid.name}?`
          : `Can you beat ${best}, ${kid.name}?`;

    const tabs = h("div", "ww-modes");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Game");
    for (const m of ["build", "fix"] as const) {
      const tab = button("ww-mode", () => {
        if (m === bench.mode) return;
        this.tap();
        bench = { ...this.bench(kid), mode: m };
        this.storeBench(kid, bench);
        this.showHome();
      }, h("span", "ww-mode-icon", m === "build" ? "🔤" : "✏️"), h("span", "", MODE_NAMES[m]));
      tab.setAttribute("aria-pressed", String(m === mode));
      tabs.append(tab);
    }

    const deckButton = button(
      "ww-deck",
      () => (this.tap(), this.showDecks()),
      h("span", "ww-deck-grade", GRADE_NAMES[deck.grade]),
      h("span", "ww-deck-title", deck.title),
      h("span", "ww-deck-sample", deckSample(deck)),
      h("span", "ww-deck-change", "Change ›"),
    );
    deckButton.setAttribute("aria-label", `${GRADE_NAMES[deck.grade]}, ${deck.title}. Change deck.`);

    const bestPill = h(
      "div",
      "ww-best",
      h("span", "", "🏆"),
      h("span", "", best === undefined ? "No best yet" : "My best"),
      best === undefined ? null : h("strong", "", `${best} of ${ROUND_ITEMS}`),
    );

    const active = this.work.active?.kidId === kid.id ? this.work.active : null;
    const resume = active
      ? h(
          "div",
          "ww-card ww-resume",
          h("p", "", `You were on ${active.mode === "build" ? "word" : "sentence"} ${active.results.length + 1} of ${active.items.length}.`),
          button("ww-btn ww-btn--teal", () => {
            this.tap("uiSelect");
            const d = deckFor(active.mode, active.deckId);
            if (d) this.startRound(kid, active.mode, d, active);
          }, "Finish that round"),
        )
      : null;

    const play = button("ww-btn ww-btn--go", () => {
      this.tap("uiSelect");
      this.startRound(kid, mode, deck, null);
    }, h("span", "ww-play-icon", "▶"), h("span", "", "Start a round"));
    play.dataset.autofocus = "";

    const prize = nextStampPrize(bench, kid);
    this.mount(
      "home",
      this.topBar(this.whoButton(kid)),
      this.marquee(),
      h("div", "ww-stage", h("div", "ww-bubble", bubble), digitImg(kid.outfit, kid.fur, "ww-stage-digit")),
      resume,
      tabs,
      deckButton,
      bestPill,
      play,
      h(
        "div",
        "ww-home-row",
        button("ww-btn ww-btn--small", () => (this.tap(), this.showCloset()), "👕 Closet"),
        button("ww-btn ww-btn--small", () => (this.tap(), this.showLesson()), "🧢 Lesson"),
        this.voiceButton(),
        this.soundButton(),
      ),
      h(
        "p",
        "ww-goal",
        `Workshop stamps: ${bench.stamps}`,
        prize ? ` · ${prize.toGo} more to win the ${prize.outfit.name}` : "",
      ),
    );
    this.paintToggles();
  }

  private showDecks(): void {
    const kid = this.kidOrEdit();
    if (!kid) return;
    const bench = this.bench(kid);
    const mode = bench.mode;
    const current = mode === "build" ? bench.spellDeck : bench.fixDeck;
    const list = h("div", "ww-decks");
    for (const deck of decksOf(mode)) {
      const best = bench.bests[bestKey(mode, deck.id, deck.grade)];
      const item = button(
        "ww-deck-item",
        () => {
          this.tap("uiSelect");
          this.storeBench(kid, mode === "build" ? { ...this.bench(kid), spellDeck: deck.id } : { ...this.bench(kid), fixDeck: deck.id });
          this.showHome();
        },
        h("span", "ww-deck-title", deck.title),
        h("span", "ww-deck-sample", deckSample(deck)),
        h("span", "ww-deck-best", best === undefined ? "New" : best === ROUND_ITEMS ? "★ 5 of 5" : `Best ${best} of ${ROUND_ITEMS}`),
      );
      if (deck.id === current) item.classList.add("is-current");
      list.append(item);
    }
    this.mount(
      "decks",
      this.topBar(button("ww-btn ww-btn--small", () => (this.tap(), this.showHome()), "‹ Back")),
      h("h2", "ww-title", mode === "build" ? "Pick your words" : "Pick your sentences"),
      h("p", "ww-note", kid.grade === "2" ? GRADE_NAMES["2"] : `${GRADE_NAMES["2"]} for now. More grades are coming.`),
      list,
    );
  }

  private showCloset(): void {
    let kid = this.kidOrEdit();
    if (!kid) return;
    const preview = h("div", "ww-closet-stage");
    const outfits = h("div", "ww-closet-grid");
    const furs = h("div", "ww-closet-grid ww-closet-grid--fur");
    const paint = () => {
      const k = kid!;
      preview.replaceChildren(digitImg(k.outfit, k.fur, "ww-closet-digit"));
      outfits.replaceChildren(
        ...OUTFITS.map((outfit) => {
          const owned = k.outfits.includes(outfit.id);
          const tile = button(
            "ww-item",
            () => {
              if (!owned) return;
              this.tap("uiSelect");
              kid = { ...(this.freshKid(k.id) ?? k), outfit: outfit.id };
              this.storeKid(kid);
              paint();
            },
            digitImg(`item-${outfit.id}`, k.fur, "ww-item-img"),
            h("span", "ww-item-name", outfit.name),
            owned ? null : h("span", "ww-item-lock", outfit.game === "Word Workshop" ? `🔒 ${outfit.earn}` : `🔒 In ${outfit.game}: ${outfit.earn}`),
          );
          tile.setAttribute("aria-pressed", String(k.outfit === outfit.id));
          if (!owned) {
            tile.classList.add("is-locked");
            tile.setAttribute("aria-disabled", "true");
          }
          return tile;
        }),
      );
      furs.replaceChildren(
        ...FURS.map((fur) => {
          const owned = furUnlocked(k, fur);
          const swatch = h("span", "ww-swatch");
          swatch.style.background = fur.swatch;
          const tile = button(
            "ww-item ww-item--fur",
            () => {
              if (!owned) return;
              this.tap("uiSelect");
              kid = { ...(this.freshKid(k.id) ?? k), fur: fur.id };
              this.storeKid(kid);
              warmDigit(kid.fur, [kid.outfit]);
              paint();
            },
            swatch,
            h("span", "ww-item-name", fur.name),
            owned ? null : h("span", "ww-item-lock", `🔒 ${fur.rounds} Fact Frenzy rounds`),
          );
          tile.setAttribute("aria-pressed", String(k.fur === fur.id));
          if (!owned) {
            tile.classList.add("is-locked");
            tile.setAttribute("aria-disabled", "true");
          }
          return tile;
        }),
      );
    };
    paint();
    this.mount(
      "closet",
      this.topBar(button("ww-btn ww-btn--small", () => (this.tap(), this.showHome()), "‹ Done")),
      h("h2", "ww-title", `${kid.name}'s Closet`),
      h("p", "ww-note", "One closet for Digit in every Learn & Play game."),
      preview,
      h("h3", "ww-subtitle", "Outfits"),
      outfits,
      h("h3", "ww-subtitle", "Fur"),
      furs,
    );
  }

  // ----- A round -----

  private startRound(kid: Kid, mode: Mode, deck: Deck, resume: ActiveRound | null): void {
    lastPlay = { kidId: kid.id, mode, deckId: deck.id };
    const bench = this.bench(kid);
    const queued = bench.queue[deck.id] ?? [];
    let ids: string[];
    let results: ItemResult[] = [];
    let id = newId();
    if (resume) {
      ids = resume.items;
      results = [...resume.results];
      id = resume.id;
    } else if (mode === "build") {
      ids = deal((deck as SpellDeck).words, ROUND_ITEMS, queued, this.rng).map((x) => x.id);
    } else {
      ids = deal((deck as FixDeck).items, ROUND_ITEMS, queued, this.rng).map((x) => x.id);
    }
    const words = mode === "build" ? ids.map((x) => (deck as SpellDeck).words.find((w) => w.id === x)).filter((x): x is SpellWord => !!x) : [];
    const sentences = mode === "fix" ? ids.map((x) => (deck as FixDeck).items.find((s) => s.id === x)).filter((x): x is FixItem => !!x) : [];
    if (words.length + sentences.length < ids.length) {
      // A saved round whose items have since been retired: start a fresh one.
      if (resume) {
        this.storeWork({ ...this.work, active: null });
        this.startRound(kid, mode, deck, null);
      }
      return;
    }
    this.round = { id, kidId: kid.id, mode, deck, grade: deck.grade, words, sentences, results };
    this.storeWork({
      ...withBench(this.work, kid.id, { ...bench, mode, ...(mode === "build" ? { spellDeck: deck.id } : { fixDeck: deck.id }) }),
      active: { id, kidId: kid.id, mode, deckId: deck.id, grade: deck.grade, items: ids, results, helped: resume?.helped ?? false },
    });
    this.players = { ...loadSave(), current: kid.id };
    storeSave(this.players);
    this.showItem(resume?.helped ?? false);
  }

  private get roundKid(): Kid {
    const id = this.round!.kidId;
    return this.players.kids.find((k) => k.id === id) ?? currentKid(this.players)!;
  }

  private progress(): HTMLElement {
    const round = this.round!;
    const n = round.results.length;
    const dots = h("div", "ww-dots");
    for (let i = 0; i < ROUND_ITEMS; i += 1) {
      const r = round.results[i];
      dots.append(h("span", `ww-dot${r ? (r.own ? " is-own" : " is-helped") : i === n ? " is-now" : ""}`));
    }
    const label = h("span", "ww-progress-label", `${round.mode === "build" ? "Word" : "Sentence"} ${n + 1} of ${ROUND_ITEMS}`);
    const box = h("div", "ww-progress", label, dots);
    box.setAttribute("aria-label", `${label.textContent}. ${round.results.filter((r) => r.own).length} on your own so far.`);
    return box;
  }

  /** Mark the item on screen as helped in the saved round, so reopening can't wipe it. */
  private noteHelp(): void {
    const active = this.work.active;
    if (active && this.round && active.id === this.round.id && !active.helped) this.storeWork({ ...this.work, active: { ...active, helped: true } });
  }

  private showItem(alreadyHelped: boolean): void {
    const round = this.round!;
    const index = round.results.length;
    const kid = this.roundKid;
    const board = h("div", "ww-board");
    const clueBox = h("div", "ww-clue");
    const digit = h("div", "ww-play-digit", digitImg(kid.outfit, kid.fur, "ww-play-pose"));

    if (round.mode === "build") {
      const word = round.words[index]!;
      const task = new BuildTask(word, trayFor(word, (round.deck as SpellDeck).spares, this.rng));
      if (alreadyHelped) task.hinted = true;
      this.task = task;
      this.mount(
        "play",
        this.topBar(this.progress()),
        clueBox,
        board,
        h("div", "ww-play-foot", digit, h("div", "ww-row", this.voiceButton(), this.soundButton())),
      );
      this.paintClue();
      this.buildBoard(board, task, { lesson: false, onRight: () => this.solvedBuild(task, digit) });
      this.speak(clue(word));
    } else {
      const item = round.sentences[index]!;
      const task = new FixTask(item, choicesFor(item, this.rng));
      if (alreadyHelped) task.hinted = true;
      this.task = task;
      this.mount(
        "play",
        this.topBar(this.progress()),
        clueBox,
        board,
        h("div", "ww-play-foot", digit, h("div", "ww-row", this.voiceButton(), this.soundButton())),
      );
      this.paintClue();
      this.fixBoard(board, task, digit);
      this.speak(sentenceText(item.parts));
    }
    this.paintToggles();
  }

  /**
   * The top of the play screen: Hear it, or, with no voice, a word only a
   * grown-up uncovers to read aloud.
   */
  private paintClue(): void {
    const box = this.root.querySelector<HTMLElement>(".ww-clue");
    const round = this.round;
    const task = this.task;
    if (!box || !round || !task) return;
    if (task instanceof FixTask) {
      const hear = this.voiceOn
        ? button("ww-btn ww-btn--small ww-btn--teal ww-hear", () => this.speak(sentenceText(task.item.parts)), "🔊 Read it to me")
        : null;
      box.replaceChildren(...[h("p", "ww-clue-text", "One part needs fixing. Tap it."), hear].filter((x) => x !== null) as Node[]);
      return;
    }
    const word = task.word;
    if (this.voiceOn) {
      const hear = button("ww-btn ww-btn--teal ww-hear ww-hear--big", () => this.speak(clue(word)), h("span", "", "🔊"), h("span", "", "Hear it"));
      hear.setAttribute("aria-label", "Hear the word again");
      box.replaceChildren(hear, h("p", "ww-clue-text", "Listen, then build the word."));
      return;
    }
    // No voice: a grown-up reads it. The word stays covered until they lift the flap.
    const secret = h("p", "ww-secret", clue(word));
    secret.hidden = true;
    const lift = button("ww-btn ww-btn--small ww-btn--teal", () => {
      secret.hidden = !secret.hidden;
      lift.textContent = secret.hidden ? "Grown-up: show the word" : "Hide it";
      this.tap();
    }, "Grown-up: show the word");
    const parts: Child[] = [h("p", "ww-clue-text", "Ask a grown-up to read the word and the sentence to you."), lift, secret];
    if (!canSpeak()) {
      parts.push(
        button("ww-btn ww-btn--small ww-btn--quiet", () => {
          const kid = this.roundKid;
          this.tap();
          this.storeWork({ ...this.work, active: null });
          this.storeBench(kid, { ...this.bench(kid), mode: "fix" });
          this.showHome();
        }, "No grown-up? Fix a Sentence instead"),
      );
    }
    box.replaceChildren(...parts.filter((x): x is Node => x instanceof Node));
  }

  // ----- Build a Word -----

  private buildCtx: { task: BuildTask; board: HTMLElement; lesson: boolean; onRight: () => void; feedback: HTMLElement } | null = null;

  /** Slots, tray, and the Hint / Check buttons, for a round or for the lesson. */
  private buildBoard(board: HTMLElement, task: BuildTask, opts: { lesson: boolean; onRight: () => void }): void {
    const feedback = h("p", "ww-feedback", "");
    feedback.setAttribute("aria-live", "polite");
    this.buildCtx = { task, board, lesson: opts.lesson, onRight: opts.onRight, feedback };
    if (!opts.lesson) this.task = task;
    board.replaceChildren(h("div", "ww-slots"), h("div", "ww-tray"), feedback, h("div", "ww-actions"));
    this.paintBuild();
  }

  private paintBuild(): void {
    const ctx = this.buildCtx;
    if (!ctx) return;
    const { task, board, lesson } = ctx;
    const together = task.modeled && !task.solved;
    const pointAt = together || (lesson && task.misses > 0) ? task.nextTogether() : null;

    const slots = board.querySelector<HTMLElement>(".ww-slots")!;
    slots.replaceChildren(
      ...task.slots.map((tileId, i) => {
        const letter = tileId ? task.letterOf(tileId) : "";
        const slot = button(`ww-slot${tileId ? " is-filled" : ""}${task.solved ? " is-right" : ""}`, () => this.liftSlot(i), letter);
        if (!tileId && together) slot.append(h("span", "ww-ghost", task.word.word[i]!));
        slot.setAttribute("aria-label", tileId ? `Space ${i + 1}: ${letter}. Tap to take it out.` : `Space ${i + 1}: empty`);
        if (task.solved) slot.disabled = true;
        return slot;
      }),
    );
    slots.style.setProperty("--ww-count", String(task.slots.length));

    const tray = board.querySelector<HTMLElement>(".ww-tray")!;
    tray.replaceChildren(
      ...task.tiles.map((tile) => {
        const used = task.placed(tile.id);
        const b = button(`ww-tile${used ? " is-used" : ""}${pointAt === tile.id ? " is-pointed" : ""}`, () => this.placeTile(tile.id), tile.letter);
        b.setAttribute("aria-label", used ? `${tile.letter}, in the word` : `Letter ${tile.letter}`);
        b.disabled = used || task.solved;
        return b;
      }),
    );

    const actions = board.querySelector<HTMLElement>(".ww-actions")!;
    if (task.solved) {
      actions.replaceChildren();
      return;
    }
    const hint = lesson
      ? null
      : button("ww-btn ww-btn--small ww-btn--hint", () => {
          ctx.feedback.textContent = `Hint: ${task.hint()}`;
          this.noteHelp();
          this.speak(task.word.hint);
          this.tap();
          this.paintBuild();
        }, "💡 Hint");
    if (hint && task.hinted) hint.classList.add("is-used");
    const show =
      !lesson && task.offerModel
        ? button("ww-btn ww-btn--small ww-btn--teal", () => {
            task.model();
            this.noteHelp();
            ctx.feedback.textContent = `Let's build it together: ${task.word.word}. Tap the glowing letters.`;
            this.speak(`Let's build it together. ${task.word.word}. ${spelledOut(task.word.word)}`);
            this.tap("uiSelect");
            this.paintBuild();
          }, "👀 Show me")
        : null;
    const check = button("ww-btn ww-btn--check", () => this.checkBuild(), "Check ✓");
    check.disabled = !task.full;
    actions.replaceChildren(...[hint, show, check].filter((x): x is HTMLButtonElement => !!x));
  }

  private placeTile(tileId: string): void {
    const ctx = this.buildCtx;
    if (!ctx || ctx.task.solved) return;
    const { task } = ctx;
    const together = task.modeled || (ctx.lesson && task.misses > 0);
    if (together && task.nextTogether() !== tileId) {
      ctx.feedback.textContent = "Look for the glowing letter.";
      return;
    }
    if (task.place(tileId) < 0) return;
    this.host.sfx("wordTile");
    this.paintBuild();
    if (together && task.full) this.checkBuild();
    else if (task.full) ctx.board.querySelector<HTMLButtonElement>(".ww-btn--check")?.focus({ preventScroll: true });
  }

  private liftSlot(slot: number): void {
    const ctx = this.buildCtx;
    if (!ctx || ctx.task.solved) return;
    if (ctx.task.lift(slot)) {
      this.tap();
      this.paintBuild();
    }
  }

  private checkBuild(): void {
    const ctx = this.buildCtx;
    if (!ctx) return;
    const { task } = ctx;
    const result = task.check();
    if (result === "not-full") return;
    if (result === "right") {
      this.paintBuild();
      ctx.onRight();
      return;
    }
    this.host.sfx("factMiss");
    ctx.board.querySelector(".ww-slots")?.classList.remove("is-shake");
    void ctx.board.offsetWidth;
    ctx.board.querySelector(".ww-slots")?.classList.add("is-shake");
    if (ctx.lesson) {
      ctx.feedback.textContent = `Not quite. Listen: ${task.word.word}. Tap the glowing letters.`;
      task.clear();
      this.speak(`${task.word.word}. ${spelledOut(task.word.word)}`);
    } else {
      this.noteHelp();
      ctx.feedback.textContent = task.offerModel
        ? "Not quite. Tap Show me and we'll build it together."
        : "Not quite. Change some letters and check again, or tap Hint.";
      this.speak("Not quite. Try again.");
    }
    this.paintBuild();
  }

  private solvedBuild(task: BuildTask, digit: HTMLElement): void {
    const ctx = this.buildCtx!;
    this.host.sfx(task.own ? "factRight" : "wordTile");
    ctx.feedback.textContent = task.own ? `Yes! You built ${task.word.word} on your own!` : `You built ${task.word.word}!`;
    this.speak(`${task.word.word}!`);
    this.cheer(digit);
    this.nextButton(ctx.board.querySelector<HTMLElement>(".ww-actions")!, { id: task.word.id, own: task.own });
  }

  private cheer(digit: HTMLElement): void {
    const kid = this.roundKid;
    const { pose, leap } = reaction(kid.outfit, "jump");
    digit.replaceChildren(digitImg(pose, kid.fur, `ww-play-pose is-cheer${leap ? " is-leap" : ""}`));
  }

  private nextButton(where: HTMLElement, result: ItemResult): void {
    const round = this.round!;
    const last = round.results.length + 1 >= ROUND_ITEMS;
    const next = button("ww-btn ww-btn--go ww-next", () => {
      if (next.disabled) return;
      next.disabled = true;
      this.tap("uiSelect");
      round.results.push(result);
      const active = this.work.active;
      if (active && active.id === round.id) this.storeWork({ ...this.work, active: { ...active, results: [...round.results], helped: false } });
      if (round.results.length >= ROUND_ITEMS) this.finish();
      else this.showItem(false);
    }, last ? "See how I did ▸" : round.mode === "build" ? "Next word ▸" : "Next sentence ▸");
    where.replaceChildren(next);
    next.focus({ preventScroll: true });
  }

  // ----- Fix a Sentence -----

  private fixBoard(board: HTMLElement, task: FixTask, digit: HTMLElement): void {
    const sentence = h("div", "ww-sentence");
    const choices = h("div", "ww-choices");
    const feedback = h("p", "ww-feedback", "");
    feedback.setAttribute("aria-live", "polite");
    const actions = h("div", "ww-actions");
    board.replaceChildren(sentence, choices, feedback, actions);

    const paint = () => {
      const fixed = task.solved ? fixedParts(task.item) : [...task.item.parts];
      sentence.replaceChildren(
        ...fixed.map((part, i) => {
          const end = i === fixed.length - 1;
          const cls = `ww-part${end ? " ww-part--end" : ""}${end && !part ? " is-empty" : ""}${task.solved && i === task.item.at ? " is-fixed" : ""}${
            !task.solved && task.found && i === task.item.at ? " is-found" : ""
          }${!task.solved && !task.found && task.modeled && i === task.item.at ? " is-pointed" : ""}`;
          const b = button(cls, () => tapPart(i, b), part || "");
          b.setAttribute("aria-label", end ? (part ? `Ending mark: ${markName(part)}` : "Ending mark: none. Tap to add one.") : part);
          if (task.solved) b.disabled = true;
          return b;
        }),
      );
      if (task.found && !task.solved) {
        choices.replaceChildren(
          h("span", "ww-choices-ask", "What should it be?"),
          ...task.choices.map((choice) => {
            const c = button(`ww-choice${task.modeled && choice === task.item.fix ? " is-pointed" : ""}`, () => choose(choice, c), choice);
            c.setAttribute("aria-label", choice.length === 1 && /[.?!,]/.test(choice) ? (choice === "," ? "a comma" : markName(choice)) : choice);
            return c;
          }),
        );
      } else {
        choices.replaceChildren();
      }
      if (task.solved) {
        actions.replaceChildren();
        return;
      }
      const hint = button("ww-btn ww-btn--small ww-btn--hint", () => {
        feedback.textContent = `Hint: ${task.hint()}`;
        this.noteHelp();
        this.speak(task.item.look);
        this.tap();
        paint();
      }, "💡 Hint");
      if (task.hinted) hint.classList.add("is-used");
      const show = task.offerModel
        ? button("ww-btn ww-btn--small ww-btn--teal", () => {
            task.model();
            this.noteHelp();
            feedback.textContent = "Here it is. Tap the glowing choice.";
            this.speak("Here it is. Tap the glowing choice.");
            this.tap("uiSelect");
            paint();
          }, "👀 Show me")
        : null;
      actions.replaceChildren(...[hint, show].filter((x): x is HTMLButtonElement => !!x));
    };

    const tapPart = (i: number, b: HTMLButtonElement) => {
      const result = task.tapPart(i);
      if (result === "ignored") return;
      if (result === "found") {
        this.host.sfx("wordTile");
        feedback.textContent = "";
        paint();
        choices.querySelector<HTMLButtonElement>(".ww-choice")?.focus({ preventScroll: true });
        return;
      }
      this.host.sfx("factMiss");
      this.noteHelp();
      b.classList.remove("is-shake");
      void b.offsetWidth;
      b.classList.add("is-shake");
      feedback.textContent = task.offerModel ? "That part is fine. Tap Show me for help." : "That part is fine. Look again.";
      paint();
    };

    const choose = (choice: string, c: HTMLButtonElement) => {
      const result = task.choose(choice);
      if (result === "ignored") return;
      if (result === "wrong") {
        this.host.sfx("factMiss");
        this.noteHelp();
        c.disabled = true;
        c.classList.add("is-wrong");
        feedback.textContent = task.offerModel ? "Not that one. Tap Show me for help." : "Not that one. Try another.";
        if (task.offerModel) paint();
        return;
      }
      this.host.sfx(task.own ? "factRight" : "wordTile");
      paint();
      const fixed = sentenceText(fixedParts(task.item));
      feedback.replaceChildren(h("strong", "ww-fixed-line", fixed), h("span", "ww-why", task.item.why));
      this.speak(`${fixed} ${task.item.why}`);
      this.cheer(digit);
      this.nextButton(actions, { id: task.item.id, own: task.own });
    };

    paint();
  }

  // ----- Results -----

  private finish(): void {
    const round = this.round!;
    const before = this.freshKid(round.kidId) ?? this.roundKid;
    const done = commitRound(this.work, before, {
      id: round.id,
      mode: round.mode,
      deckId: round.deck.id,
      grade: round.grade,
      results: round.results,
    });
    if (!done) {
      this.showHome();
      return;
    }
    this.storeWork(done.save);
    this.storeKid(done.kid);
    this.showResults(done.kid, done.outcome);
  }

  private showResults(startKid: Kid, outcome: WorkOutcome): void {
    const round = this.round!;
    let kid = startKid;
    const record = outcome.kind === "record";
    const headline = h("h2", "ww-headline", "");
    const stars = h("div", "ww-stars");
    const own = round.results.map((r) => r.own);
    // Own answers first, so the count fills from the left.
    const order = [...own].sort((a, b) => Number(b) - Number(a));
    for (const o of order) stars.append(h("span", `ww-star${o ? " is-own" : ""}`, o ? "★" : "✓"));
    stars.setAttribute("aria-label", `${outcome.score} of ${outcome.total} on your own`);
    const count = h("span", "ww-count", "0");
    const scoreLine = h("div", "ww-score", count, h("span", "ww-score-of", ` of ${outcome.total} on your own`));
    const line = h("p", "ww-result-line", "");
    line.setAttribute("aria-live", "polite");
    const digitBox = h("div", "ww-result-digit");
    let celebrating = false;
    const showDigit = () => {
      const { pose, leap } = celebrating ? reaction(kid.outfit, "jump") : { pose: kid.outfit, leap: false };
      digitBox.replaceChildren(digitImg(pose, kid.fur, `ww-result-pose${celebrating ? " is-cheer" : ""}${leap ? " is-leap" : ""}`));
    };
    showDigit();

    const stamp = h(
      "div",
      "ww-card ww-stamp-card",
      h("span", "ww-stamp", "★"),
      h("div", "", h("strong", "", "Workshop stamp!"), h("span", "", ` You have ${outcome.stamps}.`)),
    );
    const prizes = h("div", "ww-prizes");
    for (const prize of outcome.prizes) {
      prizes.append(
        this.prizeCard(prize, () => kid, (next) => {
          kid = next;
          this.storeKid(kid);
          showDigit();
        }),
      );
    }
    const bench = this.bench(kid);
    const goal = nextStampPrize(bench, kid);

    const anotherDeck =
      outcome.score === ROUND_ITEMS
        ? h(
            "div",
            "ww-card ww-perfect",
            h("p", "", "5 of 5! You're ready for a new deck."),
            button("ww-btn ww-btn--teal", () => (this.tap(), this.showDecks()), "Try another deck"),
          )
        : null;

    const pencil = h(
      "div",
      "ww-card ww-pencil-offer",
      h("h3", "ww-subtitle", "✏️ Pencil Bonus"),
      h("p", "", "Digit reads a sentence. You write it on paper."),
      h(
        "div",
        "ww-row",
        button("ww-btn ww-btn--small ww-btn--quiet", () => (this.tap(), this.showHome()), "Skip"),
        button("ww-btn ww-btn--small ww-btn--teal", () => (this.tap("uiSelect"), this.showPencil()), "Write on paper"),
      ),
    );
    const again = button("ww-btn ww-btn--go", () => {
      this.tap("uiSelect");
      const fresh = this.freshKid(kid.id) ?? kid;
      this.startRound(fresh, round.mode, round.deck, null);
    }, h("span", "ww-play-icon", "▶"), h("span", "", "Play again"));

    this.mount(
      "results",
      this.topBar(),
      digitBox,
      headline,
      stars,
      scoreLine,
      line,
      stamp,
      prizes,
      goal ? h("p", "ww-goal", `${goal.toGo} more ${goal.toGo === 1 ? "stamp" : "stamps"} to win the ${goal.outfit.name}`) : null,
      anotherDeck,
      pencil,
      again,
    );
    const page = this.root.firstElementChild as HTMLElement;
    page.classList.add("is-counting");

    const reveal = () => {
      count.textContent = String(outcome.score);
      line.textContent = outcomeLine(outcome, false);
      page.classList.remove("is-counting");
      page.classList.add("is-done");
      this.host.sfx("wordStamp");
      if (record) {
        headline.textContent = "NEW PERSONAL BEST!";
        page.classList.add("is-record");
        celebrating = true;
        showDigit();
        this.later(this.calm ? 0 : 500, () => this.host.sfx("factRecord"));
        this.host.buzz([30, 60, 30, 60, 80]);
      } else {
        headline.textContent =
          outcome.kind === "first" ? "FIRST SCORE!" : outcome.kind === "tie" ? "YOU MATCHED YOUR BEST!" : "ROUND DONE!";
        if (outcome.prizes.length) this.later(this.calm ? 0 : 500, () => this.host.sfx("factPrize"));
      }
      this.speak(`${outcome.score} of ${outcome.total} on your own!`);
    };

    if (this.calm) {
      reveal();
      return;
    }
    const target = outcome.score;
    let shown = 0;
    const next = () => {
      if (shown >= target) {
        this.later(300, reveal);
        return;
      }
      shown += 1;
      count.textContent = String(shown);
      stars.children[shown - 1]?.classList.add("is-lit");
      this.host.sfx("factTick");
      const hold = record && shown === outcome.previous;
      scoreLine.classList.toggle("is-holding", hold);
      this.later(hold ? 750 : 260, next);
    };
    this.later(400, next);
  }

  private prizeCard(outfit: Outfit, getKid: () => Kid, onWear: (kid: Kid) => void): HTMLElement {
    const wear = button("ww-btn ww-btn--gold", () => {
      const kid = getKid();
      this.host.sfx("factPrize");
      onWear({ ...kid, outfit: outfit.id });
      wear.disabled = true;
      wear.textContent = "Wearing it ✓";
    }, "Wear it!");
    return h(
      "div",
      "ww-card ww-prize",
      digitImg(`item-${outfit.id}`, getKid().fur, "ww-prize-img"),
      h("div", "ww-prize-text", h("span", "ww-prize-tag", "NEW OUTFIT!"), h("strong", "ww-prize-name", outfit.name), h("span", "ww-note", "For Digit in every Learn & Play game.")),
      wear,
    );
  }

  // ----- Pencil Bonus -----

  /**
   * One sentence to write on paper, from a word just practiced. Nothing is
   * scored or checked by the game: the child, or a grown-up, compares.
   */
  private showPencil(): void {
    const round = this.round;
    if (!round) {
      this.showHome();
      return;
    }
    let sentence: string;
    let focus: string;
    if (round.mode === "build") {
      const ownIds = new Set(round.results.filter((r) => r.own).map((r) => r.id));
      const pick = round.words.find((w) => ownIds.has(w.id)) ?? round.words[0]!;
      sentence = pick.sentence;
      focus = pick.word;
    } else {
      const pick = round.sentences[0]!;
      sentence = sentenceText(fixedParts(pick));
      focus = pick.fix;
    }
    const mark = sentence.slice(-1);

    const shown = h("div", "ww-card ww-pencil-reveal");
    shown.hidden = true;
    shown.append(
      h("p", "ww-pencil-sentence", sentence),
      h("h3", "ww-subtitle", "Check your paper"),
      h(
        "ul",
        "ww-checks",
        /[.?!,]/.test(focus) ? null : h("li", "", `Did you spell `, h("strong", "", focus), ` like this?`),
        h("li", "", `Did you start with a capital ${sentence[0]}?`),
        h("li", "", `Did you end with ${markName(mark)}?`),
      ),
    );
    const reveal = button("ww-btn ww-btn--teal", () => {
      this.tap("uiSelect");
      shown.hidden = false;
      reveal.hidden = true;
      done.focus({ preventScroll: true });
    }, "Reveal");
    const replay = this.voiceOn ? button("ww-btn ww-btn--small ww-btn--teal", () => this.speak(sentence), "🔊 Replay") : null;
    const helper = this.voiceOn
      ? null
      : h("p", "ww-note", "Ask a grown-up to tap Reveal and read the sentence to you before you look.");
    const done = button("ww-btn ww-btn--go", () => (this.tap("uiSelect"), this.showHome()), "Done");

    this.mount(
      "pencil",
      this.topBar(button("ww-btn ww-btn--small", () => (this.tap(), this.showHome()), "‹ Workshop")),
      h("h2", "ww-title", "✏️ Pencil Bonus"),
      h("p", "ww-note ww-note--big", "Get a pencil and paper. Listen, then write the sentence."),
      helper,
      replay,
      reveal,
      shown,
      done,
    );
    this.speak(sentence);
  }
}

// ----- The cabinet -----

const tileImage = new Image();
tileImage.src = tileArt;

export const wordWorkshopModule: GameModule = {
  id: GAME_ID,
  title: "WORD WORKSHOP",
  shortTitle: "WORD WORKSHOP",
  blurb: "Build words and fix sentences with Digit.",
  accent: "#2fc6c0",
  section: "learn",
  tileImage: tileArt,
  noLeaderboard: true,
  newUntil: "2027-01-05",
  howToPlay: [
    "Build a Word: listen to Digit, then tap letter blocks into place and press Check.",
    "Fix a Sentence: tap the part that's wrong, then choose what it should be.",
    "Getting it right on your own the first time scores a point. Hints and Show me are always there to help.",
    "Every round earns a workshop stamp. Stamps win Digit the Red Cap and the Red Cape.",
    "Players and Digit's closet are shared with Fact Frenzy.",
  ],
  drawIcon(ctx, size) {
    if (tileImage.complete && tileImage.naturalWidth > 0) {
      ctx.drawImage(tileImage, 0, 0, size, size);
      return;
    }
    ctx.fillStyle = "#13244a";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffb43a";
    ctx.font = `bold ${size * 0.42}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ab", size / 2, size / 2);
  },
  create(host, start) {
    return new WordWorkshop(host, start);
  },
};

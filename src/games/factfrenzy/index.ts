/**
 * Fact Frenzy! Two-minute math-fact rounds with Digit the raccoon, from
 * Kindergarten picture sums to Grade 5 fractions.
 *
 * Built for one child opening it again tomorrow: the cabinet opens on the
 * last player, on their usual deck, with Digit in whatever they last won and
 * the score to beat in Digit's bubble -- one tap on PLAY and they're going.
 *
 * The whole cabinet is DOM, like Word Voltage: real buttons and live text for
 * the facts, the clock and the score, so they're big, sharp and read aloud by
 * VoiceOver. The rules live in decks.ts, round.ts and profiles.ts, which have
 * no DOM and are tested on their own.
 */

import "./factfrenzy.css";

import type { GameHost, GameInstance, GameModule, HudState, StartOptions } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Rng } from "../../core/rng";
import { GRADES, GRADE_NAMES, STARTING_DECK, deckById, decksFor, factText, type Deck, type Fact, type Grade, type Num } from "./decks";
import { ART, digitImg, warmDigit, type Pose } from "./digit";
import { hintPicture } from "./hint";
import {
  FURS,
  NAME_MAX,
  OUTFITS,
  cleanName,
  currentKid,
  finishRound,
  furUnlocked,
  loadSave,
  newKid,
  nextFur,
  outcomeLine,
  storeSave,
  withKid,
  type Kid,
  type Outcome,
  type OutfitId,
  type Prize,
  type Save,
} from "./profiles";
import { ROUND_SECONDS, Round, clockText } from "./round";

const GAME_ID = "fact-frenzy";

/** Seconds of GO! before the clock starts. */
const GET_READY = 0.9;

/** What RESTART on the pause menu, and PLAY AGAIN, start. */
let lastPlay: { kidId: string; deckId: string } | null = null;

type Screen = "edit" | "home" | "players" | "decks" | "closet" | "play" | "results";

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

/** A number as the screen writes it; a fraction stacked, top over bottom. */
function numNode(num: Num): HTMLElement {
  if (!num.includes("/")) return h("span", "ff-num", num);
  const [top, bottom] = num.split("/");
  const frac = h("span", "ff-frac", h("span", "ff-frac-top", top), h("span", "ff-frac-bottom", bottom));
  frac.setAttribute("aria-label", `${top} over ${bottom}`);
  return frac;
}

/** A fact read aloud: "14 minus 8 equals what?" */
function spoken(fact: Fact): string {
  const word = { "+": "plus", "−": "minus", "×": "times", "÷": "divided by" }[fact.op];
  const say = (n: Num) => n.replace("/", " over ");
  if (fact.blank === "right") return `${say(fact.left)} ${word} what equals ${say(fact.result)}?`;
  return `${say(fact.left)} ${word} ${say(fact.right)} equals what?`;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ----- The game -----

class FactFrenzy implements GameInstance {
  private readonly host: GameHost;
  private readonly root = h("div", "ff-root");
  private save: Save;
  private screen: Screen = "home";
  private timers: number[] = [];

  // A round in play.
  private round: Round | null = null;
  private roundKid: Kid | null = null;
  private ready = 0;
  private busy = false;
  private ending = false;
  private clockEl: HTMLElement | null = null;
  private scoreEl: HTMLElement | null = null;
  private questionEl: HTMLElement | null = null;
  private answersEl: HTMLElement | null = null;
  private helpEl: HTMLElement | null = null;
  private shownSecond = -1;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.save = loadSave();
    this.applyCalm();
    window.addEventListener("keydown", this.onKey);

    const kid = currentKid(this.save);
    if (kid) warmDigit(kid.fur, [kid.outfit, "think", "jump"]);
    const again = start?.again && lastPlay ? this.save.kids.find((k) => k.id === lastPlay!.kidId) : null;
    const deck = lastPlay ? deckById(lastPlay.deckId) : undefined;
    if (again && deck) this.startRound(again, deck);
    else if (kid) this.showHome();
    else this.showEdit(null);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  update(dt: number, _input: InputSnapshot): void {
    if (this.screen !== "play" || !this.round || this.ending) return;
    if (this.ready > 0) {
      this.ready -= dt;
      if (this.ready <= 0) this.root.querySelector(".ff-go")?.remove();
      return;
    }
    this.round.tick(dt);
    this.paintClock();
    if (this.round.finished) this.timeUp();
  }

  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}

  hud(): HudState {
    return { lives: 0, progress: 0, progressLabel: "", hidden: true };
  }

  /** Only a round is worth pausing; a menu or a results card can sit. */
  pausesWhenHidden(): boolean {
    return this.screen === "play" && !this.ending;
  }

  onResume(): void {
    this.applyCalm();
    this.paintMute();
  }

  destroy(): void {
    this.clearTimers();
    window.removeEventListener("keydown", this.onKey);
  }

  feedbackContext(): string {
    const kid = currentKid(this.save);
    const deck = kid ? deckById(kid.deck) : undefined;
    const where = deck ? `${GRADE_NAMES[deck.grade]} ${deck.skill} ${deck.range}` : "no player yet";
    return `${where}, ${this.screen === "play" ? "playing a round" : `${this.screen} screen`}`;
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
    this.root.classList.toggle("ff-calm", this.calm);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  private mount(screen: Screen, backdrop: "workshop" | "tickets" | "plain", ...children: Child[]): void {
    this.clearTimers();
    this.screen = screen;
    this.root.dataset.backdrop = backdrop;
    this.root.style.setProperty("--ff-backdrop", `url("${backdrop === "tickets" ? ART.tickets : ART.workshop}")`);
    const page = h("div", `ff-page ff-page--${screen}`, ...children);
    this.root.replaceChildren(page);
    this.root.scrollTop = 0;
    this.root.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }

  private store(save: Save): void {
    this.save = save;
    storeSave(save);
  }

  private updateKid(kid: Kid): void {
    this.store(withKid(this.save, kid));
  }

  private tap(sound: "uiMove" | "uiSelect" = "uiMove"): void {
    this.host.sfx(sound);
  }

  /** A row across the top that leaves room for the arcade's pause button. */
  private topBar(...left: Child[]): HTMLElement {
    return h("div", "ff-top", h("div", "ff-top-left", ...left), h("div", "ff-pause-space"));
  }

  private muteButton(): HTMLButtonElement {
    const b = button("ff-icon-btn ff-mute", () => {
      this.host.updateSettings?.({ muted: !this.host.settings.muted });
      this.paintMute();
      if (!this.host.settings.muted) this.tap();
    });
    this.paintMuteOn(b);
    return b;
  }

  private paintMute(): void {
    const b = this.root.querySelector<HTMLButtonElement>(".ff-mute");
    if (b) this.paintMuteOn(b);
  }

  private paintMuteOn(b: HTMLButtonElement): void {
    const muted = this.host.settings.muted;
    b.textContent = muted ? "🔇" : "🔊";
    b.setAttribute("aria-label", muted ? "Sound is off. Turn sound on." : "Sound is on. Turn sound off.");
    b.setAttribute("aria-pressed", String(muted));
  }

  private onKey = (event: KeyboardEvent): void => {
    // Detached while the arcade's pause menu is up: no answering behind it.
    if (this.screen !== "play" || !this.root.isConnected || event.target instanceof HTMLInputElement) return;
    const index = ["1", "2", "3", "4"].indexOf(event.key);
    const choice = this.round?.fact.choices[index];
    if (choice === undefined) return;
    const target = this.answersEl?.querySelectorAll<HTMLButtonElement>(".ff-answer")[index];
    if (target) this.answer(choice, target);
  };

  // ----- A player -----

  private showEdit(existing: Kid | null): void {
    const first = this.save.kids.length === 0;
    let grade: Grade = existing?.grade ?? "2";
    let fur = existing?.fur ?? "purple";

    const input = h("input", "ff-input");
    input.type = "text";
    input.maxLength = NAME_MAX;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.enterKeyHint = "done";
    input.placeholder = "Your name";
    input.value = existing?.name ?? "";
    input.id = "ff-name";
    if (!first) input.dataset.autofocus = "";
    const label = h("label", "ff-label", "Name");
    label.htmlFor = "ff-name";

    const gradeNote = h("p", "ff-note");
    const grades = h("div", "ff-chips");
    const paintGrades = () => {
      for (const chip of grades.children) {
        chip.setAttribute("aria-pressed", String((chip as HTMLElement).dataset.grade === grade));
      }
      gradeNote.textContent = GRADE_NAMES[grade];
    };
    for (const g of GRADES) {
      const chip = button("ff-chip", () => {
        grade = g;
        this.tap();
        paintGrades();
      }, g);
      chip.dataset.grade = g;
      chip.setAttribute("aria-label", GRADE_NAMES[g]);
      grades.append(chip);
    }
    paintGrades();

    // A new player picks Digit's colour here; later the closet has them all.
    const colours = h("div", "ff-colours");
    const paintColours = () => {
      for (const c of colours.children) c.setAttribute("aria-pressed", String((c as HTMLElement).dataset.fur === fur));
    };
    if (!existing) {
      for (const f of FURS.filter((x) => x.rounds === 0)) {
        const c = button(
          "ff-colour",
          () => {
            fur = f.id;
            this.tap();
            paintColours();
          },
          digitImg("overalls", f.id, "ff-colour-digit"),
          h("span", "ff-colour-name", f.name),
        );
        c.dataset.fur = f.id;
        colours.append(c);
      }
      paintColours();
    }

    const go = button("ff-btn ff-btn--play", () => {
      const name = cleanName(input.value);
      if (!name) {
        input.focus();
        input.classList.add("is-empty");
        return;
      }
      this.tap("uiSelect");
      if (existing) {
        const kid: Kid = { ...existing, name, grade, deck: grade === existing.grade ? existing.deck : STARTING_DECK[grade] };
        this.store({ ...withKid(this.save, kid), current: kid.id });
      } else {
        const kid = newKid(newId(), name, grade, fur);
        this.store({ kids: [...this.save.kids, kid], current: kid.id });
        warmDigit(kid.fur, ["think", "jump"]);
      }
      this.showHome();
    }, existing ? "Save" : "Let's go!");
    input.addEventListener("input", () => input.classList.remove("is-empty"));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    const parts: HTMLElement[] = [this.topBar()];
    if (first) {
      const logo = h("img", "ff-logo");
      logo.src = ART.logo;
      logo.alt = "Fact Frenzy!";
      parts.push(logo, h("p", "ff-welcome", "Hi! I'm Digit. Who's playing?"));
    } else {
      parts.push(h("h2", "ff-title", existing ? "Edit player" : "New player"));
    }
    parts.push(
      h("div", "ff-card ff-form", label, input, h("span", "ff-label", "Grade"), grades, gradeNote, existing ? null : h("span", "ff-label", "Digit's color"), existing ? null : colours),
      go,
    );
    if (!first) parts.push(button("ff-btn ff-btn--quiet", () => (this.tap(), existing ? this.showPlayers() : this.showHome()), "Cancel"));
    if (existing) {
      let armed = false;
      const remove = button("ff-btn ff-btn--danger", () => {
        if (!armed) {
          armed = true;
          remove.textContent = `Tap again to remove ${existing.name} and their scores`;
          this.tap();
          return;
        }
        const kids = this.save.kids.filter((k) => k.id !== existing.id);
        this.store({ kids, current: kids[0]?.id ?? null });
        this.tap("uiSelect");
        if (kids.length) this.showPlayers();
        else this.showEdit(null);
      }, `Remove ${existing.name}`);
      parts.push(remove);
    }
    this.mount("edit", "workshop", ...parts);
  }

  private showPlayers(): void {
    const list = h("div", "ff-players");
    for (const kid of this.save.kids) {
      const deck = deckById(kid.deck);
      const pick = button(
        "ff-player",
        () => {
          this.tap("uiSelect");
          this.store({ ...this.save, current: kid.id });
          warmDigit(kid.fur, [kid.outfit, "think", "jump"]);
          this.showHome();
        },
        digitImg(kid.outfit, kid.fur, "ff-player-digit"),
        h("span", "ff-player-name", kid.name),
        h("span", "ff-player-deck", deck ? `${GRADE_NAMES[deck.grade]} · ${deck.skill}` : ""),
      );
      if (kid.id === this.save.current) pick.classList.add("is-current");
      const edit = button("ff-icon-btn ff-player-edit", () => (this.tap(), this.showEdit(kid)), "✎");
      edit.setAttribute("aria-label", `Edit ${kid.name}`);
      list.append(h("div", "ff-player-row", pick, edit));
    }
    this.mount(
      "players",
      "workshop",
      this.topBar(button("ff-btn ff-btn--small", () => (this.tap(), this.showHome()), "‹ Back")),
      h("h2", "ff-title", "Who's playing?"),
      list,
      button("ff-btn", () => (this.tap(), this.showEdit(null)), "+ Add a player"),
    );
  }

  // ----- Home -----

  private showHome(): void {
    const kid = currentKid(this.save);
    if (!kid) {
      this.showEdit(null);
      return;
    }
    const deck = deckById(kid.deck) ?? deckById(STARTING_DECK[kid.grade])!;
    const best = kid.bests[deck.id];
    const bubble =
      best === undefined
        ? kid.rounds === 0
          ? `Hi ${kid.name}! Let's set your first score!`
          : `New facts! Let's set a score, ${kid.name}!`
        : `Can you beat ${best}, ${kid.name}?`;

    const who = button("ff-btn ff-btn--small ff-who", () => (this.tap(), this.showPlayers()), `${kid.name} ▾`);
    who.setAttribute("aria-label", `Playing as ${kid.name}. Change player.`);

    const stage = h(
      "div",
      "ff-stage",
      h("div", "ff-bubble", bubble),
      digitImg(kid.outfit, kid.fur, "ff-stage-digit"),
    );

    const deckButton = button(
      "ff-deck",
      () => (this.tap(), this.showDecks()),
      h("span", "ff-deck-grade", GRADE_NAMES[deck.grade]),
      h("span", "ff-deck-skill", deck.skill),
      h("span", "ff-deck-range", deck.range),
      h("span", "ff-deck-change", "Change ›"),
    );
    deckButton.setAttribute("aria-label", `${GRADE_NAMES[deck.grade]}, ${deck.skill}, ${deck.range}. Change facts.`);

    const bestPill = h(
      "div",
      "ff-best",
      h("span", "ff-best-cup", "🏆"),
      h("span", "", best === undefined ? "No best yet" : "My best"),
      best === undefined ? null : h("strong", "", String(best)),
    );

    const play = button(
      "ff-btn ff-btn--play",
      () => {
        this.tap("uiSelect");
        this.startRound(kid, deck);
      },
      h("span", "ff-play-icon", "▶"),
      h("span", "", "Play 2 minutes"),
    );

    const goal = nextFur(kid);
    const closet = button("ff-btn ff-btn--small", () => (this.tap(), this.showCloset()), "👕 Closet");

    this.mount(
      "home",
      "workshop",
      this.topBar(who),
      this.marquee(),
      stage,
      deckButton,
      bestPill,
      play,
      h("div", "ff-home-row", closet, this.muteButton()),
      goal
        ? h("p", "ff-goal", `${goal.roundsToGo} more ${goal.roundsToGo === 1 ? "round" : "rounds"} to win ${goal.fur.name} fur`)
        : null,
    );
  }

  private marquee(): HTMLElement {
    const lights = h("div", "ff-lights");
    for (let i = 0; i < 14; i += 1) lights.append(h("span", "ff-light"));
    return h(
      "div",
      "ff-marquee",
      lights,
      h("span", "ff-marquee-plaque", "DAD'S ARCADE"),
      h("h1", "ff-marquee-title", h("span", "ff-bolt", "⚡"), "FACT FRENZY!", h("span", "ff-bolt", "⚡")),
    );
  }

  private showDecks(): void {
    const kid = currentKid(this.save)!;
    let grade = deckById(kid.deck)?.grade ?? kid.grade;
    const tabs = h("div", "ff-chips ff-grade-tabs");
    const list = h("div", "ff-decks");
    const fill = () => {
      for (const tab of tabs.children) tab.setAttribute("aria-pressed", String((tab as HTMLElement).dataset.grade === grade));
      list.replaceChildren(
        h("p", "ff-note", GRADE_NAMES[grade]),
        ...decksFor(grade).map((deck) => {
          const best = kid.bests[deck.id];
          const item = button(
            "ff-deck-item",
            () => {
              this.tap("uiSelect");
              this.updateKid({ ...kid, deck: deck.id, grade: deck.grade });
              this.showHome();
            },
            h("span", "ff-deck-skill", deck.skill),
            h("span", "ff-deck-range", deck.range),
            h("span", "ff-deck-best", best === undefined ? "New" : `Best ${best}`),
          );
          if (deck.id === kid.deck) item.classList.add("is-current");
          return item;
        }),
      );
    };
    for (const g of GRADES) {
      const tab = button("ff-chip", () => {
        grade = g;
        this.tap();
        fill();
      }, g);
      tab.dataset.grade = g;
      tab.setAttribute("aria-label", GRADE_NAMES[g]);
      tabs.append(tab);
    }
    fill();
    this.mount(
      "decks",
      "workshop",
      this.topBar(button("ff-btn ff-btn--small", () => (this.tap(), this.showHome()), "‹ Back")),
      h("h2", "ff-title", "Pick your facts"),
      tabs,
      list,
    );
  }

  // ----- The closet -----

  private showCloset(): void {
    let kid = currentKid(this.save)!;
    const preview = h("div", "ff-closet-stage");
    const outfits = h("div", "ff-closet-grid");
    const furs = h("div", "ff-closet-grid ff-closet-grid--fur");

    const paint = () => {
      preview.replaceChildren(digitImg(kid.outfit, kid.fur, "ff-closet-digit"));
      outfits.replaceChildren(
        ...OUTFITS.map((outfit) => {
          const owned = kid.outfits.includes(outfit.id);
          const img = digitImg(`item-${outfit.id}`, kid.fur, "ff-item-img");
          const tile = button(
            "ff-item",
            () => {
              if (!owned) return;
              this.tap("uiSelect");
              kid = { ...kid, outfit: outfit.id };
              this.updateKid(kid);
              paint();
            },
            img,
            h("span", "ff-item-name", outfit.name),
            owned ? null : h("span", "ff-item-lock", `🔒 ${outfit.earn}`),
          );
          tile.setAttribute("aria-pressed", String(kid.outfit === outfit.id));
          if (!owned) {
            tile.classList.add("is-locked");
            tile.setAttribute("aria-disabled", "true");
          }
          return tile;
        }),
      );
      furs.replaceChildren(
        ...FURS.map((fur) => {
          const owned = furUnlocked(kid, fur);
          const swatch = h("span", "ff-swatch");
          swatch.style.background = fur.swatch;
          const tile = button(
            "ff-item ff-item--fur",
            () => {
              if (!owned) return;
              this.tap("uiSelect");
              kid = { ...kid, fur: fur.id };
              this.updateKid(kid);
              warmDigit(fur.id, ["think", "jump"]);
              paint();
            },
            swatch,
            h("span", "ff-item-name", fur.name),
            owned ? null : h("span", "ff-item-lock", `🔒 ${fur.rounds} rounds`),
          );
          tile.setAttribute("aria-pressed", String(kid.fur === fur.id));
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
      "workshop",
      this.topBar(button("ff-btn ff-btn--small", () => (this.tap(), this.showHome()), "‹ Done")),
      h("h2", "ff-title", `${kid.name}'s Closet`),
      preview,
      h("h3", "ff-subtitle", "Outfits"),
      outfits,
      h("h3", "ff-subtitle", "Fur"),
      furs,
      h("p", "ff-note", `Rounds finished: ${kid.rounds}`),
    );
  }

  // ----- A round -----

  private startRound(kid: Kid, deck: Deck): void {
    lastPlay = { kidId: kid.id, deckId: deck.id };
    this.store({ ...this.save, current: kid.id });
    this.roundKid = kid;
    this.round = new Round(deck, new Rng((Math.random() * 2 ** 32) >>> 0));
    this.ready = GET_READY;
    this.busy = false;
    this.ending = false;
    this.shownSecond = -1;

    this.clockEl = h("span", "ff-pill-value", clockText(ROUND_SECONDS));
    this.scoreEl = h("span", "ff-pill-value", "0");
    const clock = h("div", "ff-pill ff-pill--clock", h("span", "ff-pill-icon", "⏱"), this.clockEl);
    clock.setAttribute("role", "timer");
    clock.setAttribute("aria-label", "Time left");
    const score = h("div", "ff-pill ff-pill--score", h("span", "ff-pill-icon", "★"), this.scoreEl);
    score.setAttribute("aria-label", "Score");
    this.questionEl = h("div", "ff-question");
    this.questionEl.setAttribute("aria-live", "polite");
    this.answersEl = h("div", "ff-answers");
    this.helpEl = h("div", "ff-help");

    this.mount(
      "play",
      "plain",
      this.topBar(clock, score),
      h("div", "ff-screen", this.questionEl),
      this.answersEl,
      this.helpEl,
      h("div", "ff-panel", h("span", "ff-stick"), h("span", "ff-bolt-btn", "⚡"), h("span", "ff-knob ff-knob--gold"), h("span", "ff-knob ff-knob--teal"), this.muteButton()),
      h("div", "ff-go", h("span", "", "GO!")),
    );
    this.host.sfx("factGo");
    this.showFact();
  }

  private showFact(): void {
    const round = this.round!;
    const fact = round.fact;
    const q = this.questionEl!;
    q.classList.remove("is-new");
    void q.offsetWidth;
    q.classList.add("is-new");
    q.setAttribute("aria-label", spoken(fact));

    const parts: HTMLElement[] = [];
    if (fact.picture) {
      const pics = (n: number, gone = 0) => {
        const g = h("span", "ff-pics");
        for (let i = 0; i < n; i += 1) g.append(h("span", i >= n - gone ? "ff-pic is-gone" : "ff-pic", fact.picture));
        return g;
      };
      const a = Number(fact.left);
      const b = Number(fact.right);
      parts.push(
        h("div", "ff-pictures", fact.op === "+" ? pics(a) : pics(a, b), fact.op === "+" ? h("span", "ff-pics-op", "+") : null, fact.op === "+" ? pics(b) : null),
      );
    }
    const blank = () => h("span", "ff-blank", "?");
    const line = h(
      "div",
      "ff-equation",
      numNode(fact.left),
      h("span", "ff-op", fact.op),
      fact.blank === "right" ? blank() : numNode(fact.right),
    );
    if (fact.blank === "right") line.append(h("span", "ff-op", "="), numNode(fact.result));
    parts.push(line);
    q.replaceChildren(...parts);
    q.classList.toggle("is-long", fact.left.length + fact.right.length > 5 || fact.blank === "right");

    this.answersEl!.replaceChildren(
      ...fact.choices.map((choice) => {
        const b = button("ff-answer", () => this.answer(choice, b), numNode(choice));
        b.setAttribute("aria-label", choice.replace("/", " over "));
        return b;
      }),
    );
    this.showHelp(null);
  }

  /** The strip under the answers: Digit cheering, or Digit's hint after a miss. */
  private showHelp(fact: Fact | null): void {
    const kid = this.roundKid!;
    const help = this.helpEl!;
    if (!fact) {
      help.classList.remove("is-hint");
      const round = this.round!;
      const cheer =
        round.answered === 0 ? "Tap the right answer!" : round.score >= 10 && round.score % 5 === 0 ? `${round.score} right! Keep going!` : "";
      help.replaceChildren(digitImg(kid.outfit, kid.fur, "ff-help-digit"), cheer ? h("span", "ff-help-cheer", cheer) : "");
      return;
    }
    help.classList.add("is-hint");
    help.replaceChildren(
      digitImg("think", kid.fur, "ff-help-digit ff-help-digit--think"),
      h("div", "ff-hint", h("p", "ff-hint-say", fact.hint.say), hintPicture(fact.hint)),
    );
  }

  private answer(choice: string, target: HTMLButtonElement): void {
    const round = this.round;
    if (!round || this.busy || this.ending || this.ready > 0 || this.screen !== "play") return;
    const missed = round.fact;
    const result = round.tap(choice);
    if (result === "ignored") return;
    if (result === "wrong") {
      this.host.sfx("factMiss");
      target.classList.add("is-wrong");
      target.disabled = true;
      target.setAttribute("aria-label", `${choice}, not this one`);
      this.showHelp(missed);
      return;
    }
    this.host.sfx("factRight");
    target.classList.add("is-right");
    if (result === "right") {
      this.scoreEl!.textContent = String(round.score);
      const pill = this.scoreEl!.parentElement!;
      pill.classList.remove("is-pop");
      void pill.offsetWidth;
      pill.classList.add("is-pop");
    }
    this.busy = true;
    this.later(result === "right" ? 220 : 420, () => {
      this.busy = false;
      if (this.screen === "play" && !this.ending) this.showFact();
    });
  }

  private paintClock(): void {
    const round = this.round!;
    const second = Math.ceil(round.timeLeft);
    if (second === this.shownSecond) return;
    this.shownSecond = second;
    this.clockEl!.textContent = clockText(round.timeLeft);
    this.clockEl!.parentElement!.classList.toggle("is-low", round.timeLeft <= 10);
  }

  private timeUp(): void {
    this.ending = true;
    this.busy = true;
    this.host.sfx("factTimeUp");
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".ff-answer")) b.disabled = true;
    this.root.append(h("div", "ff-timeup", h("span", "", "TIME'S UP!")));
    this.later(this.calm ? 700 : 1300, () => this.finish());
  }

  // ----- Results -----

  private finish(): void {
    const round = this.round!;
    const before = this.save.kids.find((k) => k.id === this.roundKid!.id) ?? this.roundKid!;
    const { kid, outcome } = finishRound(before, round.deck.id, round.score);
    this.store({ ...withKid(this.save, kid), current: kid.id });
    this.showResults(kid, round, outcome);
    this.round = null;
  }

  private showResults(startKid: Kid, round: Round, outcome: Outcome): void {
    let kid = startKid;
    const record = outcome.kind === "record";
    const headline = h("h2", "ff-headline", "");
    const count = h("span", "ff-ticket-number", "0");
    const ticket = h("div", "ff-ticket", h("span", "ff-ticket-star", "★"), count, h("span", "ff-ticket-word", "correct"), h("span", "ff-ticket-star", "★"));
    const line = h("p", "ff-result-line", "");
    const previous =
      outcome.previous !== null ? h("div", "ff-best ff-best--small", h("span", "", record ? "Previous best" : "Your best"), h("strong", "", String(outcome.previous))) : null;
    const digitBox = h("div", "ff-result-digit");
    const showDigit = (pose: Pose) => digitBox.replaceChildren(digitImg(pose, kid.fur, `ff-result-pose ff-result-pose--${pose}`));
    showDigit(kid.outfit);

    const prizes = h("div", "ff-prizes");
    for (const prize of outcome.prizes) prizes.append(this.prizeCard(prize, () => kid, (next) => {
      kid = next;
      this.updateKid(kid);
      showDigit(kid.outfit);
    }));

    const practice = round.missed.length
      ? h(
          "div",
          "ff-card ff-practice",
          h("h3", "ff-subtitle", "Practice these"),
          h("div", "ff-practice-list", ...round.missed.slice(0, 6).map((f) => h("span", "ff-practice-fact", factText(f)))),
        )
      : null;
    const goal = nextFur(kid);
    const deck = round.deck;
    const again = button("ff-btn ff-btn--play", () => {
      this.tap("uiSelect");
      this.startRound(currentKid(this.save) ?? kid, deck);
    }, h("span", "ff-play-icon", "▶"), h("span", "", "Play again"));
    const home = button("ff-btn", () => (this.tap(), this.showHome()), "Home");

    const lights = h("div", "ff-sweep");
    this.mount(
      "results",
      "workshop",
      this.topBar(),
      lights,
      digitBox,
      headline,
      ticket,
      line,
      previous,
      prizes,
      practice,
      goal ? h("p", "ff-goal", `${goal.roundsToGo} more ${goal.roundsToGo === 1 ? "round" : "rounds"} to win ${goal.fur.name} fur`) : "",
      h("div", "ff-result-buttons", again, home),
    );
    const page = this.root.firstElementChild as HTMLElement;
    page.classList.add("is-counting");

    const reveal = () => {
      count.textContent = String(outcome.score);
      line.textContent = outcomeLine(outcome, kid.name);
      page.classList.remove("is-counting");
      page.classList.add("is-done");
      if (record) {
        headline.textContent = "NEW PERSONAL BEST!";
        this.root.dataset.backdrop = "tickets";
        this.root.style.setProperty("--ff-backdrop", `url("${ART.tickets}")`);
        page.classList.add("is-record");
        showDigit("jump");
        this.host.sfx("factRecord");
        this.host.buzz([30, 60, 30, 60, 80]);
      } else {
        headline.textContent =
          outcome.kind === "first" ? "FIRST SCORE!" : outcome.kind === "tie" ? "TIED YOUR BEST!" : "GREAT ROUND!";
        this.host.sfx(outcome.prizes.length ? "factPrize" : "uiSelect");
      }
    };

    if (this.calm) {
      reveal();
      return;
    }
    // Count up; on a record, wait a beat on the old best before going past it.
    const target = outcome.score;
    const step = Math.max(35, Math.min(90, 1400 / Math.max(1, target)));
    let shown = 0;
    const next = () => {
      if (shown >= target) {
        this.later(250, reveal);
        return;
      }
      shown += 1;
      count.textContent = String(shown);
      this.host.sfx("factTick");
      const pause = record && shown === outcome.previous ? 700 : step;
      if (record && shown === outcome.previous) ticket.classList.add("is-holding");
      if (record && shown === (outcome.previous ?? 0) + 1) ticket.classList.remove("is-holding");
      this.later(pause, next);
    };
    this.later(400, next);
  }

  private prizeCard(prize: Prize, getKid: () => Kid, onWear: (kid: Kid) => void): HTMLElement {
    const art =
      prize.kind === "outfit"
        ? digitImg(`item-${prize.outfit.id}`, getKid().fur, "ff-prize-img")
        : digitImg("overalls", prize.fur.id, "ff-prize-img ff-prize-img--fur");
    const name = prize.kind === "outfit" ? prize.outfit.name : `${prize.fur.name} fur`;
    const wear = button("ff-btn ff-btn--gold", () => {
      const kid = getKid();
      const next: Kid = prize.kind === "outfit" ? { ...kid, outfit: prize.outfit.id as OutfitId } : { ...kid, fur: prize.fur.id };
      this.host.sfx("factPrize");
      onWear(next);
      wear.disabled = true;
      wear.textContent = "Wearing it ✓";
    }, "Wear it!");
    return h("div", "ff-card ff-prize", art, h("div", "ff-prize-text", h("span", "ff-prize-tag", "NEW PRIZE!"), h("strong", "ff-prize-name", name)), wear);
  }
}

// ----- The cabinet -----

const tileImage = new Image();
tileImage.src = ART.tile;

export const factFrenzyModule: GameModule = {
  id: GAME_ID,
  title: "FACT FRENZY!",
  shortTitle: "FACT FRENZY",
  blurb: "Two-minute math facts with Digit. Beat your best!",
  accent: "#b56bff",
  section: "learn",
  tileImage: ART.tile,
  noLeaderboard: true,
  newUntil: "2026-12-15",
  howToPlay: [
    "Tap Play 2 minutes and answer as many facts as you can.",
    "A right answer on your first tap scores a point.",
    "Miss one and Digit shows you a picture to count. Find the answer and carry on.",
    "Beat your best score to win prizes for Digit, like the Star Jacket.",
    "Each player keeps their own scores and closet. Tap your name to switch.",
  ],
  drawIcon(ctx, size) {
    if (tileImage.complete && tileImage.naturalWidth > 0) {
      ctx.drawImage(tileImage, 0, 0, size, size);
      return;
    }
    ctx.fillStyle = "#2a0f5c";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffcf3a";
    ctx.font = `bold ${size * 0.42}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+−", size / 2, size / 2);
  },
  create(host, start) {
    return new FactFrenzy(host, start);
  },
};

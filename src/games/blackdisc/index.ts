/**
 * BLACK DISC -- pass it, guess it, don't get caught holding it.
 *
 * A phone-passing word game for the whole family: one team describes words
 * from a category to their own teammates while the timer runs, tapping GOT IT
 * to pass the disc onward with every correct guess. Whoever is holding it
 * when the buzzer goes loses a point to the other team. First to seven wins.
 *
 * This is the one cabinet in the arcade with no playfield to simulate -- it's
 * entirely a DOM overlay (see GameInstance.extraControls), because the whole
 * game is a phone changing hands around a table. The canvas underneath never
 * gets seen, so render() has nothing to draw and hud() reports nothing the
 * shell would show.
 *
 * No leaderboard: it's Team 1 vs Team 2, not individual players, and there's
 * nothing to rank a "best" run by that a personal high score would mean
 * anything against.
 *
 * The one thing borrowed from the real electronic disc: you're never shown
 * exactly how much time is left. A loading bar stands in for the numeric
 * countdown, and the tick starts slow and quiet-ish and audibly speeds up and
 * gets louder as the buzzer gets close -- close enough to guess, never close
 * enough to count down from.
 */

import type { SoundName } from "../../core/audio.ts";
import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { drawDiscIcon } from "./render.ts";
import { CATEGORIES, type DiscCategory } from "./words.ts";

/** First team to this many points wins the match. */
const TARGET_SCORE = 7;

const DURATIONS = [45, 60, 90] as const;
const DEFAULT_DURATION = 60;

const TEAM_NAMES: readonly [string, string] = ["Team 1", "Team 2"];

/** Tick cadence at the very start of a round, in milliseconds. */
const TICK_START_MS = 820;
/** Tick cadence right before the buzzer, in milliseconds. */
const TICK_END_MS = 140;
/** >1 keeps most of the round relaxed, then accelerates hard near the end. */
const TICK_CURVE = 1.7;

/** The bar (and its caption) switch to "urgent" inside the last this-much. */
const URGENT_FRACTION = 0.16;

/**
 * Seconds knocked off the clock for every SKIP after the first free one.
 *
 * The first skip in a round is free -- a hard word shouldn't cost you the
 * round -- but unlimited free skips would let a team just cycle past
 * everything until an easy one turns up. Charging the clock instead of
 * capping the count keeps the only rule the game already has ("the clock is
 * the whole tension") rather than adding a second resource to track.
 */
const SKIP_PENALTY_SECONDS = 4;

/** How long a flashed caption (e.g. the skip-cost warning) stays up. */
const CAPTION_FLASH_SECONDS = 1.4;

/**
 * Which flavour of tick to play, by how far through the round we are. Five
 * discrete sounds standing in for a continuous ramp -- the shared audio
 * engine plays named one-shots, not parameterised tones, so cadence does the
 * smooth part and these five steps do the "louder and higher" part.
 */
const TICK_STAGES: ReadonlyArray<{ at: number; sound: SoundName }> = [
  { at: 0, sound: "discTick1" },
  { at: 0.35, sound: "discTick2" },
  { at: 0.6, sound: "discTick3" },
  { at: 0.8, sound: "discTick4" },
  { at: 0.92, sound: "discTick5" },
];

interface TeamRefs {
  card: HTMLElement;
  scoreValue: HTMLElement;
  minus: HTMLButtonElement;
  plus: HTMLButtonElement;
}

type Phase = "setup" | "play" | "result";

export class BlackDisc implements GameInstance {
  private readonly root = document.createElement("div");
  private readonly setupSection: HTMLElement;
  private readonly playSection: HTMLElement;
  private readonly resultSection: HTMLElement;
  private readonly rulesDetails: HTMLDetailsElement;
  private readonly celebrationEl: HTMLElement;

  private teamRefs!: [TeamRefs, TeamRefs];
  private readonly categoryButtons: HTMLButtonElement[] = [];
  private durationSelect!: HTMLSelectElement;
  private starterSelect!: HTMLSelectElement;
  private startButton!: HTMLButtonElement;

  private roundLabelEl!: HTMLElement;
  private turnLabelEl!: HTMLElement;
  private meterWrapEl!: HTMLElement;
  private meterFillEl!: HTMLElement;
  private meterCaptionEl!: HTMLElement;
  private phraseEl!: HTMLElement;
  private categoryTagEl!: HTMLElement;
  private gotItButton!: HTMLButtonElement;
  private ruleBreakButton!: HTMLButtonElement;
  private skipButton!: HTMLButtonElement;
  private cancelButton!: HTMLButtonElement;

  private resultLabelEl!: HTMLElement;
  private resultTitleEl!: HTMLElement;
  private resultTextEl!: HTMLElement;
  private nextButton!: HTMLButtonElement;
  private settingsLinkButton!: HTMLButtonElement;
  private newGameButton!: HTMLButtonElement;

  private phase: Phase = "setup";
  private category = CATEGORIES[0]!.id;
  private durationSeconds: number = DEFAULT_DURATION;

  private scores: [number, number] = [0, 0];
  private team: 0 | 1 = 0;
  private round = 1;

  private total = DEFAULT_DURATION;
  private remaining = DEFAULT_DURATION;
  private tickTimer = 0;
  private time = 0;

  /** Skips used this round. The first is free; the rest cost time. */
  private skipsUsed = 0;
  /** Counts down while a flashed caption (e.g. the skip warning) is showing. */
  private captionFlashTimer = 0;

  /** Shuffled draw piles, refilled and reshuffled once a category runs dry. */
  private readonly bag: Record<string, string[]> = {};

  constructor(private readonly host: GameHost) {
    this.root.className = "disc-root";

    this.root.append(this.buildScores());

    const stage = document.createElement("div");
    stage.className = "disc-stage";
    this.setupSection = this.buildSetup();
    this.playSection = this.buildPlay();
    this.resultSection = this.buildResult();
    this.playSection.hidden = true;
    this.resultSection.hidden = true;
    stage.append(this.setupSection, this.playSection, this.resultSection);
    this.root.append(stage);

    this.rulesDetails = this.buildRules();
    this.root.append(this.rulesDetails);

    this.celebrationEl = document.createElement("div");
    this.celebrationEl.className = "disc-celebration";
    this.celebrationEl.setAttribute("aria-hidden", "true");
    this.root.append(this.celebrationEl);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- Loop -----

  update(dt: number, _input: InputSnapshot): void {
    this.time += dt;
    if (this.phase !== "play") return;

    if (this.captionFlashTimer > 0) {
      this.captionFlashTimer = Math.max(0, this.captionFlashTimer - dt);
    }

    this.remaining = Math.max(0, this.remaining - dt);
    this.updateMeter();

    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      if (this.remaining > 0) this.playTick();
      const frac = this.total > 0 ? 1 - this.remaining / this.total : 1;
      const eased = Math.pow(Math.min(1, Math.max(0, frac)), TICK_CURVE);
      this.tickTimer = (TICK_START_MS + (TICK_END_MS - TICK_START_MS) * eased) / 1000;
    }

    if (this.remaining <= 0) this.finish("buzz");
  }

  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {
    // Nothing to draw -- the DOM panel covers the whole screen while this
    // game is running.
  }

  hud(): HudState {
    return { lives: 0, progress: this.round, progressLabel: "Round" };
  }

  // ----- Round flow -----

  private beginRound(): void {
    this.total = this.durationSeconds;
    this.remaining = this.total;
    this.tickTimer = TICK_START_MS / 1000;
    this.skipsUsed = 0;
    this.captionFlashTimer = 0;
    this.skipButton.textContent = "SKIP";
    this.pickPhrase();
    this.updateTurnLabel();
    this.roundLabelEl.textContent = `ROUND ${this.round}`;
    this.updateMeter();
    this.setControlsEnabled(false);
    this.showSection("play");
    this.host.sfx("discRoundStart");
  }

  private finish(kind: "buzz" | "rule"): void {
    if (this.phase !== "play") return;
    const loser = this.team;
    const winner = other(this.team);
    this.scores[winner] = Math.min(TARGET_SCORE, this.scores[winner] + 1);
    this.round += 1;
    this.renderScores();
    this.setControlsEnabled(true);
    this.host.sfx(kind === "rule" ? "discRuleBreak" : "discBuzz");

    if (this.scores[winner] >= TARGET_SCORE) {
      this.celebrate(winner);
      return;
    }

    this.resultLabelEl.textContent = kind === "rule" ? "RULE BREAK!" : "BUZZ!";
    this.resultTitleEl.textContent = `${this.teamName(winner)} +1`;
    this.resultTextEl.textContent =
      kind === "rule"
        ? `${this.teamName(loser)} broke a rule. ${this.teamName(winner)} gets the point.`
        : `${this.teamName(loser)} was holding the disc when it buzzed.`;
    this.nextButton.hidden = false;
    this.newGameButton.textContent = "NEW GAME";
    this.showSection("result");
  }

  private celebrate(winner: 0 | 1): void {
    this.resultLabelEl.textContent = "FIRST TO SEVEN · CHAMPIONS";
    this.resultTitleEl.textContent = `${this.teamName(winner)} wins!`;
    this.resultTextEl.textContent =
      `Final score: ${this.teamName(0)} ${this.scores[0]} — ${this.scores[1]} ${this.teamName(1)}. ` +
      "Time for a victory dance!";
    this.nextButton.hidden = true;
    this.newGameButton.textContent = "PLAY AGAIN";
    this.showSection("result");
    this.spawnConfetti();
    this.host.sfx("discWin");
    navigator.vibrate?.([100, 60, 100, 60, 350]);
  }

  private cancelRound(): void {
    if (this.phase !== "play") return;
    if (!window.confirm("End this round without awarding a point?")) return;
    this.setControlsEnabled(true);
    this.starterSelect.value = String(this.team);
    this.showSection("setup");
    this.host.sfx("uiMove");
  }

  private newGame(): void {
    this.clearCelebration();
    this.scores = [0, 0];
    this.round = 1;
    this.team = 0;
    this.renderScores();
    this.nextButton.hidden = false;
    this.newGameButton.textContent = "NEW GAME";
    this.setControlsEnabled(true);
    this.starterSelect.value = "0";
    this.showSection("setup");
    this.host.sfx("uiSelect");
  }

  private adjustScore(index: 0 | 1, delta: number): void {
    if (this.phase === "play") return;
    this.scores[index] = Math.max(0, Math.min(TARGET_SCORE, this.scores[index] + delta));
    this.renderScores();
    this.host.sfx("uiMove");
    if (this.scores[index] >= TARGET_SCORE) this.celebrate(index);
  }

  // ----- Phrase draw -----

  private pickPhrase(): void {
    const cat = findCategory(this.category);
    let pile = this.bag[cat.id];
    if (!pile || pile.length === 0) {
      pile = shuffled(cat.words);
      this.bag[cat.id] = pile;
    }
    const word = pile.pop();
    if (word === undefined) return;
    this.phraseEl.textContent = word;
    this.categoryTagEl.textContent = cat.label;
  }

  // ----- Timer audio/visuals -----

  private playTick(): void {
    const frac = this.total > 0 ? 1 - this.remaining / this.total : 0;
    let sound: SoundName = "discTick1";
    for (const stage of TICK_STAGES) {
      if (frac >= stage.at) sound = stage.sound;
    }
    this.host.sfx(sound);
  }

  private updateMeter(): void {
    const frac = this.total > 0 ? this.remaining / this.total : 0;
    this.meterFillEl.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
    const urgent = frac <= URGENT_FRACTION;
    this.meterWrapEl.classList.toggle("is-urgent", urgent);
    // A flashed message (e.g. "that skip cost you time") stands until its own
    // timer runs out, rather than being overwritten the very next frame.
    if (this.captionFlashTimer > 0) return;
    this.meterCaptionEl.classList.remove("is-flash");
    this.meterCaptionEl.textContent = urgent
      ? "FEELS CLOSE — BETTER HURRY"
      : "PASS IT ON — NO PEEKING AT THE CLOCK";
  }

  /** Briefly replace the meter caption, e.g. to call out a skip's cost. */
  private flashCaption(text: string): void {
    this.meterCaptionEl.textContent = text;
    this.meterCaptionEl.classList.add("is-flash");
    this.captionFlashTimer = CAPTION_FLASH_SECONDS;
  }

  // ----- Small helpers -----

  private teamName(index: 0 | 1): string {
    return TEAM_NAMES[index];
  }

  private updateTurnLabel(): void {
    this.turnLabelEl.textContent = `${this.teamName(this.team)} has the disc`;
    this.turnLabelEl.classList.toggle("is-team-a", this.team === 0);
    this.turnLabelEl.classList.toggle("is-team-b", this.team === 1);
  }

  private renderScores(): void {
    this.teamRefs[0].scoreValue.textContent = String(this.scores[0]);
    this.teamRefs[1].scoreValue.textContent = String(this.scores[1]);
  }

  private setControlsEnabled(enabled: boolean): void {
    for (const refs of this.teamRefs) {
      refs.minus.disabled = !enabled;
      refs.plus.disabled = !enabled;
    }
  }

  private showSection(name: Phase): void {
    this.setupSection.hidden = name !== "setup";
    this.playSection.hidden = name !== "play";
    this.resultSection.hidden = name !== "result";
    this.rulesDetails.open = false;
    this.phase = name;
  }

  private spawnConfetti(): void {
    this.celebrationEl.replaceChildren();
    if (this.host.settings.reducedMotion) return;
    const colors = ["#dbff73", "#46e0ff", "#ff5fae", "#ffffff"];
    for (let i = 0; i < 48; i += 1) {
      const bit = document.createElement("i");
      bit.style.setProperty("--x", `${Math.random() * 100}%`);
      bit.style.setProperty("--delay", `${Math.random() * 1.5}s`);
      bit.style.setProperty("--spin", `${Math.random() * 1000 - 500}deg`);
      bit.style.background = colors[i % colors.length]!;
      this.celebrationEl.append(bit);
    }
  }

  private clearCelebration(): void {
    this.celebrationEl.replaceChildren();
  }

  // ----- DOM construction -----

  private buildScores(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "disc-scores";
    wrap.setAttribute("aria-label", "Team scores");
    const a = this.buildTeamCard(0);
    const b = this.buildTeamCard(1);
    this.teamRefs = [a, b];
    wrap.append(a.card, b.card);
    return wrap;
  }

  private buildTeamCard(index: 0 | 1): TeamRefs {
    const card = document.createElement("div");
    card.className = `disc-team disc-team--${index === 0 ? "a" : "b"}`;

    const name = document.createElement("div");
    name.className = "disc-team-name";
    name.textContent = this.teamName(index);

    const row = document.createElement("div");
    row.className = "disc-team-row";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "disc-team-btn";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Subtract point from team ${index + 1}`);
    minus.addEventListener("click", () => this.adjustScore(index, -1));

    const scoreValue = document.createElement("strong");
    scoreValue.className = "disc-team-score";
    scoreValue.textContent = "0";

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "disc-team-btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Add point to team ${index + 1}`);
    plus.addEventListener("click", () => this.adjustScore(index, 1));

    row.append(minus, scoreValue, plus);
    card.append(name, row);

    return { card, scoreValue, minus, plus };
  }

  private buildSetup(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "disc-panel disc-setup";

    const title = document.createElement("h1");
    title.className = "disc-title";
    title.append("Pass it. Guess it. ");
    const em = document.createElement("em");
    em.textContent = "Don’t get buzzed.";
    title.append(em);

    const tagline = document.createElement("p");
    tagline.className = "disc-tagline";
    tagline.textContent =
      "One phone, two teams, and a disc that never tells you when it'll buzz.";

    const categoriesWrap = document.createElement("div");
    categoriesWrap.className = "disc-categories";
    for (const cat of CATEGORIES) {
      const button = this.buildCategoryButton(cat);
      this.categoryButtons.push(button);
      categoriesWrap.append(button);
    }

    const settingsWrap = document.createElement("div");
    settingsWrap.className = "disc-settings";

    const durationField = document.createElement("label");
    durationField.className = "disc-field";
    const durationLabel = document.createElement("span");
    durationLabel.className = "disc-field-label";
    durationLabel.textContent = "Buzzer length";
    this.durationSelect = document.createElement("select");
    this.durationSelect.className = "disc-select";
    for (const seconds of DURATIONS) {
      const option = document.createElement("option");
      option.value = String(seconds);
      option.textContent = `${seconds} seconds`;
      option.selected = seconds === this.durationSeconds;
      this.durationSelect.append(option);
    }
    this.durationSelect.addEventListener("change", () => {
      this.durationSeconds = Number(this.durationSelect.value);
    });
    durationField.append(durationLabel, this.durationSelect);

    const starterField = document.createElement("label");
    starterField.className = "disc-field";
    const starterLabel = document.createElement("span");
    starterLabel.className = "disc-field-label";
    starterLabel.textContent = "Starts with";
    this.starterSelect = document.createElement("select");
    this.starterSelect.className = "disc-select";
    for (const index of [0, 1] as const) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = this.teamName(index);
      this.starterSelect.append(option);
    }
    starterField.append(starterLabel, this.starterSelect);

    settingsWrap.append(durationField, starterField);

    this.startButton = document.createElement("button");
    this.startButton.type = "button";
    this.startButton.className = "disc-btn disc-btn--primary";
    this.startButton.textContent = "START GAME";
    this.startButton.addEventListener("click", () => {
      this.team = Number(this.starterSelect.value) as 0 | 1;
      this.beginRound();
    });

    const hint = document.createElement("p");
    hint.className = "disc-hint";
    hint.textContent = "One phone. Two teams. Don't get caught holding it.";

    panel.append(title, tagline, categoriesWrap, settingsWrap, this.startButton, hint);
    return panel;
  }

  private buildCategoryButton(cat: DiscCategory): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "disc-category" + (cat.id === this.category ? " is-selected" : "");
    button.dataset.cat = cat.id;
    button.setAttribute("aria-pressed", String(cat.id === this.category));

    const emoji = document.createElement("span");
    emoji.className = "disc-cat-emoji";
    emoji.textContent = cat.emoji;
    emoji.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "disc-cat-copy";
    const label = document.createElement("b");
    label.className = "disc-cat-label";
    label.textContent = cat.label;
    const hint = document.createElement("small");
    hint.className = "disc-cat-hint";
    hint.textContent = cat.hint;
    copy.append(label, hint);

    const check = document.createElement("span");
    check.className = "disc-cat-check";
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");

    button.append(emoji, copy, check);
    button.addEventListener("click", () => {
      this.category = cat.id;
      for (const btn of this.categoryButtons) {
        const selected = btn.dataset.cat === cat.id;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      }
      this.host.sfx("uiMove");
    });

    return button;
  }

  private buildPlay(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "disc-panel disc-play";

    this.roundLabelEl = document.createElement("span");
    this.roundLabelEl.className = "disc-round-tag";
    this.roundLabelEl.textContent = "ROUND 1";

    this.turnLabelEl = document.createElement("p");
    this.turnLabelEl.className = "disc-turn";

    this.meterWrapEl = document.createElement("div");
    this.meterWrapEl.className = "disc-meter";
    this.meterFillEl = document.createElement("div");
    this.meterFillEl.className = "disc-meter-fill";
    this.meterWrapEl.append(this.meterFillEl);

    this.meterCaptionEl = document.createElement("p");
    this.meterCaptionEl.className = "disc-meter-caption";
    this.meterCaptionEl.textContent = "PASS IT ON — NO PEEKING AT THE CLOCK";

    const card = document.createElement("div");
    card.className = "disc-card";
    this.phraseEl = document.createElement("h1");
    this.phraseEl.className = "disc-phrase";
    this.categoryTagEl = document.createElement("span");
    this.categoryTagEl.className = "disc-phrase-tag";
    card.append(this.phraseEl, this.categoryTagEl);

    this.gotItButton = document.createElement("button");
    this.gotItButton.type = "button";
    this.gotItButton.className = "disc-btn disc-btn--primary";
    this.gotItButton.textContent = "GOT IT! · Pass it on";
    this.gotItButton.addEventListener("click", () => {
      if (this.phase !== "play") return;
      this.team = other(this.team);
      this.pickPhrase();
      this.updateTurnLabel();
      this.host.sfx("discPass");
    });

    this.ruleBreakButton = document.createElement("button");
    this.ruleBreakButton.type = "button";
    this.ruleBreakButton.className = "disc-btn disc-btn--danger";
    this.ruleBreakButton.textContent = "RULE BREAK · end round";
    this.ruleBreakButton.addEventListener("click", () => this.finish("rule"));

    const row = document.createElement("div");
    row.className = "disc-row";

    this.skipButton = document.createElement("button");
    this.skipButton.type = "button";
    this.skipButton.className = "disc-btn disc-btn--ghost";
    this.skipButton.textContent = "SKIP";
    this.skipButton.addEventListener("click", () => {
      if (this.phase !== "play") return;
      this.skipsUsed += 1;

      if (this.skipsUsed === 1) {
        // The first skip in a round is free -- a hard word shouldn't cost
        // you the round.
        this.host.sfx("uiMove");
        this.skipButton.textContent = `SKIP (−${SKIP_PENALTY_SECONDS}s)`;
      } else {
        this.remaining = Math.max(0, this.remaining - SKIP_PENALTY_SECONDS);
        this.updateMeter();
        this.host.sfx("discSkipCost");
        if (this.remaining <= 0) {
          this.finish("buzz");
          return;
        }
        this.flashCaption("THAT SKIP COST YOU TIME");
      }

      this.pickPhrase();
    });

    this.cancelButton = document.createElement("button");
    this.cancelButton.type = "button";
    this.cancelButton.className = "disc-btn disc-btn--ghost";
    this.cancelButton.textContent = "CANCEL ROUND";
    this.cancelButton.addEventListener("click", () => this.cancelRound());

    row.append(this.skipButton, this.cancelButton);

    const hint = document.createElement("p");
    hint.className = "disc-play-hint";
    hint.textContent = "Clue-giver only — keep this screen hidden from your team.";

    panel.append(
      this.roundLabelEl,
      this.turnLabelEl,
      this.meterWrapEl,
      this.meterCaptionEl,
      card,
      this.gotItButton,
      this.ruleBreakButton,
      row,
      hint,
    );
    return panel;
  }

  private buildResult(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "disc-panel disc-result";

    this.resultLabelEl = document.createElement("p");
    this.resultLabelEl.className = "disc-eyebrow";

    this.resultTitleEl = document.createElement("h1");
    this.resultTitleEl.className = "disc-result-title";

    this.resultTextEl = document.createElement("p");
    this.resultTextEl.className = "disc-result-text";

    this.nextButton = document.createElement("button");
    this.nextButton.type = "button";
    this.nextButton.className = "disc-btn disc-btn--primary";
    this.nextButton.textContent = "NEXT ROUND";
    this.nextButton.addEventListener("click", () => this.beginRound());

    this.settingsLinkButton = document.createElement("button");
    this.settingsLinkButton.type = "button";
    this.settingsLinkButton.className = "disc-btn disc-btn--ghost";
    this.settingsLinkButton.textContent = "CHANGE SETTINGS";
    this.settingsLinkButton.addEventListener("click", () => {
      this.setControlsEnabled(true);
      this.starterSelect.value = String(this.team);
      this.showSection("setup");
      this.host.sfx("uiMove");
    });

    this.newGameButton = document.createElement("button");
    this.newGameButton.type = "button";
    this.newGameButton.className = "disc-btn disc-btn--ghost";
    this.newGameButton.textContent = "NEW GAME";
    this.newGameButton.addEventListener("click", () => this.newGame());

    panel.append(
      this.resultLabelEl,
      this.resultTitleEl,
      this.resultTextEl,
      this.nextButton,
      this.settingsLinkButton,
      this.newGameButton,
    );
    return panel;
  }

  private buildRules(): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "disc-rules";

    const summary = document.createElement("summary");
    summary.textContent = "How to play";
    const plus = document.createElement("span");
    plus.textContent = "+";
    plus.setAttribute("aria-hidden", "true");
    summary.append(plus);
    details.append(summary);

    const ol = document.createElement("ol");
    const steps = [
      "Split into two teams and sit in alternating order.",
      "Describe the word or phrase to your team — no saying part of it, spelling it, or “rhymes with” clues.",
      "They guess it, you tap GOT IT and pass immediately. The disc keeps going.",
      "Holding it when it buzzes? The other team gets a point. First to seven wins.",
    ];
    for (const step of steps) {
      const li = document.createElement("li");
      li.textContent = step;
      ol.append(li);
    }
    details.append(ol);

    const note = document.createElement("p");
    note.textContent =
      "Said the word, or broke another rule? Tap RULE BREAK to end the round on the spot. " +
      `SKIP keeps the disc with your team -- the first one's free, then each one after ` +
      `costs ${SKIP_PENALTY_SECONDS} seconds off the clock. There's no on-screen timer on ` +
      "purpose — just listen for the tick and watch the bar.";
    details.append(note);

    return details;
  }
}

function other(team: 0 | 1): 0 | 1 {
  return team === 0 ? 1 : 0;
}

function findCategory(id: string): DiscCategory {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown Black Disc category: ${id}`);
  return found;
}

function shuffled(items: readonly string[]): string[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = arr[i]!;
    const b = arr[j]!;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

export const blackDiscModule: GameModule = {
  id: "black-disc",
  title: "BLACK DISC",
  shortTitle: "BLACK DISC",
  progressShort: "RD",
  blurb: "Pass it, guess it, don't get caught holding it at the buzz.",
  accent: "#dbff73",

  drawIcon(ctx, size) {
    drawDiscIcon(ctx, size);
  },

  create(host: GameHost): GameInstance {
    return new BlackDisc(host);
  },
};

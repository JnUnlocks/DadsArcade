/**
 * One level on screen: the board, the wheel, and the controls under a thumb.
 *
 * All of the rules live in play.ts and wheel.ts; this turns pointer, tap and
 * key presses into calls on them and draws what they say. The board is
 * redrawn only when something on it changes. A swipe touches nothing but the
 * trail and the word pill, and the trail is drawn once a frame at most.
 */

import type { GameHost } from "../../core/game";
import { ICONS, boltSvg } from "./art";
import { parseCellKey, type CellKey } from "./board";
import {
  charge,
  hintTarget,
  knownCells,
  makeLevel,
  submitWord,
  useHint,
  type Attempt,
  type Level,
} from "./play";
import type { Cosmetic } from "./rewards";
import { BONUS_BLOCK } from "./rewards";
import type { InputMode } from "./save";
import type { Puzzle } from "./types";
import {
  enterToken,
  hitRadius,
  pathWord,
  shuffleOrder,
  tapToken,
  tokenAt,
  tokenForLetter,
  tokensAlong,
  type Path,
  type Point,
} from "./wheel";

export interface CoachStep {
  readonly id: string;
  /** Shown once this holds and the step hasn't been dismissed. */
  readonly when: (attempt: Attempt) => boolean;
  readonly text: (mode: InputMode) => string;
}

export interface LevelHooks {
  save(attempt: Attempt, order: number[]): void;
  /** Credit a bonus word; true when it filled a block of five for the first time. */
  bonus(word: string): { charged: boolean; credited: number };
  /** The level is finished. Record it, and hand back the card to show. */
  complete(attempt: Attempt): HTMLElement;
  setInputMode(mode: InputMode): void;
  menu(): void;
  back(): void;
  /** Once ever: say that hints are free. Returns true the first time. */
  firstHint(): boolean;
  /** Tutorial only. */
  dismissCoach?(id: string): void;
  skipTutorial?(): void;
}

export interface LevelOptions {
  host: GameHost;
  puzzle: Puzzle;
  heading: string;
  subheading: string;
  colors: readonly [string, string];
  attempt: Attempt;
  order: number[];
  inputMode: InputMode;
  cosmetic: Cosmetic;
  calm: boolean;
  /** Bonus words already credited on this puzzle, from every attempt. */
  credited: readonly string[];
  coach?: { steps: readonly CoachStep[]; dismissed: readonly string[] };
  hooks: LevelHooks;
}

interface Gesture {
  pointerId: number;
  rect: DOMRect;
  scale: number;
  last: Point;
  /** Where the finger is now, for the loose end of the trail. */
  at: Point;
}

const SAY_SECONDS = 1.6;

export class LevelView {
  readonly el = div("wv-play");

  private readonly host: GameHost;
  private readonly level: Level;
  private readonly hooks: LevelHooks;
  private readonly letters: string;
  private attempt: Attempt;
  private order: number[];
  private inputMode: InputMode;
  private calm: boolean;
  private credited: string[];

  private path: Path = [];
  private gesture: Gesture | null = null;
  /** Token index to its centre, in the wheel's own pixels. */
  private centers: Point[] = [];
  private hit = 20;
  private focus: number | null = null;
  private busy = false;
  private finished = false;
  private trailFrame = 0;
  private lastTick = 0;
  private sayTimer = 0;
  private winTimer = 0;
  private liveTimer = 0;
  private coachDismissed: Set<string>;
  private readonly coachSteps: readonly CoachStep[];

  // The parts of the screen that change.
  private readonly boardWrap = div("wv-boardwrap");
  private readonly board = div("wv-board");
  private readonly cellEls = new Map<CellKey, HTMLElement>();
  private readonly chargeText = div("wv-charge-text");
  private readonly chargeFill = div("wv-meter-fill");
  private readonly chargeBar = div("wv-meter");
  private readonly slotList = document.createElement("ul");
  private readonly slotButtons: HTMLButtonElement[] = [];
  private readonly pill = div("wv-pill");
  private readonly sayEl = div("wv-say");
  private readonly live = div("wv-live");
  private readonly wheel = div("wv-wheel");
  private readonly trail = svg("svg");
  private readonly trailLine = svg("polyline");
  private readonly tokenEls: HTMLButtonElement[] = [];
  private readonly shuffleBtn: HTMLButtonElement;
  private readonly hintBtn: HTMLButtonElement;
  private readonly bonusBtn: HTMLButtonElement;
  private readonly bonusPips = div("wv-pips");
  private readonly modeBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly deck = div("wv-deck");
  private readonly coachEl = div("wv-coach");
  private overlay: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;

  constructor(options: LevelOptions) {
    this.host = options.host;
    this.hooks = options.hooks;
    this.level = makeLevel(options.puzzle);
    this.letters = options.puzzle.letters;
    this.attempt = options.attempt;
    this.order = options.order;
    this.inputMode = options.inputMode;
    this.calm = options.calm;
    this.credited = [...options.credited];
    this.coachSteps = options.coach?.steps ?? [];
    this.coachDismissed = new Set(options.coach?.dismissed ?? []);
    this.finished = this.attempt.completed;

    this.el.style.setProperty("--wv-a", options.colors[0]);
    this.el.style.setProperty("--wv-b", options.colors[1]);
    this.applyCosmetic(options.cosmetic);

    // ----- Header -----
    const top = div("wv-top");
    const back = iconButton("wv-iconbtn", ICONS.back, "Back to Word Voltage");
    back.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.hooks.back();
    });
    const titles = div("wv-titles");
    titles.append(text("wv-h", options.heading), text("wv-sub", options.subheading));
    const gear = iconButton("wv-iconbtn", ICONS.gear, "Settings and menu");
    gear.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.cancelGesture();
      this.hooks.menu();
    });
    top.append(back, titles, gear, div("wv-pause-space"));

    // ----- Charge -----
    const chargeRow = div("wv-charge");
    this.chargeBar.setAttribute("role", "progressbar");
    this.chargeBar.setAttribute("aria-label", "Charge");
    this.chargeBar.setAttribute("aria-valuemin", "0");
    this.chargeBar.setAttribute("aria-valuemax", String(options.puzzle.words.length));
    this.chargeBar.append(this.chargeFill);
    chargeRow.append(this.chargeText, this.chargeBar);

    // ----- Board -----
    this.board.setAttribute("aria-hidden", "true");
    for (const cell of this.level.board.cells.values()) {
      const el = div("wv-cell");
      el.append(text("wv-cell-letter", ""));
      el.addEventListener("click", () => this.focusAt(cell.key));
      this.cellEls.set(cell.key, el);
      this.board.append(el);
    }
    this.boardWrap.append(this.board);
    this.slotList.className = "wv-sr wv-slots";
    this.slotList.setAttribute("aria-label", "The board's words");
    options.puzzle.words.forEach((_, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "wv-sr-focus";
      // Focusing a word's description makes it the hint's focus, and shows
      // where it is on the board.
      button.addEventListener("focus", () => {
        this.focus = index;
        this.paintBoard();
      });
      item.append(button);
      this.slotButtons.push(button);
      this.slotList.append(item);
    });

    // ----- Word pill, with tap mode's undo and send either side -----
    const wordRow = div("wv-wordrow");
    this.undoBtn = iconButton("wv-roundbtn wv-undo", ICONS.undo, "Remove last letter");
    this.undoBtn.addEventListener("click", () => this.popLetter());
    this.sendBtn = iconButton("wv-roundbtn wv-send", ICONS.send, "Check word");
    this.sendBtn.addEventListener("click", () => this.submit());
    this.pill.setAttribute("aria-hidden", "true");
    wordRow.append(this.undoBtn, this.pill, this.sendBtn, this.sayEl);
    this.sayEl.setAttribute("aria-hidden", "true");

    // ----- The deck: tools either side of the wheel -----
    this.shuffleBtn = toolButton(ICONS.shuffle, "SHUFFLE", "Shuffle the letters");
    this.shuffleBtn.addEventListener("click", () => this.shuffle());
    this.bonusBtn = toolButton(boltSvg("wv-tool-icon"), "BONUS", "Bonus words");
    this.bonusBtn.classList.add("wv-bonusbtn");
    this.bonusBtn.append(this.bonusPips);
    this.bonusBtn.addEventListener("click", () => this.openBonusList());
    this.hintBtn = toolButton(ICONS.hint, "HINT", "Hint: show one letter. Hints are free.");
    this.hintBtn.addEventListener("click", () => this.hint());
    this.modeBtn = toolButton("", "", "");
    this.modeBtn.addEventListener("click", () => this.toggleMode());

    const left = div("wv-side");
    left.append(this.shuffleBtn, this.bonusBtn);
    const right = div("wv-side");
    right.append(this.hintBtn, this.modeBtn);

    this.trail.setAttribute("class", "wv-trail");
    this.trail.setAttribute("aria-hidden", "true");
    this.trailLine.setAttribute("class", "wv-trail-line");
    this.trail.append(this.trailLine);
    this.wheel.append(this.trail, div("wv-wheel-ring"));
    this.wheel.setAttribute("role", "group");
    this.wheel.setAttribute("aria-label", "Letter wheel");
    for (let token = 0; token < this.letters.length; token += 1) {
      const el = document.createElement("button");
      el.className = "wv-token";
      el.textContent = this.letters[token]!;
      el.setAttribute("aria-label", `Letter ${this.letters[token]}`);
      el.addEventListener("click", (event) => {
        // Swipe handles pointers; a click with no pointer behind it is the
        // keyboard (Enter or Space on a focused letter), which taps.
        if (this.inputMode === "tap" || event.detail === 0) this.tap(token);
      });
      this.tokenEls.push(el);
      this.wheel.append(el);
    }
    this.wheel.addEventListener("pointerdown", this.onPointerDown);
    this.wheel.addEventListener("pointermove", this.onPointerMove);
    this.wheel.addEventListener("pointerup", this.onPointerUp);
    this.wheel.addEventListener("pointercancel", this.onPointerCancel);
    this.wheel.addEventListener("lostpointercapture", this.onPointerCancel);

    const wheelBox = div("wv-wheelbox");
    wheelBox.append(this.wheel);
    this.deck.append(left, wheelBox, right);

    this.live.className = "wv-sr";
    this.live.setAttribute("aria-live", "polite");

    this.el.append(top, chargeRow, this.boardWrap, this.slotList, this.coachEl, wordRow, this.deck, this.live);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.layout());
      this.observer.observe(this.boardWrap);
      this.observer.observe(this.deck);
    }
    window.addEventListener("resize", this.onResize);

    this.paintBoard();
    this.paintMode();
    this.paintBonus();
    this.paintCoach();
    this.paintPath();
    requestAnimationFrame(() => this.layout());
  }

  /** Called once the view is in the document. */
  mounted(): void {
    this.layout();
  }

  destroy(): void {
    this.cancelGesture();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.observer?.disconnect();
    cancelAnimationFrame(this.trailFrame);
    window.clearTimeout(this.sayTimer);
    window.clearTimeout(this.winTimer);
    window.clearTimeout(this.liveTimer);
  }

  setCalm(calm: boolean): void {
    this.calm = calm;
    this.el.classList.toggle("wv-calm", calm);
  }

  setInputMode(mode: InputMode): void {
    this.inputMode = mode;
    this.clearPath();
    this.paintMode();
    this.paintCoach();
  }

  applyCosmetic(style: Cosmetic): void {
    this.el.style.setProperty("--wv-tile", style.tile);
    this.el.style.setProperty("--wv-rim", style.rim);
    this.el.style.setProperty("--wv-trail", style.trail);
  }

  /** Stop any swipe in progress without sending it. */
  cancelGesture(): void {
    if (this.gesture) {
      const id = this.gesture.pointerId;
      this.gesture = null;
      try {
        if (this.wheel.hasPointerCapture(id)) this.wheel.releasePointerCapture(id);
      } catch {
        // Already released.
      }
      this.clearPath();
    }
    this.shuffleBtn.disabled = this.finished;
  }

  /** Lay a card (the result) over the level. */
  showCard(card: HTMLElement): void {
    this.overlay?.remove();
    this.overlay = card;
    this.el.append(card);
    card.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }

  // ----- Layout -----

  private onResize = (): void => {
    this.cancelGesture();
    this.layout();
  };

  /** Size the board to its box and seat the tokens round the wheel. */
  private layout(): void {
    const { rows, cols } = this.level.board;
    const width = this.boardWrap.clientWidth;
    const height = this.boardWrap.clientHeight;
    if (width > 0 && height > 0) {
      const cell = Math.floor(Math.min(width / cols, height / rows, 58));
      this.board.style.width = `${cell * cols}px`;
      this.board.style.height = `${cell * rows}px`;
      this.board.style.setProperty("--wv-cell", `${cell}px`);
      for (const [key, el] of this.cellEls) {
        const [row, col] = parseCellKey(key);
        el.style.transform = `translate(${col * cell}px, ${row * cell}px)`;
      }
    }

    // The wheel is the biggest circle the deck has room for between its tools.
    const deckWidth = this.deck.clientWidth;
    const deckHeight = this.deck.clientHeight;
    if (deckWidth <= 0 || deckHeight <= 0) return;
    const sides = [...this.deck.querySelectorAll<HTMLElement>(".wv-side")].reduce(
      (sum, side) => sum + side.offsetWidth,
      0,
    );
    const size = Math.max(150, Math.floor(Math.min(deckWidth - sides - 16, deckHeight, 340)));
    // The wheel changing size under a finger would move every token away
    // from where the swipe thinks it is: drop the swipe instead.
    if (this.gesture && size !== this.wheel.offsetWidth) this.cancelGesture();
    this.wheel.style.width = `${size}px`;
    this.wheel.style.height = `${size}px`;
    this.trail.setAttribute("viewBox", `0 0 ${size} ${size}`);

    const n = this.letters.length;
    const sin = Math.sin(Math.PI / n);
    const outer = size / 2 - 4;
    // As large as the circle allows, with a clear gap between neighbours.
    const token = Math.floor(Math.max(40, Math.min(62, size * 0.3, (2 * outer * sin - 8) / (1 + sin))));
    const radius = outer - token / 2;
    this.wheel.style.setProperty("--wv-token", `${token}px`);
    this.wheel.style.setProperty("--wv-ring", `${radius * 2}px`);
    this.hit = hitRadius(n, radius, token / 2);
    const seats: Point[] = [];
    for (let i = 0; i < n; i += 1) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      seats.push({ x: size / 2 + radius * Math.cos(angle), y: size / 2 + radius * Math.sin(angle) });
    }
    // order[seat] is the token in that seat; centers is per token, so the
    // trail, the hit test and the button all read the same place.
    this.centers = new Array<Point>(n);
    this.order.forEach((tokenIndex, seat) => {
      this.centers[tokenIndex] = seats[seat]!;
    });
    this.tokenEls.forEach((el, tokenIndex) => {
      const at = this.centers[tokenIndex]!;
      el.style.transform = `translate(${at.x - token / 2}px, ${at.y - token / 2}px)`;
    });
    this.drawTrail();
    // Tiles glide to new seats on a shuffle, but not into their first ones:
    // the wheel should simply be there when the level opens.
    if (!this.wheel.classList.contains("wv-wheel--live")) {
      requestAnimationFrame(() => this.wheel.classList.add("wv-wheel--live"));
    }
  }

  // ----- Swipe -----

  private onPointerDown = (event: PointerEvent): void => {
    if (this.inputMode !== "swipe" || this.busy || this.finished || this.overlay) return;
    // A second finger while the first is still down is ignored entirely.
    if (this.gesture) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rect = this.wheel.getBoundingClientRect();
    const scale = rect.width / (this.wheel.offsetWidth || rect.width || 1);
    const point = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    const token = tokenAt(point, this.centers, this.hit);
    if (token === null) return;
    event.preventDefault();
    this.gesture = { pointerId: event.pointerId, rect, scale, last: point, at: point };
    try {
      this.wheel.setPointerCapture(event.pointerId);
    } catch {
      // Capture isn't available; the pointerup still arrives on the wheel.
    }
    this.shuffleBtn.disabled = true;
    this.path = [];
    this.addToken(token);
    this.paintPath();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    // Every point the browser saw since the last event, not only the latest.
    const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    const points = (events.length > 0 ? events : [event]).map((e) => ({
      x: (e.clientX - gesture.rect.left) / gesture.scale,
      y: (e.clientY - gesture.rect.top) / gesture.scale,
    }));
    const before = this.path;
    for (const point of points) {
      for (const token of tokensAlong(gesture.last, point, this.centers, this.hit)) this.addToken(token);
      gesture.last = point;
    }
    gesture.at = gesture.last;
    if (this.path !== before) this.paintPath();
    this.queueTrail();
  };

  private onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    // Cleared first, so the lostpointercapture that follows finds nothing to
    // cancel and the word is sent exactly once.
    this.gesture = null;
    try {
      if (this.wheel.hasPointerCapture(event.pointerId)) this.wheel.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    this.shuffleBtn.disabled = this.finished;
    if (this.path.length === 1) this.nudgeSwipe();
    this.submit();
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.gesture && event.pointerId === this.gesture.pointerId) this.cancelGesture();
  };

  private onBlur = (): void => {
    this.cancelGesture();
  };

  private onVisibility = (): void => {
    if (document.hidden) this.cancelGesture();
  };

  /** One token joined (or left) the path. */
  private addToken(token: number): void {
    const next = enterToken(this.path, token);
    if (next === this.path) return;
    const grew = next.length > this.path.length;
    this.path = next;
    if (grew) this.tick();
  }

  /** A climbing note per letter, rate-limited for fast swipes. */
  private tick(): void {
    const now = performance.now();
    if (now - this.lastTick < 45) return;
    this.lastTick = now;
    const step = Math.min(7, Math.max(1, this.path.length)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    this.host.sfx(`voltTick${step}`);
  }

  private queueTrail(): void {
    if (this.trailFrame) return;
    this.trailFrame = requestAnimationFrame(() => {
      this.trailFrame = 0;
      this.drawTrail();
    });
  }

  private drawTrail(): void {
    const points = this.path.map((token) => this.centers[token]).filter((p): p is Point => !!p);
    if (this.gesture && points.length > 0) points.push(this.gesture.at);
    this.trailLine.setAttribute("points", points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
  }

  // ----- Tap and keys -----

  private tap(token: number): void {
    if (this.busy || this.finished || this.overlay || this.gesture) return;
    const next = tapToken(this.path, token);
    if (next === this.path) return;
    const grew = next.length > this.path.length;
    this.path = next;
    if (grew) this.tick();
    else this.host.sfx("lockBack");
    this.paintPath();
  }

  private popLetter(): void {
    if (this.path.length === 0 || this.gesture) return;
    this.path = this.path.slice(0, -1);
    this.host.sfx("lockBack");
    this.paintPath();
  }

  private clearPath(): void {
    this.path = [];
    this.paintPath();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.el.isConnected) return;
    if (event.key === "Escape" && this.overlay && !this.finished) {
      event.preventDefault();
      this.closeOverlay();
      return;
    }
    if (this.overlay || this.busy || this.finished) return;
    // The cabinet's menu is open over the level: keys belong to it.
    if (this.el.parentElement?.querySelector(":scope > .wv-sheet")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTextEntry(event.target) || this.gesture) return;
    const { key } = event;
    if (/^[a-zA-Z]$/.test(key)) {
      const token = tokenForLetter(key, this.letters, this.order, this.path);
      if (token === null) return;
      event.preventDefault();
      this.path = [...this.path, token];
      this.tick();
      this.paintPath();
    } else if (key === "Backspace") {
      if (this.path.length === 0) return;
      event.preventDefault();
      this.popLetter();
    } else if (key === "Enter") {
      // With nothing typed, Enter belongs to whatever button has focus.
      if (this.path.length === 0) return;
      event.preventDefault();
      this.submit();
    } else if (key === "Escape") {
      if (this.path.length === 0) return;
      event.preventDefault();
      this.clearPath();
    }
  };

  private toggleMode(): void {
    const mode: InputMode = this.inputMode === "swipe" ? "tap" : "swipe";
    this.host.sfx("uiMove");
    this.hooks.setInputMode(mode);
    this.setInputMode(mode);
    this.say(mode === "tap" ? "Tap mode: tap letters, then ✓" : "Swipe mode: drag across letters");
  }

  /** A lone tap in swipe mode: say how swiping works, once in a while. */
  private nudgeSwipe(): void {
    this.say("Drag across the letters, then let go");
  }

  // ----- Sending a word -----

  private submit(): void {
    if (this.busy || this.finished) return;
    const word = pathWord(this.path, this.letters);
    this.clearPath();
    const result = submitWord(this.level, this.attempt, word);
    const outcome = result.outcome;
    switch (outcome.kind) {
      case "solved": {
        this.attempt = result.attempt;
        this.focus = null;
        this.host.sfx("voltWord");
        this.host.buzz(12);
        this.flashPill("good", word);
        const extra = outcome.words.length - 1;
        this.say(extra > 0 ? `Powered! +${extra} more` : "Powered!", `${outcome.words.join(", ")} solved`);
        this.afterBoardChange(outcome.words);
        break;
      }
      case "already":
        this.host.sfx("voltAgain");
        this.flashPill("again", word);
        this.say("Already powered!");
        this.flashWord(word);
        break;
      case "bonus": {
        this.attempt = result.attempt;
        const credit = this.hooks.bonus(outcome.word);
        if (!this.credited.includes(outcome.word)) this.credited.push(outcome.word);
        this.host.sfx(credit.charged ? "voltCharge" : "voltBonus");
        this.flashPill("bonus", word);
        this.say(credit.charged ? "Bonus Charge! +1 bolt" : "Bonus word!", `${word} is a bonus word`);
        this.paintBonus(credit.charged);
        this.save();
        break;
      }
      case "bonus-again":
        this.host.sfx("voltAgain");
        this.flashPill("again", word);
        this.say("Already found!");
        break;
      case "unknown":
        if (word.length >= 3) {
          this.flashPill("nope", word);
          this.say("Try another word");
        }
        break;
      case "short":
      case "finished":
        break;
    }
  }

  private hint(): void {
    if (this.busy || this.finished || this.gesture) return;
    const result = useHint(this.level, this.attempt, this.focus);
    if (result.cell === null) return;
    this.attempt = result.attempt;
    this.host.sfx("voltHint");
    const explain = this.hooks.firstHint();
    this.say(
      explain ? "Hints are free. Using them affects this run's stars." : "Letter revealed",
      "Letter revealed",
      explain ? 3.6 : SAY_SECONDS,
    );
    this.popCells([result.cell], "wv-cell--reveal");
    if (result.words.length > 0) {
      this.host.sfx("voltWord");
      this.afterBoardChange(result.words);
    } else {
      this.paintBoard();
      this.save();
    }
  }

  private shuffle(): void {
    if (this.gesture || this.busy || this.finished) return;
    this.order = shuffleOrder(this.order, Math.random);
    this.host.sfx("voltShuffle");
    this.clearPath();
    this.layout();
    this.save();
  }

  /** Words just finished: light them, save, and see if that was the last. */
  private afterBoardChange(words: readonly string[]): void {
    const cells = words.flatMap((word) => {
      const index = this.level.targetIndex.get(word);
      return index === undefined ? [] : [...this.level.board.slotCells[index]!];
    });
    this.paintBoard();
    this.popCells(cells, "wv-cell--pop");
    this.save();
    this.paintCoach();
    if (this.attempt.completed) this.win();
  }

  private win(): void {
    this.finished = true;
    this.busy = true;
    this.cancelGesture();
    this.shuffleBtn.disabled = true;
    this.paintTools();
    this.host.sfx("voltWin");
    this.host.buzz([20, 40, 30]);
    this.el.classList.add("wv-won");
    // Recorded now, not when the card appears: closing the app in the middle
    // of the fanfare mustn't lose the finish, the unlock or the bolt.
    const card = this.hooks.complete(this.attempt);
    const show = () => {
      if (!this.busy) return;
      this.busy = false;
      this.el.removeEventListener("pointerdown", skip);
      this.showCard(card);
    };
    // A tap anywhere skips the celebration straight to the card.
    const skip = () => {
      window.clearTimeout(this.winTimer);
      show();
    };
    this.el.addEventListener("pointerdown", skip, { once: true });
    this.winTimer = window.setTimeout(show, this.calm ? 350 : 1000);
  }

  private save(): void {
    this.hooks.save(this.attempt, this.order);
  }

  // ----- The board -----

  /** Tap a square: make its word the focus, for the next hint. */
  private focusAt(key: CellKey): void {
    if (this.finished) return;
    const slots = this.level.board.cells.get(key)?.slots ?? [];
    if (slots.length === 0) return;
    const current = this.focus !== null ? slots.indexOf(this.focus) : -1;
    this.focus = slots[(current + 1) % slots.length]!;
    this.host.sfx("uiMove");
    this.paintBoard();
  }

  private paintBoard(): void {
    const known = knownCells(this.level, this.attempt);
    const solvedCells = new Set<CellKey>();
    for (const word of this.attempt.solved) {
      const index = this.level.targetIndex.get(word);
      if (index !== undefined) for (const key of this.level.board.slotCells[index]!) solvedCells.add(key);
    }
    const focusCells = new Set(this.focus !== null ? this.level.board.slotCells[this.focus] : []);
    for (const [key, el] of this.cellEls) {
      const cell = this.level.board.cells.get(key)!;
      const solved = solvedCells.has(key);
      const shown = known.has(key);
      el.classList.toggle("wv-cell--solved", solved);
      el.classList.toggle("wv-cell--revealed", shown && !solved);
      el.classList.toggle("wv-cell--focus", focusCells.has(key) && !this.finished);
      el.firstElementChild!.textContent = shown ? cell.letter : "";
    }

    const solved = this.attempt.solved.length;
    const total = this.level.puzzle.words.length;
    this.chargeText.innerHTML = `${boltSvg("wv-charge-bolt")}<span>${solved} of ${total} words</span>`;
    this.chargeFill.style.width = `${Math.round(charge(this.level, this.attempt) * 100)}%`;
    this.chargeBar.setAttribute("aria-valuenow", String(solved));
    this.chargeBar.setAttribute("aria-valuetext", `${solved} of ${total} words`);
    this.paintSlots(known);
    this.paintTools();
  }

  /** "Across, 4 letters: S, blank, blank, R" for each word, for a screen reader. */
  private paintSlots(known: ReadonlySet<CellKey>): void {
    this.level.puzzle.words.forEach((placement, index) => {
      const cells = this.level.board.slotCells[index]!;
      const done = this.attempt.solved.includes(placement.word);
      const letters = cells
        .map((key) => (known.has(key) ? this.level.board.cells.get(key)!.letter : "blank"))
        .join(", ");
      const way = placement.dir === "across" ? "Across" : "Down";
      this.slotButtons[index]!.textContent = `${way}, ${placement.word.length} letters: ${
        done ? `${placement.word}, solved` : letters
      }`;
    });
  }

  private paintTools(): void {
    const canHint = !this.finished && hintTarget(this.level, this.attempt, this.focus) !== null;
    this.hintBtn.disabled = !canHint;
    if (!this.gesture) this.shuffleBtn.disabled = this.finished;
  }

  private popCells(keys: readonly CellKey[], className: string): void {
    keys.forEach((key, i) => {
      const el = this.cellEls.get(key);
      if (!el) return;
      el.classList.remove(className);
      void el.offsetWidth;
      el.style.setProperty("--wv-delay", `${this.calm ? 0 : i * 40}ms`);
      el.classList.add(className);
      el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
    });
  }

  private flashWord(word: string): void {
    const index = this.level.targetIndex.get(word);
    if (index === undefined) return;
    this.popCells(this.level.board.slotCells[index]!, "wv-cell--nudge");
  }

  // ----- The pill, messages, the bonus meter -----

  private paintPath(): void {
    const word = pathWord(this.path, this.letters);
    this.pill.classList.remove("wv-pill--good", "wv-pill--bonus", "wv-pill--again", "wv-pill--nope");
    this.pill.classList.toggle("wv-pill--empty", word.length === 0);
    this.pill.textContent =
      word.length > 0 ? word : this.inputMode === "tap" ? "Tap the letters" : "Swipe the letters";
    this.tokenEls.forEach((el, token) => {
      const at = this.path.indexOf(token);
      el.classList.toggle("wv-token--on", at >= 0);
      el.setAttribute("aria-pressed", at >= 0 ? "true" : "false");
    });
    this.undoBtn.disabled = this.path.length === 0;
    this.sendBtn.disabled = this.path.length === 0;
    this.drawTrail();
  }

  private flashPill(kind: "good" | "bonus" | "again" | "nope", word: string): void {
    this.pill.textContent = word;
    this.pill.classList.remove("wv-pill--empty", "wv-pill--good", "wv-pill--bonus", "wv-pill--again", "wv-pill--nope");
    void this.pill.offsetWidth;
    this.pill.classList.add(`wv-pill--${kind}`);
  }

  private say(message: string, spoken = message, seconds = SAY_SECONDS): void {
    this.sayEl.textContent = message;
    this.sayEl.classList.remove("wv-say--on");
    void this.sayEl.offsetWidth;
    this.sayEl.classList.add("wv-say--on");
    window.clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => {
      this.sayEl.classList.remove("wv-say--on");
      if (this.path.length === 0) this.paintPath();
    }, seconds * 1000);
    // Throttled: a burst of quick words reads as the last one, not a queue.
    window.clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => (this.live.textContent = spoken), 250);
  }

  private paintBonus(charged = false): void {
    const count = this.credited.length;
    const filled = count % BONUS_BLOCK;
    this.bonusPips.replaceChildren(
      ...Array.from({ length: BONUS_BLOCK }, (_, i) => div(i < filled ? "wv-pip wv-pip--on" : "wv-pip")),
    );
    this.bonusBtn.setAttribute(
      "aria-label",
      `Bonus words: ${filled} of ${BONUS_BLOCK} toward the next bolt. ${count} found on this puzzle.`,
    );
    if (charged) {
      this.bonusBtn.classList.remove("wv-bonusbtn--charged");
      void this.bonusBtn.offsetWidth;
      this.bonusBtn.classList.add("wv-bonusbtn--charged");
    }
  }

  private paintMode(): void {
    const tap = this.inputMode === "tap";
    this.el.classList.toggle("wv-tapmode", tap);
    this.modeBtn.innerHTML = `${tap ? ICONS.tap : ICONS.swipe}<span class="wv-tool-label">${tap ? "TAP" : "SWIPE"}</span>`;
    this.modeBtn.setAttribute(
      "aria-label",
      tap ? "Input: tap mode. Switch to swipe mode." : "Input: swipe mode. Switch to tap mode.",
    );
  }

  private openBonusList(): void {
    this.host.sfx("uiMove");
    const total = this.level.puzzle.bonus.length;
    const sheet = div("wv-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Bonus words");
    const card = div("wv-sheet-card");
    card.append(
      text("wv-sheet-title", "BONUS WORDS"),
      text("wv-sheet-sub", `${this.credited.length} of ${total} found on this puzzle`),
      text(
        "wv-sheet-note",
        "Real words that aren't on the board. Every five fills a bolt for your collection. You never need them to finish.",
      ),
    );
    const list = div("wv-chips");
    if (this.credited.length === 0) list.append(text("wv-sheet-note", "None yet. Try some short words!"));
    for (const word of [...this.credited].sort()) {
      list.append(text(this.attempt.bonus.includes(word) ? "wv-chip wv-chip--new" : "wv-chip", word));
    }
    const close = document.createElement("button");
    close.className = "wv-btn wv-btn--primary";
    close.textContent = "BACK TO THE BOARD";
    close.dataset.autofocus = "";
    close.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.overlay = null;
      sheet.remove();
    });
    card.append(list, close);
    sheet.append(card);
    this.cancelGesture();
    this.showCard(sheet);
  }

  /** Close whatever is laid over the level (a sheet, never the result card). */
  closeOverlay(): void {
    if (this.overlay && !this.finished) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  // ----- Tutorial -----

  private paintCoach(): void {
    const step = this.coachSteps.find((s) => !this.coachDismissed.has(s.id) && s.when(this.attempt));
    if (!step || this.finished) {
      this.coachEl.replaceChildren();
      this.coachEl.classList.remove("wv-coach--on");
      return;
    }
    const got = document.createElement("button");
    got.className = "wv-coach-btn";
    got.textContent = "GOT IT";
    got.addEventListener("click", () => {
      this.coachDismissed.add(step.id);
      this.hooks.dismissCoach?.(step.id);
      this.host.sfx("uiMove");
      this.paintCoach();
    });
    const skip = document.createElement("button");
    skip.className = "wv-coach-btn wv-coach-btn--quiet";
    skip.textContent = "SKIP TUTORIAL";
    skip.addEventListener("click", () => this.hooks.skipTutorial?.());
    const row = div("wv-coach-row");
    row.append(skip, got);
    this.coachEl.replaceChildren(text("wv-coach-text", step.text(this.inputMode)), row);
    this.coachEl.classList.add("wv-coach--on");
  }

}

// ----- Small DOM helpers -----

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

function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function iconButton(className: string, icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.innerHTML = icon;
  button.setAttribute("aria-label", label);
  return button;
}

function toolButton(icon: string, label: string, aria: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "wv-tool";
  button.innerHTML = `${icon}<span class="wv-tool-label">${label}</span>`;
  if (aria) button.setAttribute("aria-label", aria);
  return button;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

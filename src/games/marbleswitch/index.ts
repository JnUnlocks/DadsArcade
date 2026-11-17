/**
 * MARBLE SWITCH.
 *
 * Flip the switches so each glass marble rolls into the cup with its shape.
 * Twenty boards in two packs: THE BASICS, and THE WORKSHOP, whose pieces
 * move by themselves -- flippers, turntables, geared switches and light
 * gates. Two ways to play: JUNIOR plans one marble at a time with its route
 * shown; CLASSIC sends a timed queue and lets you flip switches while the
 * marbles roll.
 *
 * The rules are in sim.ts and the boards in levels.ts, both without a
 * screen, and checked by marble.test.ts. This file is the cabinet around
 * them: the level list, the buttons, the sounds and lights, and the results
 * card. Controls are real buttons laid over the board, named and with their
 * setting spoken, so they can be reached with a keyboard or a screen reader.
 */

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { buildBoard, gearedWith, TURNTABLE_EXITS, type Board, type NodeDef } from "./graph.ts";
import { LEVELS, type LevelDef } from "./levels.ts";
import { isUnlocked, loadProgress, recordResult, starsFor, WORKSHOP_FIRST } from "./progress.ts";
import {
  BOARD_H,
  BOARD_W,
  drawBoard,
  drawCabinet,
  drawMarbleSwitchIcon,
  SYMBOL_NAME,
  type Marquee,
} from "./render.ts";
import {
  advance,
  canDrop,
  canFlip,
  drop,
  flip,
  isRolling,
  marblePosition,
  MISS_BEAT,
  nextInQueue,
  predictedRoute,
  startAttempt,
  type Attempt,
  type Mode,
} from "./sim.ts";
import { hintFor } from "./solve.ts";
import "./marbleswitch.css";

const GAME_ID = "marble-switch";
const MODE_KEY = "hyperdrive.marbleswitch.mode";
const TEACHING = "Tap a switch. Drop the marble into its matching cup.";
const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Seconds between the soft rolling sounds while marbles move. */
const ROLL_EVERY = 0.3;
/** Seconds a lever takes to swing over. Cosmetic: the switch itself changes at once. */
const LEVER_TIME = 0.12;
/** Seconds a turntable takes to turn a notch. */
const WHEEL_TIME = 0.22;
/** Points of glowing trail kept behind each marble. */
const TRAIL = 16;
/** Board units of space above and below the board, for the header and the buttons. */
const TOP_ROOM = 64;
const BOTTOM_ROOM = 112;

interface Placement {
  x0: number;
  y0: number;
  scale: number;
}

class MarbleSwitch implements GameInstance {
  private readonly host: GameHost;
  private readonly root: HTMLDivElement;
  private mode: Mode = loadMode();
  private screen: "select" | "board" = "select";

  private level: LevelDef = LEVELS[0]!;
  private board: Board = buildBoard(LEVELS[0]!.nodes, LEVELS[0]!.edges);
  private attempt: Attempt;
  private labels = new Map<string, string>();

  // How the moving parts are drawn, eased towards what the simulation says.
  private leverTurn = new Map<string, number>();
  private wheelTarget = new Map<string, number>();
  private wheelTurn = new Map<string, number>();
  private gearAngle = new Map<string, number>();
  private gearTarget = new Map<string, number>();
  private litAt = new Map<string, number>();
  private trails: Array<Array<{ x: number; y: number }>> = [];
  private marquee: Marquee = { mode: "idle", for: 0, bright: false };

  private clock = 0;
  private rollWait = 0;
  /** How far into the attempt's event log the screen has read. */
  private seen = 0;
  private hintOn = false;
  private hintCache: { key: string; node: string | null } | null = null;
  private resultShown = false;
  private readonly particles = new Particles();

  // The board's controls.
  private header!: HTMLDivElement;
  private counter!: HTMLSpanElement;
  private switchLayer!: HTMLDivElement;
  private switchButtons = new Map<string, HTMLButtonElement>();
  private message!: HTMLParagraphElement;
  private dropButton!: HTMLButtonElement;
  private hintButton!: HTMLButtonElement;
  private result: HTMLDivElement | null = null;
  private placedFor = "";

  constructor(host: GameHost) {
    this.host = host;
    this.root = document.createElement("div");
    this.root.className = "ms-root";
    this.attempt = this.freshAttempt();
    this.showSelect();
    window.addEventListener("keydown", this.onKey);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
  }

  feedbackContext(): string {
    const mode = this.mode === "junior" ? "Junior" : "Classic";
    return this.screen === "board" ? `level ${this.level.number} ${this.level.name}, ${mode}` : `level list, ${mode}`;
  }

  hud(): HudState {
    return { lives: 0, progress: 0, progressLabel: "", hidden: true };
  }

  /** Only a board with marbles rolling has anything a pause protects. */
  pausesWhenHidden(): boolean {
    return this.screen === "board" && this.attempt.phase === "rolling" && this.attempt.marbles.some(isRolling);
  }

  // ----- The level list -----

  private showSelect(): void {
    this.screen = "select";
    this.result = null;
    this.root.classList.toggle("is-calm", this.host.settings.reducedMotion);
    const progress = loadProgress();
    const panel = el("div", "ms-select");
    panel.append(el("h2", "ms-select__title", "MARBLE SWITCH"));

    const modes = el("div", "ms-modes");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "How to play");
    for (const [mode, label] of [["junior", "JUNIOR"], ["classic", "CLASSIC"]] as const) {
      const button = el("button", `ms-mode${mode === this.mode ? " is-on" : ""}`, label) as HTMLButtonElement;
      button.setAttribute("aria-pressed", String(mode === this.mode));
      button.addEventListener("click", () => {
        this.mode = mode;
        saveMode(mode);
        this.host.sfx("uiMove");
        this.showSelect();
      });
      modes.append(button);
    }
    panel.append(modes);
    panel.append(
      el(
        "p",
        "ms-select__pitch",
        this.mode === "junior"
          ? "One marble at a time, no rush. Plan the switches, see the route, then DROP."
          : "Set the switches, DROP, and the marbles roll in turn. Flip switches as they go.",
      ),
    );

    const packs: Array<[string, string, LevelDef[]]> = [
      ["THE BASICS", "Switches, forks and merges.", LEVELS.filter((l) => l.number < WORKSHOP_FIRST)],
      [
        "THE WORKSHOP",
        isUnlocked(progress, this.mode, WORKSHOP_FIRST)
          ? "Pieces that move by themselves: flippers, turntables, gears and light gates."
          : "Clear level 10 in either mode to open the Workshop.",
        LEVELS.filter((l) => l.number >= WORKSHOP_FIRST),
      ],
    ];
    for (const [title, pitch, levels] of packs) {
      panel.append(el("h3", "ms-pack", title), el("p", "ms-pack__pitch", pitch));
      const grid = el("div", "ms-levels");
      for (const level of levels) grid.append(this.levelButton(level, progress));
      panel.append(grid);
    }

    if (this.host.exitToArcade) {
      const back = el("button", "btn btn--ghost ms-select__back", "BACK TO ARCADE") as HTMLButtonElement;
      back.addEventListener("click", () => this.host.exitToArcade?.());
      panel.append(back);
    }
    this.root.replaceChildren(panel);
  }

  private levelButton(level: LevelDef, progress: ReturnType<typeof loadProgress>): HTMLButtonElement {
    const stars = progress[this.mode][level.number] ?? 0;
    const open = isUnlocked(progress, this.mode, level.number);
    const workshop = level.number >= WORKSHOP_FIRST;
    const button = el("button", `ms-level${open ? "" : " is-locked"}${workshop ? " ms-level--workshop" : ""}`) as HTMLButtonElement;
    button.disabled = !open;
    button.append(el("span", "ms-level__num", String(level.number)), el("span", "ms-level__name", level.name));
    button.append(el("span", "ms-level__stars", open ? starText(stars) : "LOCKED"));
    button.setAttribute(
      "aria-label",
      `Level ${level.number}, ${level.name}. ${open ? (stars ? `${stars} of 3 stars.` : "Not cleared yet.") : "Locked."}`,
    );
    button.addEventListener("click", () => {
      this.host.sfx("uiSelect");
      this.openLevel(level);
    });
    return button;
  }

  // ----- A board -----

  private openLevel(level: LevelDef): void {
    this.level = level;
    this.board = buildBoard(level.nodes, level.edges);
    this.labels = new Map(this.board.controls.map((s, i) => [s.id, LETTERS[i] ?? s.id]));
    this.screen = "board";
    this.buildBoardControls();
    this.retry();
  }

  private freshAttempt(): Attempt {
    return startAttempt({ board: this.board, mode: this.mode, queue: this.level.queue, releases: this.level.releases });
  }

  /** Back to the start of this board: queue, controls, lights, taps, clock. */
  private retry(): void {
    // A new attempt object: anything still pointing at the old one is ignored.
    this.attempt = this.freshAttempt();
    this.seen = 0;
    this.leverTurn = new Map(this.board.switches.map((s) => [s.id, s.start === "right" ? 1 : 0]));
    this.wheelTarget = new Map(
      this.board.controls.filter((n) => n.kind === "turntable").map((n) => [n.id, TURNTABLE_EXITS.indexOf(n.start ?? "left")]),
    );
    this.wheelTurn = new Map(this.wheelTarget);
    this.gearAngle = new Map();
    this.gearTarget = new Map();
    this.litAt = new Map();
    this.trails = [];
    this.marquee = { mode: "idle", for: 0, bright: false };
    this.hintOn = false;
    this.hintCache = null;
    this.resultShown = false;
    this.particles.clear();
    this.result?.remove();
    this.result = null;
    this.refreshControls();
  }

  private buildBoardControls(): void {
    this.header = el("div", "ms-header") as HTMLDivElement;
    this.counter = el("span", "ms-counter") as HTMLSpanElement;
    this.counter.setAttribute("aria-hidden", "true");
    this.switchLayer = el("div", "ms-switches") as HTMLDivElement;
    this.switchButtons.clear();
    for (const s of this.board.controls) {
      const button = el("button", "ms-switch") as HTMLButtonElement;
      button.addEventListener("click", () => this.tapControl(s.id));
      this.switchButtons.set(s.id, button);
      this.switchLayer.append(button);
    }
    const bottom = el("div", "ms-bottom");
    this.message = el("p", "ms-message") as HTMLParagraphElement;
    this.message.setAttribute("aria-live", "polite");
    const row = el("div", "ms-buttons");
    const retry = el("button", "ms-btn ms-btn--retry", "↺ RETRY") as HTMLButtonElement;
    retry.setAttribute("aria-label", "Retry this board from the start");
    retry.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.retry();
    });
    this.dropButton = el("button", "ms-btn ms-btn--drop", "DROP") as HTMLButtonElement;
    this.dropButton.addEventListener("click", () => this.pressDrop());
    this.hintButton = el("button", "ms-btn ms-btn--hint", "HINT") as HTMLButtonElement;
    this.hintButton.addEventListener("click", () => {
      this.hintOn = !this.hintOn;
      this.host.sfx("uiMove");
      this.refreshControls();
    });
    const levels = el("button", "ms-btn ms-btn--levels", "LEVELS") as HTMLButtonElement;
    levels.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.showSelect();
    });
    row.append(levels, retry, this.dropButton);
    if (this.mode === "junior") row.append(this.hintButton);
    bottom.append(this.message, row);
    this.root.replaceChildren(this.header, this.switchLayer, bottom);
    this.root.classList.toggle("is-calm", this.host.settings.reducedMotion);
    this.placedFor = "";
  }

  private tapControl(id: string): void {
    if (this.screen !== "board") return;
    if (!flip(this.attempt, id)) {
      if (this.mode === "junior" && this.attempt.marbles.some(isRolling)) this.say("Wait for the marble to stop, then tap.");
      return;
    }
    this.host.buzz(10);
    this.refreshControls();
  }

  private pressDrop(): void {
    if (this.screen !== "board" || !drop(this.attempt)) return;
    this.hintOn = false;
    this.refreshControls();
  }

  private say(text: string): void {
    this.message.textContent = text;
  }

  /** How a control is described to a screen reader, with its setting. */
  private describe(node: NodeDef): string {
    const name = this.labels.get(node.id);
    const setting = this.attempt.switches.get(node.id);
    if (node.kind === "turntable") return `Turntable ${name}, pointing ${setting}. Tap to turn it one notch.`;
    const partners = gearedWith(this.board, node.id).filter((s) => s.id !== node.id).map((s) => this.labels.get(s.id));
    const extra = node.auto
      ? " It flips itself after every marble."
      : partners.length
        ? ` Geared to ${partners.join(" and ")}: they flip together.`
        : "";
    return `${node.auto ? "Flipper" : "Switch"} ${name}, sending marbles ${setting}.${extra} Tap to flip.`;
  }

  /** Words and states that change with the attempt: header, control labels, buttons. */
  private refreshControls(): void {
    if (this.screen !== "board") return;
    const a = this.attempt;
    const [, three] = this.level.stars[this.mode];
    this.setCounter(a.flips);
    this.header.replaceChildren(
      el("span", "ms-header__level", `${this.level.number}. ${this.level.name.toUpperCase()}`),
      el("span", "ms-header__mode", this.mode === "junior" ? "JUNIOR" : "CLASSIC"),
      el("span", "ms-header__break"),
      el("span", "ms-header__flips", "TAPS"),
      this.counter,
      el("span", "ms-header__target", `★★★ IN ${three}`),
    );
    this.header.setAttribute("aria-label", `${a.flips} taps. Three stars in ${three}.`);
    for (const [id, button] of this.switchButtons) {
      button.setAttribute("aria-label", this.describe(this.board.nodes.get(id)!));
      button.disabled = !canFlip(a);
    }
    this.dropButton.disabled = !canDrop(a);
    const next = nextInQueue(a);
    this.dropButton.setAttribute("aria-label", next ? `Drop the ${SYMBOL_NAME[next.symbol]} marble` : "Drop");
    this.hintButton.classList.toggle("is-on", this.hintOn);

    const held = a.marbles.find((m) => m.heldAt);
    if (this.hintOn && this.mode === "junior") this.say(this.level.hint);
    else if (this.level.number === 1 && a.phase === "setup") this.say(TEACHING);
    else if (a.phase === "setup" && this.mode === "classic") this.say("Set the switches, then DROP. You can tap while they roll.");
    else if (a.phase === "setup") this.say(next ? `Next: the ${SYMBOL_NAME[next.symbol]} marble. Set its route, then DROP.` : "");
    else if (this.mode === "junior" && !a.marbles.some(isRolling) && next) {
      this.say(
        held
          ? `The ${SYMBOL_NAME[held.symbol]} marble is waiting at the gate. Next: the ${SYMBOL_NAME[next.symbol]} marble.`
          : `Next: the ${SYMBOL_NAME[next.symbol]} marble.`,
      );
    } else this.say("");
  }

  /** The mechanical tap counter: three wheels, the changed ones rolling over. */
  private setCounter(n: number): void {
    const digits = String(Math.min(999, n)).padStart(3, "0");
    const old = this.counter.dataset.value ?? "000";
    this.counter.dataset.value = digits;
    this.counter.replaceChildren(
      ...[...digits].map((d, i) => {
        const wheel = el("span", `ms-counter__digit${d !== old[i] && n > 0 ? " is-rolling" : ""}`, d);
        return wheel;
      }),
    );
  }

  // ----- Keys -----

  private onKey = (event: KeyboardEvent): void => {
    if (this.screen !== "board" || event.repeat) return;
    const onButton = event.target instanceof HTMLElement && event.target.closest("button, input, textarea");
    const digit = Number(event.key);
    if (digit >= 1 && digit <= this.board.controls.length) {
      this.tapControl(this.board.controls[digit - 1]!.id);
      return;
    }
    if ((event.code === "Space" || event.code === "Enter") && !onButton) {
      event.preventDefault();
      this.pressDrop();
    } else if (event.key === "r" || event.key === "R") {
      this.retry();
    }
  };

  // ----- Update -----

  update(dt: number, _input: InputSnapshot): void {
    this.clock += dt;
    this.marquee.for += dt;
    if (this.screen !== "board") return;
    const a = this.attempt;
    const calm = this.host.settings.reducedMotion;
    const wasRolling = a.marbles.some(isRolling);
    advance(a, dt);
    this.particles.update(dt);
    this.readEvents();
    this.ease(dt, calm);

    // Glowing trails behind the marbles.
    a.marbles.forEach((m, i) => {
      const trail = (this.trails[i] ??= []);
      const p = isRolling(m) ? marblePosition(a, m) : null;
      if (p) trail.push(p);
      if (trail.length > TRAIL || (!p && trail.length)) trail.shift();
    });

    if (a.marbles.some(isRolling)) {
      this.rollWait -= dt;
      if (this.rollWait <= 0) {
        this.rollWait = ROLL_EVERY;
        this.host.sfx("marbleRoll");
      }
    }
    if (wasRolling && !a.marbles.some(isRolling)) this.refreshControls();

    if (!this.resultShown && a.phase === "cleared") {
      this.resultShown = true;
      const stars = starsFor(this.level, this.mode, a.flips);
      this.marquee = { mode: "chase", for: 0, bright: stars === 3 };
      this.host.sfx(stars === 3 ? "marbleLights" : "marbleClear");
      this.host.buzz([30, 40, 60]);
      this.showResult(true);
    } else if (!this.resultShown && a.phase === "missed" && a.miss) {
      if (this.marquee.mode !== "dim") this.marquee = { mode: "dim", for: 0, bright: false };
      if (a.time - a.miss.at >= MISS_BEAT) {
        this.resultShown = true;
        this.showResult(false);
      }
    }
  }

  /** Turn what happened on the board into sound, sparks and lights. */
  private readEvents(): void {
    const a = this.attempt;
    const calm = this.host.settings.reducedMotion;
    for (; this.seen < a.events.length; this.seen += 1) {
      const e = a.events[this.seen]!;
      const node = this.board.nodes.get(e.node);
      switch (e.kind) {
        case "drop":
          this.host.sfx("marbleDrop");
          break;
        case "tap":
          this.onMoved(e.node);
          this.host.sfx(node?.kind === "turntable" ? "marbleTurn" : node?.link ? "marbleGear" : "marbleClick");
          break;
        case "kick":
          this.onMoved(e.node);
          this.host.sfx("marbleFlipper");
          if (!calm && node) this.particles.burst(node.x, node.y, "#ff9a4d", 10, 90);
          break;
        case "turn":
          this.onMoved(e.node);
          this.host.sfx("marbleTurn");
          break;
        case "trip":
          this.litAt.set(e.node, this.clock);
          this.host.sfx("marbleTrip");
          if (!calm && node) this.particles.burst(node.x, node.y, "#ffe39a", 16, 110);
          break;
        case "open":
          this.host.sfx("marbleGate");
          break;
        case "hold":
          this.host.sfx("marbleClick");
          break;
        case "catch":
          this.host.sfx("marbleChime");
          if (!calm && node) this.particles.burst(node.x, node.y - 14, "#fff6c8", 12, 80);
          this.refreshControls();
          break;
        case "miss":
        case "stuck":
          this.host.sfx("marbleMiss");
          this.host.buzz(40);
          break;
        default:
          break;
      }
    }
  }

  /** A control moved: a lever swings, a wheel turns a notch, gears turn. */
  private onMoved(id: string): void {
    const node = this.board.nodes.get(id);
    if (!node) return;
    if (node.kind === "turntable") {
      this.wheelTarget.set(id, (this.wheelTarget.get(id) ?? 0) + 1);
    } else if (node.link) {
      this.gearTarget.set(node.link, (this.gearTarget.get(node.link) ?? 0) + Math.PI / 5);
    }
  }

  private ease(dt: number, calm: boolean): void {
    for (const [id, side] of this.attempt.switches) {
      if (this.board.nodes.get(id)?.kind !== "switch") continue;
      const target = side === "right" ? 1 : 0;
      const now = this.leverTurn.get(id) ?? target;
      const step = calm ? 1 : dt / LEVER_TIME;
      this.leverTurn.set(id, now + Math.max(-step, Math.min(step, target - now)));
    }
    for (const [id, target] of this.wheelTarget) {
      const now = this.wheelTurn.get(id) ?? target;
      this.wheelTurn.set(id, calm ? target : Math.min(target, now + dt / WHEEL_TIME));
    }
    for (const [link, target] of this.gearTarget) {
      const now = this.gearAngle.get(link) ?? 0;
      this.gearAngle.set(link, calm ? target : Math.min(target, now + dt * 5));
    }
  }

  private showResult(cleared: boolean): void {
    const a = this.attempt;
    const card = el("div", "ms-result") as HTMLDivElement;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", cleared ? "Board cleared" : "Attempt over");
    const buttons = el("div", "ms-result__buttons");
    const add = (label: string, cls: string, action: () => void) => {
      const button = el("button", `ms-btn ${cls}`, label) as HTMLButtonElement;
      button.addEventListener("click", () => {
        this.host.sfx("uiSelect");
        action();
      });
      buttons.append(button);
      return button;
    };

    if (cleared) {
      const stars = starsFor(this.level, this.mode, a.flips);
      recordResult(this.mode, this.level.number, stars);
      const [two, three] = this.level.stars[this.mode];
      card.append(
        el("h2", "ms-result__title", stars === 3 ? "PERFECT RUN!" : "CLEAR!"),
        el("p", "ms-result__stars", starText(stars)),
        el(
          "p",
          "ms-result__line",
          stars === 3
            ? `${tapWord(a.flips)}. As few as it can be done in!`
            : `${tapWord(a.flips)}. ★★ in ${two}, ★★★ in ${three}.`,
        ),
      );
      if (this.level.number === WORKSHOP_FIRST - 1) {
        card.append(el("p", "ms-result__hint", "The Workshop is open: ten more boards, with pieces that move by themselves."));
      }
      const next = LEVELS[this.level.number];
      const first = next
        ? add("NEXT LEVEL", "ms-btn--drop", () => this.openLevel(next))
        : add("ALL LEVELS", "ms-btn--drop", () => this.showSelect());
      add("REPLAY", "", () => this.retry());
      if (next) add("LEVELS", "", () => this.showSelect());
      card.append(buttons);
      this.root.append(card);
      first.focus();
    } else {
      const miss = a.miss!;
      const m = a.marbles[miss.marble]!;
      const cup = miss.cup ? this.board.nodes.get(miss.cup)! : null;
      card.append(
        el("h2", "ms-result__title ms-result__title--miss", cup ? "WRONG CUP" : "STUCK AT THE GATE"),
        el(
          "p",
          "ms-result__line",
          cup
            ? `The ${SYMBOL_NAME[m.symbol]} marble rolled into the ${SYMBOL_NAME[cup.symbol!]} cup.`
            : `The ${SYMBOL_NAME[m.symbol]} marble is waiting behind a gate, and no marble lit its trip light.`,
        ),
      );
      if (this.mode === "junior") card.append(el("p", "ms-result__hint", this.level.hint));
      const first = add("↺ RETRY", "ms-btn--drop", () => this.retry());
      add("LEVELS", "", () => this.showSelect());
      card.append(buttons);
      this.root.append(card);
      first.focus();
    }
    this.result = card;
  }

  // ----- Render -----

  private placement(): Placement {
    const { w, h, insetTop, insetBottom } = this.host.view;
    const top = insetTop + TOP_ROOM;
    const room = h - top - BOTTOM_ROOM - insetBottom;
    const scale = Math.min((w - 24) / BOARD_W, room / BOARD_H);
    return { x0: (w - BOARD_W * scale) / 2, y0: top + (room - BOARD_H * scale) / 2, scale };
  }

  /** Lay the control buttons over the controls, in screen pixels. */
  private placeSwitchButtons(p: Placement): void {
    const view = this.host.view;
    const css = 1 / view.toWorldDistance(1);
    const ox = -view.toWorldX(0) * css;
    const oy = -view.toWorldY(0) * css;
    const key = `${css}:${ox}:${oy}:${p.scale}`;
    if (key === this.placedFor) return;
    this.placedFor = key;
    const size = Math.max(52, 54 * p.scale * css * 0.9);
    for (const s of this.board.controls) {
      const button = this.switchButtons.get(s.id)!;
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.style.left = `${ox + (p.x0 + s.x * p.scale) * css - size / 2}px`;
      button.style.top = `${oy + (p.y0 + s.y * p.scale) * css - size / 2}px`;
    }
  }

  /** Junior's hint: worked out by the solver from wherever the player is, and kept until something changes. */
  private currentHint(): string | null {
    const a = this.attempt;
    if (!this.hintOn || this.mode !== "junior" || !canDrop(a)) return null;
    const key = `${a.dropped}|${[...a.switches.values()].join(",")}|${[...a.lights].join(",")}`;
    if (this.hintCache?.key !== key) this.hintCache = { key, node: hintFor(a) };
    return this.hintCache.node;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.host.view;
    const settings = this.host.settings;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0b1030");
    bg.addColorStop(1, "#05070f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (this.screen !== "board") return;

    const p = this.placement();
    this.placeSwitchButtons(p);
    drawCabinet(
      ctx,
      p.x0 - 8,
      p.y0 - 8,
      BOARD_W * p.scale + 16,
      BOARD_H * p.scale + 16,
      settings.reducedMotion,
      this.clock,
      this.marquee,
    );

    const a = this.attempt;
    const predicted = this.mode === "junior" && canDrop(a) ? predictedRoute(a).edges : null;
    ctx.save();
    ctx.translate(p.x0, p.y0);
    ctx.scale(p.scale, p.scale);
    drawBoard(ctx, a, this.labels, {
      clock: this.clock,
      calm: settings.reducedMotion,
      highContrast: settings.highContrast,
      predicted,
      hintSwitch: this.currentHint(),
      leverTurn: this.leverTurn,
      wheelTurn: this.wheelTurn,
      gearAngle: this.gearAngle,
      litAt: this.litAt,
      trails: this.trails,
      missFor: a.miss ? a.time - a.miss.at : null,
    });
    this.particles.render(ctx);
    ctx.restore();
  }
}

function tapWord(n: number): string {
  return `${n} ${n === 1 ? "tap" : "taps"}`;
}

function starText(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "classic" ? "classic" : "junior";
  } catch {
    return "junior";
  }
}

function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage disabled -- the level list just opens on Junior.
  }
}

export const marbleSwitchModule: GameModule = {
  id: GAME_ID,
  title: "MARBLE SWITCH",
  blurb: "Flip the switches. Roll each marble into its matching cup.",
  howToPlay: [
    "Tap a switch to flip it. Its brass lever points along the rail a marble will take. Roll each marble into the cup with its shape.",
    "JUNIOR: one marble per DROP, with its route shown, and a HINT. CLASSIC: DROP sends the whole queue; tap while they roll.",
    "THE WORKSHOP: orange flippers flip themselves after each marble, and turntables turn a notch per marble or per tap.",
    "Geared switches flip together on one tap. A gate stays shut until a marble rolls over the light it is wired to.",
    "A wrong cup, or a marble stuck at a gate, ends the try. Fewer taps earn more stars.",
    "On a keyboard, number keys tap the controls in order. Space drops, R retries.",
  ],
  accent: "#ff9a4d",
  beta: true,
  noLeaderboard: true,
  drawIcon: drawMarbleSwitchIcon,
  create: (host: GameHost): GameInstance => new MarbleSwitch(host),
};

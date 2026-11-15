/**
 * MARBLE SWITCH.
 *
 * Flip the switches so each glass marble rolls into the cup with its shape.
 * Ten short boards, in two ways to play: JUNIOR plans one marble at a time
 * with its route shown; CLASSIC sends a timed queue and lets you flip
 * switches while the marbles roll.
 *
 * The rules are in sim.ts and the boards in levels.ts, both without a
 * screen, and checked by marble.test.ts. This file is the cabinet around
 * them: the level list, the buttons, the sounds, and the results card.
 * Switches are real buttons laid over the board, named and with their
 * setting spoken, so they can be reached with a keyboard or a screen reader.
 */

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { buildBoard, type Board } from "./graph.ts";
import { LEVELS, type LevelDef } from "./levels.ts";
import { isUnlocked, loadProgress, recordResult, starsFor } from "./progress.ts";
import { BOARD_H, BOARD_W, drawBoard, drawCabinet, drawMarbleSwitchIcon, SYMBOL_NAME } from "./render.ts";
import {
  advance,
  canDrop,
  canFlip,
  drop,
  flip,
  isRolling,
  MISS_BEAT,
  nextInQueue,
  predictedRoute,
  startAttempt,
  type Attempt,
  type Mode,
} from "./sim.ts";
import { hintFor, plan, type Plan } from "./solve.ts";
import "./marbleswitch.css";

const GAME_ID = "marble-switch";
const MODE_KEY = "hyperdrive.marbleswitch.mode";
const TEACHING = "Tap a switch. Drop the marble into its matching cup.";
const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Seconds between the soft rolling sounds while marbles move. */
const ROLL_EVERY = 0.3;
/** Seconds a lever takes to swing over. Cosmetic: the switch itself changes at once. */
const LEVER_TIME = 0.12;
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
  private solution: Plan | null = null;
  private labels = new Map<string, string>();
  private leverTurn = new Map<string, number>();

  private clock = 0;
  private rollWait = 0;
  private landed = 0;
  private hintOn = false;
  private resultShown = false;
  private readonly particles = new Particles();

  // The board's controls.
  private header!: HTMLDivElement;
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

    const grid = el("div", "ms-levels");
    for (const level of LEVELS) {
      const stars = progress[this.mode][level.number] ?? 0;
      const open = isUnlocked(progress, this.mode, level.number);
      const button = el("button", `ms-level${open ? "" : " is-locked"}`) as HTMLButtonElement;
      button.disabled = !open;
      button.append(el("span", "ms-level__num", String(level.number)), el("span", "ms-level__name", level.name));
      button.append(el("span", "ms-level__stars", open ? starText(stars) : "LOCKED"));
      button.setAttribute(
        "aria-label",
        `Level ${level.number}, ${level.name}. ${open ? (stars ? `${stars} of 3 stars.` : "Not cleared yet.") : "Locked: clear the level before it."}`,
      );
      button.addEventListener("click", () => {
        this.host.sfx("uiSelect");
        this.openLevel(level);
      });
      grid.append(button);
    }
    panel.append(grid);

    if (this.host.exitToArcade) {
      const back = el("button", "btn btn--ghost ms-select__back", "BACK TO ARCADE") as HTMLButtonElement;
      back.addEventListener("click", () => this.host.exitToArcade?.());
      panel.append(back);
    }
    this.root.replaceChildren(panel);
  }

  // ----- A board -----

  private openLevel(level: LevelDef): void {
    this.level = level;
    this.board = buildBoard(level.nodes, level.edges);
    this.solution = plan(this.board, level.queue);
    this.labels = new Map(this.board.switches.map((s, i) => [s.id, LETTERS[i] ?? s.id]));
    this.screen = "board";
    this.buildBoardControls();
    this.retry();
  }

  private freshAttempt(): Attempt {
    return startAttempt({ board: this.board, mode: this.mode, queue: this.level.queue, releases: this.level.releases });
  }

  /** Back to the start of this board: queue, switches, flips, clock. */
  private retry(): void {
    // A new attempt object: anything still pointing at the old one is ignored.
    this.attempt = this.freshAttempt();
    this.leverTurn = new Map(this.board.switches.map((s) => [s.id, s.start === "right" ? 1 : 0]));
    this.landed = 0;
    this.hintOn = false;
    this.resultShown = false;
    this.particles.clear();
    this.result?.remove();
    this.result = null;
    this.refreshControls();
  }

  private buildBoardControls(): void {
    this.header = el("div", "ms-header") as HTMLDivElement;
    this.switchLayer = el("div", "ms-switches") as HTMLDivElement;
    this.switchButtons.clear();
    for (const s of this.board.switches) {
      const button = el("button", "ms-switch") as HTMLButtonElement;
      button.addEventListener("click", () => this.tapSwitch(s.id));
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
    this.placedFor = "";
  }

  private tapSwitch(id: string): void {
    if (this.screen !== "board") return;
    if (!flip(this.attempt, id)) {
      if (this.mode === "junior" && this.attempt.marbles.some(isRolling)) this.say("Wait for the marble to land, then flip.");
      return;
    }
    this.host.sfx("marbleClick");
    this.host.buzz(10);
    this.refreshControls();
  }

  private pressDrop(): void {
    if (this.screen !== "board" || !drop(this.attempt)) return;
    this.host.sfx("marbleDrop");
    this.hintOn = false;
    this.refreshControls();
  }

  private say(text: string): void {
    this.message.textContent = text;
  }

  /** Words and states that change with the attempt: header, switch labels, buttons. */
  private refreshControls(): void {
    if (this.screen !== "board") return;
    const a = this.attempt;
    const [, three] = this.level.stars[this.mode];
    this.header.replaceChildren(
      el("span", "ms-header__level", `${this.level.number}. ${this.level.name.toUpperCase()}`),
      el("span", "ms-header__mode", this.mode === "junior" ? "JUNIOR" : "CLASSIC"),
      el("span", "ms-header__flips", `FLIPS ${a.flips}  ·  ★★★ IN ${three}`),
    );
    for (const [id, button] of this.switchButtons) {
      const side = a.switches.get(id);
      button.setAttribute("aria-label", `Switch ${this.labels.get(id)}, sending marbles ${side}. Tap to flip.`);
      button.disabled = !canFlip(a);
    }
    this.dropButton.disabled = !canDrop(a);
    const next = nextInQueue(a);
    this.dropButton.setAttribute(
      "aria-label",
      next ? `Drop the ${SYMBOL_NAME[next.symbol]} marble` : "Drop",
    );
    this.hintButton.classList.toggle("is-on", this.hintOn);

    if (this.hintOn && this.mode === "junior") this.say(this.level.hint);
    else if (this.level.number === 1 && a.phase === "setup") this.say(TEACHING);
    else if (a.phase === "setup" && this.mode === "classic") this.say("Set the switches, then DROP. You can flip while they roll.");
    else if (a.phase === "setup") this.say(next ? `Next: the ${SYMBOL_NAME[next.symbol]} marble. Set its route, then DROP.` : "");
    else if (this.mode === "junior" && !a.marbles.some(isRolling) && next) {
      this.say(`Next: the ${SYMBOL_NAME[next.symbol]} marble.`);
    } else this.say("");
  }

  // ----- Keys -----

  private onKey = (event: KeyboardEvent): void => {
    if (this.screen !== "board" || event.repeat) return;
    const onButton = event.target instanceof HTMLElement && event.target.closest("button, input, textarea");
    const digit = Number(event.key);
    if (digit >= 1 && digit <= this.board.switches.length) {
      this.tapSwitch(this.board.switches[digit - 1]!.id);
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
    if (this.screen !== "board") return;
    const a = this.attempt;
    const wasRolling = a.marbles.some(isRolling);
    advance(a, dt);
    this.particles.update(dt);

    // The levers swing over; the switch itself changed the moment it was tapped.
    for (const [id, side] of a.switches) {
      const target = side === "right" ? 1 : 0;
      const now = this.leverTurn.get(id) ?? target;
      const step = this.host.settings.reducedMotion ? 1 : dt / LEVER_TIME;
      this.leverTurn.set(id, now + Math.max(-step, Math.min(step, target - now)));
    }

    // Sounds and sparkle as marbles land.
    const landed = a.marbles.filter((m) => m.cup !== null).length;
    if (landed > this.landed) {
      for (const m of a.marbles.slice()) {
        if (m.cup && m.landedAt > a.time - dt - 1e-6 && a.miss?.marble !== m.index) {
          const cup = this.board.nodes.get(m.cup)!;
          this.host.sfx("marbleChime");
          if (!this.host.settings.reducedMotion) this.particles.burst(cup.x, cup.y, "#ffffff", 10, 70);
        }
      }
      this.landed = landed;
      this.refreshControls();
    }
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
      this.host.sfx("marbleClear");
      this.host.buzz([30, 40, 60]);
      this.showResult(true);
    } else if (!this.resultShown && a.phase === "missed" && a.miss) {
      if (a.time - a.miss.at < 0.02) this.host.sfx("marbleMiss");
      if (a.time - a.miss.at >= MISS_BEAT) {
        this.resultShown = true;
        this.showResult(false);
      }
    }
  }

  private showResult(cleared: boolean): void {
    const a = this.attempt;
    const card = el("div", "ms-result") as HTMLDivElement;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", cleared ? "Board cleared" : "Wrong cup");
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
        el("h2", "ms-result__title", "CLEAR!"),
        el("p", "ms-result__stars", starText(stars)),
        el(
          "p",
          "ms-result__line",
          stars === 3
            ? `${flipWord(a.flips)}. As few as it can be done in!`
            : `${flipWord(a.flips)}. ★★ in ${two}, ★★★ in ${three}.`,
        ),
      );
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
      const m = a.marbles[a.miss!.marble]!;
      const cup = this.board.nodes.get(a.miss!.cup)!;
      card.append(
        el("h2", "ms-result__title ms-result__title--miss", "WRONG CUP"),
        el(
          "p",
          "ms-result__line",
          `The ${SYMBOL_NAME[m.symbol]} marble rolled into the ${SYMBOL_NAME[cup.symbol!]} cup.`,
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

  /** Lay the switch buttons over the switches, in screen pixels. */
  private placeSwitchButtons(p: Placement): void {
    const view = this.host.view;
    const css = 1 / view.toWorldDistance(1);
    const ox = -view.toWorldX(0) * css;
    const oy = -view.toWorldY(0) * css;
    const key = `${css}:${ox}:${oy}:${p.scale}`;
    if (key === this.placedFor) return;
    this.placedFor = key;
    const size = Math.max(52, 54 * p.scale * css * 0.9);
    for (const s of this.board.switches) {
      const button = this.switchButtons.get(s.id)!;
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.style.left = `${ox + (p.x0 + s.x * p.scale) * css - size / 2}px`;
      button.style.top = `${oy + (p.y0 + s.y * p.scale) * css - size / 2}px`;
    }
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
    drawCabinet(ctx, p.x0 - 8, p.y0 - 8, BOARD_W * p.scale + 16, BOARD_H * p.scale + 16, settings.reducedMotion, this.clock);

    const a = this.attempt;
    const predicted = this.mode === "junior" && canDrop(a) ? predictedRoute(a).edges : null;
    const hintSwitch =
      this.hintOn && this.mode === "junior" && canDrop(a) ? hintFor(a, this.solution?.routes[a.dropped]) : null;

    ctx.save();
    ctx.translate(p.x0, p.y0);
    ctx.scale(p.scale, p.scale);
    drawBoard(ctx, a, this.labels, {
      clock: this.clock,
      calm: settings.reducedMotion,
      highContrast: settings.highContrast,
      predicted,
      hintSwitch,
      leverTurn: this.leverTurn,
      missFor: a.miss ? a.time - a.miss.at : null,
    });
    this.particles.render(ctx);
    ctx.restore();
  }
}

function flipWord(n: number): string {
  return `${n} ${n === 1 ? "flip" : "flips"}`;
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
    "Tap a switch to flip it. Its brass lever points along the rail a marble will take.",
    "Every marble has a shape. Roll it into the cup with the same shape.",
    "JUNIOR: one marble per DROP, with its route shown. Switches lock while it rolls. HINT shows which switch to flip.",
    "CLASSIC: DROP sends the whole queue, spaced out. Flip switches while the marbles roll.",
    "A wrong cup ends the try. RETRY starts the board over. Fewer flips earn more stars.",
    "On a keyboard, number keys flip switches A, B, C and D. Space drops, R retries.",
  ],
  accent: "#ff9a4d",
  beta: true,
  noLeaderboard: true,
  drawIcon: drawMarbleSwitchIcon,
  create: (host: GameHost): GameInstance => new MarbleSwitch(host),
};

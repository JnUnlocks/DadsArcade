/**
 * Flash Point, on screen. The rules are in flash.ts.
 *
 * Timing is the whole game, so it is taken as carefully as a web page can:
 * GO's moment is stamped when the frame that first shows it is drawn, and a
 * tap's moment is the browser's own timestamp for the event, not the frame
 * that later noticed it. A tap before GO was on screen is early, whatever
 * the clock says. Phones, screens and browsers still add their own delay, so
 * the results are game timings to compare with each other, not lab numbers.
 *
 * WAIT and GO differ in word, shape and colour -- a pink octagon that says
 * WAIT, a yellow circle that says GO -- so nobody depends on colour alone.
 * Nothing flashes: GO appears and stays until the tap.
 */

import type { GameHost, HudState } from "../../core/game.ts";
import { drawCity, FONT, label, RR } from "./art.ts";
import {
  judge,
  points,
  summarise,
  TIMEOUT_MS,
  TRIALS,
  waitFor,
  type Trial,
} from "./flash.ts";
import { isAction, type Press } from "./presses.ts";

export const FLASH_BOARD = "flash-point";

/**
 * A key press this soon after a card appears doesn't press its button: it's
 * the tail of the tap that made the card, and would start the next wait
 * before anyone was ready.
 */
const CARD_GUARD_MS = 400;

type Phase = "intro" | "wait" | "go" | "result" | "done";

export class FlashPointGame {
  private readonly host: GameHost;
  private readonly root: HTMLElement;
  private readonly onDone: () => void;
  private phase: Phase = "intro";
  private readonly trials: Trial[] = [];
  private waitLeft = 0;
  /** When the frame showing GO was drawn; null until it has been. */
  private goAt: number | null = null;
  private cardAt = 0;
  private cardAction: (() => void) | null = null;
  private time = 0;

  constructor(host: GameHost, root: HTMLElement, onDone: () => void) {
    this.host = host;
    this.root = root;
    this.onDone = onDone;
    this.showIntro(false);
  }

  // ----- Cards -----

  private card(...children: HTMLElement[]): HTMLElement {
    const card = document.createElement("div");
    card.className = "rr-card";
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.append(...children);
    this.root.replaceChildren(card);
    this.cardAt = performance.now();
    return card;
  }

  private button(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "btn btn--primary";
    button.textContent = text;
    button.addEventListener("click", () => {
      if (this.cardAction === action) this.press();
    });
    this.cardAction = action;
    return button;
  }

  /** The card's button, by tap or by Space/Enter. */
  private press(): void {
    const action = this.cardAction;
    if (!action) return;
    this.cardAction = null;
    this.host.sfx("uiSelect");
    action();
  }

  private text(tag: string, className: string, content: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = content;
    return node;
  }

  private showIntro(interrupted: boolean): void {
    this.phase = "intro";
    this.card(
      this.text("span", "rr-card__label", interrupted ? "PAUSED" : "FLASH POINT"),
      this.text(
        "p",
        "rr-card__text",
        interrupted
          ? "That try didn't count. Go again when you're ready."
          : "Wait for GO, then tap as fast as you can. Don't jump early!",
      ),
      this.text("p", "rr-card__hint", `${TRIALS} TRIES  ·  TAP THE SCREEN, SPACE OR ENTER`),
      this.button(interrupted ? "GO AGAIN" : "START", () => this.startTrial()),
    );
  }

  private startTrial(): void {
    this.root.replaceChildren();
    this.phase = "wait";
    this.waitLeft = waitFor(Math.random);
    this.goAt = null;
  }

  private record(trial: Trial): void {
    this.trials.push(trial);
    this.phase = "result";
    const gained = points(trial);
    if (gained > 0) this.host.addScore(gained);

    const n = this.trials.length;
    const last = n >= TRIALS;
    let big: HTMLElement;
    let note: string;
    if (trial.kind === "hit") {
      this.host.sfx("flashHit");
      big = this.text("span", "rr-card__big", `${trial.ms} ms`);
      note = `+${gained} points`;
    } else if (trial.kind === "early") {
      this.host.sfx("flashEarly");
      this.host.buzz(60);
      big = this.text("span", "rr-card__big rr-card__big--bad", "TOO SOON!");
      note = "Wait for GO. This try scores nothing.";
    } else {
      this.host.sfx("flashEarly");
      big = this.text("span", "rr-card__big rr-card__big--bad", "TOO SLOW");
      note = `No tap within ${TIMEOUT_MS / 1000} seconds of GO.`;
    }

    const parts: HTMLElement[] = [
      this.text("span", "rr-card__label", `TRY ${n} OF ${TRIALS}`),
      big,
      this.text("p", "rr-card__text", note),
    ];
    if (last) parts.push(this.stats());
    parts.push(this.button(last ? "SEE RESULTS" : "NEXT", () => (last ? this.finish() : this.startTrial())));
    this.card(...parts);
  }

  /** The round in three numbers, on the last card. */
  private stats(): HTMLElement {
    const sum = summarise(this.trials);
    const grid = document.createElement("div");
    grid.className = "rr-card__stats";
    const stat = (name: string, value: string) => {
      const cell = this.text("div", "rr-stat", value);
      cell.prepend(this.text("span", "", name));
      return cell;
    };
    grid.append(
      stat("MEDIAN", sum.median === null ? "—" : `${sum.median} ms`),
      stat("FASTEST", sum.best === null ? "—" : `${sum.best} ms`),
      stat("COUNTED", `${sum.times.length} of ${TRIALS}`),
    );
    return grid;
  }

  private finish(): void {
    this.phase = "done";
    this.root.replaceChildren();
    const sum = summarise(this.trials);
    this.host.gameOver({
      boardId: FLASH_BOARD,
      progress: Math.max(1, Math.min(9999, sum.median ?? 1)),
      progressLabel: "Median ms",
      ranked: sum.times.length > 0,
      headline: sum.median === null ? "NO CLEAN TAPS" : `MEDIAN ${sum.median} MS`,
      changeLabel: "PICK ANOTHER GAME",
    });
    this.onDone();
  }

  // ----- Loop -----

  update(dt: number, all: readonly Press[]): void {
    this.time += dt;
    const now = performance.now();
    const presses = all.filter(isAction);

    if (this.phase === "intro" || this.phase === "result") {
      // A tap on the screen doesn't press the card's button -- only the
      // button does, or a fresh Space/Enter.
      if (presses.some((p) => p.via === "key" && p.at - this.cardAt > CARD_GUARD_MS)) this.press();
      return;
    }

    if (this.phase === "wait") {
      if (presses.length > 0) {
        this.record(judge(null));
        return;
      }
      this.waitLeft -= dt;
      if (this.waitLeft <= 0) this.phase = "go";
      return;
    }

    if (this.phase === "go") {
      const first = presses[0];
      if (first) {
        // Before the GO frame was drawn, nobody could have seen it.
        this.record(judge(this.goAt === null ? null : first.at - this.goAt));
        return;
      }
      if (this.goAt !== null && now - this.goAt >= TIMEOUT_MS) this.record({ kind: "miss" });
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    drawCity(ctx, view.w, view.h, view.h - view.insetBottom - 30, 0);
    ctx.fillStyle = "rgba(5,6,26,0.45)";
    ctx.fillRect(0, 0, view.w, view.h);

    const cx = view.w / 2;
    const cy = view.insetTop + (view.h - view.insetTop - view.insetBottom) * 0.4;

    if (this.phase === "go") {
      if (this.goAt === null) this.goAt = performance.now();
      this.drawGo(ctx, cx, cy);
    } else if (this.phase === "wait") {
      this.drawWait(ctx, cx, cy);
    } else {
      this.drawIdle(ctx, cx, cy);
    }
    this.drawTries(ctx, cx, cy + 118);
  }

  private drawWait(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    // A slow breath, so it's plainly alive; still under reduced motion.
    const r = 70 + (this.host.settings.reducedMotion ? 0 : Math.sin(this.time * 2.4) * 2);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#3a0f33";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = RR.pink;
    ctx.stroke();
    ctx.restore();
    label(ctx, "WAIT…", cx, cy, 26, RR.pink);
  }

  private drawGo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    for (const [r, alpha] of [[104, 0.35], [90, 0.7]] as const) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(46,230,255,${alpha})`;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 76, 0, Math.PI * 2);
    ctx.fillStyle = RR.yellow;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = `900 46px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = RR.navy;
    ctx.fillText("GO!", cx, cy + 2);
    ctx.restore();
  }

  /** Between tries: the beacon at rest, dim, so the card is what's read. */
  private drawIdle(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 76, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(46,230,255,0.35)";
    ctx.stroke();
    ctx.restore();
    label(ctx, "FLASH POINT", cx, cy, 18, "rgba(238,243,255,0.6)");
  }

  /** One dot per try: yellow for a counted tap, pink for early or late. */
  private drawTries(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
    for (let i = 0; i < TRIALS; i += 1) {
      const x = cx + (i - (TRIALS - 1) / 2) * 22;
      const t = this.trials[i];
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      if (!t) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = i === this.trials.length ? RR.cyan : "rgba(142,163,200,0.4)";
        ctx.stroke();
      } else {
        ctx.fillStyle = t.kind === "hit" ? RR.yellow : RR.pink;
        ctx.fill();
        if (t.kind !== "hit") {
          // A cross as well as the colour.
          ctx.strokeStyle = RR.navy;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 3, y - 3);
          ctx.lineTo(x + 3, y + 3);
          ctx.moveTo(x + 3, y - 3);
          ctx.lineTo(x - 3, y + 3);
          ctx.stroke();
        }
      }
    }
  }

  hud(): HudState {
    return { lives: 0, progress: Math.min(TRIALS, this.trials.length + 1), progressLabel: "Try" };
  }

  /** A try in progress is invalidated by a pause, so only then is one worth it. */
  pausesWhenHidden(): boolean {
    return this.phase === "wait" || this.phase === "go";
  }

  /** Paused mid-try: that try never happened. Completed ones are kept. */
  onPause(): void {
    if (this.phase === "wait" || this.phase === "go") this.showIntro(true);
  }
}

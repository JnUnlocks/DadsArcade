/**
 * Thumb Storm, on screen. The rules are in type.ts.
 *
 * Typing needs the phone's own keyboard, and only a real text box can call
 * it up, so this game is mostly page rather than canvas: the passage sits at
 * the top of the screen, clear of the keyboard, with an invisible text box
 * laid over it. Tapping the passage is tapping the box, which is what makes
 * the keyboard appear on every phone. Opening the game from the picker's tap
 * focuses it straight away too.
 *
 * The box asks the keyboard to keep out of it: no autocorrect, no capitals,
 * no spellcheck, no suggestions. Some keyboards do it anyway, which is why
 * every change is judged by type.ts and a swipe or a suggestion is undone.
 *
 * The clock starts on the first letter. If the round is interrupted (the
 * pause button, the phone locking), it starts over with a new passage:
 * thirty seconds with a hole in them aren't thirty seconds.
 */

import type { GameHost, HudState } from "../../core/game.ts";
import { drawCity } from "./art.ts";
import { type Press } from "./presses.ts";
import { change, liveWpm, newTyping, passage, result, TYPE_MS, type Typing } from "./type.ts";

export const TYPE_BOARD = "thumb-storm";
export const TYPE_COLOUR = "#4dff9a";

/** How long the round's numbers show before the game-over screen. */
const END_MS = 2200;

type Phase = "ready" | "play" | "end" | "done";

const HINT_START = "Tap the text to bring up your keyboard. The clock starts on your first letter.";
const HINT_TYPING = "Letter by letter. Backspace fixes a mistake.";
const HINT_SWIPE = "Letter by letter only: swipes and suggestions don't count.";
const HINT_AWAY = "Keyboard gone? Tap the text to keep going. The clock is still running!";

export class ThumbStormGame {
  private readonly host: GameHost;
  private readonly root: HTMLElement;
  private readonly onDone: () => void;
  private phase: Phase = "ready";
  private t: Typing;
  private endAt = 0;
  /** When a warning went up, so normal typing can take it down a moment later. */
  private warnedAt = 0;

  private readonly panel: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly box: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly hint: HTMLElement;
  private chars: HTMLSpanElement[] = [];
  private caret = -1;

  constructor(host: GameHost, root: HTMLElement, onDone: () => void) {
    this.host = host;
    this.root = root;
    this.onDone = onDone;
    this.t = newTyping(passage(Math.random));

    this.panel = el("div", "rr-type");
    const top = el("div", "rr-type__top");
    const name = el("span", "rr-type__name", "THUMB STORM");
    this.clock = el("span", "rr-type__clock", `${TYPE_MS / 1000}.0s`);
    this.speed = el("span", "rr-type__speed", "— WPM");
    top.append(name, this.speed, this.clock);

    const field = el("div", "rr-type__field");
    this.box = el("div", "rr-type__text");
    this.box.setAttribute("aria-hidden", "true");
    this.input = document.createElement("input");
    this.input.className = "rr-type__input";
    this.input.type = "text";
    this.input.name = "thumb-storm";
    this.input.autocomplete = "off";
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("autocapitalize", "none");
    this.input.spellcheck = false;
    this.input.inputMode = "text";
    this.input.enterKeyHint = "done";
    this.input.setAttribute("data-1p-ignore", "");
    this.input.setAttribute("data-lpignore", "true");
    this.input.setAttribute("aria-label", "Type the passage shown");
    field.append(this.box, this.input);

    this.hint = el("p", "rr-type__hint", HINT_START);
    this.hint.setAttribute("role", "status");
    this.hint.setAttribute("aria-live", "polite");

    this.panel.append(top, field, this.hint);
    this.root.replaceChildren(this.panel);

    this.input.addEventListener("input", (e) => this.onInput(e.timeStamp));
    this.input.addEventListener("paste", (e) => {
      e.preventDefault();
      this.say(HINT_SWIPE, true);
    });
    this.input.addEventListener("drop", (e) => e.preventDefault());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });
    this.input.addEventListener("blur", () => {
      if (this.phase === "play") this.say(HINT_AWAY, true);
    });
    this.input.addEventListener("focus", () => {
      if (this.phase === "play") this.say(HINT_TYPING, false);
    });

    this.fill();
    // From the picker's own tap this brings the keyboard up at once; when it
    // can't (a phone that wants a tap of its own), the hint says to tap.
    this.input.focus({ preventScroll: true });
  }

  /** Lay the passage out, a span a letter. */
  private fill(): void {
    this.chars = [];
    const frag = document.createDocumentFragment();
    for (const ch of this.t.target) {
      const span = document.createElement("span");
      span.className = "rr-ch";
      span.textContent = ch;
      this.chars.push(span);
      frag.append(span);
    }
    this.box.replaceChildren(frag);
    this.caret = -1;
    this.paint(0, this.t.target.length);
  }

  /** Re-colour letters [from, to) and move the caret. */
  private paint(from: number, to: number): void {
    const { typed, target } = this.t;
    for (let i = Math.max(0, from); i < Math.min(to, target.length); i += 1) {
      const span = this.chars[i]!;
      if (i >= typed.length) span.className = "rr-ch";
      else if (typed[i] === target[i]) span.className = "rr-ch rr-ch--ok";
      else span.className = target[i] === " " ? "rr-ch rr-ch--bad rr-ch--gap" : "rr-ch rr-ch--bad";
    }
    const at = Math.min(typed.length, target.length - 1);
    if (this.caret !== at) {
      this.chars[this.caret]?.classList.remove("rr-ch--cur");
      this.caret = at;
    }
    const cur = this.chars[at];
    if (cur) {
      cur.classList.add("rr-ch--cur");
      // Keep the line being typed second from the top, so the line before is
      // still there to check and the next one is coming into view.
      // Whole lines only, so no line is ever cut in half.
      const line = parseFloat(getComputedStyle(this.box).lineHeight) || 30;
      const row = Math.round(cur.offsetTop / line);
      this.box.scrollTop = Math.max(0, row - 1) * line;
    }
  }

  private onInput(at: number): void {
    if (this.phase !== "ready" && this.phase !== "play") {
      this.input.value = this.t.typed;
      return;
    }
    const before = this.t.typed.length;
    const verdict = change(this.t, this.input.value, at);
    if (verdict !== "ok") {
      // Put the box back exactly as it was judged, caret at the end.
      this.input.value = this.t.typed;
      if (verdict === "many" || verdict === "swap") {
        this.say(HINT_SWIPE, true);
        this.host.buzz(40);
      }
      return;
    }
    if (this.input.value !== this.t.typed) this.input.value = this.t.typed;
    if (this.phase === "ready" && this.t.start !== null) {
      this.phase = "play";
      this.say(HINT_TYPING, false);
    }
    const after = this.t.typed.length;
    if (this.phase === "play" && this.hint.classList.contains("rr-type__hint--warn") && at - this.warnedAt > 1500) {
      this.say(HINT_TYPING, false);
    }
    if (after > before) {
      const i = after - 1;
      if (this.t.typed[i] !== this.t.target[i]) this.host.buzz(12);
    }
    this.paint(Math.min(before, after), Math.max(before, after) + 1);
  }

  private say(text: string, warn: boolean): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle("rr-type__hint--warn", warn);
    if (warn) this.warnedAt = performance.now();
  }

  // ----- Loop -----

  update(_dt: number, _presses: readonly Press[]): void {
    const now = performance.now();
    if (this.phase === "play" && this.t.deadline !== null) {
      const left = Math.max(0, this.t.deadline - now);
      this.clock.textContent = `${(left / 1000).toFixed(1)}s`;
      this.clock.classList.toggle("rr-type__clock--low", left < 5000);
      const live = liveWpm(this.t, now);
      this.speed.textContent = live === null ? "— WPM" : `${live} WPM`;
      if (left <= 0) this.end(now);
      return;
    }
    if (this.phase === "end" && now >= this.endAt) this.finish();
  }

  private end(now: number): void {
    this.phase = "end";
    this.endAt = now + END_MS;
    this.input.disabled = true;
    this.input.blur();
    this.host.sfx("roundClear");
    const r = result(this.t);
    if (r.wpm > 0) this.host.addScore(r.wpm);
    this.clock.textContent = "0.0s";
    this.speed.textContent = `${r.wpm} WPM`;

    const card = el("div", "rr-type__result");
    card.append(
      el("span", "rr-type__big", `${r.wpm} WPM`),
      el(
        "span",
        "rr-type__line",
        `${r.accuracy}% ACCURACY  ·  ${r.correct} RIGHT  ·  ${r.wrong} WRONG`,
      ),
    );
    this.hint.replaceWith(card);
  }

  private finish(): void {
    this.phase = "done";
    const r = result(this.t);
    this.host.gameOver({
      boardId: TYPE_BOARD,
      progress: Math.max(1, r.accuracy),
      progressLabel: "Accuracy %",
      ranked: r.wpm > 0,
      durationMs: TYPE_MS,
      headline: `${r.wpm} WPM · ${r.accuracy}% ACCURACY`,
      changeLabel: "PICK ANOTHER GAME",
    });
    this.root.replaceChildren();
    this.onDone();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { view } = this.host;
    drawCity(ctx, view.w, view.h, view.h - view.insetBottom - 20, 0);
    ctx.fillStyle = "rgba(6,10,26,0.55)";
    ctx.fillRect(0, 0, view.w, view.h);
  }

  hud(): HudState {
    const live = liveWpm(this.t, performance.now());
    return { lives: 0, progress: live ?? 0, progressLabel: "WPM" };
  }

  pausesWhenHidden(): boolean {
    return this.phase === "play";
  }

  /** Interrupted mid-round: nothing is kept, and a fresh passage waits. */
  onPause(): void {
    if (this.phase !== "play") return;
    this.phase = "ready";
    this.t = newTyping(passage(Math.random));
    this.input.value = "";
    this.input.blur();
    this.clock.textContent = `${TYPE_MS / 1000}.0s`;
    this.clock.classList.remove("rr-type__clock--low");
    this.speed.textContent = "— WPM";
    this.fill();
    this.say(`That round was interrupted, so it starts over. ${HINT_START}`, true);
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

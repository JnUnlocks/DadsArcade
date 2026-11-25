/**
 * One two-minute round of Fact Frenzy, with no DOM: the clock, the score and
 * what a tap does.
 *
 * A point is a correct FIRST tap. After a miss the wrong answer goes dark, the
 * clock stops for a few seconds while Digit shows the hint, and the fact
 * stays until it's answered -- a child always finishes the fact they were
 * stuck on, but a guess-until-it-works never scores. The fact they missed
 * comes round again a few facts later, which is where the learning happens.
 */

import type { Rng } from "../../core/rng.ts";
import type { Deck, Fact } from "./decks.ts";

export const ROUND_SECONDS = 120;

/** How long a miss stops the clock: long enough to look at the hint. */
export const HINT_SECONDS = 6;

/** Facts that can't come round again until this many others have. */
const NO_REPEAT = 8;

export type TapResult =
  /** Right first time: a point. */
  | "right"
  /** Right after a miss: on to the next fact, no point. */
  | "fixed"
  /** Wrong. The fact stays. */
  | "wrong"
  /** Not a tap that counts: an answer already tried, or the round is over. */
  | "ignored";

export class Round {
  readonly deck: Deck;
  private readonly rng: Rng;
  timeLeft = ROUND_SECONDS;
  score = 0;
  /** Facts finished, right first time or not. */
  answered = 0;
  fact: Fact;
  /** True once the current fact has been missed. */
  missedThis = false;
  /** Answers already tried on the current fact. */
  readonly tried = new Set<string>();
  /** Every fact missed this round, once each, in the order they came. */
  readonly missed: Fact[] = [];
  private hintClock = 0;
  private readonly recent: string[] = [];
  /** A missed fact waiting to come round again, and how many facts until it does. */
  private comeback: { fact: Fact; after: number } | null = null;

  constructor(deck: Deck, rng: Rng) {
    this.deck = deck;
    this.rng = rng;
    this.fact = this.deal();
  }

  get finished(): boolean {
    return this.timeLeft <= 0;
  }

  /** True while a miss is holding the clock. */
  get clockHeld(): boolean {
    return this.missedThis && this.hintClock < HINT_SECONDS;
  }

  tick(dt: number): void {
    if (this.finished) return;
    let left = dt;
    if (this.clockHeld) {
      const held = Math.min(left, HINT_SECONDS - this.hintClock);
      this.hintClock += held;
      left -= held;
    }
    this.timeLeft = Math.max(0, this.timeLeft - left);
  }

  tap(choice: string): TapResult {
    if (this.finished || this.tried.has(choice)) return "ignored";
    if (choice !== this.fact.answer) {
      this.tried.add(choice);
      if (!this.missedThis) {
        this.missedThis = true;
        if (!this.missed.some((f) => f.key === this.fact.key)) this.missed.push(this.fact);
        this.comeback = { fact: this.fact, after: this.rng.int(3, 5) };
      }
      return "wrong";
    }
    const result: TapResult = this.missedThis ? "fixed" : "right";
    if (result === "right") this.score += 1;
    this.answered += 1;
    this.fact = this.deal();
    return result;
  }

  private deal(): Fact {
    this.missedThis = false;
    this.hintClock = 0;
    this.tried.clear();

    let fact: Fact | null = null;
    if (this.comeback) {
      this.comeback.after -= 1;
      if (this.comeback.after <= 0) {
        fact = this.comeback.fact;
        this.comeback = null;
      }
    }
    if (!fact) {
      for (let guard = 0; guard < 30; guard += 1) {
        fact = this.deck.make(this.rng);
        if (!this.recent.includes(fact.key)) break;
      }
    }
    this.recent.push(fact!.key);
    if (this.recent.length > NO_REPEAT) this.recent.shift();
    return fact!;
  }
}

/** "1:24" */
export function clockText(seconds: number): string {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

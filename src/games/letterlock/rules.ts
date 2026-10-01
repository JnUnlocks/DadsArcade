/**
 * Letter Lock's rules: marking a guess, picking the day's word, and scoring.
 *
 * No DOM and no canvas, so every rule that can be got wrong has a test beside
 * it (rules.test.ts). Three of them are easy to get wrong:
 *
 *   - Repeated letters. A guess with two Ls against a word with one must light
 *     up one L, not both, and a letter in the right spot has first claim on it.
 *   - The daily word. Picking at random from the day's seed repeats a word
 *     within weeks (the birthday problem, with 1,200 words). The day instead
 *     indexes a shuffle that never changes, so nothing comes round again until
 *     every word has had its day.
 *   - Midnight. The day is the *local* date, like every other daily here.
 */

import { Rng } from "../../core/rng.ts";
import { ANSWERS } from "./words.ts";

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/**
 * What one tile says about its letter:
 *   locked  right letter, right spot
 *   close   in the word, but somewhere else
 *   out     not in the word (or no more of them than already shown)
 */
export type Mark = "locked" | "close" | "out";

// ----- Marking a guess -----

/**
 * Mark each letter of `guess` against `answer`. Both lower case, same length.
 *
 * Two passes, because the order matters when a letter repeats. First every
 * letter in the right spot is locked and uses up that letter of the answer.
 * Then, left to right, a letter is `close` only while the answer still has an
 * unclaimed one. So LLAMA against HELLO marks both Ls close (HELLO has two),
 * and a third L would be out.
 */
export function markGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = new Array<Mark>(guess.length).fill("out");
  const spare = new Map<string, number>();

  for (let i = 0; i < guess.length; i += 1) {
    if (guess[i] === answer[i]) {
      marks[i] = "locked";
    } else {
      const letter = answer[i]!;
      spare.set(letter, (spare.get(letter) ?? 0) + 1);
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (marks[i] === "locked") continue;
    const left = spare.get(guess[i]!) ?? 0;
    if (left > 0) {
      marks[i] = "close";
      spare.set(guess[i]!, left - 1);
    }
  }
  return marks;
}

const RANK: Record<Mark, number> = { out: 0, close: 1, locked: 2 };

/**
 * The best thing learned about each letter so far, for the keyboard. A letter
 * that has been locked once stays locked on its key, even if a later guess
 * put it somewhere it was only close.
 */
export function bestMarks(guesses: readonly string[], answer: string): Map<string, Mark> {
  const best = new Map<string, Mark>();
  for (const guess of guesses) {
    const marks = markGuess(guess, answer);
    for (let i = 0; i < guess.length; i += 1) {
      const letter = guess[i]!;
      const mark = marks[i]!;
      const known = best.get(letter);
      if (!known || RANK[mark] > RANK[known]) best.set(letter, mark);
    }
  }
  return best;
}

export function isSolved(guesses: readonly string[], answer: string): boolean {
  return guesses.length > 0 && guesses[guesses.length - 1] === answer;
}

/** Solved, or out of tries. */
export function isOver(guesses: readonly string[], answer: string): boolean {
  return isSolved(guesses, answer) || guesses.length >= MAX_GUESSES;
}

// ----- The day's word -----

/** Salts this game's shuffle so no two daily challenges ever correlate. */
export const SEED_SALT = 0x4c4f434b;

/**
 * Day zero of the schedule, as a `dailySeed()` day number: 1 October 2026,
 * the day the game shipped. Fixed for all time -- moving it would shift every
 * day's word.
 */
export const EPOCH_DAY = Date.UTC(2026, 9, 1) / 86_400_000;

/** One pass through every answer, in an order fixed by the salt and the lap. */
function lapOrder(lap: number, answers: readonly string[]): string[] {
  const rng = new Rng((SEED_SALT + lap) >>> 0);
  const order = answers.slice();
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const held = order[i]!;
    order[i] = order[j]!;
    order[j] = held;
  }
  return order;
}

/**
 * The word for a day, where `day` is `dailySeed(date)` -- the local calendar
 * day as a whole number.
 *
 * The list is shuffled once and walked a day at a time, so a word cannot come
 * back until all of them have been used: more than three years. After that it
 * starts a new lap with a new shuffle, and the one way that could repeat a
 * word on consecutive days (the last word of one lap opening the next) is
 * swapped out of the way.
 */
export function dailyWord(day: number, answers: readonly string[] = ANSWERS): string {
  const count = answers.length;
  const since = Math.floor(day) - EPOCH_DAY;
  const lap = Math.floor(since / count);
  const index = since - lap * count;

  const order = lapOrder(lap, answers);
  if (count > 2) {
    const previous = lapOrder(lap - 1, answers);
    if (order[0] === previous[count - 1]) {
      order[0] = order[1]!;
      order[1] = previous[count - 1]!;
    }
  }
  return order[index]!;
}

/**
 * A word for Free Play or Practice. Never the day's own word: a practice round
 * shouldn't hand anyone the answer to the puzzle the family is comparing.
 */
export function randomWord(
  random: () => number,
  avoid = "",
  answers: readonly string[] = ANSWERS,
): string {
  const pool = answers.length > 1 ? answers.filter((word) => word !== avoid) : answers;
  return pool[Math.floor(random() * pool.length)] ?? pool[0]!;
}

// ----- Scoring -----

/** What a first-guess solve is worth; each guess after it costs a step. */
export const FIRST_GUESS_POINTS = 1500;
export const POINTS_PER_EXTRA_GUESS = 200;

/** The speed bonus only ever adds: full inside FAST, gone by SLOW. */
export const SPEED_POINTS = 200;
const FAST_SECONDS = 60;
const SLOW_SECONDS = 360;

export function speedBonus(seconds: number): number {
  const t = (SLOW_SECONDS - seconds) / (SLOW_SECONDS - FAST_SECONDS);
  return Math.round(SPEED_POINTS * Math.max(0, Math.min(1, t)));
}

/**
 * Points for a solve in `guesses` tries.
 *
 * A guess is worth as much as the whole speed bonus, so thinking for five
 * minutes and saving a try always beats typing fast and spending one. A miss
 * scores nothing and is never sent to the board, so there is no row for it.
 */
export function scoreSolve(guesses: number, seconds: number): number {
  const used = Math.max(1, Math.min(MAX_GUESSES, Math.round(guesses)));
  return FIRST_GUESS_POINTS - (used - 1) * POINTS_PER_EXTRA_GUESS + speedBonus(seconds);
}

/**
 * The text a finished daily word sends to the family chat.
 *
 *   Dad's Arcade · Letter Lock · Oct 2 · 4/6
 *   ⬛🟧⬛⬛⬛
 *   ⬛⬛🟦🟧⬛
 *   🟦⬛🟦⬛🟦
 *   🟦🟦🟦🟦🟦
 *   🔥 3-day streak
 *   https://…/?play=letter-lock
 *
 * It has to be spoiler-free, because the whole family is working on the same
 * word. So this module is never given a letter: it takes the marks and nothing
 * else, which makes "it can't leak the word" a property of the types rather
 * than something to remember. One row per guess -- blue for a letter locked in
 * place, orange for one that's in the word but elsewhere, black for one that
 * isn't. The picture is the story of the solve; the "4/6" is the score people
 * actually compare.
 *
 * Pure, so the wording can be tested without a browser.
 */

import { shortDate } from "../../core/rng.ts";
import { MAX_GUESSES, type Mark } from "./rules.ts";

const SQUARE: Record<Mark, string> = { locked: "🟦", close: "🟧", out: "⬛" };

export interface ShareableResult {
  /** One row of marks per guess made, in order. */
  rows: ReadonlyArray<readonly Mark[]>;
  solved: boolean;
}

export function dailyShareText(
  result: ShareableResult,
  dateKey: string,
  streak: number,
  link: string,
): string {
  const tally = `${result.solved ? result.rows.length : "X"}/${MAX_GUESSES}`;
  const lines = [`Dad's Arcade · Letter Lock · ${shortDate(dateKey)} · ${tally}`];
  for (const row of result.rows) lines.push(row.map((mark) => SQUARE[mark]).join(""));
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push(link);
  return lines.join("\n");
}

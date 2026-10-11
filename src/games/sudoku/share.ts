/**
 * The text a finished daily Sudoku sends to the family chat.
 *
 *   Dad's Arcade · Uncle Potato Head's Sudoku · Oct 3 · HARD
 *   ⏱ 8:42 · 1 slip · no hints
 *   🟩🟩🟥
 *   🟩🟨🟩
 *   🟩🟩🟩
 *   🔥 3-day streak
 *   https://…/?play=sudoku
 *
 * Spoiler-free, because everyone is working on the same grid: this module is
 * never given a digit. The picture is the nine boxes -- green for one solved
 * clean, yellow where a hint went in, red where a wrong digit did.
 *
 * Pure, so the wording can be tested without a browser.
 */

import { shortDate } from "../../core/rng.ts";
import type { Difficulty } from "./generate.ts";
import { formatClock, type BoxMark } from "./rules.ts";

/** Who runs the cabinet, and what it's called everywhere it's named. */
export const HOST_NAME = "Uncle Potato Head";
export const GAME_NAME = `${HOST_NAME} Number Game`;

export interface ShareableResult {
  difficulty: Difficulty;
  /** Nine marks, one per box in reading order. */
  boxes: readonly BoxMark[];
  /** The clock with every penalty already added. */
  seconds: number;
  mistakes: number;
  hints: number;
}

const SQUARE: Record<BoxMark, string> = { clean: "🟩", helped: "🟨", slipped: "🟥" };

function count(n: number, one: string, many: string): string {
  return n === 0 ? `no ${many}` : `${n} ${n === 1 ? one : many}`;
}

export function dailyShareText(
  result: ShareableResult,
  dateKey: string,
  streak: number,
  link: string,
): string {
  const lines = [
    `Dad's Arcade · ${HOST_NAME}'s Sudoku · ${shortDate(dateKey)} · ${result.difficulty.toUpperCase()}`,
    `⏱ ${formatClock(result.seconds)} · ${count(result.mistakes, "slip", "slips")} · ${count(result.hints, "hint", "hints")}`,
  ];
  for (let row = 0; row < 3; row += 1) {
    lines.push(
      result.boxes
        .slice(row * 3, row * 3 + 3)
        .map((mark) => SQUARE[mark])
        .join(""),
    );
  }
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push(link);
  return lines.join("\n");
}

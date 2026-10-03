/**
 * The text a finished daily crossword sends to the family chat.
 *
 *   Dad's Arcade · Mom Mom's Crossword · Oct 3
 *   ⏱ 8:42 · 2 hints
 *   ⬜⬜⬜⬜⬜⬛⬜⬛⬜⬜⬜
 *   ⬜⬛⬛⬛🟨⬛⬜⬛⬜⬛⬜
 *   …
 *   🔥 3-day streak
 *   https://…/?play=crossword
 *
 * Spoiler-free, because everyone is working on the same grid: this module is
 * never given a letter. It gets the shape of the grid -- which is the same for
 * the whole family, so it gives nothing away -- and which squares were filled
 * in by a hint. The picture is today's grid with the helped squares in yellow.
 *
 * Pure, so the wording can be tested without a browser.
 */

import { shortDate } from "../../core/rng.ts";
import { formatClock } from "./rules.ts";

/** What the cabinet is called, everywhere it's named. */
export const GAME_NAME = "Mom Mom's Crossword";

export type ShareSquare = "black" | "helped" | "clean";

export interface ShareableResult {
  size: number;
  /** One entry per square: black, filled by a hint, or solved unaided. */
  squares: readonly ShareSquare[];
  /** The clock with every hint's penalty already added. */
  seconds: number;
  hints: number;
}

const SQUARE: Record<ShareSquare, string> = { black: "⬛", helped: "🟨", clean: "⬜" };

export function dailyShareText(
  result: ShareableResult,
  dateKey: string,
  streak: number,
  link: string,
): string {
  const help =
    result.hints === 0 ? "no hints" : `${result.hints} ${result.hints === 1 ? "hint" : "hints"}`;
  const lines = [
    `Dad's Arcade · ${GAME_NAME} · ${shortDate(dateKey)}`,
    `⏱ ${formatClock(result.seconds)} · ${help}`,
  ];
  for (let row = 0; row < result.size; row += 1) {
    lines.push(
      result.squares
        .slice(row * result.size, (row + 1) * result.size)
        .map((square) => SQUARE[square])
        .join(""),
    );
  }
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push(link);
  return lines.join("\n");
}

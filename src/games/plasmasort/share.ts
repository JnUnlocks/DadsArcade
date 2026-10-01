/**
 * The text a solved daily puzzle sends to the family chat.
 *
 *   Dad's Arcade · Plasma Sort · Oct 1
 *   🟥🟧🟨🟩🟦🟪⬛⬛⬛
 *   ⭐⭐ 17 pours, par 14 · 2:41
 *   🔥 5-day streak
 *   https://…/?play=plasma-sort
 *
 * It has to be spoiler-free, because the whole family is playing the same
 * deal. So it never says which colour went where or in what order: the six
 * coloured squares are the six tubes you sorted, the same for everyone, and
 * each black square after them is one pour over par. A perfect solve is a
 * clean rainbow; a long tail is visible from across the room. That's the
 * comparison people actually make in a chat, so it's the one the picture
 * shows, and the numbers underneath are there for whoever wants them.
 *
 * Pure, so the wording can be tested without a browser.
 */

import { shortDate } from "../../core/rng.ts";
import type { DailyResult } from "./progress.ts";
import { starsFor } from "./puzzle.ts";

// Letter Lock dates its results the same way, so the helper lives in core now.
export { shortDate };

/** One square per tube sorted. Rainbow order reads as "done" at a glance. */
const SORTED = "🟥🟧🟨🟩🟦🟪";
const WASTED = "⬛";
/** Past this many black squares the line wraps on a phone; the number says the rest. */
const MAX_WASTED = 10;

export function dailyShareText(
  result: DailyResult,
  dateKey: string,
  streak: number,
  link: string,
): string {
  const over = Math.max(0, result.pours - result.par);
  const tail = WASTED.repeat(Math.min(over, MAX_WASTED)) + (over > MAX_WASTED ? "+" : "");
  const stars = "⭐".repeat(starsFor(result.pours, result.par));

  const lines = [
    `Dad's Arcade · Plasma Sort · ${shortDate(dateKey)}`,
    SORTED + tail,
    `${stars} ${result.pours} pours, par ${result.par} · ${clock(result.seconds)}`,
  ];
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push(link);
  return lines.join("\n");
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Today's Daily Drop on this device: whether it's been started, where it was
 * left, and what it scored. And the text a finished one sends to the family
 * chat.
 *
 * One go counts. The attempt is saved the moment it starts and as it goes,
 * so closing the app, a phone call or a refresh carries on where it was
 * rather than handing out a fresh try. Once the cabinet fills, the score is
 * kept and any more goes that day are practice.
 *
 * Pure apart from the two localStorage calls, so the rules can be tested.
 */

import { shortDate } from "../../core/rng.ts";
import { prize, TOP_TIER } from "./prizes.ts";
import { DAILY_RULES, type RunSnapshot } from "./rules.ts";

const KEY = "hyperdrive.prizedrop.daily";

export type DailyRecord =
  | { date: string; rules: number; status: "playing"; snap: RunSnapshot }
  | { date: string; rules: number; status: "done"; score: number; bestTier: number };

/** Kept in memory too, for a browser that won't store anything. */
let memory: DailyRecord | null = null;

/** Today's record, or null if today's drop hasn't been started (or was started under other rules). */
export function loadDaily(dateKey: string): DailyRecord | null {
  let record: DailyRecord | null = memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) record = JSON.parse(raw) as DailyRecord;
  } catch {
    // Fall back to what this visit has seen.
  }
  return todays(record, dateKey);
}

/** A record counts only for the day and the rules it was made on. */
export function todays(record: DailyRecord | null, dateKey: string): DailyRecord | null {
  if (!record || typeof record !== "object") return null;
  if (record.date !== dateKey || record.rules !== DAILY_RULES) return null;
  if (record.status === "done") {
    return Number.isFinite(record.score) && Number.isFinite(record.bestTier) ? record : null;
  }
  return record.status === "playing" && record.snap ? record : null;
}

export function saveDaily(record: DailyRecord): void {
  memory = record;
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Kept in memory until the arcade closes.
  }
}

/**
 * The share text, spoiler-free: the ladder as squares, lit up to the best
 * prize made, never which prizes came in which order.
 *
 *   Dad's Arcade · Prize Drop · Nov 15
 *   🏆 2,345 · best prize: Beep Bot
 *   🟩🟩🟩🟩🟩🟩⬛⬛⬛⬛
 *   🔥 3-day streak
 *   https://…/?play=prize-drop
 */
export function dailyShareText(
  score: number,
  bestTier: number,
  dateKey: string,
  streak: number,
  link: string,
): string {
  const tier = Math.max(1, Math.min(TOP_TIER, bestTier));
  const lines = [
    `Dad's Arcade · Prize Drop · ${shortDate(dateKey)}`,
    `🏆 ${score.toLocaleString("en-US")} · best prize: ${prize(tier).name}`,
    "🟩".repeat(tier) + "⬛".repeat(TOP_TIER - tier),
  ];
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push("Can you beat my drop?");
  lines.push(link);
  return lines.join("\n");
}

/**
 * Daily Charge: one shared puzzle a day per path, dated by the New York
 * calendar.
 *
 * Every other daily in the arcade turns over at local midnight. This one
 * deliberately doesn't: the family is spread across time zones and travels,
 * and the point of Daily Charge is that everyone gets the same board on the
 * same day. A fixed calendar is the only way a grandparent in Florida and a
 * cousin on holiday in California are on the same puzzle at breakfast.
 *
 * The day is read off a time-zone-aware calendar (Intl), never by slicing a
 * UTC timestamp, which would turn the day over at 7 or 8 in the evening.
 */

import type { Difficulty, Pack } from "./types.ts";

export const DAILY_TIME_ZONE = "America/New_York";

let formatter: Intl.DateTimeFormat | null | undefined;

function newYorkFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: DAILY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    // A browser without time-zone data.
    formatter = null;
  }
  return formatter;
}

/** Today's Daily Charge date, YYYY-MM-DD in New York. */
export function dailyDate(now: Date = new Date()): string {
  const format = newYorkFormatter();
  if (format) {
    const parts = format.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)) {
      return `${year}-${month}-${day}`;
    }
  }
  return dailyDateByRule(now);
}

/**
 * The same answer without Intl, from the US daylight-saving rule (since
 * 2007): EDT, UTC-4, from 2 a.m. on the second Sunday of March to 2 a.m. on
 * the first Sunday of November; EST, UTC-5, the rest of the year. Exported
 * so the tests can hold the two methods to each other.
 */
export function dailyDateByRule(now: Date): string {
  const ms = now.getTime();
  const year = now.getUTCFullYear();
  // 2 a.m. EST (07:00 UTC) on the second Sunday of March.
  const dstStart = Date.UTC(year, 2, nthSunday(year, 2, 2), 7);
  // 2 a.m. EDT (06:00 UTC) on the first Sunday of November.
  const dstEnd = Date.UTC(year, 10, nthSunday(year, 10, 1), 6);
  const offsetHours = ms >= dstStart && ms < dstEnd ? -4 : -5;
  return new Date(ms + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** Day of the month of the nth Sunday of a (0-based) month. */
function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

/** Today's puzzle id for a path, or null if this pack has no puzzle for it. */
export function dailyPuzzleId(pack: Pack, date: string, difficulty: Difficulty): string | null {
  const id = pack.daily[date]?.[difficulty];
  return id && pack.puzzles[id] ? id : null;
}

/** The last date this pack covers, for the help text. */
export function lastDailyDate(pack: Pack): string | null {
  const dates = Object.keys(pack.daily).sort();
  return dates[dates.length - 1] ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-21" -> "Oct 21, 2026". */
export function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const name = MONTHS[(month ?? 0) - 1];
  return name && day && year ? `${name} ${day}, ${year}` : date;
}

export interface DailyResult {
  date: string;
  difficulty: Difficulty;
  stars: number;
  hints: number;
  bonusWords: number;
}

/**
 * What SHARE sends. Built only from the result -- never the words -- so a
 * shared Daily Charge can't spoil the board for anyone yet to play it.
 */
export function shareText(result: DailyResult, link: string): string {
  const stars = "⭐".repeat(Math.max(1, Math.min(3, result.stars)));
  const hints = `${result.hints} ${result.hints === 1 ? "hint" : "hints"}`;
  const bonus = `${result.bonusWords} bonus ${result.bonusWords === 1 ? "word" : "words"}`;
  const path = result.difficulty === "family" ? "Family" : "Challenge";
  return [
    "⚡ Dad's Arcade · Word Voltage",
    `Daily Charge · ${longDate(result.date)} · ${path}`,
    `${stars} · ${hints} · ${bonus}`,
    "Connect letters. Charge up.",
    link,
  ].join("\n");
}

/**
 * When the menu offers a daily reminder.
 *
 * The reminder switch lives at the foot of the streak screen, and by November
 * one device in the arcade had found it. So the menu now offers it, once, at
 * the moment it means the most: someone who has come back on another day has
 * just finished a daily puzzle. Not on a first visit, when a request for
 * notifications is the fastest way to lose someone; not twice in a day; and
 * never again after it has been turned down three times.
 *
 * Pure, so it can be tested; core/storage.ts keeps what it reads.
 */

import type { DayLog } from "./streak.ts";

/** Times "not now" can be said before the menu stops asking. */
export const MAX_DECLINES = 3;

export interface OfferMemory {
  /** The last day it was offered. */
  shownOn: string;
  declines: number;
}

export function shouldOfferReminder(
  log: DayLog,
  today: string,
  memory: OfferMemory,
  remindersOn: boolean,
): boolean {
  if (remindersOn) return false;
  if (memory.declines >= MAX_DECLINES) return false;
  if (memory.shownOn === today) return false;
  // A daily finished today, and dailies on at least one other day too.
  const days = Object.keys(log).filter((day) => (log[day]?.length ?? 0) > 0);
  return days.includes(today) && days.length >= 2;
}

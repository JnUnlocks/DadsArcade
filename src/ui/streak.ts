/**
 * The daily streak: the strip at the top of the menu, and the screen it opens.
 *
 * The strip takes the place of the menu's "Pick your machine." line rather
 * than adding a row, because the menu already fills a phone and one more row
 * would push the cabinets into scrolling. Everything else -- which dailies
 * are done, the shields, the last four weeks, the trophies -- lives on the
 * screen behind it, one tap away and never in the way.
 *
 * The rules themselves are in core/streak.ts.
 */

import type { GameModule } from "../core/game";
import { dailyKey, previousDailyKey } from "../core/rng";
import {
  DAILIES_NEEDED,
  type DayLog,
  MAX_SHIELDS,
  MILESTONES,
  nextMilestone,
  SHIELD_EVERY,
  type StreakState,
} from "../core/streak";

/** Days shown on the calendar: four whole weeks, ending today. */
const CALENDAR_DAYS = 28;

function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "S"}`;

/** What the menu strip says. Short enough for one line on a 360px phone. */
export function stripText(state: StreakState): string {
  const done = Math.min(state.doneToday.length, DAILIES_NEEDED);
  if (state.litToday) return `🔥 ${plural(state.count, "DAY")} · TODAY ✓`;
  if (state.count > 0) return `🔥 ${plural(state.count, "DAY")} · ${done} OF ${DAILIES_NEEDED} TODAY`;
  if (done > 0) return `🔥 DAILY STREAK · ${done} OF ${DAILIES_NEEDED} TODAY`;
  return `🔥 DAILY STREAK · PLAY ${DAILIES_NEEDED} DAILIES`;
}

/** The menu strip. `cheer` plays its one-off animation for a day just lit. */
export function buildStreakStrip(
  state: StreakState,
  cheer: boolean,
  onOpen: () => void,
): HTMLElement {
  const strip = el("button", "streak-strip");
  if (state.litToday) strip.classList.add("streak-strip--lit");
  if (state.atRisk) strip.classList.add("streak-strip--risk");
  if (cheer) strip.classList.add("streak-strip--cheer");

  strip.append(el("span", "streak-strip-text", stripText(state)));
  if (state.shields > 0) {
    strip.append(el("span", "streak-strip-shields", "🛡".repeat(state.shields)));
  }
  strip.setAttribute(
    "aria-label",
    `Daily streak: ${state.count} days. ` +
      `${Math.min(state.doneToday.length, DAILIES_NEEDED)} of ${DAILIES_NEEDED} dailies done today. ` +
      `${state.shields} shields. Open the streak.`,
  );
  strip.addEventListener("click", onOpen);
  return strip;
}

/** The streak screen. `onPlay` opens a daily game from its row. */
export function buildStreakScreen(
  state: StreakState,
  log: DayLog,
  dailies: readonly GameModule[],
  onPlay: (game: GameModule) => void,
  onBack: () => void,
  /** Shown above BACK: the daily reminder switch (ui/reminders.ts). */
  extra?: HTMLElement,
): HTMLElement {
  const screen = el("div", "screen screen--streak");
  screen.append(el("h2", "", "DAILY STREAK"));

  // ----- The number -----
  const head = el("div", "streak-head");
  head.append(
    el("span", "streak-flame", state.count > 0 ? "🔥" : "🕯️"),
    el("span", "streak-count", String(state.count)),
    el("span", "streak-unit", state.count === 1 ? "DAY" : "DAYS"),
  );
  screen.append(head);

  const status = state.litToday
    ? "Today's done. See you tomorrow!"
    : state.count > 0
      ? `Finish ${DAILIES_NEEDED - Math.min(state.doneToday.length, DAILIES_NEEDED)} more today to keep it going.`
      : `Finish any ${DAILIES_NEEDED} daily puzzles today to start one.`;
  screen.append(el("p", "streak-status", status));
  if (state.best > state.count) {
    screen.append(el("p", "streak-best", `Your best: ${plural(state.best, "DAY")}`));
  }

  // ----- Today's dailies -----
  screen.append(el("h3", "streak-heading", `TODAY · ${Math.min(state.doneToday.length, DAILIES_NEEDED)} OF ${DAILIES_NEEDED}`));
  const list = el("div", "streak-dailies");
  for (const game of dailies) {
    const done = state.doneToday.includes(game.id);
    const row = el("button", done ? "streak-daily streak-daily--done" : "streak-daily");
    row.style.setProperty("--cabinet-accent", game.accent);
    row.append(el("span", "streak-daily-mark", done ? "✓" : ""), el("span", "streak-daily-name", game.title));
    row.setAttribute("aria-label", `${game.title}. ${done ? "Done today." : "Not played today."} Open it.`);
    row.addEventListener("click", () => onPlay(game));
    list.append(row);
  }
  screen.append(list);

  // ----- Shields -----
  screen.append(el("h3", "streak-heading", "SHIELDS"));
  const shields = el("p", "streak-shields");
  shields.append(
    el(
      "span",
      "streak-shield-icons",
      "🛡".repeat(state.shields) + "·".repeat(MAX_SHIELDS - state.shields),
    ),
    el(
      "span",
      "",
      ` Every ${SHIELD_EVERY} days in a row earns a shield, up to ${MAX_SHIELDS}. Miss a day and one is used by itself.`,
    ),
  );
  screen.append(shields);

  // ----- Four weeks -----
  screen.append(el("h3", "streak-heading", "LAST FOUR WEEKS"));
  screen.append(buildCalendar(state, log));

  // ----- Trophies -----
  screen.append(el("h3", "streak-heading", "TROPHIES"));
  const shelf = el("div", "streak-trophies");
  for (const days of MILESTONES) {
    const earned = state.best >= days;
    const trophy = el("span", earned ? "streak-trophy streak-trophy--earned" : "streak-trophy");
    trophy.append(el("span", "streak-trophy-icon", earned ? "🏆" : "🔒"), el("span", "", String(days)));
    trophy.setAttribute("aria-label", `${days}-day trophy${earned ? ", earned" : ""}`);
    shelf.append(trophy);
  }
  screen.append(shelf);
  const next = nextMilestone(state.best);
  if (next !== null) {
    const togo = next - state.count;
    screen.append(
      el("p", "streak-best", togo > 0 && state.count > 0 ? `${togo} more day${togo === 1 ? "" : "s"} to the ${next}-day trophy` : `Next trophy: ${next} days in a row`),
    );
  }

  screen.append(
    el(
      "p",
      "streak-rules",
      "Only the daily puzzles count, and won or lost doesn't matter. Each game keeps its own streak as well. It's kept on this phone.",
    ),
  );

  if (extra) screen.append(extra);

  const back = el("button", "btn btn--ghost", "BACK");
  back.addEventListener("click", onBack);
  screen.append(back);
  return screen;
}

function buildCalendar(state: StreakState, log: DayLog): HTMLElement {
  const today = dailyKey();
  const days: string[] = [today];
  while (days.length < CALENDAR_DAYS) days.unshift(previousDailyKey(days[0]!));

  const grid = el("div", "streak-calendar");
  grid.setAttribute("role", "img");
  let lit = 0;
  for (const key of days) {
    const count = log[key]?.length ?? 0;
    const cell = el("span", "streak-day");
    if (count >= DAILIES_NEEDED) {
      cell.classList.add("streak-day--lit");
      cell.textContent = "🔥";
      lit += 1;
    } else if (state.shieldDays.includes(key)) {
      cell.classList.add("streak-day--shield");
      cell.textContent = "🛡";
    } else {
      cell.textContent = String(Number(key.slice(8)));
    }
    if (key === today) cell.classList.add("streak-day--today");
    grid.append(cell);
  }
  grid.setAttribute("aria-label", `${lit} of the last ${CALENDAR_DAYS} days lit.`);
  return grid;
}

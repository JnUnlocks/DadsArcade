/**
 * Which games and which tabs the high-score screen offers.
 *
 * Kept apart from the screen itself so it can be tested without a DOM: the
 * rules are small, but getting them wrong gives a tab that is always empty or
 * a filter that silently shows the wrong game's board.
 */

import type { GameModule } from "../core/game.ts";

/**
 * ALL TIME and THIS WEEK are date filters on a game's main board. TODAY is a
 * different board entirely -- the daily challenge, where everyone played the
 * same seeded run.
 */
export type Slice = "all" | "week" | "today";

/** null means "all games". */
export type GameFilter = string | null;

/** TODAY only makes sense where at least one selected game has a daily board. */
export function todayAvailable(games: readonly GameModule[], filter: GameFilter): boolean {
  return gamesInView(games, filter).some((g) => g.hasDailyChallenge);
}

/**
 * The slice to show after the filter changes. Switching to a game with no
 * daily board while TODAY is selected would leave an empty board and a tab
 * that's no longer on screen, so fall back to ALL TIME.
 */
export function sliceAfterFilterChange(
  games: readonly GameModule[],
  filter: GameFilter,
  slice: Slice,
): Slice {
  return slice === "today" && !todayAvailable(games, filter) ? "all" : slice;
}

/** The games whose scores belong on screen for this filter and slice. */
export function gamesInView(
  games: readonly GameModule[],
  filter: GameFilter,
  slice: Slice = "all",
): readonly GameModule[] {
  const selected = filter === null ? games : games.filter((g) => g.id === filter);
  return slice === "today" ? selected.filter((g) => g.hasDailyChallenge) : selected;
}

export function shortTitleOf(game: GameModule): string {
  return game.shortTitle ?? game.title;
}

/** "LV7", "RD3", "W6" -- what a score row prints after the score. */
export function progressText(game: GameModule | undefined, progress: number): string {
  return `${game?.progressShort ?? "W"}${progress}`;
}

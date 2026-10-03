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
 * same seeded run. So is "extra": a game's second permanent board, for a mode
 * that scores on a different scale (Snake's CLASSIC).
 */
export type Slice = "all" | "week" | "today" | "extra";

/** null means "all games". */
export type GameFilter = string | null;

/** TODAY only makes sense where at least one selected game has a daily board. */
export function todayAvailable(games: readonly GameModule[], filter: GameFilter): boolean {
  return gamesInView(games, filter).some((g) => g.hasDailyChallenge);
}

/**
 * The game whose extra board the fourth tab would open, if there is one in
 * view. A tab named after one game's mode only makes sense with that game
 * chosen, so ALL GAMES never offers it.
 */
export function extraBoardGame(
  games: readonly GameModule[],
  filter: GameFilter,
): GameModule | undefined {
  return filter === null ? undefined : gamesInView(games, filter).find((g) => g.extraBoard);
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
  if (slice === "today" && !todayAvailable(games, filter)) return "all";
  if (slice === "extra" && !extraBoardGame(games, filter)) return "all";
  return slice;
}

/** The games whose scores belong on screen for this filter and slice. */
export function gamesInView(
  games: readonly GameModule[],
  filter: GameFilter,
  slice: Slice = "all",
): readonly GameModule[] {
  const selected = filter === null ? games : games.filter((g) => g.id === filter);
  if (slice === "today") return selected.filter((g) => g.hasDailyChallenge);
  if (slice === "extra") return selected.filter((g) => g.extraBoard);
  return selected;
}

export function shortTitleOf(game: GameModule): string {
  return game.shortTitle ?? game.title;
}

/** "LV7", "RD3", "W6" -- what a score row prints after the score. */
export function progressText(
  game: GameModule | undefined,
  progress: number,
  slice: Slice = "all",
): string {
  const short =
    (slice === "extra" ? game?.extraBoard?.progressShort : undefined) ?? game?.progressShort;
  return `${short ?? "W"}${progress}`;
}

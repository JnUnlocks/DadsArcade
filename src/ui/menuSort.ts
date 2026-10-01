/**
 * The order the arcade menu shows its cabinets in.
 *
 * Kept apart from the shell so it can be tested without a DOM. It only ever
 * reorders the menu: the high-score screen keeps the registry's order, so a
 * board doesn't shuffle because someone changed how the front page is sorted.
 */

import type { GameModule } from "../core/game.ts";
import type { MenuSort } from "../core/storage.ts";

/** The order the SORT button steps through. */
export const MENU_SORTS: readonly MenuSort[] = ["arcade", "played", "name"];

export const MENU_SORT_LABELS: Record<MenuSort, string> = {
  arcade: "ARCADE",
  played: "MOST PLAYED",
  name: "A-Z",
};

export function nextMenuSort(sort: MenuSort): MenuSort {
  const index = MENU_SORTS.indexOf(sort);
  return MENU_SORTS[(index + 1) % MENU_SORTS.length] ?? "arcade";
}

/**
 * A sorted copy of the games.
 *
 * MOST PLAYED breaks ties by the arcade's own order, so on a new phone -- where
 * every count is zero -- it is simply the arcade order rather than a shuffle.
 */
export function sortGames(
  games: readonly GameModule[],
  sort: MenuSort,
  plays: Readonly<Record<string, number>>,
): GameModule[] {
  const ordered = games.map((game, index) => ({ game, index }));
  if (sort === "played") {
    ordered.sort(
      (a, b) => (plays[b.game.id] ?? 0) - (plays[a.game.id] ?? 0) || a.index - b.index,
    );
  } else if (sort === "name") {
    ordered.sort((a, b) => a.game.title.localeCompare(b.game.title, "en"));
  }
  return ordered.map((entry) => entry.game);
}

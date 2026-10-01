/**
 * The menu's sort orders.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GameModule } from "../core/game.ts";
import { MENU_SORTS, nextMenuSort, sortGames } from "./menuSort.ts";

const game = (id: string, title: string): GameModule =>
  ({ id, title, blurb: "", accent: "#fff" }) as GameModule;

const GAMES = [
  game("starfighter", "STARFIGHTER"),
  game("plasma-sort", "PLASMA SORT"),
  game("reef", "MISS RILEY'S REEF"),
  game("brickfall", "BRICKFALL"),
];

const ids = (games: GameModule[]) => games.map((g) => g.id);

describe("menu sort", () => {
  it("leaves the arcade's own order alone", () => {
    assert.deepEqual(ids(sortGames(GAMES, "arcade", { reef: 9 })), ids(GAMES));
  });

  it("puts the most played first, and unplayed games after in arcade order", () => {
    const plays = { brickfall: 5, reef: 12 };
    assert.deepEqual(ids(sortGames(GAMES, "played", plays)), [
      "reef",
      "brickfall",
      "starfighter",
      "plasma-sort",
    ]);
  });

  it("is the arcade order on a phone that has played nothing", () => {
    assert.deepEqual(ids(sortGames(GAMES, "played", {})), ids(GAMES));
  });

  it("sorts A-Z by the name on the cabinet", () => {
    assert.deepEqual(ids(sortGames(GAMES, "name", {})), [
      "brickfall",
      "reef",
      "plasma-sort",
      "starfighter",
    ]);
  });

  it("never reorders the list it was given", () => {
    const before = ids(GAMES);
    sortGames(GAMES, "name", {});
    assert.deepEqual(ids(GAMES), before);
  });

  it("steps through every order and back to the start", () => {
    let sort = MENU_SORTS[0]!;
    const seen = [sort];
    for (let i = 0; i < MENU_SORTS.length; i += 1) {
      sort = nextMenuSort(sort);
      seen.push(sort);
    }
    assert.deepEqual(seen, [...MENU_SORTS, MENU_SORTS[0]]);
  });
});

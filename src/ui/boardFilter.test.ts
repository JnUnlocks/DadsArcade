/**
 * The high-score filter's rules: which games show, and when TODAY is offered.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GameModule } from "../core/game.ts";
import {
  extraBoardGame,
  listBoards,
  standaloneKey,
  gamesInView,
  progressText,
  shortTitleOf,
  sliceAfterFilterChange,
  todayAvailable,
} from "./boardFilter.ts";

const game = (id: string, over: Partial<GameModule> = {}): GameModule =>
  ({ id, title: id.toUpperCase(), blurb: "", accent: "#fff", ...over }) as GameModule;

const GAMES = [
  game("starfighter", { progressShort: "WV" }),
  game("riley-slime-shop", { hasDailyChallenge: true, shortTitle: "SLIME SHOP" }),
  game("brickfall", { progressShort: "LV" }),
  game("snake", {
    progressShort: "ST",
    extraBoard: { id: "classic", label: "CLASSIC", progressShort: "LEN" },
  }),
];

describe("high score filter", () => {
  it("shows every game for ALL GAMES, and only the chosen one otherwise", () => {
    assert.equal(gamesInView(GAMES, null).length, 4);
    assert.deepEqual(gamesInView(GAMES, "brickfall").map((g) => g.id), ["brickfall"]);
  });

  it("shows nothing for a game id that doesn't exist, rather than the wrong game", () => {
    assert.equal(gamesInView(GAMES, "no-such-game").length, 0);
  });

  it("limits TODAY to games that have a daily board", () => {
    assert.deepEqual(
      gamesInView(GAMES, null, "today").map((g) => g.id),
      ["riley-slime-shop"],
    );
  });

  it("offers TODAY only where a selected game has one", () => {
    assert.ok(todayAvailable(GAMES, null), "all games includes the slime shop");
    assert.ok(todayAvailable(GAMES, "riley-slime-shop"));
    assert.ok(!todayAvailable(GAMES, "brickfall"), "an always-empty tab is worse than none");
  });

  it("drops back to ALL TIME when switching to a game with no TODAY board", () => {
    assert.equal(sliceAfterFilterChange(GAMES, "brickfall", "today"), "all");
    assert.equal(sliceAfterFilterChange(GAMES, "riley-slime-shop", "today"), "today");
    assert.equal(sliceAfterFilterChange(GAMES, "brickfall", "week"), "week");
  });
});

describe("labels", () => {
  it("uses the short title where there is one", () => {
    assert.equal(shortTitleOf(GAMES[1]!), "SLIME SHOP");
    assert.equal(shortTitleOf(GAMES[0]!), "STARFIGHTER");
  });

  it("labels progress per game, instead of W for everything", () => {
    assert.equal(progressText(GAMES[2], 7), "LV7");
    assert.equal(progressText(GAMES[0], 3), "WV3");
    assert.equal(progressText(undefined, 2), "W2", "unknown game keeps the old default");
  });

  it("offers a game's extra board only with that game chosen", () => {
    assert.equal(extraBoardGame(GAMES, "snake")?.id, "snake");
    assert.equal(extraBoardGame(GAMES, "brickfall"), undefined);
    assert.equal(extraBoardGame(GAMES, null), undefined, "ALL GAMES has no single mode to name");
    assert.deepEqual(gamesInView(GAMES, "snake", "extra").map((g) => g.id), ["snake"]);
  });

  it("falls back to ALL TIME when the extra board's game is deselected", () => {
    assert.equal(sliceAfterFilterChange(GAMES, "brickfall", "extra"), "all");
    assert.equal(sliceAfterFilterChange(GAMES, null, "extra"), "all");
    assert.equal(sliceAfterFilterChange(GAMES, "snake", "extra"), "extra");
  });

  it("labels an extra board's rows with that board's own progress", () => {
    const snake = GAMES[3];
    assert.equal(progressText(snake, 7), "ST7");
    assert.equal(progressText(snake, 31, "extra"), "LEN31");
    assert.equal(progressText(GAMES[2], 4, "extra"), "LV4");
  });
});

describe("a mode with a board of its own", () => {
  const blast: GameModule = {
    ...GAMES[2]!,
    extraBoard: {
      id: "blast",
      label: "BLAST",
      standalone: { title: "BRICK BLAST", accent: "#ff5fae" },
    },
  };
  const arcade = [GAMES[0]!, blast, GAMES[3]!];

  it("is listed as a game, straight after the game it belongs to", () => {
    const { games } = listBoards(arcade);
    assert.deepEqual(
      games.map((g) => g.id),
      [GAMES[0]!.id, "brickfall", standaloneKey("brickfall", "blast"), GAMES[3]!.id],
    );
    const entry = games[2]!;
    assert.equal(entry.title, "BRICK BLAST");
    assert.equal(shortTitleOf(entry), "BRICK BLAST");
    assert.equal(entry.accent, "#ff5fae");
  });

  it("reads its scores from the game's own board, not from a made-up game", () => {
    const { sources } = listBoards(arcade);
    assert.deepEqual(sources.get(standaloneKey("brickfall", "blast")), {
      gameId: "brickfall",
      board: "blast",
    });
    assert.deepEqual(sources.get("brickfall"), { gameId: "brickfall", board: "" });
  });

  it("isn't offered a second time as a tab", () => {
    const { games } = listBoards(arcade);
    assert.equal(extraBoardGame(games, "brickfall"), undefined);
    assert.equal(extraBoardGame(games, standaloneKey("brickfall", "blast")), undefined);
  });

  it("leaves an ordinary extra board as a tab", () => {
    const { games, sources } = listBoards(GAMES);
    assert.deepEqual(games.map((g) => g.id), GAMES.map((g) => g.id));
    assert.equal(extraBoardGame(games, "snake")?.id, "snake");
    assert.equal(sources.size, GAMES.length);
  });

  it("keeps the game's progress label", () => {
    const { games } = listBoards(arcade);
    assert.equal(progressText(games[2], 4), progressText(blast, 4));
  });
});

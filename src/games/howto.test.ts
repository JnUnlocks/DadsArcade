/**
 * Every cabinet explains itself on the pause screen.
 *
 * The family's most common question about a new game is how to play it, and
 * the pause screen is where the answer lives (GameModule.howToPlay). This
 * fails the build for a game that ships without one, or with one too long to
 * read on a phone -- so the rules get written with the game, not after the
 * questions arrive.
 *
 * It reads the source rather than importing the games, because a game module
 * pulls in its stylesheet and the DOM, and neither exists here.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const GAMES_DIR = new URL(".", import.meta.url);

const games = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** The lines of a game's howToPlay list, or null if it has none. */
function howToPlay(game: string): string[] | null {
  const source = readFileSync(new URL(`${game}/index.ts`, GAMES_DIR), "utf8");
  const list = /\n  howToPlay: \[\r?\n([\s\S]*?)\n  \],/.exec(source);
  if (!list) return null;
  return [...list[1]!.matchAll(/^\s*"((?:[^"\\]|\\.)*)",\s*$/gm)].map((m) => m[1]!);
}

describe("how to play", () => {
  it("finds the games", () => {
    assert.ok(games.length >= 14, `only found ${games.length} games`);
  });

  for (const game of games) {
    it(`${game} says how it's played, briefly`, () => {
      const lines = howToPlay(game);
      assert.ok(lines, `${game} has no howToPlay on its module`);
      assert.ok(lines.length >= 3 && lines.length <= 6, `${game} has ${lines.length} lines`);
      for (const line of lines) {
        assert.ok(line.length <= 150, `${game}: too long for a phone: "${line}"`);
        assert.match(line, /[.!?]$/, `${game}: not a sentence: "${line}"`);
      }
    });
  }
});

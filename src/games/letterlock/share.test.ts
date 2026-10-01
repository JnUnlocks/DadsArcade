/**
 * What a shared Letter Lock result says -- and, as importantly, what it doesn't.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { markGuess } from "./rules.ts";
import { dailyShareText } from "./share.ts";

const LINK = "https://example.test/?play=letter-lock";

const rowsFor = (guesses: string[], answer: string) => guesses.map((guess) => markGuess(guess, answer));

describe("dailyShareText", () => {
  it("draws one row of squares per guess under a header with the score", () => {
    const guesses = ["mouse", "tiger", "glint", "plant"];
    const text = dailyShareText({ rows: rowsFor(guesses, "plant"), solved: true }, "2026-10-02", 3, LINK);
    assert.equal(
      text,
      [
        "Dad's Arcade · Letter Lock · Oct 2 · 4/6",
        "⬛⬛⬛⬛⬛",
        "🟧⬛⬛⬛⬛",
        "⬛🟦⬛🟦🟦",
        "🟦🟦🟦🟦🟦",
        "🔥 3-day streak",
        LINK,
      ].join("\n"),
    );
  });

  it("shows a first-guess solve as a single blue row", () => {
    const text = dailyShareText({ rows: rowsFor(["plant"], "plant"), solved: true }, "2026-10-02", 0, LINK);
    assert.deepEqual(text.split("\n"), [
      "Dad's Arcade · Letter Lock · Oct 2 · 1/6",
      "🟦🟦🟦🟦🟦",
      LINK,
    ]);
  });

  it("shows a miss as X/6, with all six rows", () => {
    const guesses = ["mouse", "tiger", "candy", "blink", "world", "glint"];
    const text = dailyShareText({ rows: rowsFor(guesses, "plant"), solved: false }, "2026-12-25", 0, LINK);
    const lines = text.split("\n");
    assert.equal(lines[0], "Dad's Arcade · Letter Lock · Dec 25 · X/6");
    assert.equal(lines.length, 1 + 6 + 1);
    assert.equal(lines[6], "⬛🟦⬛🟦🟦");
  });

  it("never contains a letter of any guess or of the answer", () => {
    // Words with letters that don't appear in the fixed text ("Dad's Arcade",
    // "Letter Lock", the month, "streak", the link), so a leak would show.
    const guesses = ["fuzzy", "jumbo", "whiff", "quick"];
    const text = dailyShareText({ rows: rowsFor(guesses, "quick"), solved: true }, "2026-10-02", 2, LINK);
    const body = text.split("\n").slice(1, 1 + guesses.length).join("");
    assert.match(body, /^[🟦🟧⬛]+$/u);
    for (const word of guesses) assert.ok(!text.toLowerCase().includes(word), `leaked "${word}"`);
  });

  it("mentions a streak only once there is one", () => {
    const result = { rows: rowsFor(["plant"], "plant"), solved: true };
    assert.ok(!dailyShareText(result, "2026-10-02", 1, LINK).includes("streak"));
    assert.ok(dailyShareText(result, "2026-10-02", 5, LINK).includes("🔥 5-day streak"));
  });

  it("ends with the link, so chat apps preview it", () => {
    const text = dailyShareText({ rows: rowsFor(["plant"], "plant"), solved: true }, "2026-10-02", 3, LINK);
    assert.ok(text.endsWith(`\n${LINK}`));
  });
});

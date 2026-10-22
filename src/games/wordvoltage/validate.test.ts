/**
 * The strict validator, against boards built to break each rule once.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canSpell, letterSignature, normalizeWord } from "./letters.ts";
import type { Placement, Puzzle } from "./types.ts";
import { puzzleSignature, validatePuzzle } from "./validate.ts";

/** The fixture from the brief: STAR across, TAR down through its T, RAT across. */
export const STAR_FIXTURE: Puzzle = {
  id: "fixture-star",
  difficulty: "family",
  letters: "TRSA",
  words: [
    { word: "STAR", row: 0, col: 0, dir: "across" },
    { word: "TAR", row: 0, col: 1, dir: "down" },
    { word: "RAT", row: 2, col: 1, dir: "across" },
  ],
  bonus: ["ART", "ARTS", "RATS", "TARS", "TSAR"],
};

function withWords(words: Placement[], extra: Partial<Puzzle> = {}): Puzzle {
  return { ...STAR_FIXTURE, words, bonus: [], ...extra };
}

describe("letters", () => {
  it("spells only what the multiset holds", () => {
    assert.equal(canSpell("STAR", "TRSA"), true);
    assert.equal(canSpell("TART", "TRSA"), false);
    assert.equal(canSpell("LETTER", "LETTER"), true);
    assert.equal(canSpell("LETTERS", "LETTER"), false);
    assert.equal(canSpell("TEETER", "LETTER"), false);
  });

  it("normalises to upper-case A-Z and refuses anything else", () => {
    assert.equal(normalizeWord(" star "), "STAR");
    assert.equal(normalizeWord("café"), null);
    assert.equal(normalizeWord("it's"), null);
    assert.equal(normalizeWord("x-ray"), null);
    assert.equal(normalizeWord(""), null);
  });

  it("gives anagrams one signature", () => {
    assert.equal(letterSignature("STAR"), letterSignature("RATS"));
  });
});

describe("the validator", () => {
  it("passes the STAR / TAR / RAT fixture", () => {
    assert.deepEqual(validatePuzzle(STAR_FIXTURE), []);
  });

  it("refuses crossings whose letters disagree", () => {
    const errors = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "ART", row: 0, col: 1, dir: "down" },
      ]),
    );
    assert.ok(errors.some((e) => e.includes("holds both")), errors.join("\n"));
  });

  it("refuses two words overlapping the same way", () => {
    const errors = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "TAR", row: 0, col: 1, dir: "across" },
      ]),
    );
    assert.ok(errors.some((e) => e.includes("same way")), errors.join("\n"));
  });

  it("refuses words that don't connect", () => {
    const errors = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "RAT", row: 2, col: 0, dir: "across" },
      ]),
    );
    assert.ok(errors.some((e) => e.includes("connect")), errors.join("\n"));
  });

  it("refuses a word that runs straight on into another", () => {
    // STAR then RAT on the same row with no gap reads STARRAT.
    const errors = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "RAT", row: 0, col: 4, dir: "across" },
        { word: "TAR", row: 0, col: 1, dir: "down" },
      ]),
    );
    assert.ok(errors.some((e) => e.includes("undeclared")), errors.join("\n"));
  });

  it("refuses side-by-side words that make stray two-letter runs", () => {
    const errors = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "RAT", row: 1, col: 0, dir: "across" },
      ]),
    );
    assert.ok(errors.some((e) => e.includes("undeclared")), errors.join("\n"));
  });

  it("refuses a target the wheel can't spell, or one shorter than three", () => {
    const errors = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "TARTS", row: 0, col: 1, dir: "down" },
      ]),
    );
    assert.ok(errors.some((e) => e.includes("cannot spell")), errors.join("\n"));
    const short = validatePuzzle(withWords([{ word: "AT", row: 0, col: 0, dir: "across" }]));
    assert.ok(short.some((e) => e.includes("shorter")), short.join("\n"));
  });

  it("refuses a duplicate target, and a target in the bonus list", () => {
    const dup = validatePuzzle(
      withWords([
        { word: "STAR", row: 0, col: 0, dir: "across" },
        { word: "STAR", row: 0, col: 1, dir: "down" },
      ]),
    );
    assert.ok(dup.some((e) => e.includes("twice")), dup.join("\n"));
    const both = validatePuzzle({ ...STAR_FIXTURE, bonus: ["RAT"] });
    assert.ok(both.some((e) => e.includes("both a target and a bonus")), both.join("\n"));
  });

  it("refuses an untrimmed board and one that's too big", () => {
    const margin = validatePuzzle(
      withWords(STAR_FIXTURE.words.map((p) => ({ ...p, row: p.row + 1, col: p.col + 2 }))),
    );
    assert.ok(margin.some((e) => e.includes("margin")), margin.join("\n"));
    // A legal chain of crossings that wanders out to nine columns.
    const wide = validatePuzzle(
      withWords([
        { word: "ARTS", row: 0, col: 0, dir: "across" },
        { word: "STAR", row: 0, col: 3, dir: "down" },
        { word: "RATS", row: 3, col: 3, dir: "across" },
        { word: "SAT", row: 3, col: 6, dir: "down" },
        { word: "TAR", row: 5, col: 6, dir: "across" },
      ]),
    );
    assert.deepEqual(
      wide.filter((e) => !e.includes("allows 8x8")),
      [],
      "the only fault should be its width",
    );
    assert.ok(wide.some((e) => e.includes("allows 8x8")), wide.join("\n"));
  });

  it("refuses a wheel that starts out spelling a target", () => {
    const errors = validatePuzzle({ ...STAR_FIXTURE, letters: "STAR" });
    assert.ok(errors.some((e) => e.includes("starting order")), errors.join("\n"));
  });

  it("treats a slid or turned board as the same puzzle", () => {
    const slid = { ...STAR_FIXTURE, words: STAR_FIXTURE.words.map((p) => ({ ...p, row: p.row + 3 })) };
    const turned = {
      ...STAR_FIXTURE,
      words: STAR_FIXTURE.words.map((p) => ({
        word: p.word,
        row: p.col,
        col: p.row,
        dir: p.dir === "across" ? ("down" as const) : ("across" as const),
      })),
    };
    assert.equal(puzzleSignature(slid), puzzleSignature(STAR_FIXTURE));
    assert.equal(puzzleSignature(turned), puzzleSignature(STAR_FIXTURE));
  });
});

/**
 * The crossword generator, and the clue bank it fills from.
 *
 * The whole family solves the same daily grid on different phones, so the one
 * thing this must never do is make two different puzzles from one seed. It
 * also must never fail to make one: a day with no crossword is a broken
 * cabinet.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLUES, CLUE_LINES } from "./clues.ts";
import {
  BLACK,
  SIZES,
  clueCells,
  findSlots,
  generatePuzzle,
  solutionOf,
  type Puzzle,
} from "./generate.ts";
import { dailyPuzzleSeed } from "./rules.ts";

/** Words that must never be in the bank, whatever else changes. */
const NEVER_A_WORD = [
  "crap", "damn", "idiot", "naked", "booze", "drunk", "cigar", "smoke", "vodka", "drugs",
  "kill", "death", "blood", "sword", "fight", "bomb", "gun",
] as const;

function checkPuzzle(puzzle: Puzzle): void {
  const { size, rows, clues } = puzzle;
  assert.equal(rows.length, size);
  for (const row of rows) assert.match(row, new RegExp(`^[a-z#]{${size}}$`));

  const solution = solutionOf(puzzle);
  const black = [...solution].map((square) => square === BLACK);

  // Looks the same turned upside down.
  for (let i = 0; i < black.length; i += 1) {
    assert.equal(black[i], black[black.length - 1 - i], "the grid isn't symmetric");
  }

  // One clue for every run of white squares, and nothing else.
  const slots = findSlots(size, black);
  assert.equal(clues.length, slots.length);

  const covered = new Set<number>();
  const answers = new Set<string>();
  for (const clue of clues) {
    const cells = clueCells(puzzle, clue);
    assert.equal(cells.map((cell) => solution[cell]).join(""), clue.answer);
    assert.ok(clue.clue.length > 0, `${clue.answer} has no clue`);
    assert.ok(!answers.has(clue.answer), `${clue.answer} is in the grid twice`);
    answers.add(clue.answer);
    for (const cell of cells) covered.add(cell);
  }
  black.forEach((isBlack, cell) => {
    if (!isBlack) assert.ok(covered.has(cell), `square ${cell} belongs to no word`);
  });

  // Numbered in reading order, across and down sharing a start's number.
  const starts = [...new Set(clues.map((clue) => clue.row * size + clue.col))].sort((a, b) => a - b);
  for (const clue of clues) {
    assert.equal(clue.number, starts.indexOf(clue.row * size + clue.col) + 1);
  }
}

describe("the generator", () => {
  it("makes the same puzzle from the same seed", () => {
    for (const size of SIZES) {
      assert.deepEqual(generatePuzzle(1234, size), generatePuzzle(1234, size));
    }
  });

  it("makes different puzzles from different seeds", () => {
    assert.notDeepEqual(generatePuzzle(1, 11).rows, generatePuzzle(2, 11).rows);
  });

  it("makes a sound puzzle for every day of the next two years", () => {
    const start = Math.floor(Date.UTC(2026, 9, 3) / 86_400_000);
    for (let day = start; day < start + 730; day += 1) {
      checkPuzzle(generatePuzzle(dailyPuzzleSeed(day), 11));
    }
  });

  it("makes a sound quick puzzle from any seed", () => {
    for (let seed = 0; seed < 300; seed += 1) checkPuzzle(generatePuzzle(seed * 7919, 9));
  });

  it("fills a grid that is mostly white squares", () => {
    for (const size of SIZES) {
      const solution = solutionOf(generatePuzzle(99, size));
      const white = [...solution].filter((square) => square !== BLACK).length;
      assert.ok(white >= size * size * 0.66, `only ${white} white squares`);
    }
  });
});

describe("the clue bank", () => {
  it("is one lower-case word and at least one clue per line", () => {
    for (const line of CLUE_LINES) {
      const [word, ...clues] = line.split("|");
      assert.match(word ?? "", /^[a-z]{3,}$/, `bad word in "${line}"`);
      assert.ok(clues.length > 0, `no clue in "${line}"`);
      for (const clue of clues) {
        assert.ok(clue.trim() === clue && clue.length > 0, `untidy clue in "${line}"`);
        assert.ok(clue.length <= 48, `clue too long for the clue bar: "${line}"`);
      }
    }
  });

  it("never gives the answer away in the clue", () => {
    for (const { word, clues } of CLUES) {
      for (const clue of clues) {
        const said = clue.toLowerCase().split(/[^a-z]+/);
        assert.ok(!said.includes(word) && !said.includes(`${word}s`), `"${clue}" contains ${word}`);
      }
    }
  });

  it("is big enough that the grids stay varied", () => {
    assert.ok(CLUES.length >= 1000, `only ${CLUES.length} words`);
  });

  it("contains nothing a seven-year-old shouldn't be handed", () => {
    const words = new Set(CLUES.map((entry) => entry.word));
    for (const word of NEVER_A_WORD) assert.ok(!words.has(word), `"${word}" is in the bank`);
  });
});

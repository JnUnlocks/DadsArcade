/**
 * The crossword's rules, the share text, the saved game and the Word Finder's
 * searches: everything about the cabinet that can be got wrong without a
 * browser to show it.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ClueEntry } from "./clues.ts";
import { clueCells, generatePuzzle, solutionOf } from "./generate.ts";
import { anagrams, matchPattern, normalizePattern, rankMatches, searchClues } from "./lookup.ts";
import { parseSavedGame } from "./progress.ts";
import {
  HINT_SECONDS,
  cluePattern,
  dailyPuzzleSeed,
  emptyFill,
  fitsPuzzle,
  formatClock,
  isFull,
  isSolved,
  issueNumber,
  scoreSolve,
  setLetter,
  unsolvedCells,
  wrongCells,
  EPOCH_DAY,
} from "./rules.ts";
import { dailyShareText } from "./share.ts";

const puzzle = generatePuzzle(42, 9);
const solution = solutionOf(puzzle);

describe("a fill", () => {
  it("starts empty and the same shape as the grid", () => {
    const fill = emptyFill(puzzle);
    assert.equal(fill.length, solution.length);
    assert.ok(fitsPuzzle(fill, puzzle));
    assert.ok(!isFull(fill));
    assert.ok(!/[a-z]/.test(fill));
  });

  it("is solved only when every letter is right", () => {
    assert.ok(isSolved(solution, puzzle));
    const cell = solution.search(/[a-z]/);
    const off = setLetter(solution, cell, solution[cell] === "q" ? "x" : "q");
    assert.ok(isFull(off));
    assert.ok(!isSolved(off, puzzle));
  });

  it("is refused when it doesn't match the grid", () => {
    assert.ok(!fitsPuzzle(solution.slice(1), puzzle));
    assert.ok(!fitsPuzzle(solution.replace("#", "a"), puzzle));
    assert.ok(!fitsPuzzle(solution.toUpperCase(), puzzle));
    assert.ok(!fitsPuzzle(null, puzzle));
  });
});

describe("hints", () => {
  const clue = puzzle.clues[0]!;
  const cells = clueCells(puzzle, clue);

  it("finds the wrong letters and leaves the blanks alone", () => {
    const right = solution[cells[0]!]!;
    const wrong = right === "z" ? "y" : "z";
    let fill = setLetter(emptyFill(puzzle), cells[0]!, wrong);
    fill = setLetter(fill, cells[1]!, solution[cells[1]!]!);
    assert.deepEqual(wrongCells(fill, puzzle, clue), [cells[0]]);
    assert.equal(unsolvedCells(fill, puzzle, clue).length, cells.length - 1);
  });

  it("asks the finder for the letters so far", () => {
    const fill = setLetter(emptyFill(puzzle), cells[0]!, clue.answer[0]!);
    assert.equal(cluePattern(fill, puzzle, clue), clue.answer[0] + "?".repeat(cells.length - 1));
  });

  it("costs more the more it gives away", () => {
    assert.ok(HINT_SECONDS.check < HINT_SECONDS.letter);
    assert.ok(HINT_SECONDS.letter < HINT_SECONDS.word);
  });
});

describe("scoring", () => {
  it("is worth less the longer it takes, but never nothing", () => {
    assert.ok(scoreSolve(11, 300) > scoreSolve(11, 301));
    assert.ok(scoreSolve(11, 600) > scoreSolve(11, 660));
    assert.ok(scoreSolve(11, 5 * 3600) >= 1);
  });

  it("is half the top score at par", () => {
    assert.equal(scoreSolve(11, 600), 2500);
    assert.equal(scoreSolve(9, 300), 1500);
  });

  it("stays inside what the scoreboard will accept", () => {
    // worker/index.ts refuses more than 3000 points a second.
    for (const seconds of [3, 10, 60]) assert.ok(scoreSolve(11, seconds) <= 3000 * seconds);
  });

  it("writes the clock the way a stopwatch does", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(522), "8:42");
    assert.equal(formatClock(3725), "1:02:05");
  });
});

describe("the day's puzzle", () => {
  it("has its own seed every day", () => {
    const seeds = new Set<number>();
    for (let day = EPOCH_DAY; day < EPOCH_DAY + 1000; day += 1) seeds.add(dailyPuzzleSeed(day));
    assert.equal(seeds.size, 1000);
  });

  it("is issue number one on the day it shipped", () => {
    assert.equal(issueNumber(EPOCH_DAY), 1);
    assert.equal(issueNumber(EPOCH_DAY + 9), 10);
  });
});

describe("the share text", () => {
  const text = dailyShareText(
    { size: 3, squares: ["clean", "black", "clean", "helped", "clean", "clean", "clean", "black", "clean"], seconds: 522, hints: 2 },
    "2026-10-03",
    3,
    "https://example.test/?play=crossword",
  );

  it("says the time, the hints and the streak, and ends with the link", () => {
    const lines = text.split("\n");
    assert.equal(lines[0], "Dad's Arcade · Mom Mom's Crossword · Oct 3");
    assert.equal(lines[1], "⏱ 8:42 · 2 hints");
    assert.deepEqual(lines.slice(2, 5), ["⬜⬛⬜", "🟨⬜⬜", "⬜⬛⬜"]);
    assert.equal(lines[5], "🔥 3-day streak");
    assert.equal(lines[6], "https://example.test/?play=crossword");
  });

  it("gives no letter away", () => {
    assert.ok(!/[a-z]{3,}/.test(text.split("\n").slice(1, 5).join("").replace("hints", "")));
  });
});

describe("a saved game", () => {
  const saved = {
    date: "2026-10-03",
    puzzle,
    fill: emptyFill(puzzle),
    seconds: 61.5,
    penalty: 20,
    hints: 1,
    helped: [0, 9999],
    result: null,
  };

  it("comes back as it was saved", () => {
    const back = parseSavedGame(JSON.parse(JSON.stringify(saved)));
    assert.ok(back);
    assert.deepEqual(back.puzzle, puzzle);
    assert.equal(back.seconds, 61.5);
    assert.equal(back.penalty, 20);
    // A square that isn't on the grid is dropped rather than trusted.
    assert.deepEqual(back.helped, [0]);
  });

  it("is refused when the grid and its clues disagree", () => {
    const broken = JSON.parse(JSON.stringify(saved));
    broken.puzzle.clues[0].answer = "zzz";
    assert.equal(parseSavedGame(broken), null);
    assert.equal(parseSavedGame({ ...saved, fill: "abc" }), null);
    assert.equal(parseSavedGame(null), null);
    assert.equal(parseSavedGame("nonsense"), null);
  });
});

describe("the word finder", () => {
  const words = ["cat", "cot", "cut", "act", "dog", "coat", "taco"];

  it("reads a blank however it's typed", () => {
    assert.equal(normalizePattern("C?T"), "c?t");
    assert.equal(normalizePattern("c.t"), "c?t");
    assert.equal(normalizePattern("C_T "), "c?t?");
    assert.equal(normalizePattern("c-a*t!9"), "c?a?t");
  });

  it("finds the words that fit a pattern", () => {
    assert.deepEqual(matchPattern(words, "c?t"), ["cat", "cot", "cut"]);
    assert.deepEqual(matchPattern(words, "?o??"), ["coat"]);
    assert.deepEqual(matchPattern(words, ""), []);
  });

  it("unscrambles letters, with ? for any letter", () => {
    assert.deepEqual(anagrams(words, "tca"), ["cat", "act"]);
    assert.deepEqual(anagrams(words, "caot"), ["coat", "taco"]);
    assert.deepEqual(anagrams(words, "c?t"), ["cat", "cot", "cut", "act"]);
    assert.deepEqual(anagrams(words, "cc?"), []);
  });

  it("puts the everyday words first", () => {
    assert.deepEqual(rankMatches(["cat", "cot", "cut"], new Set(["cut"])), ["cut", "cat", "cot"]);
  });

  it("searches the clues, shortest clue first", () => {
    const bank: ClueEntry[] = [
      { word: "owl", clues: ["Bird that hoots"] },
      { word: "robin", clues: ["Bird with a red breast"] },
      { word: "nest", clues: ["Bird's home"] },
      { word: "dog", clues: ["Pet that barks"] },
    ];
    assert.deepEqual(searchClues(bank, "bird").map((hit) => hit.word), ["nest", "owl", "robin"]);
    assert.deepEqual(searchClues(bank, "the bird red").map((hit) => hit.word), ["robin"]);
    assert.deepEqual(searchClues(bank, "bird", "o??").map((hit) => hit.word), ["owl"]);
    assert.deepEqual(searchClues(bank, "the"), []);
  });
});

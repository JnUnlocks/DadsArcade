/**
 * Sudoku's generator, rules, share text and saved game: everything about the
 * cabinet that can be got wrong without a browser to show it.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CELLS,
  DIFFICULTIES,
  PEERS,
  TARGETS,
  UNITS,
  countSolutions,
  generatePuzzle,
  technique,
  toCells,
} from "./generate.ts";
import { parseSavedGame, type SavedGame } from "./progress.ts";
import {
  HINT_SECONDS,
  MISTAKE_SECONDS,
  autoNotes,
  boxMarks,
  dailyDifficulty,
  dailyPuzzleSeed,
  finishedUnits,
  hasNote,
  isSolved,
  notesAfterPlacing,
  remaining,
  scoreSolve,
  toggleNote,
} from "./rules.ts";
import { dailyShareText } from "./share.ts";

describe("the generator", () => {
  for (const difficulty of DIFFICULTIES) {
    it(`makes ${difficulty} puzzles with one answer, at the technique asked for`, () => {
      for (let seed = 1; seed <= 12; seed += 1) {
        const puzzle = generatePuzzle(seed * 7919, difficulty);
        const givens = toCells(puzzle.givens);
        const solution = toCells(puzzle.solution);
        assert.equal(givens.length, CELLS);
        assert.equal(countSolutions(givens), 1);
        assert.equal(countSolutions(solution, 1), 1);
        givens.forEach((digit, cell) => {
          if (digit !== 0) assert.equal(digit, solution[cell]);
        });
        assert.equal(technique(givens), TARGETS[difficulty].level);
        assert.ok(givens.filter(Boolean).length >= TARGETS[difficulty].floor);
      }
    });
  }

  it("makes the same puzzle from the same seed", () => {
    assert.deepEqual(generatePuzzle(2026, "hard"), generatePuzzle(2026, "hard"));
    assert.notEqual(generatePuzzle(2026, "hard").givens, generatePuzzle(2027, "hard").givens);
  });

  it("takes squares away in mirrored pairs", () => {
    const { givens } = generatePuzzle(99, "medium");
    for (let cell = 0; cell < CELLS; cell += 1) {
      assert.equal(givens[cell] === "0", givens[80 - cell] === "0");
    }
  });

  it("counts no answers for a grid that breaks the rules, and two for an open one", () => {
    const clash = new Array<number>(CELLS).fill(0);
    clash[0] = 5;
    clash[1] = 5;
    assert.equal(countSolutions(clash), 0);
    assert.equal(countSolutions(new Array<number>(CELLS).fill(0)), 2);
  });

  it("gives every square twenty peers and every unit nine squares", () => {
    assert.ok(PEERS.every((peers) => peers.length === 20));
    assert.equal(UNITS.length, 27);
    assert.ok(UNITS.every((unit) => unit.length === 9));
  });
});

const puzzle = generatePuzzle(42, "easy");
const givens = toCells(puzzle.givens);
const solution = toCells(puzzle.solution);
const blank = givens.indexOf(0);

describe("the board", () => {
  it("is solved only when every square is right", () => {
    assert.equal(isSolved(givens, solution), false);
    assert.equal(isSolved(solution, solution), true);
  });

  it("counts what's left of each digit, ignoring slips", () => {
    const values = givens.slice();
    const digit = solution[blank]!;
    const before = remaining(values, solution)[digit]!;
    values[blank] = digit === 9 ? 1 : digit + 1;
    assert.deepEqual(remaining(values, solution), remaining(givens, solution));
    values[blank] = digit;
    assert.equal(remaining(values, solution)[digit], before - 1);
    assert.deepEqual(remaining(solution, solution).slice(1), new Array(9).fill(0));
  });

  it("reports the rows, columns and boxes a digit completes", () => {
    const values = solution.slice();
    assert.equal(finishedUnits(values, solution, 40).length, 3);
    values[41] = 0;
    // Same row and box as 40, so only the column is still whole.
    assert.equal(finishedUnits(values, solution, 40).length, 1);
  });
});

describe("pencil marks", () => {
  it("auto notes always include the answer and never mark a filled square", () => {
    const notes = autoNotes(givens, solution);
    givens.forEach((digit, cell) => {
      if (digit !== 0) assert.equal(notes[cell], 0);
      else assert.ok(hasNote(notes, cell, solution[cell]!));
    });
  });

  it("auto notes look past a wrong digit", () => {
    const values = givens.slice();
    values[blank] = solution[blank] === 9 ? 1 : solution[blank]! + 1;
    assert.deepEqual(autoNotes(values, solution), autoNotes(givens, solution));
  });

  it("placing a digit rubs it out of its row, column and box", () => {
    const digit = solution[blank]!;
    const notes = notesAfterPlacing(autoNotes(givens, solution), blank, digit);
    assert.equal(notes[blank], 0);
    for (const peer of PEERS[blank]!) assert.equal(hasNote(notes, peer, digit), false);
  });

  it("toggles on and off", () => {
    const empty = new Array<number>(CELLS).fill(0);
    const on = toggleNote(empty, 3, 7);
    assert.equal(hasNote(on, 3, 7), true);
    assert.deepEqual(toggleNote(on, 3, 7), empty);
  });
});

describe("scoring", () => {
  it("is worth more the faster and the harder", () => {
    assert.ok(scoreSolve("easy", 100) > scoreSolve("easy", 200));
    assert.ok(scoreSolve("expert", 300) > scoreSolve("easy", 300));
    assert.ok(scoreSolve("easy", 100_000) >= 1);
  });

  it("charges more for a hint than for a slip", () => {
    assert.ok(HINT_SECONDS > MISTAKE_SECONDS);
  });
});

describe("the day's puzzle", () => {
  it("is easy on Monday and hardest on Sunday", () => {
    // 5 October 2026 is a Monday.
    const week = [5, 6, 7, 8, 9, 10, 11].map((day) => dailyDifficulty(new Date(2026, 9, day, 12)));
    assert.deepEqual(week, ["easy", "easy", "medium", "medium", "hard", "hard", "expert"]);
  });

  it("has a different seed each day", () => {
    assert.notEqual(dailyPuzzleSeed(20000), dailyPuzzleSeed(20001));
    assert.equal(dailyPuzzleSeed(20000), dailyPuzzleSeed(20000));
  });
});

describe("the share text", () => {
  it("marks a box red for a slip, yellow for a hint, and gives no digits away", () => {
    const boxes = boxMarks([0, 80], [80, 40]);
    assert.deepEqual(boxes, [
      "slipped", "clean", "clean",
      "clean", "helped", "clean",
      "clean", "clean", "slipped",
    ]);
    const message = dailyShareText(
      { difficulty: "hard", boxes, seconds: 522, mistakes: 2, hints: 1 },
      "2026-10-03",
      3,
      "https://example.test/?play=sudoku",
    );
    assert.deepEqual(message.split("\n"), [
      "Dad's Arcade · Uncle Potato Head's Sudoku · Oct 3 · HARD",
      "⏱ 8:42 · 2 slips · 1 hint",
      "🟥🟩🟩",
      "🟩🟨🟩",
      "🟩🟩🟥",
      "🔥 3-day streak",
      "https://example.test/?play=sudoku",
    ]);
  });

  it("says so when there were none, and leaves a one-day streak out", () => {
    const message = dailyShareText(
      { difficulty: "easy", boxes: boxMarks([], []), seconds: 61, mistakes: 0, hints: 0 },
      "2026-10-05",
      1,
      "link",
    );
    assert.equal(message.split("\n")[1], "⏱ 1:01 · no slips · no hints");
    assert.equal(message.includes("streak"), false);
  });
});

describe("a saved game", () => {
  const saved: SavedGame = {
    date: "2026-10-03",
    puzzle,
    values: puzzle.givens,
    notes: new Array<number>(CELLS).fill(0),
    autoNotes: false,
    seconds: 12.5,
    penalty: 30,
    mistakes: 1,
    hints: 0,
    helped: [],
    slipped: [blank],
    result: null,
  };

  it("comes back as it went in", () => {
    assert.deepEqual(parseSavedGame(JSON.parse(JSON.stringify(saved))), saved);
  });

  it("is refused if it isn't one", () => {
    assert.equal(parseSavedGame(null), null);
    assert.equal(parseSavedGame({ ...saved, values: "123" }), null);
    assert.equal(parseSavedGame({ ...saved, puzzle: { ...puzzle, solution: puzzle.givens } }), null);
  });

  it("is refused if a given has been changed", () => {
    const given = givens.findIndex((digit) => digit !== 0);
    const tampered = puzzle.givens.slice(0, given) + "0" + puzzle.givens.slice(given + 1);
    assert.equal(parseSavedGame({ ...saved, values: tampered }), null);
  });

  it("drops what it can't trust and keeps the rest", () => {
    const loose = parseSavedGame({ ...saved, notes: "nope", helped: [3, 999, "x"], result: { score: "lots" } });
    assert.deepEqual(loose?.notes, saved.notes);
    assert.deepEqual(loose?.helped, [3]);
    assert.equal(loose?.result, null);
  });
});

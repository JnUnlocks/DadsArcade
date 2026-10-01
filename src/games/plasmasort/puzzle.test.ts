/**
 * Plasma Sort's rules and its daily deal.
 *
 * The daily board only means anything if every device deals the same tubes and
 * agrees on the same par, and if par really is the fewest pours. Those are the
 * claims worth pinning down here rather than discovering on a leaderboard.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAPACITY,
  EMPTY_TUBES,
  cloneBoard,
  generatePuzzle,
  isComplete,
  isSolved,
  isStuck,
  pour,
  pourCount,
  scoreSolve,
  solve,
  speedBonus,
  starsFor,
  topRun,
  unpour,
  type Board,
} from "./puzzle.ts";
import { advanceStreak, liveStreak } from "./progress.ts";

describe("pouring", () => {
  it("moves the whole run of one colour off the top", () => {
    const board: Board = [[1, 2, 2], [], [3]];
    assert.equal(topRun(board[0]!), 2);
    const move = pour(board, 0, 1);
    assert.deepEqual(move, { from: 0, to: 1, count: 2 });
    assert.deepEqual(board, [[1], [2, 2], [3]]);
  });

  it("only lands on an empty tube or the same colour", () => {
    const board: Board = [[1, 2], [3], [2], []];
    assert.equal(pourCount(board, 0, 1), 0, "2 onto 3");
    assert.equal(pourCount(board, 0, 2), 1, "2 onto 2");
    assert.equal(pourCount(board, 0, 3), 1, "2 into empty");
    assert.equal(pourCount(board, 0, 0), 0, "onto itself");
    assert.equal(pourCount(board, 3, 0), 0, "from empty");
  });

  it("pours only what fits, and leaves the rest behind", () => {
    const board: Board = [[1, 2, 2, 2], [3, 3, 2], []];
    assert.equal(pourCount(board, 0, 1), 1);
    pour(board, 0, 1);
    assert.deepEqual(board, [[1, 2, 2], [3, 3, 2, 2], []]);
    assert.equal(pourCount(board, 0, 1), 0, "full tube takes nothing");
  });

  it("refuses an illegal pour without touching the board", () => {
    const board: Board = [[1, 2], [3]];
    const before = cloneBoard(board);
    assert.equal(pour(board, 0, 1), null);
    assert.deepEqual(board, before);
  });

  it("is exactly undone by unpour, including a partial pour", () => {
    const board: Board = [[1, 2, 2, 2], [3, 3, 2], [1]];
    const before = cloneBoard(board);
    const move = pour(board, 0, 1)!;
    unpour(board, move);
    assert.deepEqual(board, before);
  });
});

describe("finishing", () => {
  it("counts a tube as complete only when full of one colour", () => {
    assert.ok(isComplete([2, 2, 2, 2]));
    assert.ok(!isComplete([2, 2, 2]));
    assert.ok(!isComplete([2, 2, 2, 1]));
    assert.ok(!isComplete([]));
  });

  it("is solved when every tube is empty or complete", () => {
    assert.ok(isSolved([[1, 1, 1, 1], [], [2, 2, 2, 2]]));
    assert.ok(!isSolved([[1, 1, 1], [1], [2, 2, 2, 2]]));
  });

  it("knows when there is nothing useful left to pour", () => {
    assert.ok(isStuck([[1, 2, 1, 2], [2, 1, 2, 1]]));
    assert.ok(!isStuck([[1, 2, 1, 2], [2, 1, 2, 1], []]));
    // Sliding a one-colour tube into an empty one goes nowhere.
    assert.ok(isStuck([[3, 3, 3], []]));
    assert.ok(!isStuck([[1, 1, 1, 1], []]), "solved is not stuck");
  });
});

describe("the solver", () => {
  it("finds the fewest pours", () => {
    assert.equal(solve([[1, 1, 1, 1], []]), 0);
    assert.equal(solve([[1, 1, 1], [1], []]), 1);
    // 2s out to the spare tube, 1s together, 2s together.
    assert.equal(solve([[1, 1, 2, 2], [2, 2, 1, 1], []]), 3);
  });

  it("says so when a board can't be solved", () => {
    assert.equal(solve([[1, 2, 1, 2], [2, 1, 2, 1]]), null);
  });
});

describe("the daily deal", () => {
  it("is identical for the same seed", () => {
    const a = generatePuzzle(20727, 6);
    const b = generatePuzzle(20727, 6);
    assert.deepEqual(a, b);
  });

  it("differs from one day to the next", () => {
    const a = generatePuzzle(20727, 6);
    const b = generatePuzzle(20728, 6);
    assert.notDeepEqual(a.board, b.board);
  });

  it("deals every colour exactly CAPACITY times, plus the empty tubes", () => {
    for (const colours of [4, 6]) {
      const { board } = generatePuzzle(99, colours);
      assert.equal(board.length, colours + EMPTY_TUBES);
      const counts = new Map<number, number>();
      for (const cell of board.flat()) counts.set(cell, (counts.get(cell) ?? 0) + 1);
      assert.equal(counts.size, colours);
      for (const n of counts.values()) assert.equal(n, CAPACITY);
    }
  });

  it("is solvable, with an honest par, for two months of days", () => {
    for (let day = 0; day < 60; day += 1) {
      const { board, par } = generatePuzzle(20727 + day, 6);
      assert.equal(solve(board), par, `day ${day}`);
      assert.ok(par >= 16, `day ${day} is too easy at par ${par}`);
      assert.ok(!isSolved(board));
      assert.ok(!board.some(isComplete), `day ${day} starts with a finished tube`);
    }
  });
});

describe("scoring", () => {
  it("pays full marks for par and takes 50 a pour after that", () => {
    assert.equal(scoreSolve(19, 19, 9999), 1000);
    assert.equal(scoreSolve(21, 19, 9999), 900);
  });

  it("never pays less than the floor for a solved puzzle", () => {
    assert.equal(scoreSolve(200, 19, 9999), 100);
  });

  it("adds a speed bonus that fades and never goes negative", () => {
    assert.equal(speedBonus(10), 200);
    assert.equal(speedBonus(45), 200);
    assert.ok(speedBonus(120) < 200 && speedBonus(120) > 0);
    assert.equal(speedBonus(300), 0);
    assert.equal(speedBonus(5000), 0);
  });

  it("values a pour above a minute of thinking", () => {
    const quickButSloppy = scoreSolve(20, 19, 60);
    const slowButPerfect = scoreSolve(19, 19, 120);
    assert.ok(slowButPerfect > quickButSloppy);
  });

  it("gives three stars for par, two for close, one for solved", () => {
    assert.equal(starsFor(19, 19), 3);
    assert.equal(starsFor(22, 19), 2);
    assert.equal(starsFor(23, 19), 1);
  });
});

describe("the streak", () => {
  const today = "2026-09-30";
  const yesterday = "2026-09-29";

  it("starts at one", () => {
    assert.deepEqual(advanceStreak({ last: "", count: 0 }, today, yesterday), {
      last: today,
      count: 1,
    });
  });

  it("grows when yesterday was solved", () => {
    assert.equal(advanceStreak({ last: yesterday, count: 4 }, today, yesterday).count, 5);
  });

  it("doesn't count the same day twice", () => {
    assert.equal(advanceStreak({ last: today, count: 4 }, today, yesterday).count, 4);
  });

  it("resets after a missed day, and stops showing once it's broken", () => {
    const stale = { last: "2026-09-27", count: 9 };
    assert.equal(advanceStreak(stale, today, yesterday).count, 1);
    assert.equal(liveStreak(stale, today, yesterday), 0);
    assert.equal(liveStreak({ last: yesterday, count: 3 }, today, yesterday), 3);
  });
});

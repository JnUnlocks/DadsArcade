/**
 * BRICK BLAST's rules.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  anyMoves,
  boardClearBonus,
  canPlace,
  clearLines,
  clearScore,
  deal,
  emptyBoard,
  fitsAnywhere,
  fullLines,
  isEmpty,
  levelForLines,
  linesUntilNextLevel,
  LINES_PER_LEVEL,
  MAX_LEVEL,
  place,
  SHAPES,
  shapeWeight,
  SIZE,
  type Board,
  type Shape,
} from "./puzzle.ts";

const shape = (id: string): Shape => {
  const found = SHAPES.find((s) => s.id === id);
  assert.ok(found, `no shape called ${id}`);
  return found;
};

function fillRow(board: Board, row: number, except: number[] = []) {
  for (let col = 0; col < SIZE; col += 1) if (!except.includes(col)) board[row]![col] = "I";
}

function fillCol(board: Board, col: number, except: number[] = []) {
  for (let row = 0; row < SIZE; row += 1) if (!except.includes(row)) board[row]![col] = "J";
}

/** A deterministic stand-in for Math.random. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("brick blast pieces", () => {
  it("has no two pieces the same", () => {
    const seen = new Set<string>();
    for (const s of SHAPES) {
      const key = s.cells.map(([c, r]) => `${c},${r}`).sort().join(" ");
      assert.ok(!seen.has(key), `${s.id} repeats another piece`);
      seen.add(key);
    }
  });

  it("measures every piece from its top-left corner", () => {
    for (const s of SHAPES) {
      assert.equal(Math.min(...s.cells.map(([c]) => c)), 0, s.id);
      assert.equal(Math.min(...s.cells.map(([, r]) => r)), 0, s.id);
      assert.equal(Math.max(...s.cells.map(([c]) => c)) + 1, s.w, s.id);
      assert.equal(Math.max(...s.cells.map(([, r]) => r)) + 1, s.h, s.id);
    }
  });

  it("fits every piece on an empty board", () => {
    const board = emptyBoard();
    for (const s of SHAPES) assert.ok(fitsAnywhere(board, s), s.id);
  });
});

describe("placing", () => {
  it("keeps a piece on the board", () => {
    const board = emptyBoard();
    const line = shape("h5");
    assert.equal(canPlace(board, line, 0, 0), true);
    assert.equal(canPlace(board, line, SIZE - 5, SIZE - 1), true);
    assert.equal(canPlace(board, line, SIZE - 4, 0), false);
    assert.equal(canPlace(board, line, -1, 0), false);
    assert.equal(canPlace(board, shape("v5"), 0, SIZE - 4), false);
  });

  it("won't put a piece on top of another", () => {
    const board = emptyBoard();
    place(board, shape("sq2"), 3, 3);
    assert.equal(canPlace(board, shape("dot"), 4, 4), false);
    assert.equal(canPlace(board, shape("dot"), 5, 4), true);
  });

  it("lets a piece sit in the hollow of its own shape", () => {
    // The empty corner of an L is free space, not part of the piece.
    const board = emptyBoard();
    place(board, shape("corner-a"), 0, 0);
    assert.equal(canPlace(board, shape("dot"), 1, 0), true);
  });
});

describe("clearing", () => {
  it("finds full rows and full columns", () => {
    const board = emptyBoard();
    fillRow(board, 2);
    fillCol(board, 5);
    assert.deepEqual(fullLines(board), { rows: [2], cols: [5] });
  });

  it("leaves a line with a gap alone", () => {
    const board = emptyBoard();
    fillRow(board, 2, [7]);
    assert.deepEqual(fullLines(board), { rows: [], cols: [] });
  });

  it("clears a row and a column that cross, and counts the crossing once", () => {
    const board = emptyBoard();
    fillRow(board, 2);
    fillCol(board, 5);
    board[0]![0] = "T";

    const lines = fullLines(board);
    const gone = clearLines(board, lines);
    assert.equal(gone.length, SIZE + SIZE - 1);
    assert.equal(board[0]![0], "T", "a square off both lines stays");
    assert.equal(
      board.flat().filter((tile) => tile !== null).length,
      1,
      "everything on either line has gone",
    );
  });

  it("drops nothing: squares above a cleared row stay where they are", () => {
    const board = emptyBoard();
    fillRow(board, 5);
    board[1]![3] = "S";
    clearLines(board, fullLines(board));
    assert.equal(board[1]![3], "S");
  });

  it("knows an empty board", () => {
    const board = emptyBoard();
    assert.equal(isEmpty(board), true);
    fillRow(board, 0);
    assert.equal(isEmpty(board), false);
    clearLines(board, fullLines(board));
    assert.equal(isEmpty(board), true);
  });
});

describe("the end of the game", () => {
  it("goes on while any piece in the tray fits", () => {
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [0]);
    // Only column 0 is open: a tall line fits, a wide one cannot.
    assert.equal(anyMoves(board, [shape("h2"), null, shape("v4")]), true);
    assert.equal(anyMoves(board, [shape("h2"), null, shape("sq2")]), false);
  });

  it("is over with an empty tray slot and nothing else that fits", () => {
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [row % 2 === 0 ? 0 : 7]);
    assert.equal(anyMoves(board, [null, shape("v2"), null]), false);
    assert.equal(anyMoves(board, [null, shape("dot"), null]), true);
  });
});

describe("dealing", () => {
  it("deals three pieces", () => {
    assert.equal(deal(emptyBoard(), 1, sequence(1)).length, 3);
  });

  it("never deals a hand with nothing that fits", () => {
    // A board with single holes only: just the one-square piece can go.
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [row % 2 === 0 ? 1 : 5]);
    for (let seed = 1; seed <= 40; seed += 1) {
      const hand = deal(board, 12, sequence(seed));
      assert.ok(anyMoves(board, hand), `seed ${seed} dealt a dead hand`);
    }
  });

  it("deals more big pieces and fewer fillers as the level climbs", () => {
    const big = shape("sq3");
    const small = shape("dot");
    assert.ok(shapeWeight(big, 20) > shapeWeight(big, 1));
    assert.ok(shapeWeight(small, 20) < shapeWeight(small, 1));
    assert.ok(shapeWeight(small, MAX_LEVEL) > 0, "the filler never disappears");
    assert.equal(shapeWeight(shape("h4"), 20), shapeWeight(shape("h4"), 1));
  });
});

describe("scoring and levels", () => {
  it("pays more for two lines with one piece than for two pieces taking one each", () => {
    assert.ok(clearScore(2, 1, 1) > clearScore(1, 1, 1) * 2);
    assert.ok(clearScore(3, 1, 1) > clearScore(2, 1, 1) + clearScore(1, 1, 1));
    assert.equal(clearScore(0, 4, 3), 0);
  });

  it("pays more for every clear in a row, and nothing extra for the first", () => {
    assert.ok(clearScore(1, 2, 1) > clearScore(1, 1, 1));
    assert.ok(clearScore(1, 3, 1) > clearScore(1, 2, 1));
    assert.equal(clearScore(1, 0, 1), clearScore(1, 1, 1));
  });

  it("scales the payout with the level", () => {
    assert.equal(clearScore(2, 3, 4), clearScore(2, 3, 1) * 4);
    assert.equal(boardClearBonus(3), boardClearBonus(1) * 3);
  });

  it("levels up every few lines, up to the top", () => {
    assert.equal(levelForLines(0), 1);
    assert.equal(levelForLines(LINES_PER_LEVEL - 1), 1);
    assert.equal(levelForLines(LINES_PER_LEVEL), 2);
    assert.equal(levelForLines(100000), MAX_LEVEL);
  });

  it("counts down to the next level", () => {
    assert.equal(linesUntilNextLevel(0), LINES_PER_LEVEL);
    assert.equal(linesUntilNextLevel(LINES_PER_LEVEL - 1), 1);
    assert.equal(linesUntilNextLevel(LINES_PER_LEVEL), LINES_PER_LEVEL);
    // Two lines with one piece can carry you past the threshold.
    assert.equal(linesUntilNextLevel(LINES_PER_LEVEL + 1), LINES_PER_LEVEL - 1);
    assert.equal(linesUntilNextLevel(100000), null);
  });
});

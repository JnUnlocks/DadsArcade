/**
 * BRICK BLAST's rules.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  anyMoves,
  bestMove,
  boardClearBonus,
  canPlace,
  clearLines,
  clearScore,
  deal,
  emptyBoard,
  fitsAnywhere,
  fitsTurned,
  freeShare,
  fullLines,
  isEmpty,
  levelForLines,
  linesUntilNextLevel,
  LINES_PER_LEVEL,
  MAX_LEVEL,
  place,
  rotate,
  sameShape,
  SHAPES,
  shapeWeight,
  SIZE,
  turns,
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
    // Only column 0 is open: a tall line fits, anything two wide cannot.
    assert.equal(anyMoves(board, [shape("sq3"), null, shape("v4")]), true);
    assert.equal(anyMoves(board, [shape("sq3"), null, shape("sq2")]), false);
  });

  it("goes on while a piece would fit if it were turned", () => {
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [0]);
    const wide = shape("h4");
    assert.equal(fitsAnywhere(board, wide), false, "it doesn't fit as it sits");
    assert.equal(fitsTurned(board, wide), true, "it does on its end");
    assert.equal(anyMoves(board, [wide, null, null]), true);
  });

  it("is over with an empty tray slot and nothing else that fits", () => {
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [row % 2 === 0 ? 0 : 7]);
    assert.equal(anyMoves(board, [null, shape("v2"), null]), false);
    assert.equal(anyMoves(board, [null, shape("dot"), null]), true);
  });
});

describe("turning", () => {
  it("turns a wide line into a tall one", () => {
    assert.ok(sameShape(rotate(shape("h3")), shape("v3")));
    assert.equal(rotate(shape("h3")).w, 1);
    assert.equal(rotate(shape("h3")).h, 3);
  });

  it("comes back to where it started after four turns", () => {
    for (const s of SHAPES) {
      const round = rotate(rotate(rotate(rotate(s))));
      assert.ok(sameShape(round, s), s.id);
    }
  });

  it("keeps a turned piece measured from its top-left corner", () => {
    for (const s of SHAPES) {
      const turned = rotate(s);
      assert.equal(Math.min(...turned.cells.map(([c]) => c)), 0, s.id);
      assert.equal(Math.min(...turned.cells.map(([, r]) => r)), 0, s.id);
      assert.equal(Math.max(...turned.cells.map(([c]) => c)) + 1, turned.w, s.id);
      assert.equal(Math.max(...turned.cells.map(([, r]) => r)) + 1, turned.h, s.id);
      assert.equal(turned.cells.length, s.cells.length, s.id);
    }
  });

  it("counts the ways up a piece really has", () => {
    assert.equal(turns(shape("sq2")).length, 1);
    assert.equal(turns(shape("h4")).length, 2);
    assert.equal(turns(shape("ess-a")).length, 2);
    assert.equal(turns(shape("ell-a")).length, 4);
    assert.equal(turns(shape("tee-a")).length, 4);
  });
});

describe("the hint", () => {
  it("points at the spot that finishes a line", () => {
    const board = emptyBoard();
    fillRow(board, 7, [2, 3, 4]);
    const move = bestMove(board, [shape("sq2"), shape("h3"), null]);
    assert.ok(move);
    assert.equal(move.slot, 1);
    assert.deepEqual([move.col, move.row], [2, 7]);
    assert.equal(move.turned, false);
  });

  it("turns a piece when that is what finishes the line", () => {
    const board = emptyBoard();
    fillRow(board, 7, [2, 3, 4]);
    const move = bestMove(board, [shape("v3"), null, null]);
    assert.ok(move);
    assert.deepEqual([move.col, move.row], [2, 7]);
    assert.equal(move.turned, true);
    assert.ok(sameShape(move.shape, shape("h3")));
  });

  it("only ever points somewhere the piece can go", () => {
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [row % 2 === 0 ? 1 : 5]);
    const move = bestMove(board, [shape("sq3"), shape("dot"), shape("h5")]);
    assert.ok(move);
    assert.equal(move.slot, 1);
    assert.ok(canPlace(board, move.shape, move.col, move.row));
  });

  it("has nothing to say when nothing fits", () => {
    const board = emptyBoard();
    for (let row = 0; row < SIZE; row += 1) fillRow(board, row, [row % 2 === 0 ? 1 : 5]);
    assert.equal(bestMove(board, [shape("sq2"), null, shape("h2")]), null);
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

  it("deals a hand where every piece has somewhere to go, when it can", () => {
    const board = emptyBoard();
    place(board, shape("sq3"), 0, 0);
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const piece of deal(board, 6, sequence(seed))) {
        assert.ok(fitsTurned(board, piece), `seed ${seed} dealt a ${piece.id} that can't go`);
      }
    }
  });

  it("measures how much of the board is left", () => {
    const board = emptyBoard();
    assert.equal(freeShare(board), 1);
    for (let row = 0; row < 4; row += 1) fillRow(board, row);
    assert.equal(freeShare(board), 0.5);
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

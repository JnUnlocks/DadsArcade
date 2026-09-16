/**
 * The well's rules, and the shape of the twenty-five level climb.
 *
 * Line clearing is the classic place this genre goes quietly wrong: clearing
 * two rows at once and dropping the wrong one looks like a rendering glitch,
 * not a logic bug, and it only shows up when someone is halfway up the well
 * and has most to lose.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearLines,
  COLS,
  dropDistance,
  emptyGrid,
  fallInterval,
  fits,
  EARLY_LEVELS,
  EARLY_LINES_PER_LEVEL,
  LINES_PER_LEVEL,
  lineScore,
  levelForLines,
  linesToReach,
  linesUntilNextLevel,
  MAX_LEVEL,
  occupiedCells,
  ROWS,
  settle,
  SPAWN_ROWS,
  type Grid,
  type Piece,
} from "./board.ts";
import { cellsFor, PIECE_COLOURS, PIECE_KINDS, pieceWidth } from "./pieces.ts";

function fill(grid: Grid, row: number, except: number[] = []) {
  for (let c = 0; c < COLS; c += 1) {
    if (!except.includes(c)) grid[row]![c] = "I";
  }
}

const piece = (over: Partial<Piece> = {}): Piece => ({
  kind: "O",
  rotation: 0,
  col: 4,
  row: 0,
  ...over,
});

describe("the pieces", () => {
  it("has seven, each four cells in every rotation", () => {
    // All seven tetrominoes, and rotation must never gain or lose a cell.
    assert.equal(PIECE_KINDS.length, 7);
    for (const kind of PIECE_KINDS) {
      for (let rotation = 0; rotation < 4; rotation += 1) {
        assert.equal(
          cellsFor(kind, rotation).length,
          4,
          `${kind} rotation ${rotation} is not four cells`,
        );
      }
    }
  });

  it("has no duplicate cells within a piece", () => {
    for (const kind of PIECE_KINDS) {
      for (let rotation = 0; rotation < 4; rotation += 1) {
        const cells = cellsFor(kind, rotation).map(([c, r]) => `${c},${r}`);
        assert.equal(new Set(cells).size, 4, `${kind} r${rotation} overlaps itself`);
      }
    }
  });

  it("keeps every piece connected", () => {
    // A tetromino whose cells aren't edge-adjacent would fall apart visually.
    for (const kind of PIECE_KINDS) {
      for (let rotation = 0; rotation < 4; rotation += 1) {
        const cells = cellsFor(kind, rotation);
        const seen = new Set<string>([`${cells[0]![0]},${cells[0]![1]}`]);
        const queue = [cells[0]!];
        while (queue.length) {
          const [c, r] = queue.pop()!;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const hit = cells.find((x) => x[0] === c + dc! && x[1] === r + dr!);
            if (hit && !seen.has(`${hit[0]},${hit[1]}`)) {
              seen.add(`${hit[0]},${hit[1]}`);
              queue.push(hit);
            }
          }
        }
        assert.equal(seen.size, 4, `${kind} r${rotation} is not connected`);
      }
    }
  });

  it("wraps rotation in both directions", () => {
    for (const kind of PIECE_KINDS) {
      assert.deepEqual(cellsFor(kind, 4), cellsFor(kind, 0));
      assert.deepEqual(cellsFor(kind, -1), cellsFor(kind, 3));
    }
  });

  it("leaves the square piece alone when it turns", () => {
    // The O has no meaningful rotation; a generic matrix rotate drifts it.
    for (let rotation = 0; rotation < 4; rotation += 1) {
      assert.deepEqual(cellsFor("O", rotation), cellsFor("O", 0));
    }
  });

  it("gives every piece its own colour", () => {
    const colours = PIECE_KINDS.map((k) => PIECE_COLOURS[k]);
    assert.equal(new Set(colours).size, PIECE_KINDS.length);
  });

  it("measures width correctly for centring", () => {
    assert.equal(pieceWidth("I", 0), 4);
    assert.equal(pieceWidth("I", 1), 1);
    assert.equal(pieceWidth("O", 0), 2);
  });
});

describe("the well", () => {
  it("blocks the walls and the floor but not the sky", () => {
    const grid = emptyGrid();
    // Uses I rotation 1, a single column of four cells at offset 2, so the
    // bounding box margins don't muddy what "against the wall" means. The O
    // piece has an empty column on its left and would sit happily at col -1.
    const bar = (col: number) => piece({ kind: "I" as const, rotation: 1, col, row: 0 });
    assert.ok(fits(grid, bar(-2)), "against the left wall is fine");
    assert.ok(!fits(grid, bar(-3)), "through the left wall is not");
    assert.ok(fits(grid, bar(COLS - 3)), "against the right wall is fine");
    assert.ok(!fits(grid, bar(COLS - 2)), "through the right wall is not");
    // Pieces spawn above the visible well and must be allowed to exist there.
    assert.ok(fits(grid, piece({ row: -2 })), "above the board is fine");
    assert.ok(!fits(grid, piece({ row: ROWS + SPAWN_ROWS })), "below the floor is not");
  });

  it("blocks settled blocks", () => {
    const grid = emptyGrid();
    // The O at col 4 occupies columns 5 and 6, not 4 -- its cells start at a
    // one-column offset. Block a cell it genuinely covers.
    grid[5]![5] = "T";
    assert.ok(!fits(grid, piece({ col: 4, row: 4 })), "should collide");
    assert.ok(fits(grid, piece({ col: 7, row: 4 })), "clear of it should not");
  });

  it("drops a piece exactly onto the floor", () => {
    const grid = emptyGrid();
    const p = piece({ row: 0 });
    const distance = dropDistance(grid, p);
    const landed = { ...p, row: p.row + distance };
    assert.ok(fits(grid, landed), "the landing spot must be legal");
    assert.ok(!fits(grid, { ...landed, row: landed.row + 1 }), "and one lower must not");
  });
});

describe("clearing lines", () => {
  it("clears a full row and drops what was above it", () => {
    const grid = emptyGrid();
    const bottom = ROWS + SPAWN_ROWS - 1;
    fill(grid, bottom);
    grid[bottom - 1]![3] = "T"; // a lone block sitting above

    const { grid: after, cleared } = clearLines(grid);
    assert.deepEqual(cleared, [bottom]);
    assert.equal(after[bottom]![3], "T", "the block above should have fallen");
    assert.equal(after[bottom - 1]![3], null);
  });

  it("clears four at once without skipping one", () => {
    // The bug this pins: splicing rows while walking the grid skips a row when
    // several clear together, and one row of a four silently survives.
    const grid = emptyGrid();
    const bottom = ROWS + SPAWN_ROWS - 1;
    for (let i = 0; i < 4; i += 1) fill(grid, bottom - i);
    grid[bottom - 4]![7] = "L";

    const { grid: after, cleared } = clearLines(grid);
    assert.equal(cleared.length, 4, "all four rows must clear");
    for (let i = 0; i < 4; i += 1) {
      assert.ok(
        after[bottom - i]!.some((c) => c === null),
        `row ${bottom - i} survived the clear`,
      );
    }
    assert.equal(after[bottom]![7], "L", "the marker should land on the floor");
  });

  it("clears rows that aren't touching each other", () => {
    const grid = emptyGrid();
    const bottom = ROWS + SPAWN_ROWS - 1;
    fill(grid, bottom);
    fill(grid, bottom - 2);

    const { cleared } = clearLines(grid);
    assert.deepEqual(cleared, [bottom - 2, bottom]);
  });

  it("leaves a row with a single gap alone", () => {
    const grid = emptyGrid();
    fill(grid, ROWS, [5]);
    const { cleared } = clearLines(grid);
    assert.deepEqual(cleared, []);
  });

  it("always returns a grid of the right size", () => {
    const grid = emptyGrid();
    for (let i = 0; i < 6; i += 1) fill(grid, ROWS + SPAWN_ROWS - 1 - i);
    const { grid: after } = clearLines(grid);
    assert.equal(after.length, ROWS + SPAWN_ROWS);
    for (const row of after) assert.equal(row.length, COLS);
  });

  it("settles a piece into the cells it occupied", () => {
    const grid = emptyGrid();
    const p = piece({ kind: "T", col: 3, row: 6 });
    settle(grid, p);
    for (const [col, row] of occupiedCells(p)) {
      assert.equal(grid[row]![col], "T", `cell ${col},${row} should be filled`);
    }
  });
});

describe("the twenty-five level climb", () => {
  it("gets faster at every single level, all the way to 25", () => {
    // A ramp that flattens early makes the back half of the climb pointless.
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      assert.ok(
        fallInterval(level) < fallInterval(level - 1),
        `level ${level} is not faster than ${level - 1}`,
      );
    }
  });

  it("starts gently and ends hard, but never impossible", () => {
    assert.ok(fallInterval(1) >= 0.8, `level 1 at ${fallInterval(1)}s is too brisk to start`);
    assert.ok(fallInterval(MAX_LEVEL) <= 0.09, "level 25 should be genuinely fast");
    // Below ~50ms a row the piece is teleporting and only spawn-memorisation
    // works, which isn't a game any more.
    assert.ok(fallInterval(MAX_LEVEL) >= 0.05, "level 25 must stay playable");
  });

  it("stops at 25 however many lines are cleared", () => {
    assert.equal(levelForLines(0), 1);
    assert.equal(levelForLines(linesToReach(MAX_LEVEL)), MAX_LEVEL);
    assert.equal(levelForLines(100_000), MAX_LEVEL);
    assert.equal(fallInterval(999), fallInterval(MAX_LEVEL));
  });

  it("levels up quickly at first, then settles", () => {
    // The first playtest ran 3:39 on level 1. The early levels are shorter so
    // a new player hears a level-up while they're still learning the controls.
    assert.equal(levelForLines(EARLY_LINES_PER_LEVEL - 1), 1);
    assert.equal(levelForLines(EARLY_LINES_PER_LEVEL), 2, "first level-up at 4 lines");
    assert.equal(linesToReach(EARLY_LEVELS + 1), EARLY_LEVELS * EARLY_LINES_PER_LEVEL);
    assert.equal(
      linesToReach(EARLY_LEVELS + 2) - linesToReach(EARLY_LEVELS + 1),
      LINES_PER_LEVEL,
      "after the early levels, each takes the full eight",
    );
  });

  it("makes the whole climb a real undertaking", () => {
    // 3 early levels at 4, then 21 more at 8.
    assert.equal(linesToReach(MAX_LEVEL), 180);
  });

  it("never lets the level go backwards as lines accumulate", () => {
    let previous = 1;
    for (let lines = 0; lines <= 250; lines += 1) {
      const level = levelForLines(lines);
      assert.ok(level >= previous, `level dropped at ${lines} lines`);
      assert.ok(level - previous <= 1, `skipped a level at ${lines} lines`);
      previous = level;
    }
  });

  it("counts down exactly to each level-up", () => {
    for (let lines = 0; lines < linesToReach(MAX_LEVEL); lines += 1) {
      const remaining = linesUntilNextLevel(lines);
      assert.ok(remaining !== null && remaining > 0, `bad countdown at ${lines}`);
      assert.equal(
        levelForLines(lines + remaining),
        levelForLines(lines) + 1,
        `clearing ${remaining} more from ${lines} should be exactly one level-up`,
      );
    }
    assert.equal(linesUntilNextLevel(linesToReach(MAX_LEVEL)), null, "nothing to count at the top");
  });

  it("pays more for four rows at once than for four singles", () => {
    // The whole reason to build a well and wait rather than shave the top.
    assert.ok(lineScore(4, 1) > lineScore(1, 1) * 4);
    assert.ok(lineScore(3, 1) > lineScore(1, 1) * 3);
    assert.equal(lineScore(0, 5), 0);
  });

  it("scales the payout with the level", () => {
    assert.equal(lineScore(1, 4), lineScore(1, 1) * 4);
  });
});

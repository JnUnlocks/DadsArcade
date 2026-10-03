/**
 * Snake's rules: the turn queue, what counts as a crash, and the pickups.
 *
 * The cases here are the ones a player feels without being able to name: a
 * turn that got dropped, a death in a square that was about to be empty.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Rng } from "../../core/rng.ts";
import {
  COLS,
  ROWS,
  START_HEAD_COL,
  START_LENGTH,
  START_ROW,
  advance,
  classicBonusValue,
  classicSpeed,
  createSnake,
  pickFreeCell,
  pullToward,
  queueTurn,
  safeDirs,
  type Cell,
  type Snake,
} from "./rules.ts";

const open = () => false;

/** A snake laid out along the given cells, head first. */
function snakeAt(cells: Array<[number, number]>, dir: Snake["dir"]): Snake {
  const body: Cell[] = cells.map(([col, row]) => ({ col, row }));
  return { body, dir, queue: [], grow: 0, tailFrom: { ...body[body.length - 1]! }, wraps: false };
}

describe("snake: movement", () => {
  it("starts mid-board, heading right, with room ahead", () => {
    const snake = createSnake();
    assert.equal(snake.body.length, START_LENGTH);
    assert.deepEqual(snake.body[0], { col: START_HEAD_COL, row: START_ROW });
    assert.equal(snake.dir, "right");
    assert.ok(COLS - START_HEAD_COL > 8, "a fresh snake needs time to react");
  });

  it("moves one cell a step and keeps its length", () => {
    const snake = createSnake();
    assert.equal(advance(snake, open), "moved");
    assert.deepEqual(snake.body[0], { col: START_HEAD_COL + 1, row: START_ROW });
    assert.equal(snake.body.length, START_LENGTH);
  });

  it("grows by one segment per piece of food, a step later", () => {
    const snake = createSnake();
    snake.grow = 2;
    advance(snake, open);
    advance(snake, open);
    advance(snake, open);
    assert.equal(snake.body.length, START_LENGTH + 2);
  });

  it("remembers where the tail came from, for drawing the slide", () => {
    const snake = createSnake();
    const tail = { ...snake.body[snake.body.length - 1]! };
    advance(snake, open);
    assert.deepEqual(snake.tailFrom, tail);
  });
});

describe("snake: the turn queue", () => {
  it("keeps both turns of a fast UP-then-LEFT, one per step", () => {
    const snake = createSnake();
    assert.ok(queueTurn(snake, "up"));
    assert.ok(queueTurn(snake, "left"));
    advance(snake, open);
    assert.equal(snake.dir, "up");
    advance(snake, open);
    assert.equal(snake.dir, "left");
  });

  it("refuses a reversal, judged against the last queued turn", () => {
    const snake = createSnake();
    assert.ok(!queueTurn(snake, "left"), "can't reverse straight into the neck");
    assert.ok(queueTurn(snake, "up"));
    assert.ok(!queueTurn(snake, "down"), "UP then DOWN inside one step would fold it in half");
  });

  it("ignores a repeat of the direction already set, and a third queued turn", () => {
    const snake = createSnake();
    assert.ok(!queueTurn(snake, "right"));
    assert.ok(queueTurn(snake, "up"));
    assert.ok(queueTurn(snake, "left"));
    assert.ok(!queueTurn(snake, "down"), "stale swipes shouldn't pile up");
    assert.equal(snake.queue.length, 2);
  });
});

describe("snake: crashes", () => {
  it("crashes into every wall", () => {
    assert.equal(advance(snakeAt([[COLS - 1, 5], [COLS - 2, 5]], "right"), open), "crashed");
    assert.equal(advance(snakeAt([[0, 5], [1, 5]], "left"), open), "crashed");
    assert.equal(advance(snakeAt([[5, 0], [5, 1]], "up"), open), "crashed");
    assert.equal(advance(snakeAt([[5, ROWS - 1], [5, ROWS - 2]], "down"), open), "crashed");
  });

  it("crashes into a blocked cell and leaves the snake where it was", () => {
    const snake = createSnake();
    const before = JSON.stringify(snake.body);
    const crate = (col: number, row: number) => col === START_HEAD_COL + 1 && row === START_ROW;
    assert.equal(advance(snake, crate), "crashed");
    assert.equal(JSON.stringify(snake.body), before);
  });

  it("crashes into its own body", () => {
    // A hook: the head turns back into the third segment.
    const snake = snakeAt([[5, 5], [5, 4], [4, 4], [4, 5], [4, 6]], "left");
    assert.equal(advance(snake, open), "crashed");
  });

  it("lets the head follow the tail into the cell it's leaving", () => {
    // A closed 2x2 loop: the head's next cell is the tail's current one.
    const snake = snakeAt([[5, 5], [5, 4], [4, 4], [4, 5]], "left");
    assert.equal(advance(snake, open), "moved");
  });

  it("but not while growing, when the tail stays put", () => {
    const snake = snakeAt([[5, 5], [5, 4], [4, 4], [4, 5]], "left");
    snake.grow = 1;
    assert.equal(advance(snake, open), "crashed");
  });

  it("lists the safe ways out, straight on first", () => {
    const cornered = snakeAt([[COLS - 1, 0], [COLS - 2, 0]], "right");
    assert.deepEqual(safeDirs(cornered, open), ["down"]);
    assert.deepEqual(safeDirs(createSnake(), open), ["right", "up", "down"]);
  });
});

describe("snake: open edges", () => {
  const wrapping = (cells: Array<[number, number]>, dir: Snake["dir"]): Snake => ({
    ...snakeAt(cells, dir),
    wraps: true,
  });

  it("comes back in on the far side of all four edges", () => {
    const cases: Array<[Snake, Cell]> = [
      [wrapping([[COLS - 1, 5], [COLS - 2, 5]], "right"), { col: 0, row: 5 }],
      [wrapping([[0, 5], [1, 5]], "left"), { col: COLS - 1, row: 5 }],
      [wrapping([[5, 0], [5, 1]], "up"), { col: 5, row: ROWS - 1 }],
      [wrapping([[5, ROWS - 1], [5, ROWS - 2]], "down"), { col: 5, row: 0 }],
    ];
    for (const [snake, expected] of cases) {
      assert.equal(advance(snake, open), "moved");
      assert.deepEqual(snake.body[0], expected);
    }
  });

  it("still crashes into a crate or its own body waiting on the far side", () => {
    const intoCrate = wrapping([[COLS - 1, 5], [COLS - 2, 5]], "right");
    assert.equal(advance(intoCrate, (col, row) => col === 0 && row === 5), "crashed");

    // A snake as long as the row is wide: its tail is still in the way.
    const row: Array<[number, number]> = [];
    for (let col = COLS - 1; col >= 0; col -= 1) row.push([col, 5]);
    const ring = wrapping(row, "right");
    ring.grow = 1;
    assert.equal(advance(ring, open), "crashed");
  });

  it("counts the far side as a way out", () => {
    const cornered = wrapping([[COLS - 1, 0], [COLS - 2, 0]], "right");
    assert.deepEqual(safeDirs(cornered, open), ["right", "up", "down"]);
  });

  it("starts walled unless asked, so Classic's wall stays solid", () => {
    assert.equal(createSnake().wraps, false);
    assert.equal(createSnake(true).wraps, true);
  });
});

describe("snake: food and pickups", () => {
  it("only ever places food on a free cell, and says so when there are none", () => {
    const rng = new Rng(7);
    const onlyOne = (col: number, row: number) => !(col === 3 && row === 9);
    for (let i = 0; i < 20; i += 1) {
      assert.deepEqual(pickFreeCell(rng, onlyOne), { col: 3, row: 9 });
    }
    assert.equal(pickFreeCell(rng, () => true), null);
  });

  it("pulls food one cell toward the head, along the bigger gap", () => {
    const allOpen = () => true;
    assert.deepEqual(pullToward({ col: 8, row: 5 }, { col: 5, row: 5 }, allOpen), { col: 7, row: 5 });
    assert.deepEqual(pullToward({ col: 5, row: 2 }, { col: 6, row: 5 }, allOpen), { col: 5, row: 3 });
  });

  it("leaves food alone when it's out of reach, adjacent, or boxed in", () => {
    const allOpen = () => true;
    const far = { col: 12, row: 5 };
    assert.equal(pullToward(far, { col: 5, row: 5 }, allOpen), far);
    const adjacent = { col: 6, row: 5 };
    assert.equal(pullToward(adjacent, { col: 5, row: 5 }, allOpen), adjacent);
    const boxed = { col: 8, row: 5 };
    assert.equal(pullToward(boxed, { col: 5, row: 5 }, () => false), boxed);
  });

  it("goes round a crate rather than through it", () => {
    const crate = (col: number, row: number) => !(col === 7 && row === 5);
    assert.deepEqual(pullToward({ col: 8, row: 5 }, { col: 6, row: 4 }, crate), { col: 8, row: 4 });
  });
});

describe("snake: classic pace and bonus", () => {
  it("speeds up with every piece of food, to a ceiling", () => {
    assert.ok(classicSpeed(10) > classicSpeed(0));
    assert.equal(classicSpeed(40), classicSpeed(400));
  });

  it("pays 100 for an instant bonus, counting down in tens to 10", () => {
    assert.equal(classicBonusValue(6), 100);
    assert.equal(classicBonusValue(3), 50);
    assert.equal(classicBonusValue(0.01), 10);
    assert.equal(classicBonusValue(-1), 10);
  });
});

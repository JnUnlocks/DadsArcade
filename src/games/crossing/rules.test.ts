/**
 * Two rules that exist because measurement said so, and would be easy to
 * "tidy away" later by someone who didn't know that.
 *
 * Both were found by running a solver against the real game and counting how
 * it died, not by reading the code. HighwayHop touches no DOM -- it only talks
 * to GameHost -- so it can be driven headlessly with a stub host.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HighwayHop } from "./index.ts";
import { COLS, HOME_COLS, HOME_ROW, START_ROW } from "./types.ts";

/** Minimal GameHost. Records what the game asked the shell to do. */
function stubHost() {
  const calls = { score: 0, sfx: [] as string[], gameOvers: 0 };
  return {
    calls,
    host: {
      view: { w: 360, h: 780, insetTop: 0, insetBottom: 0 } as never,
      settings: { reducedMotion: true, largeText: false, highContrast: false } as never,
      get score() {
        return calls.score;
      },
      sfx: (n: string) => calls.sfx.push(n),
      addScore: (p: number) => {
        calls.score += p;
      },
      shake: () => {},
      hitStop: () => {},
      gameOver: () => {
        calls.gameOvers += 1;
      },
    } as never,
  };
}

const IDLE = {
  dragX: 0,
  dragY: 0,
  axisX: 0,
  axisY: 0,
  firing: false,
  justPressed: false,
  pointerDown: false,
  secondaryTaps: 0,
  firePressed: false,
};
const TAP = { ...IDLE, justPressed: true };

/** Run frames until the current hop finishes. */
function settle(game: HighwayHop, frames = 16) {
  for (let i = 0; i < frames; i += 1) game.update(1 / 60, IDLE);
}

/** Reach into the instance. These are private only to TypeScript. */
function peek(game: HighwayHop) {
  return game as unknown as {
    frog: { row: number; col: number; fromRow: number; fromCol: number; hop: number };
    phase: string;
    lives: number;
    filled: Set<number>;
  };
}

function place(game: HighwayHop, row: number, col: number) {
  const g = peek(game);
  g.frog.row = row;
  g.frog.col = col;
  g.frog.fromRow = row;
  g.frog.fromCol = col;
  g.frog.hop = 1;
  g.phase = "idle";
}

describe("the burrow row", () => {
  it("refuses a hop into the bank instead of killing you", () => {
    // Measured against a solver, dying here was the single biggest killer in
    // the game -- you survive ten lanes and lose the life for landing one
    // column off, at the moment of greatest investment.
    const { host } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);
    const livesBefore = g.lives;

    place(game, HOME_ROW + 1, 3); // 3 is bank; burrows are 0,2,4,6,8
    game.update(1 / 60, TAP);
    settle(game);

    assert.equal(g.frog.row, HOME_ROW + 1, "the frog should not have moved");
    assert.equal(g.lives, livesBefore, "refusing a hop must not cost a life");
    assert.equal(g.filled.size, 0);
  });

  it("refuses a hop into a burrow that's already filled", () => {
    const { host } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);
    g.filled.add(2); // the burrow at column 4
    const livesBefore = g.lives;

    place(game, HOME_ROW + 1, HOME_COLS[2]!);
    game.update(1 / 60, TAP);
    settle(game);

    assert.equal(g.frog.row, HOME_ROW + 1, "should not enter a filled burrow");
    assert.equal(g.lives, livesBefore);
  });

  it("still lets you into an open burrow, and scores it", () => {
    const { host, calls } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);

    place(game, HOME_ROW + 1, HOME_COLS[1]!);
    game.update(1 / 60, TAP);
    settle(game);

    assert.ok(g.filled.has(1), "the burrow should be filled");
    assert.ok(calls.score > 0, "reaching home should score");
    assert.equal(g.frog.row, START_ROW, "and send the frog back to the kerb");
  });
});

describe("hopping", () => {
  it("goes straight up in the river, without drifting sideways", () => {
    // Rounding the column on every hop meant riding a log at 3.6 and hopping
    // up put you down at 4.0 -- half a cell the player never asked for, onto
    // a moving target. The river was killing twice as often as the road.
    const { host } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);

    place(game, 3, 3.6); // row 3 is river, and row 2 above it is too
    game.update(1 / 60, TAP);

    // Not exact: the frog is on a moving log, so one frame of being carried
    // (at most MAX_SPEED / 60 = 0.057 of a cell) lands between the two. What
    // matters is that the hop itself adds no sideways displacement -- the
    // rounding bug moved it by up to half a cell.
    assert.ok(
      Math.abs(g.frog.col - 3.6) < 0.1,
      `up should be up: expected ~3.6, got ${g.frog.col}`,
    );
    assert.equal(g.frog.row, 2);
  });

  it("snaps back to the grid when it leaves the river", () => {
    // Keeping the fraction on land would leave the road and burrow rows
    // subtly misaligned, which is where exactness matters.
    const { host } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);

    // Row 5 is the top river row; row 6 below it is the median.
    place(game, 5, 3.6);
    game.update(1 / 60, { ...IDLE, axisY: 1 });

    assert.equal(g.frog.row, 6, "should have moved onto the median");
    assert.equal(g.frog.col, 4, "and snapped to a whole column");
  });

  it("never walks off the board", () => {
    const { host } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);

    place(game, START_ROW, 0);
    game.update(1 / 60, { ...IDLE, axisX: -1 });
    settle(game);
    assert.ok(g.frog.col >= 0, `walked off the left edge to ${g.frog.col}`);

    place(game, START_ROW, COLS - 1);
    game.update(1 / 60, { ...IDLE, axisX: 1 });
    settle(game);
    assert.ok(g.frog.col <= COLS - 1, `walked off the right edge to ${g.frog.col}`);
  });

  it("hops once per key press, not once per frame", () => {
    // Keyboard axes are a level, not an edge. Acting on the level directly
    // machine-gunned the frog across the board for anyone holding Up.
    const { host } = stubHost();
    const game = new HighwayHop(host);
    const g = peek(game);

    place(game, START_ROW, 4);
    const held = { ...IDLE, axisY: -1 };
    for (let i = 0; i < 40; i += 1) game.update(1 / 60, held);

    assert.equal(
      g.frog.row,
      START_ROW - 1,
      `holding up should hop once, but reached row ${g.frog.row}`,
    );
  });
});

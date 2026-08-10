/**
 * The maze is hand-authored ASCII, which is a pleasant way to write a level
 * and a very easy way to strand a bubble behind a wall. An unreachable pellet
 * makes the level literally unwinnable, and you'd only discover it by clearing
 * everything else and waiting for an end that never comes.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COLS, DEN_TILE, Maze, ROWS, START_TILE, TUNNEL_ROW } from "./maze.ts";

describe("reef maze", () => {
  it("is well-formed and fully reachable", () => {
    const report = Maze.validate();
    assert.deepEqual(report.problems, [], "maze layout problems");
    assert.ok(report.ok);
  });

  it("has a sensible number of collectables", () => {
    const report = Maze.validate();
    assert.ok(report.pellets > 100, `only ${report.pellets} pellets`);
    assert.equal(report.reachable, report.pellets);
  });

  it("counts down to zero as everything is eaten", () => {
    const maze = new Maze();
    const total = maze.remaining;
    let taken = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (maze.take(col, row)) taken += 1;
      }
    }
    assert.equal(taken, total);
    assert.equal(maze.remaining, 0);
  });

  it("does not double-count a tile that was already eaten", () => {
    const maze = new Maze();
    const before = maze.remaining;
    // Find any bubble and take it twice.
    let target: { col: number; row: number } | null = null;
    maze.forEachItem((col, row) => {
      if (!target) target = { col, row };
    });
    assert.ok(target, "expected at least one item");
    const { col, row } = target!;
    assert.ok(maze.take(col, row));
    assert.equal(maze.take(col, row), null);
    assert.equal(maze.remaining, before - 1);
  });

  it("wraps the tunnel row around both edges", () => {
    const maze = new Maze();
    assert.equal(maze.wrapCol(-1), COLS - 1);
    assert.equal(maze.wrapCol(COLS), 0);
    // Both tunnel mouths have to be swimmable or the wrap goes nowhere.
    assert.ok(maze.isOpenForPlayer(0, TUNNEL_ROW));
    assert.ok(maze.isOpenForPlayer(COLS - 1, TUNNEL_ROW));
  });

  it("keeps Riley out of the den but lets jellyfish through the gate", () => {
    const maze = new Maze();
    const gateRow = DEN_TILE.row - 1;
    assert.equal(maze.isOpenForPlayer(DEN_TILE.col, gateRow), false);
    assert.equal(maze.isOpenForGhost(DEN_TILE.col, gateRow), true);
  });

  it("starts Riley on open water outside the den", () => {
    const maze = new Maze();
    assert.ok(maze.isOpenForPlayer(START_TILE.col, START_TILE.row));
    assert.equal(maze.itemAt(START_TILE.col, START_TILE.row), null);
  });
});

/**
 * No generated stage may be the thing that kills you.
 *
 * A snake can't back out of a dead end, so a single one-cell pocket between
 * two crates is a death the player did nothing to earn -- and by stage 15
 * nobody would think to blame the level. These walk a long run of stages and
 * assert the floor is in one piece with no cell that has only one way out.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COLS, ROWS, START_ROW, cellKey, inBounds } from "./rules.ts";
import {
  LASER_ON_SECONDS,
  LASER_WARN_SECONDS,
  buildStage,
  laserPhase,
} from "./stages.ts";

const STAGES = Array.from({ length: 80 }, (_, i) => buildStage(i + 1));
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

describe("snake stages", () => {
  it("are the same every time for a given number", () => {
    const again = buildStage(9);
    assert.deepEqual([...again.crates], [...STAGES[8]!.crates]);
    assert.deepEqual(again.lasers, STAGES[8]!.lasers);
  });

  it("leave every open cell with at least two ways out", () => {
    for (const stage of STAGES) {
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          if (stage.crates.has(cellKey(col, row))) continue;
          const exits = NEIGHBOURS.filter(
            ([dc, dr]) => inBounds(col + dc, row + dr) && !stage.crates.has(cellKey(col + dc, row + dr)),
          ).length;
          assert.ok(exits >= 2, `stage ${stage.number}: dead end at ${col},${row}`);
        }
      }
    }
  });

  it("keep the whole floor connected", () => {
    for (const stage of STAGES) {
      const seen = new Set<number>([cellKey(0, 0)]);
      const queue = [{ col: 0, row: 0 }];
      while (queue.length > 0) {
        const { col, row } = queue.pop()!;
        for (const [dc, dr] of NEIGHBOURS) {
          const key = cellKey(col + dc, row + dr);
          if (!inBounds(col + dc, row + dr) || stage.crates.has(key) || seen.has(key)) continue;
          seen.add(key);
          queue.push({ col: col + dc, row: row + dr });
        }
      }
      assert.equal(seen.size, COLS * ROWS - stage.crates.size, `stage ${stage.number} is split`);
    }
  });

  it("keep crates off the spawn lane and the outer ring", () => {
    for (const stage of STAGES) {
      for (const key of stage.crates) {
        const col = key % COLS;
        const row = Math.floor(key / COLS);
        assert.ok(Math.abs(row - START_ROW) > 1, `stage ${stage.number}: crate by the spawn lane`);
        assert.ok(col > 0 && col < COLS - 1 && row > 0 && row < ROWS - 1);
      }
    }
  });

  it("start with no lasers, and never fire one along or across a fresh snake", () => {
    assert.equal(STAGES[0]!.lasers.length, 0);
    for (const stage of STAGES) {
      for (const laser of stage.lasers) {
        assert.ok(laser.cells.length >= 4, "a stub of a beam is just a trap by the wall");
        assert.ok(!(laser.axis === "row" && Math.abs(laser.index - START_ROW) <= 1));
        for (const key of laser.cells) {
          assert.ok(!stage.crates.has(key), "beams stop at crates");
          assert.ok(!(Math.floor(key / COLS) === START_ROW && key % COLS <= 10));
        }
      }
    }
  });

  it("always warn before a laser fires, and start every stage dark", () => {
    for (const stage of STAGES) {
      for (const laser of stage.lasers) {
        assert.equal(laserPhase(stage, laser, 0), "off");
        assert.equal(laserPhase(stage, laser, 1), "off", "a second to get moving first");
        let previous = "off";
        const period = stage.laserOff + LASER_WARN_SECONDS + LASER_ON_SECONDS;
        for (let t = 0; t < period * 2; t += 0.05) {
          const phase = laserPhase(stage, laser, t);
          if (phase === "on") assert.notEqual(previous, "off", "fired with no warning");
          previous = phase;
        }
      }
    }
  });

  it("get harder, to a ceiling a person can still play", () => {
    assert.ok(STAGES[5]!.speed > STAGES[0]!.speed);
    assert.ok(STAGES[5]!.target > STAGES[0]!.target);
    for (const stage of STAGES) {
      assert.ok(stage.speed <= 10.5 && stage.target <= 12 && stage.lasers.length <= 3);
      assert.ok(stage.crates.size <= COLS * ROWS * 0.1, "crates shouldn't crowd out the snake");
    }
  });
});

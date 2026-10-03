/**
 * Hyper mode's stages: where the crates sit and where the lasers fire.
 *
 * Same guarantee as the crossing's lanes and the slime shop's orders: a
 * generated stage must never be the thing that kills you. For a snake that
 * means no pocket it can enter and not leave. Crates are placed as small
 * clusters with a clear one-cell moat around each (diagonals included) and
 * never on the outer ring, which leaves every open cell with at least two
 * open neighbours and the whole floor in one piece. stages.test.ts asserts
 * both across a long run of stages rather than trusting that argument.
 *
 * Stages are seeded by their number, so stage 6 is the same stage 6 for
 * everyone -- you can learn it, and two people can compare notes on it.
 */

import { Rng } from "../../core/rng.ts";
import { COLS, ROWS, START_HEAD_COL, START_ROW, cellKey } from "./rules.ts";

export interface Laser {
  axis: "row" | "col";
  /** Which row or column the beam runs along. */
  index: number;
  /** True when the emitter is on the left/top wall, false for right/bottom. */
  fromStart: boolean;
  /** Cell keys the beam covers, from the emitter outward to the first crate. */
  cells: number[];
  /** Seconds this laser's cycle is offset by, so they don't fire in unison. */
  offset: number;
}

export interface Stage {
  number: number;
  crates: Set<number>;
  lasers: Laser[];
  /** Apples to eat to clear the stage. */
  target: number;
  /** Steps per second. */
  speed: number;
  /** Seconds a laser stays dark between shots. */
  laserOff: number;
}

export type LaserPhase = "off" | "warn" | "on";

export const LASER_WARN_SECONDS = 1.1;
export const LASER_ON_SECONDS = 1.0;
const MIN_BEAM_CELLS = 4;

/** Crate clusters, as cell offsets from a corner. */
const SHAPES: ReadonlyArray<{ fromStage: number; cells: ReadonlyArray<[number, number]> }> = [
  { fromStage: 1, cells: [[0, 0]] },
  { fromStage: 1, cells: [[0, 0], [1, 0]] },
  { fromStage: 1, cells: [[0, 0], [0, 1]] },
  { fromStage: 3, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { fromStage: 4, cells: [[0, 0], [1, 0], [2, 0]] },
  { fromStage: 4, cells: [[0, 0], [0, 1], [0, 2]] },
];

export function buildStage(number: number): Stage {
  const rng = new Rng(Math.imul(number, 7919) + 104729);
  const crates = placeCrates(rng, number);
  return {
    number,
    crates,
    lasers: placeLasers(rng, number, crates),
    target: Math.min(12, 5 + number),
    speed: Math.min(10.5, 6 + (number - 1) * 0.4),
    laserOff: Math.max(2.4, 3.4 - number * 0.1),
  };
}

export function laserPhase(stage: Stage, laser: Laser, time: number): LaserPhase {
  const period = stage.laserOff + LASER_WARN_SECONDS + LASER_ON_SECONDS;
  const t = (time + laser.offset) % period;
  if (t < stage.laserOff) return "off";
  return t < stage.laserOff + LASER_WARN_SECONDS ? "warn" : "on";
}

function placeCrates(rng: Rng, number: number): Set<number> {
  const crates = new Set<number>();
  const clusters = Math.min(9, 2 + number);
  const shapes = SHAPES.filter((s) => s.fromStage <= number);

  for (let placed = 0, attempt = 0; placed < clusters && attempt < 400; attempt += 1) {
    const shape = rng.pick(shapes);
    const col = rng.int(1, COLS - 2);
    const row = rng.int(1, ROWS - 2);
    const cells = shape.cells.map(([dc, dr]) => ({ col: col + dc, row: row + dr }));
    if (!cells.every((c) => canHoldCrate(c.col, c.row, crates))) continue;
    for (const c of cells) crates.add(cellKey(c.col, c.row));
    placed += 1;
  }
  return crates;
}

/**
 * A crate cell must sit inside the outer ring, clear of the spawn lane and
 * its neighbours, and with nothing already placed in any of the eight cells
 * around it. Checked per cell against crates from *earlier* clusters only --
 * the cells of the cluster being placed are added afterwards.
 */
function canHoldCrate(col: number, row: number, crates: Set<number>): boolean {
  if (col < 1 || col > COLS - 2 || row < 1 || row > ROWS - 2) return false;
  if (Math.abs(row - START_ROW) <= 1) return false;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (crates.has(cellKey(col + dc, row + dr))) return false;
    }
  }
  return true;
}

function placeLasers(rng: Rng, number: number, crates: Set<number>): Laser[] {
  const lasers: Laser[] = [];
  const wanted = Math.min(3, Math.floor(number / 2));

  for (let attempt = 0; lasers.length < wanted && attempt < 200; attempt += 1) {
    const axis = rng.chance(0.5) ? "row" : "col";
    const index = rng.int(1, (axis === "row" ? ROWS : COLS) - 2);
    const fromStart = rng.chance(0.5);
    // Never along the spawn lane, and never right beside another beam on the
    // same axis -- two adjacent beams read as one wall with no way through.
    if (axis === "row" && Math.abs(index - START_ROW) <= 1) continue;
    if (lasers.some((l) => l.axis === axis && Math.abs(l.index - index) <= 1)) continue;

    const cells = beamCells(axis, index, fromStart, crates);
    if (cells.length < MIN_BEAM_CELLS) continue;
    // A column beam may cross the spawn lane, but not where a fresh snake
    // is lying or about to be.
    if (cells.some((key) => isSpawnCell(key))) continue;

    lasers.push({ axis, index, fromStart, cells, offset: lasers.length * 0.6 });
  }
  return lasers;
}

function beamCells(
  axis: "row" | "col",
  index: number,
  fromStart: boolean,
  crates: Set<number>,
): number[] {
  const length = axis === "row" ? COLS : ROWS;
  const cells: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const along = fromStart ? i : length - 1 - i;
    const key = axis === "row" ? cellKey(along, index) : cellKey(index, along);
    if (crates.has(key)) break;
    cells.push(key);
  }
  return cells;
}

function isSpawnCell(key: number): boolean {
  const row = Math.floor(key / COLS);
  const col = key % COLS;
  return row === START_ROW && col <= START_HEAD_COL + 5;
}

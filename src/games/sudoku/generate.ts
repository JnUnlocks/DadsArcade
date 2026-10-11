/**
 * Makes Sudoku puzzles: a full grid from a seed, then squares taken away until
 * what's left is as hard as it was asked to be -- and no harder.
 *
 * Two solvers live here, and they answer different questions.
 *
 *   countSolutions  brute force. "Is there exactly one answer?" Every puzzle
 *                   handed out has been through it.
 *   technique       solves the way a person does, and reports the hardest
 *                   step it needed. That's what a difficulty *is*: not how
 *                   many squares are given, but what you have to spot.
 *
 *     1  singles only: a square with one digit left, or a digit with one
 *        square left in its row, column or box
 *     2  also locked candidates and naked pairs
 *     3  something past those
 *
 * Everything is driven by the seeded Rng, so a day's seed makes the same
 * puzzle on every device. No DOM.
 */

import { Rng } from "../../core/rng.ts";

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

export interface Puzzle {
  difficulty: Difficulty;
  /** 81 digits in reading order, `0` for a square left to the player. */
  givens: string;
  /** 81 digits, none of them `0`. */
  solution: string;
}

export const CELLS = 81;
const ALL = 0x3fe;

const bit = (digit: number): number => 1 << digit;

function popcount(mask: number): number {
  let count = 0;
  for (let rest = mask; rest; rest &= rest - 1) count += 1;
  return count;
}

export const rowOf = (cell: number): number => Math.floor(cell / 9);
export const colOf = (cell: number): number => cell % 9;
export const boxOf = (cell: number): number => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);

/** The 27 rows, columns and boxes, as lists of cells. Rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: readonly (readonly number[])[] = (() => {
  const units: number[][] = Array.from({ length: 27 }, () => []);
  for (let cell = 0; cell < CELLS; cell += 1) {
    units[rowOf(cell)]!.push(cell);
    units[9 + colOf(cell)]!.push(cell);
    units[18 + boxOf(cell)]!.push(cell);
  }
  return units;
})();

/** For each cell, the 20 others that share its row, column or box. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, cell) => {
  const peers: number[] = [];
  for (let other = 0; other < CELLS; other += 1) {
    if (other === cell) continue;
    if (rowOf(other) === rowOf(cell) || colOf(other) === colOf(cell) || boxOf(other) === boxOf(cell)) {
      peers.push(other);
    }
  }
  return peers;
});

export function toCells(grid: string): number[] {
  return [...grid].map(Number);
}

/** The digits a square could still hold, as a bitmask, given the grid around it. */
export function candidates(grid: readonly number[], cell: number): number {
  let used = 0;
  for (const peer of PEERS[cell]!) used |= bit(grid[peer]!);
  return ALL & ~used;
}

// ----- Brute force -----

/**
 * Depth-first search, always on the square with the fewest digits left.
 * `order` gives the digits to try, so a shuffled one makes a random grid.
 * `visit` is called with each solution and returns true to stop.
 */
function search(grid: number[], order: readonly number[], visit: () => boolean): boolean {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (grid[cell] !== 0) continue;
    const mask = candidates(grid, cell);
    const count = popcount(mask);
    if (count === 0) return false;
    if (count < bestCount) {
      best = cell;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (best < 0) return visit();
  for (const digit of order) {
    if (!(bestMask & bit(digit))) continue;
    grid[best] = digit;
    const stop = search(grid, order, visit);
    grid[best] = 0;
    if (stop) return true;
  }
  return false;
}

const IN_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** How many ways the grid can be finished, giving up at `limit`. */
export function countSolutions(givens: readonly number[], limit = 2): number {
  for (let cell = 0; cell < CELLS; cell += 1) {
    const digit = givens[cell]!;
    if (digit !== 0 && PEERS[cell]!.some((peer) => givens[peer] === digit)) return 0;
  }
  let count = 0;
  search(givens.slice(), IN_ORDER, () => (count += 1) >= limit);
  return count;
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A complete, valid grid. */
function fillGrid(rng: Rng): number[] {
  const grid = new Array<number>(CELLS).fill(0);
  let solution: number[] = [];
  search(grid, shuffled(IN_ORDER, rng), () => {
    solution = grid.slice();
    return true;
  });
  return solution;
}

// ----- Solving like a person -----

export type Technique = 1 | 2 | 3;

/** The hardest technique a puzzle needs. See the top of the file. */
export function technique(givens: readonly number[]): Technique {
  const grid = givens.slice();
  const cand = grid.map((digit, cell) => (digit === 0 ? candidates(grid, cell) : 0));
  const place = (cell: number, digit: number): void => {
    grid[cell] = digit;
    cand[cell] = 0;
    for (const peer of PEERS[cell]!) cand[peer]! &= ~bit(digit);
  };

  let level: Technique = 1;
  for (;;) {
    let placed = false;
    for (let cell = 0; cell < CELLS; cell += 1) {
      const mask = cand[cell]!;
      if (mask !== 0 && (mask & (mask - 1)) === 0) {
        place(cell, 31 - Math.clz32(mask));
        placed = true;
      }
    }
    for (const unit of UNITS) {
      for (let digit = 1; digit <= 9; digit += 1) {
        const homes = unit.filter((cell) => cand[cell]! & bit(digit));
        if (homes.length === 1) {
          place(homes[0]!, digit);
          placed = true;
        }
      }
    }
    if (placed) continue;
    if (grid.every((digit) => digit !== 0)) return level;
    // Both run, so one pass makes every elimination it can.
    const locked = lockedCandidates(cand);
    const pairs = nakedPairs(cand);
    if (!locked && !pairs) return 3;
    level = 2;
  }
}

/** Removes `digit` from `cells`; true if any of them had it. */
function strike(cand: number[], cells: readonly number[], digit: number): boolean {
  let changed = false;
  for (const cell of cells) {
    if (cand[cell]! & bit(digit)) {
      cand[cell]! &= ~bit(digit);
      changed = true;
    }
  }
  return changed;
}

/**
 * A digit confined, within one unit, to squares that all sit in a second
 * unit: it can go nowhere else in that second unit. Covers both directions --
 * a box pointing along a line, and a line claiming a box.
 */
function lockedCandidates(cand: number[]): boolean {
  let changed = false;
  for (const unit of UNITS) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const homes = unit.filter((cell) => cand[cell]! & bit(digit));
      if (homes.length < 2) continue;
      for (const other of UNITS) {
        if (other === unit || !homes.every((cell) => other.includes(cell))) continue;
        if (strike(cand, other.filter((cell) => !homes.includes(cell)), digit)) changed = true;
      }
    }
  }
  return changed;
}

/** Two squares in a unit with the same two digits left: nobody else gets those. */
function nakedPairs(cand: number[]): boolean {
  let changed = false;
  for (const unit of UNITS) {
    for (let i = 0; i < 9; i += 1) {
      const mask = cand[unit[i]!]!;
      if (popcount(mask) !== 2) continue;
      for (let j = i + 1; j < 9; j += 1) {
        if (cand[unit[j]!] !== mask) continue;
        const rest = unit.filter((_, at) => at !== i && at !== j);
        for (let digit = 1; digit <= 9; digit += 1) {
          if (mask & bit(digit) && strike(cand, rest, digit)) changed = true;
        }
      }
    }
  }
  return changed;
}

// ----- Making a puzzle -----

/**
 * What each difficulty means. `level` is the hardest technique the puzzle
 * needs; `floor` is the fewest givens it's dug down to. EASY and MEDIUM need
 * the same technique and differ in how much there is to find.
 */
export const TARGETS: Record<Difficulty, { level: Technique; floor: number }> = {
  easy: { level: 1, floor: 38 },
  medium: { level: 1, floor: 30 },
  hard: { level: 2, floor: 26 },
  expert: { level: 3, floor: 24 },
};

const ATTEMPTS = 120;

/**
 * Takes squares away in mirrored pairs -- the look of a newspaper puzzle --
 * keeping each removal only if the puzzle still has one answer and hasn't
 * become harder than asked.
 */
function dig(solution: readonly number[], rng: Rng, difficulty: Difficulty): number[] {
  const { level, floor } = TARGETS[difficulty];
  const givens = solution.slice();
  let left = CELLS;
  for (const cell of shuffled(Array.from({ length: 41 }, (_, i) => i), rng)) {
    const pair = cell === 40 ? [cell] : [cell, 80 - cell];
    if (left - pair.length < floor) continue;
    for (const at of pair) givens[at] = 0;
    if (countSolutions(givens) === 1 && technique(givens) <= level) left -= pair.length;
    else for (const at of pair) givens[at] = solution[at]!;
  }
  return givens;
}

/**
 * The puzzle for a seed. Digging can stop short of the technique asked for --
 * a HARD that turned out to need only singles -- so it tries again from the
 * next seed along until one lands, and settles for the hardest it found.
 */
export function generatePuzzle(seed: number, difficulty: Difficulty): Puzzle {
  const want = TARGETS[difficulty].level;
  let best: { givens: number[]; solution: number[]; level: Technique } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rng = new Rng((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0);
    const solution = fillGrid(rng);
    const givens = dig(solution, rng, difficulty);
    const level = technique(givens);
    if (!best || level > best.level) best = { givens, solution, level };
    if (level === want) break;
  }
  return { difficulty, givens: best!.givens.join(""), solution: best!.solution.join("") };
}

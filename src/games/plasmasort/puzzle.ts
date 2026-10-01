/**
 * Plasma Sort's rules, generator, solver and scoring.
 *
 * Pure and DOM-free on purpose. Everything a daily board depends on lives
 * here: two phones on the same date must deal the identical tubes and agree on
 * the identical par, or the leaderboard is comparing different puzzles. That is
 * not something to find out from a screenshot, so it sits beside a test.
 *
 * The rules are the water-sort ones:
 *   - A tube holds CAPACITY cells.
 *   - A pour takes the whole run of one colour off the top of a tube and puts
 *     as much of it as fits onto an empty tube or onto the same colour.
 *   - The puzzle is solved when every tube is empty or full of one colour.
 */

import { Rng } from "../../core/rng.ts";

/** Cells per tube. */
export const CAPACITY = 4;

/** Spare tubes dealt empty. Two is what makes every deal comfortably solvable. */
export const EMPTY_TUBES = 2;

/** A tube, bottom first. Colours are 1..n. */
export type Tube = number[];
export type Board = Tube[];

export interface Pour {
  from: number;
  to: number;
  /** How many cells moved -- needed to take the pour back exactly. */
  count: number;
}

export interface Puzzle {
  board: Board;
  /** Fewest pours that solve it. */
  par: number;
}

export function cloneBoard(board: Board): Board {
  return board.map((tube) => tube.slice());
}

/** Length of the same-colour run on top of a tube. */
export function topRun(tube: Tube): number {
  if (tube.length === 0) return 0;
  const top = tube[tube.length - 1];
  let run = 1;
  while (run < tube.length && tube[tube.length - 1 - run] === top) run += 1;
  return run;
}

/** Full of a single colour: finished, and never worth pouring from again. */
export function isComplete(tube: Tube): boolean {
  return tube.length === CAPACITY && topRun(tube) === CAPACITY;
}

export function isSolved(board: Board): boolean {
  return board.every((tube) => tube.length === 0 || isComplete(tube));
}

/**
 * How many cells a pour from one tube to another would move. Zero means the
 * pour isn't allowed.
 */
export function pourCount(board: Board, from: number, to: number): number {
  if (from === to) return 0;
  const src = board[from];
  const dst = board[to];
  if (!src || !dst || src.length === 0 || dst.length >= CAPACITY) return 0;
  const colour = src[src.length - 1];
  if (dst.length > 0 && dst[dst.length - 1] !== colour) return 0;
  return Math.min(topRun(src), CAPACITY - dst.length);
}

/** Apply a pour in place. Returns null, and changes nothing, if it's illegal. */
export function pour(board: Board, from: number, to: number): Pour | null {
  const count = pourCount(board, from, to);
  if (count === 0) return null;
  const src = board[from]!;
  const dst = board[to]!;
  for (let i = 0; i < count; i += 1) dst.push(src.pop()!);
  return { from, to, count };
}

/** Take a pour back, in place. */
export function unpour(board: Board, move: Pour): void {
  const src = board[move.from]!;
  const dst = board[move.to]!;
  for (let i = 0; i < move.count; i += 1) src.push(dst.pop()!);
}

/**
 * True when no pour would change anything that matters -- the cue to offer
 * UNDO. Sliding a single-colour tube into an empty one is legal but goes
 * nowhere, so it doesn't count as having a move.
 */
export function isStuck(board: Board): boolean {
  if (isSolved(board)) return false;
  for (let from = 0; from < board.length; from += 1) {
    const src = board[from]!;
    if (src.length === 0 || isComplete(src)) continue;
    const wholeTube = topRun(src) === src.length;
    for (let to = 0; to < board.length; to += 1) {
      if (pourCount(board, from, to) === 0) continue;
      if (wholeTube && board[to]!.length === 0) continue;
      return false;
    }
  }
  return true;
}

// ----- Solver -----

/**
 * Tubes are interchangeable, so two boards that differ only in tube order are
 * the same position. Sorting the key folds them together, which is most of
 * what keeps the search small.
 */
function boardKey(board: Board): string {
  return board
    .map((tube) => tube.join(""))
    .sort()
    .join("|");
}

/** Beyond this the search gives up. Real deals need a few thousand states. */
const SEARCH_LIMIT = 250_000;

/**
 * Fewest pours that solve a board, by breadth-first search.
 *
 * Returns null when the board can't be solved, or when the search outgrows
 * SEARCH_LIMIT (which the generator treats the same way: deal again).
 */
export function solve(board: Board): number | null {
  let frontier: Board[] = [board];
  const seen = new Set<string>([boardKey(board)]);
  let depth = 0;

  while (frontier.length > 0) {
    const next: Board[] = [];
    for (const current of frontier) {
      if (isSolved(current)) return depth;

      for (let from = 0; from < current.length; from += 1) {
        const src = current[from]!;
        if (src.length === 0 || isComplete(src)) continue;
        const wholeTube = topRun(src) === src.length;
        // Every empty tube is the same destination; trying one is enough.
        let triedEmpty = false;

        for (let to = 0; to < current.length; to += 1) {
          if (pourCount(current, from, to) === 0) continue;
          if (current[to]!.length === 0) {
            if (triedEmpty || wholeTube) continue;
            triedEmpty = true;
          }
          const child = cloneBoard(current);
          pour(child, from, to);
          const key = boardKey(child);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(child);
        }
      }
    }
    if (seen.size > SEARCH_LIMIT) return null;
    frontier = next;
    depth += 1;
  }
  return null;
}

// ----- Generator -----

/**
 * The par a deal has to reach to be worth playing, per colour count. A deal
 * that solves in a dozen pours with six colours has fallen out half-sorted,
 * and "everyone got par today" is a board with nothing on it.
 */
const MIN_PAR: Record<number, number> = { 3: 6, 4: 10, 5: 13, 6: 16, 7: 19, 8: 22 };

/** After this many rejected deals, take the next solvable one whatever its par. */
const PICKY_DEALS = 24;

function deal(rng: Rng, colours: number): Board {
  const cells: number[] = [];
  for (let colour = 1; colour <= colours; colour += 1) {
    for (let i = 0; i < CAPACITY; i += 1) cells.push(colour);
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const swap = cells[i]!;
    cells[i] = cells[j]!;
    cells[j] = swap;
  }
  const board: Board = [];
  for (let t = 0; t < colours; t += 1) {
    board.push(cells.slice(t * CAPACITY, (t + 1) * CAPACITY));
  }
  for (let e = 0; e < EMPTY_TUBES; e += 1) board.push([]);
  return board;
}

/** A tube that arrives with three of a kind stacked up is a freebie. */
function givesTooMuchAway(board: Board): boolean {
  return board.some((tube) => {
    for (let i = 0; i + 2 < tube.length; i += 1) {
      if (tube[i] === tube[i + 1] && tube[i] === tube[i + 2]) return true;
    }
    return false;
  });
}

/**
 * Deal a puzzle from a seed.
 *
 * Deterministic: the same seed and colour count always give the same board and
 * par, on any device. Deals are rejected until one is solvable, isn't
 * half-sorted already, and takes a respectable number of pours.
 */
export function generatePuzzle(seed: number, colours: number): Puzzle {
  const rng = new Rng(seed);
  const minPar = MIN_PAR[colours] ?? 0;

  for (let attempt = 0; ; attempt += 1) {
    const board = deal(rng, colours);
    const picky = attempt < PICKY_DEALS;
    if (picky && givesTooMuchAway(board)) continue;
    const par = solve(board);
    if (par === null || par === 0) continue;
    if (picky && par < minPar) continue;
    return { board, par };
  }
}

// ----- Scoring -----

/** Solving at all is worth this; pours over par come off it. */
export const SOLVE_POINTS = 1000;
export const POINTS_PER_EXTRA_POUR = 50;
/** However many pours it took, a solved puzzle is always worth something. */
export const MIN_SOLVE_POINTS = 100;

/** The speed bonus only ever adds: full inside FAST, gone by SLOW. */
export const SPEED_POINTS = 200;
const FAST_SECONDS = 45;
const SLOW_SECONDS = 300;

export function speedBonus(seconds: number): number {
  const t = (SLOW_SECONDS - seconds) / (SLOW_SECONDS - FAST_SECONDS);
  return Math.round(SPEED_POINTS * Math.max(0, Math.min(1, t)));
}

/**
 * Points for a solve.
 *
 * Pours dominate on purpose: one wasted pour costs more than a minute of
 * thinking, so the board rewards planning rather than fast fingers.
 */
export function scoreSolve(pours: number, par: number, seconds: number): number {
  const over = Math.max(0, pours - par);
  const base = Math.max(MIN_SOLVE_POINTS, SOLVE_POINTS - over * POINTS_PER_EXTRA_POUR);
  return base + speedBonus(seconds);
}

/** Three stars for par, two for coming close, one for getting it sorted. */
export function starsFor(pours: number, par: number): 1 | 2 | 3 {
  if (pours <= par) return 3;
  if (pours <= par + 3) return 2;
  return 1;
}

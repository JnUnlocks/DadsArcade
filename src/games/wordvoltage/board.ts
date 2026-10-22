/**
 * The board as cells: the one canonical map every other part reads.
 *
 * A placement says "STAR across from row 0, column 0". This turns the
 * placements into the squares they cover, which squares two words share, and
 * how big the board is. The renderer draws exactly these cells and nothing
 * else, so what is on screen is always the crossword that was validated.
 */

import type { Placement, Puzzle } from "./types.ts";

/** "row,col": the key for one square. */
export type CellKey = string;

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

export function parseCellKey(key: CellKey): [number, number] {
  const [row, col] = key.split(",").map(Number);
  return [row ?? 0, col ?? 0];
}

/** The squares a word covers, first letter first. */
export function placementCells(placement: Placement): CellKey[] {
  const cells: CellKey[] = [];
  for (let i = 0; i < placement.word.length; i += 1) {
    cells.push(
      placement.dir === "across"
        ? cellKey(placement.row, placement.col + i)
        : cellKey(placement.row + i, placement.col),
    );
  }
  return cells;
}

export interface BoardCell {
  readonly key: CellKey;
  readonly row: number;
  readonly col: number;
  readonly letter: string;
  /** Indexes into puzzle.words of every word through this square (1 or 2). */
  readonly slots: readonly number[];
}

export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly cells: ReadonlyMap<CellKey, BoardCell>;
  /** For each word, its squares in order. */
  readonly slotCells: readonly (readonly CellKey[])[];
}

/**
 * Build the board. Throws on a contradiction (two letters in one square),
 * which only an invalid puzzle can have; validate.ts reports it properly.
 */
export function buildBoard(puzzle: Pick<Puzzle, "words">): Board {
  const letters = new Map<CellKey, string>();
  const slots = new Map<CellKey, number[]>();
  const slotCells: CellKey[][] = [];
  let rows = 0;
  let cols = 0;
  puzzle.words.forEach((placement, index) => {
    const cells = placementCells(placement);
    slotCells.push(cells);
    cells.forEach((key, i) => {
      const letter = placement.word[i]!;
      const existing = letters.get(key);
      if (existing !== undefined && existing !== letter) {
        throw new Error(`Square ${key} holds both ${existing} and ${letter}`);
      }
      letters.set(key, letter);
      const list = slots.get(key) ?? [];
      list.push(index);
      slots.set(key, list);
      const [row, col] = parseCellKey(key);
      rows = Math.max(rows, row + 1);
      cols = Math.max(cols, col + 1);
    });
  });
  const cells = new Map<CellKey, BoardCell>();
  for (const [key, letter] of letters) {
    const [row, col] = parseCellKey(key);
    cells.set(key, { key, row, col, letter, slots: slots.get(key) ?? [] });
  }
  return { rows, cols, cells, slotCells };
}

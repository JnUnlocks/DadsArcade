/**
 * Making a crossword: the grid, the fill, the numbering.
 *
 * No DOM, and nothing random that doesn't come from the seed, so the same seed
 * gives the same puzzle on every phone -- that's what lets the whole family
 * compare times on the day's puzzle. generate.test.ts holds it to that.
 *
 * The grid is the lattice kind a newspaper's quick crossword uses: words run
 * along every other row and every other column, so the squares where an odd
 * row meets an odd column are always black, and about half of each word's
 * letters are crossed by another word. An American-style grid, where every
 * letter is crossed, needs tens of thousands of words to fill, most of them
 * words nobody has said aloud since 1950. A lattice fills from the thousand or
 * so in clues.ts, every one of which was written with a clue a family can get.
 *
 * Three steps:
 *   1. A template: where the black squares go. Each word row is cut into words
 *      at random, mirrored so the grid looks the same upside down, and the
 *      columns are then cut to agree with the rows.
 *   2. The fill: a backtracking search that always works on the slot with the
 *      fewest words left that fit, and gives up on a template early rather
 *      than grinding at it. There is always another template.
 *   3. Numbering, in reading order, the way every crossword does it.
 */

import { Rng } from "../../core/rng.ts";
import { CLUES, type ClueEntry } from "./clues.ts";

export type Direction = "across" | "down";

/** A run of white squares that takes a word. */
export interface Slot {
  dir: Direction;
  row: number;
  col: number;
  length: number;
  /** Indices into the grid, `row * size + col`, first letter first. */
  cells: number[];
}

export interface Template {
  size: number;
  /** One entry per square, row by row. */
  black: boolean[];
  slots: Slot[];
}

export interface PuzzleClue {
  number: number;
  dir: Direction;
  row: number;
  col: number;
  answer: string;
  clue: string;
}

/** A finished puzzle. Plain data, so it can be saved whole and read back. */
export interface Puzzle {
  size: PuzzleSize;
  /** One string per row: a lower-case letter, or `#` for a black square. */
  rows: string[];
  /** Across clues first, each direction in number order. */
  clues: PuzzleClue[];
}

export const BLACK = "#";

/** The longest and shortest words a grid may ask for. */
const MAX_WORD = 9;
const MIN_WORD = 3;
/** The least of the grid that must be white squares. */
const MIN_WHITE = 0.66;
/** The most black squares allowed in a straight line. */
const MAX_BLACK_RUN = 3;

// ----- Templates -----

/**
 * Every way of cutting one word line into words, as a list of which squares
 * are black. A run of white squares must be a word (3 to 9 letters), or a
 * single square standing where a crossing word passes through.
 */
function linePatterns(size: number): boolean[][] {
  const patterns: boolean[][] = [];
  for (let bits = 0; bits < 1 << size; bits += 1) {
    const black: boolean[] = [];
    for (let i = 0; i < size; i += 1) black.push(((bits >> i) & 1) === 1);
    if (isValidLine(black)) patterns.push(black);
  }
  return patterns;
}

function isValidLine(black: readonly boolean[]): boolean {
  let words = 0;
  let start = 0;
  for (let i = 0; i <= black.length; i += 1) {
    if (i < black.length && !black[i]) continue;
    const length = i - start;
    if (length === 1) {
      // A lone square is only reachable where a crossing word comes through.
      if (start % 2 !== 0) return false;
    } else if (length > 1) {
      if (length < MIN_WORD || length > MAX_WORD) return false;
      words += 1;
    }
    start = i + 1;
  }
  return words > 0;
}

const PATTERN_CACHE = new Map<number, boolean[][]>();

function patternsFor(size: number): boolean[][] {
  let patterns = PATTERN_CACHE.get(size);
  if (!patterns) {
    patterns = linePatterns(size);
    PATTERN_CACHE.set(size, patterns);
  }
  return patterns;
}

function isPalindrome(black: readonly boolean[]): boolean {
  for (let i = 0; i < black.length / 2; i += 1) {
    if (black[i] !== black[black.length - 1 - i]) return false;
  }
  return true;
}

/** How many black squares a line pattern adds. Fewer makes longer words. */
function blackCount(black: readonly boolean[]): number {
  return black.reduce((sum, cell) => sum + (cell ? 1 : 0), 0);
}

/**
 * One attempt at a template, or null if the columns couldn't be made to agree
 * with the rows or the result broke a rule. Cheap, so the caller just asks
 * again.
 */
export function tryTemplate(size: number, rng: Rng): Template | null {
  const last = size - 1;
  // At most two cuts to a line: more than that and it is all short words,
  // and far fewer of the grids that come out pass the checks below.
  const patterns = patternsFor(size).filter((p) => blackCount(p) <= 2);
  const black: boolean[] = new Array<boolean>(size * size).fill(false);
  for (let r = 1; r < size; r += 2) {
    for (let c = 1; c < size; c += 2) black[r * size + c] = true;
  }

  // Rows first. Each row and its mirror image are cut the same way reversed.
  for (let r = 0; r <= last - r; r += 2) {
    const choices = r === last - r ? patterns.filter(isPalindrome) : patterns;
    if (choices.length === 0) return null;
    const pattern = rng.pick(choices);
    for (let c = 0; c < size; c += 1) {
      if (!pattern[c]) continue;
      black[r * size + c] = true;
      black[(last - r) * size + (last - c)] = true;
    }
  }

  // Then columns, which have to agree with the rows wherever the two cross.
  for (let c = 0; c <= last - c; c += 2) {
    const fits = (pattern: readonly boolean[]): boolean => {
      for (let r = 0; r < size; r += 2) {
        if (pattern[r] !== black[r * size + c]) return false;
      }
      return true;
    };
    let choices = patterns.filter(fits);
    if (c === last - c) choices = choices.filter(isPalindrome);
    if (choices.length === 0) return null;
    const pattern = rng.pick(choices);
    for (let r = 0; r < size; r += 1) {
      if (!pattern[r]) continue;
      black[r * size + c] = true;
      black[(last - r) * size + (last - c)] = true;
    }
  }

  const slots = findSlots(size, black);
  return isGoodTemplate(size, black, slots) ? { size, black, slots } : null;
}

/** Every run of three or more white squares, across then down. */
export function findSlots(size: number, black: readonly boolean[]): Slot[] {
  const slots: Slot[] = [];
  const scan = (dir: Direction): void => {
    for (let line = 0; line < size; line += 1) {
      let run: number[] = [];
      for (let i = 0; i <= size; i += 1) {
        const index = dir === "across" ? line * size + i : i * size + line;
        if (i < size && !black[index]) {
          run.push(index);
          continue;
        }
        if (run.length >= MIN_WORD) {
          const first = run[0]!;
          slots.push({
            dir,
            row: Math.floor(first / size),
            col: first % size,
            length: run.length,
            cells: run,
          });
        }
        run = [];
      }
    }
  };
  scan("across");
  scan("down");
  return slots;
}

/**
 * The rules a template has to pass before it's worth trying to fill: every
 * white square belongs to a word, every word is crossed at least twice, the
 * whole grid is one connected piece, and it isn't all three-letter words.
 */
function isGoodTemplate(size: number, black: readonly boolean[], slots: readonly Slot[]): boolean {
  const uses = new Array<number>(size * size).fill(0);
  for (const slot of slots) for (const cell of slot.cells) uses[cell]! += 1;

  let white = 0;
  for (let i = 0; i < black.length; i += 1) {
    if (black[i]) continue;
    white += 1;
    if (uses[i] === 0) return false;
  }
  for (const slot of slots) {
    const crossings = slot.cells.filter((cell) => uses[cell] === 2).length;
    if (crossings < 2) return false;
  }

  const short = slots.filter((slot) => slot.length === MIN_WORD).length;
  if (short > slots.length * 0.4) return false;
  if (!slots.some((slot) => slot.length >= 6)) return false;
  // A grid that is mostly black squares is a few words in a box, not a
  // crossword. The lattice alone is about a fifth black.
  if (white < size * size * MIN_WHITE) return false;
  if (slots.length < (size >= 11 ? 20 : 13)) return false;

  // No slab of black: four black squares in a straight line reads as a hole
  // in the grid rather than as a gap between words.
  for (let line = 0; line < size; line += 1) {
    let acrossRun = 0;
    let downRun = 0;
    for (let i = 0; i < size; i += 1) {
      acrossRun = black[line * size + i] ? acrossRun + 1 : 0;
      downRun = black[i * size + line] ? downRun + 1 : 0;
      if (acrossRun > MAX_BLACK_RUN || downRun > MAX_BLACK_RUN) return false;
    }
  }

  // Flood fill from the first white square: it has to reach all the others.
  const start = black.indexOf(false);
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const row = Math.floor(cell / size);
    const col = cell % size;
    const neighbours = [
      row > 0 ? cell - size : -1,
      row < size - 1 ? cell + size : -1,
      col > 0 ? cell - 1 : -1,
      col < size - 1 ? cell + 1 : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || black[next] || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === white;
}

// ----- The fill -----

/** How many search steps one template gets before it's dropped for another. */
const FILL_BUDGET = 1500;
/** How many words are tried in one slot before backing up. */
const TRIES_PER_SLOT = 10;

export function wordsByLength(entries: readonly ClueEntry[]): Map<number, string[]> {
  const byLength = new Map<number, string[]>();
  for (const { word } of entries) {
    if (word.length < MIN_WORD || word.length > MAX_WORD) continue;
    const list = byLength.get(word.length);
    if (list) list.push(word);
    else byLength.set(word.length, [word]);
  }
  return byLength;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const held = items[i]!;
    items[i] = items[j]!;
    items[j] = held;
  }
  return items;
}

/**
 * One word per slot, in slot order, or null if the search ran out of budget.
 *
 * Each slot keeps the list of words that still fit it. Placing a word narrows
 * the lists of the slots it crosses, and if that empties one the word is taken
 * back straight away rather than discovered to be wrong ten slots later.
 */
export function fillTemplate(
  template: Template,
  bank: ReadonlyMap<number, string[]>,
  rng: Rng,
): string[] | null {
  const { slots } = template;
  // For each slot, the slots that cross it and where.
  const crossings: Array<Array<{ other: number; at: number; otherAt: number }>> = slots.map(() => []);
  const owners = new Map<number, Array<{ slot: number; at: number }>>();
  slots.forEach((slot, index) => {
    slot.cells.forEach((cell, at) => {
      const list = owners.get(cell) ?? [];
      list.push({ slot: index, at });
      owners.set(cell, list);
    });
  });
  for (const list of owners.values()) {
    if (list.length !== 2) continue;
    const [a, b] = list as [{ slot: number; at: number }, { slot: number; at: number }];
    crossings[a.slot]!.push({ other: b.slot, at: a.at, otherAt: b.at });
    crossings[b.slot]!.push({ other: a.slot, at: b.at, otherAt: a.at });
  }

  const domains: string[][] = [];
  for (const slot of slots) {
    const words = bank.get(slot.length);
    if (!words || words.length === 0) return null;
    domains.push(words);
  }

  const placed: Array<string | null> = slots.map(() => null);
  const used = new Set<string>();
  let budget = FILL_BUDGET;

  /** No two answers where one is the start of the other: CAT beside CATS. */
  const clashes = (word: string): boolean => {
    for (const other of used) {
      if (other.startsWith(word) || word.startsWith(other)) return true;
    }
    return false;
  };

  const solve = (): boolean => {
    // The open slot with the fewest words left; the longest breaks a tie, so
    // the search starts with the hardest slot rather than a three-letter one.
    let pick = -1;
    for (let i = 0; i < slots.length; i += 1) {
      if (placed[i] !== null) continue;
      if (
        pick < 0 ||
        domains[i]!.length < domains[pick]!.length ||
        (domains[i]!.length === domains[pick]!.length && slots[i]!.length > slots[pick]!.length)
      ) {
        pick = i;
      }
    }
    if (pick < 0) return true;

    const candidates = shuffle(domains[pick]!.slice(), rng);
    let tries = 0;
    for (const word of candidates) {
      if (tries >= TRIES_PER_SLOT) break;
      if (used.has(word) || clashes(word)) continue;
      tries += 1;
      budget -= 1;
      if (budget <= 0) return false;

      const saved: Array<[number, string[]]> = [];
      let alive = true;
      for (const { other, at, otherAt } of crossings[pick]!) {
        if (placed[other] !== null) continue;
        const letter = word[at];
        const narrowed = domains[other]!.filter((w) => w[otherAt] === letter && w !== word);
        saved.push([other, domains[other]!]);
        domains[other] = narrowed;
        if (narrowed.length === 0) {
          alive = false;
          break;
        }
      }

      if (alive) {
        placed[pick] = word;
        used.add(word);
        if (solve()) return true;
        placed[pick] = null;
        used.delete(word);
      }
      for (const [other, domain] of saved) domains[other] = domain;
      if (budget <= 0) return false;
    }
    return false;
  };

  return solve() ? (placed as string[]) : null;
}

// ----- The puzzle -----

/** The sizes a puzzle comes in: QUICK and CLASSIC. */
export const SIZES = [9, 11] as const;
export type PuzzleSize = (typeof SIZES)[number];

const BANK_BY_LENGTH = wordsByLength(CLUES);
const CLUE_BY_WORD = new Map(CLUES.map((entry) => [entry.word, entry.clues]));

/**
 * The puzzle for a seed. Always returns one: a template that won't fill is
 * dropped and the next one tried, with the same stream of random numbers, so
 * the answer is still fixed by the seed alone.
 */
export function generatePuzzle(seed: number, size: PuzzleSize): Puzzle {
  const rng = new Rng(seed >>> 0);
  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const template = tryTemplate(size, rng);
    if (!template) continue;
    const words = fillTemplate(template, BANK_BY_LENGTH, rng);
    if (!words) continue;
    return buildPuzzle(template, size, words, rng);
  }
  throw new Error(`No ${size}x${size} crossword could be made for seed ${seed}`);
}

function buildPuzzle(
  template: Template,
  size: PuzzleSize,
  words: readonly string[],
  rng: Rng,
): Puzzle {
  const { black, slots } = template;
  const letters: string[] = black.map((isBlack) => (isBlack ? BLACK : " "));
  slots.forEach((slot, index) => {
    slot.cells.forEach((cell, at) => {
      letters[cell] = words[index]![at]!;
    });
  });

  const rows: string[] = [];
  for (let r = 0; r < size; r += 1) rows.push(letters.slice(r * size, (r + 1) * size).join(""));

  const numbers = numberSquares(slots);
  const clues: PuzzleClue[] = slots.map((slot, index) => {
    const answer = words[index]!;
    const choices = CLUE_BY_WORD.get(answer) ?? [answer];
    return {
      number: numbers.get(slot.cells[0]!)!,
      dir: slot.dir,
      row: slot.row,
      col: slot.col,
      answer,
      clue: rng.pick(choices),
    };
  });
  clues.sort((a, b) => (a.dir === b.dir ? a.number - b.number : a.dir === "across" ? -1 : 1));
  return { size, rows, clues };
}

/**
 * Clue numbers, by the square a word starts in. Counted left to right, top to
 * bottom; a square that starts both an across and a down word gets one number
 * that both share.
 */
export function numberSquares(slots: readonly Slot[]): Map<number, number> {
  const starts = [...new Set(slots.map((slot) => slot.cells[0]!))].sort((a, b) => a - b);
  const numbers = new Map<number, number>();
  starts.forEach((cell, index) => numbers.set(cell, index + 1));
  return numbers;
}

/** The grid indices of a clue's squares, first letter first. */
export function clueCells(puzzle: Puzzle, clue: PuzzleClue): number[] {
  const cells: number[] = [];
  for (let i = 0; i < clue.answer.length; i += 1) {
    const row = clue.row + (clue.dir === "down" ? i : 0);
    const col = clue.col + (clue.dir === "across" ? i : 0);
    cells.push(row * puzzle.size + col);
  }
  return cells;
}

/** The whole solution as one string, row after row. */
export function solutionOf(puzzle: Puzzle): string {
  return puzzle.rows.join("");
}

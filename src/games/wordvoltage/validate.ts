/**
 * The strict validator: the final word on whether a puzzle may ship.
 *
 * The generator only proposes; this decides, for generated and hand-written
 * puzzles alike. The pack test (pack.test.ts) runs every shipped puzzle
 * through it on every build, so a broken board fails `npm test` rather than
 * reaching a phone.
 *
 * What a valid board means, in one sentence: every run of two or more
 * letters, across or down, is exactly one of the declared words, the words
 * hang together through real crossings, and the wheel can spell every one.
 */

import { buildBoard, cellKey, placementCells, type CellKey } from "./board.ts";
import { canSpell, letterSignature } from "./letters.ts";
import type { Difficulty, Pack, Placement, Puzzle } from "./types.ts";

export const LIMITS: Readonly<
  Record<Difficulty, { minLetters: number; maxLetters: number; maxSide: number }>
> = {
  family: { minLetters: 4, maxLetters: 6, maxSide: 8 },
  // Eight letters and 11x11 are only for Challenge levels 301-500 (pack v3);
  // everything before them is held to 7 and 10 by pack.test.ts.
  challenge: { minLetters: 5, maxLetters: 8, maxSide: 11 },
};

/** Longest side over shortest. Wider than this is a strip, not a crossword. */
export const MAX_ASPECT = 3;

export const MIN_WORD = 3;

/** Optional word lists: which words may be targets, which may be bonuses. */
export interface Lexicon {
  isTarget(word: string): boolean;
  isBonus(word: string): boolean;
}

/** Everything wrong with one puzzle; an empty list means it may ship. */
export function validatePuzzle(puzzle: Puzzle, lexicon?: Lexicon): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${puzzle.id || "(no id)"}: ${message}`);

  if (!/^[a-z0-9-]+$/.test(puzzle.id)) fail("id must be lower-case letters, digits and dashes");
  const limits = LIMITS[puzzle.difficulty];
  if (!limits) {
    fail(`unknown difficulty "${String(puzzle.difficulty)}"`);
    return errors;
  }

  // 1. The wheel.
  if (!/^[A-Z]+$/.test(puzzle.letters)) fail("wheel letters must be A-Z");
  if (puzzle.letters.length < limits.minLetters || puzzle.letters.length > limits.maxLetters) {
    fail(
      `wheel has ${puzzle.letters.length} letters; ${puzzle.difficulty} allows ${limits.minLetters}-${limits.maxLetters}`,
    );
  }

  // 2. The targets.
  if (puzzle.words.length === 0) fail("no target words");
  const seen = new Set<string>();
  for (const placement of puzzle.words) {
    const { word } = placement;
    if (!/^[A-Z]+$/.test(word)) fail(`target "${word}" must be A-Z`);
    if (word.length < MIN_WORD) fail(`target ${word} is shorter than ${MIN_WORD}`);
    if (seen.has(word)) fail(`target ${word} appears twice`);
    seen.add(word);
    if (!canSpell(word, puzzle.letters)) fail(`the wheel ${puzzle.letters} cannot spell ${word}`);
    if (lexicon && !lexicon.isTarget(word)) fail(`${word} is not on the target list`);
    if (!Number.isInteger(placement.row) || !Number.isInteger(placement.col)) {
      fail(`${word} is not on whole-number coordinates`);
    }
    if (placement.row < 0 || placement.col < 0) fail(`${word} starts off the board`);
    if (placement.dir !== "across" && placement.dir !== "down") fail(`${word} has no direction`);
  }
  if (seen.has(puzzle.letters)) fail("the wheel's starting order spells a target");
  if (errors.length > 0) return errors;

  // 3. Shared squares agree, and only words at right angles share one.
  let board;
  try {
    board = buildBoard(puzzle);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return errors;
  }
  for (const cell of board.cells.values()) {
    if (cell.slots.length > 2) fail(`square ${cell.key} is in ${cell.slots.length} words`);
    if (cell.slots.length === 2) {
      const [a, b] = cell.slots.map((i) => puzzle.words[i]!);
      if (a!.dir === b!.dir) fail(`${a!.word} and ${b!.word} overlap running the same way`);
    }
  }

  // 4. Connected through crossings.
  if (puzzle.words.length > 1 && !isConnected(puzzle.words)) {
    fail("the words don't all connect");
  }

  // 5 and 6. Every run of 2+ letters is exactly a declared word, both ways.
  // This one scan rules out touching words, words that run on into a
  // neighbour, a missing gap after a word's end, and stray two-letter runs.
  const declared = new Set(puzzle.words.map(slotId));
  const runs = maximalRuns(new Set(board.cells.keys()), board.rows, board.cols);
  for (const run of runs) {
    if (!declared.has(run)) {
      const [dir, row, col, length] = run.split(":");
      fail(`an undeclared ${length}-letter run ${dir} from ${row},${col}`);
    }
  }
  const runSet = new Set(runs);
  for (const placement of puzzle.words) {
    if (!runSet.has(slotId(placement))) fail(`${placement.word} touches or runs into another word`);
  }

  // 7. On the board, trimmed, and a usable shape.
  const minRow = Math.min(...puzzle.words.map((p) => p.row));
  const minCol = Math.min(...puzzle.words.map((p) => p.col));
  if (minRow !== 0 || minCol !== 0) fail("board has an empty margin at the top or left");
  if (board.rows > limits.maxSide || board.cols > limits.maxSide) {
    fail(`board is ${board.rows}x${board.cols}; ${puzzle.difficulty} allows ${limits.maxSide}x${limits.maxSide}`);
  }
  if (puzzle.words.length > 1) {
    const ratio = Math.max(board.rows, board.cols) / Math.min(board.rows, board.cols);
    if (ratio > MAX_ASPECT) fail(`board is ${board.rows}x${board.cols}, too long and thin`);
  }

  // The bonus list never holds a target, and holds only spellable words.
  const bonusSeen = new Set<string>();
  for (const word of puzzle.bonus) {
    if (!/^[A-Z]{3,}$/.test(word)) fail(`bonus "${word}" must be 3+ letters A-Z`);
    if (seen.has(word)) fail(`${word} is both a target and a bonus word`);
    if (bonusSeen.has(word)) fail(`bonus ${word} appears twice`);
    bonusSeen.add(word);
    if (!canSpell(word, puzzle.letters)) fail(`the wheel cannot spell bonus ${word}`);
    if (lexicon && !lexicon.isBonus(word)) fail(`bonus ${word} is not in the bonus lexicon`);
  }

  return errors;
}

/** "across:row:col:length" -- what a run and a placement are compared by. */
function slotId(placement: Placement): string {
  return `${placement.dir}:${placement.row}:${placement.col}:${placement.word.length}`;
}

/** Every maximal run of two or more filled squares, as slot ids. */
function maximalRuns(filled: ReadonlySet<CellKey>, rows: number, cols: number): string[] {
  const runs: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    let start = -1;
    for (let col = 0; col <= cols; col += 1) {
      const on = col < cols && filled.has(cellKey(row, col));
      if (on && start < 0) start = col;
      if (!on && start >= 0) {
        if (col - start >= 2) runs.push(`across:${row}:${start}:${col - start}`);
        start = -1;
      }
    }
  }
  for (let col = 0; col < cols; col += 1) {
    let start = -1;
    for (let row = 0; row <= rows; row += 1) {
      const on = row < rows && filled.has(cellKey(row, col));
      if (on && start < 0) start = row;
      if (!on && start >= 0) {
        if (row - start >= 2) runs.push(`down:${start}:${col}:${row - start}`);
        start = -1;
      }
    }
  }
  return runs;
}

function isConnected(words: readonly Placement[]): boolean {
  const cells = words.map((p) => new Set(placementCells(p)));
  const reached = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (let other = 0; other < words.length; other += 1) {
      if (reached.has(other)) continue;
      if ([...cells[at]!].some((key) => cells[other]!.has(key))) {
        reached.add(other);
        queue.push(other);
      }
    }
  }
  return reached.size === words.length;
}

/**
 * A puzzle's identity for duplicate checks: its wheel letters and its words'
 * positions, moved to the top-left corner. A board slid sideways, or turned
 * on its diagonal (across swapped for down), has the same signature.
 */
export function puzzleSignature(puzzle: Pick<Puzzle, "letters" | "words">): string {
  const wheel = letterSignature(puzzle.letters);
  const describe = (words: readonly Placement[]): string => {
    const minRow = Math.min(...words.map((p) => p.row));
    const minCol = Math.min(...words.map((p) => p.col));
    return words
      .map((p) => `${p.word}@${p.row - minRow},${p.col - minCol},${p.dir[0]}`)
      .sort()
      .join(";");
  };
  const straight = describe(puzzle.words);
  const turned = describe(
    puzzle.words.map((p) => ({
      word: p.word,
      row: p.col,
      col: p.row,
      dir: p.dir === "across" ? "down" : "across",
    })),
  );
  return `${wheel}|${straight < turned ? straight : turned}`;
}

/** How close two levels may sit and still not share a wheel. */
export const NEAR_WINDOW = 5;

/** Everything wrong with a whole pack: each puzzle, and how they fit together. */
export function validatePack(pack: Pack, lexicon?: Lexicon, minDailyDays = 90): string[] {
  const errors: string[] = [];
  const puzzles = Object.values(pack.puzzles);

  for (const [id, puzzle] of Object.entries(pack.puzzles)) {
    if (puzzle.id !== id) errors.push(`${id}: listed under the wrong id (${puzzle.id})`);
    errors.push(...validatePuzzle(puzzle, lexicon));
  }

  // No two puzzles are the same board, and no two share a wheel.
  const bySignature = new Map<string, string>();
  const byWheel = new Map<string, string>();
  for (const puzzle of puzzles) {
    const signature = puzzleSignature(puzzle);
    const twin = bySignature.get(signature);
    if (twin) errors.push(`${puzzle.id}: the same puzzle as ${twin}`);
    bySignature.set(signature, puzzle.id);
    const wheel = letterSignature(puzzle.letters);
    const sibling = byWheel.get(wheel);
    if (sibling && puzzle.id !== pack.tutorial && sibling !== pack.tutorial) {
      errors.push(`${puzzle.id}: the same wheel as ${sibling}`);
    }
    byWheel.set(wheel, puzzle.id);
  }

  // Each campaign: real puzzles of the right path, used once.
  const used = new Map<string, string>();
  for (const difficulty of ["family", "challenge"] as const) {
    const ids = pack.campaign[difficulty] ?? [];
    if (ids.length === 0) errors.push(`campaign ${difficulty} is empty`);
    ids.forEach((id, index) => {
      const puzzle = pack.puzzles[id];
      if (!puzzle) {
        errors.push(`campaign ${difficulty} level ${index + 1}: no puzzle ${id}`);
        return;
      }
      if (puzzle.difficulty !== difficulty) {
        errors.push(`campaign ${difficulty} level ${index + 1}: ${id} is ${puzzle.difficulty}`);
      }
      if (used.has(id)) errors.push(`${id} is used twice (${used.get(id)} and campaign ${difficulty})`);
      used.set(id, `campaign ${difficulty}`);
    });
    // Neighbouring levels never share target words wholesale.
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < Math.min(ids.length, i + NEAR_WINDOW); j += 1) {
        const a = pack.puzzles[ids[i]!];
        const b = pack.puzzles[ids[j]!];
        if (a && b && nearDuplicate(a, b)) {
          errors.push(`campaign ${difficulty}: levels ${i + 1} and ${j + 1} are too alike`);
        }
      }
    }
  }

  // The dailies: consecutive dates, both paths, puzzles of their own.
  const dates = Object.keys(pack.daily).sort();
  if (dates.length < minDailyDays) {
    errors.push(`only ${dates.length} daily dates; at least ${minDailyDays} are required`);
  }
  for (let i = 1; i < dates.length; i += 1) {
    if (nextDate(dates[i - 1]!) !== dates[i]) {
      errors.push(`daily dates skip from ${dates[i - 1]} to ${dates[i]}`);
    }
  }
  const dailyOrder: Record<Difficulty, Puzzle[]> = { family: [], challenge: [] };
  for (const date of dates) {
    for (const difficulty of ["family", "challenge"] as const) {
      const id = pack.daily[date]?.[difficulty];
      const puzzle = id ? pack.puzzles[id] : undefined;
      if (!id || !puzzle) {
        errors.push(`daily ${date} ${difficulty}: no puzzle`);
        continue;
      }
      if (puzzle.difficulty !== difficulty) errors.push(`daily ${date} ${difficulty}: ${id} is ${puzzle.difficulty}`);
      if (used.has(id)) errors.push(`${id} is used twice (${used.get(id)} and daily ${date})`);
      used.set(id, `daily ${date}`);
      dailyOrder[difficulty].push(puzzle);
    }
  }
  for (const difficulty of ["family", "challenge"] as const) {
    const list = dailyOrder[difficulty];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < Math.min(list.length, i + NEAR_WINDOW); j += 1) {
        if (nearDuplicate(list[i]!, list[j]!)) {
          errors.push(`daily ${difficulty}: ${list[i]!.id} and ${list[j]!.id} are too alike`);
        }
      }
    }
  }

  // Themes: real puzzles, used once, each named, each with two or more of
  // its theme's words on the board. Neighbours may share theme words -- a
  // theme is meant to repeat its subject -- but never a wheel (checked above).
  for (const [themeId, ids] of Object.entries(pack.themes ?? {})) {
    if (ids.length === 0) errors.push(`theme ${themeId} is empty`);
    ids.forEach((id, index) => {
      const puzzle = pack.puzzles[id];
      if (!puzzle) {
        errors.push(`theme ${themeId} level ${index + 1}: no puzzle ${id}`);
        return;
      }
      if (used.has(id)) errors.push(`${id} is used twice (${used.get(id)} and theme ${themeId})`);
      used.set(id, `theme ${themeId}`);
      if (!puzzle.title?.trim()) errors.push(`${id}: a theme level needs a title`);
      const onBoard = new Set(puzzle.words.map((p) => p.word));
      const themeWords = puzzle.theme ?? [];
      if (themeWords.length < 2) errors.push(`${id}: fewer than two theme words on the board`);
      for (const word of themeWords) {
        if (!onBoard.has(word)) errors.push(`${id}: theme word ${word} isn't on the board`);
      }
    });
  }

  const tutorial = pack.puzzles[pack.tutorial];
  if (!tutorial) errors.push(`no tutorial puzzle ${pack.tutorial}`);
  else if (used.has(pack.tutorial)) errors.push("the tutorial puzzle is also a level");

  return errors;
}

/** Half or more of the smaller puzzle's targets also in the other. */
export function nearDuplicate(a: Puzzle, b: Puzzle): boolean {
  if (letterSignature(a.letters) === letterSignature(b.letters)) return true;
  const words = new Set(a.words.map((p) => p.word));
  const shared = b.words.filter((p) => words.has(p.word)).length;
  return shared * 2 >= Math.min(a.words.length, b.words.length) && shared >= 2;
}

/** "2026-10-31" -> "2026-11-01", on the calendar alone. */
export function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1));
  return next.toISOString().slice(0, 10);
}

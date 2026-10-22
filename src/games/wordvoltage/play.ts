/**
 * The rules of a level, with no DOM: what a word does when it's sent, what a
 * hint reveals, when the board is finished, and what that's worth.
 *
 * Every function returns a new state rather than changing the old one, so
 * the game can save exactly what it shows, and the tests can drive a whole
 * level without a screen.
 */

import { buildBoard, type Board, type CellKey } from "./board.ts";
import { canSpell, normalizeWord } from "./letters.ts";
import { MIN_WORD } from "./validate.ts";
import type { Puzzle } from "./types.ts";

/** One go at one puzzle. */
export interface Attempt {
  /** Target words solved, in the order they were solved. */
  readonly solved: readonly string[];
  /** Squares a hint has uncovered. */
  readonly revealed: readonly CellKey[];
  /** Bonus words found this attempt, in the order found. */
  readonly bonus: readonly string[];
  readonly hints: number;
  readonly completed: boolean;
}

export const FRESH_ATTEMPT: Attempt = {
  solved: [],
  revealed: [],
  bonus: [],
  hints: 0,
  completed: false,
};

export type Outcome =
  /** A target, newly solved -- plus any the crossings finished with it. */
  | { kind: "solved"; word: string; words: readonly string[]; completed: boolean }
  | { kind: "already"; word: string }
  | { kind: "bonus"; word: string }
  | { kind: "bonus-again"; word: string }
  | { kind: "unknown"; word: string }
  /** Too short to be a word: cleared quietly, with no message at all. */
  | { kind: "short" }
  /** The level is already finished; nothing happens. */
  | { kind: "finished" };

/** A puzzle with its board worked out once. */
export interface Level {
  readonly puzzle: Puzzle;
  readonly board: Board;
  readonly bonus: ReadonlySet<string>;
  readonly targetIndex: ReadonlyMap<string, number>;
}

export function makeLevel(puzzle: Puzzle): Level {
  return {
    puzzle,
    board: buildBoard(puzzle),
    bonus: new Set(puzzle.bonus),
    targetIndex: new Map(puzzle.words.map((p, i) => [p.word, i])),
  };
}

/** Squares whose letters are showing: solved words and revealed squares. */
export function knownCells(level: Level, attempt: Attempt): Set<CellKey> {
  const known = new Set<CellKey>(attempt.revealed);
  for (const word of attempt.solved) {
    const index = level.targetIndex.get(word);
    if (index !== undefined) for (const key of level.board.slotCells[index]!) known.add(key);
  }
  return known;
}

/**
 * Solve every word whose squares are all showing. A word can be finished by
 * its crossings and hints without ever being typed, and it counts.
 */
function reconcile(level: Level, attempt: Attempt): { attempt: Attempt; added: string[] } {
  const known = knownCells(level, attempt);
  const solved = new Set(attempt.solved);
  const added: string[] = [];
  level.puzzle.words.forEach((placement, index) => {
    if (solved.has(placement.word)) return;
    if (level.board.slotCells[index]!.every((key) => known.has(key))) {
      added.push(placement.word);
      solved.add(placement.word);
    }
  });
  const all = [...attempt.solved, ...added];
  return {
    attempt: { ...attempt, solved: all, completed: all.length === level.puzzle.words.length },
    added,
  };
}

/** What a word sent from the wheel does. */
export function submitWord(
  level: Level,
  attempt: Attempt,
  raw: string,
): { attempt: Attempt; outcome: Outcome } {
  if (attempt.completed) return { attempt, outcome: { kind: "finished" } };
  const word = normalizeWord(raw);
  if (word === null) return { attempt, outcome: { kind: "unknown", word: "" } };
  if (word.length < MIN_WORD) return { attempt, outcome: { kind: "short" } };
  if (!canSpell(word, level.puzzle.letters)) return { attempt, outcome: { kind: "unknown", word } };

  // Targets first: a target is never a bonus word.
  if (level.targetIndex.has(word)) {
    if (attempt.solved.includes(word)) return { attempt, outcome: { kind: "already", word } };
    const next = reconcile(level, { ...attempt, solved: [...attempt.solved, word] });
    return {
      attempt: next.attempt,
      outcome: {
        kind: "solved",
        word,
        words: [word, ...next.added],
        completed: next.attempt.completed,
      },
    };
  }
  if (level.bonus.has(word)) {
    if (attempt.bonus.includes(word)) return { attempt, outcome: { kind: "bonus-again", word } };
    return { attempt: { ...attempt, bonus: [...attempt.bonus, word] }, outcome: { kind: "bonus", word } };
  }
  return { attempt, outcome: { kind: "unknown", word } };
}

/** The square a hint would uncover now, or null if every square is showing. */
export function hintTarget(level: Level, attempt: Attempt, focus: number | null): CellKey | null {
  if (attempt.completed) return null;
  const known = knownCells(level, attempt);
  const solved = new Set(attempt.solved);
  const hidden = (index: number) =>
    solved.has(level.puzzle.words[index]!.word)
      ? undefined
      : level.board.slotCells[index]!.find((key) => !known.has(key));
  if (focus !== null && focus >= 0 && focus < level.puzzle.words.length) {
    const cell = hidden(focus);
    if (cell) return cell;
  }
  for (let index = 0; index < level.puzzle.words.length; index += 1) {
    const cell = hidden(index);
    if (cell) return cell;
  }
  return null;
}

/**
 * Uncover one square. Hints are free and unlimited; they only count against
 * this attempt's stars. A tap that uncovers nothing isn't counted.
 */
export function useHint(
  level: Level,
  attempt: Attempt,
  focus: number | null = null,
): { attempt: Attempt; cell: CellKey | null; words: readonly string[] } {
  const cell = hintTarget(level, attempt, focus);
  if (cell === null) return { attempt, cell: null, words: [] };
  const next = reconcile(level, {
    ...attempt,
    revealed: [...attempt.revealed, cell],
    hints: attempt.hints + 1,
  });
  return { attempt: next.attempt, cell, words: next.added };
}

/** Exactly the share of target words solved. Bonus words don't move it. */
export function charge(level: Level, attempt: Attempt): number {
  return attempt.solved.length / level.puzzle.words.length;
}

/** 3 with no hints, 2 with one or two, 1 with three or more. */
export function starsFor(hints: number): 1 | 2 | 3 {
  if (hints <= 0) return 3;
  if (hints <= 2) return 2;
  return 1;
}

/**
 * Re-check a saved attempt against its puzzle: drop anything that isn't part
 * of it (a corrupt save, or a word list that changed), then re-solve.
 */
export function restoreAttempt(level: Level, saved: Partial<Attempt> | undefined): Attempt {
  if (!saved) return FRESH_ATTEMPT;
  const words = new Set(level.puzzle.words.map((p) => p.word));
  const solved = unique(arrayOf(saved.solved).filter((w) => words.has(w)));
  const revealed = unique(arrayOf(saved.revealed).filter((key) => level.board.cells.has(key)));
  const bonus = unique(arrayOf(saved.bonus).filter((w) => level.bonus.has(w)));
  const hints = Number.isInteger(saved.hints) && saved.hints! >= 0 ? saved.hints! : 0;
  return reconcile(level, { solved, revealed, bonus, hints: Math.max(hints, 0), completed: false }).attempt;
}

function arrayOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

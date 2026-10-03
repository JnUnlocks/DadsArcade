/**
 * The Word Finder's three searches: words that fit a pattern, words made from
 * a set of letters, and clues that mention a word.
 *
 * No DOM and no network: the dictionary is handed in, so every search has a
 * test beside it (lookup.test.ts).
 */

import type { ClueEntry } from "./clues.ts";

/** The longest pattern worth searching: a full-size newspaper grid is 15 wide. */
export const MAX_PATTERN = 15;

/**
 * What someone typed, as a pattern: lower-case letters, and `?` for a square
 * they don't know. A dot, a dash, an underscore, a star or a space all mean
 * the same thing, because people write a blank every one of those ways.
 */
export function normalizePattern(typed: string): string {
  return typed
    .toLowerCase()
    .replace(/[\s._*-]/g, "?")
    .replace(/[^a-z?]/g, "")
    .slice(0, MAX_PATTERN);
}

/** Words the same length as the pattern with its letters in the same places. */
export function matchPattern(words: Iterable<string>, pattern: string): string[] {
  const found: string[] = [];
  if (pattern.length === 0) return found;
  outer: for (const word of words) {
    if (word.length !== pattern.length) continue;
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern[i] !== "?" && pattern[i] !== word[i]) continue outer;
    }
    found.push(word);
  }
  return found;
}

/**
 * Words that use exactly these letters, each once. A `?` among them stands for
 * any one letter, so "tca?" finds every four-letter word with a T, a C and an
 * A in it.
 */
export function anagrams(words: Iterable<string>, letters: string): string[] {
  const found: string[] = [];
  if (letters.length === 0) return found;
  const wanted = new Map<string, number>();
  let blanks = 0;
  for (const letter of letters) {
    if (letter === "?") blanks += 1;
    else wanted.set(letter, (wanted.get(letter) ?? 0) + 1);
  }

  for (const word of words) {
    if (word.length !== letters.length) continue;
    const left = new Map(wanted);
    let spare = blanks;
    let ok = true;
    for (const letter of word) {
      const have = left.get(letter) ?? 0;
      if (have > 0) left.set(letter, have - 1);
      else if (spare > 0) spare -= 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) found.push(word);
  }
  return found;
}

export interface ClueHit {
  word: string;
  clue: string;
}

/** Words too common to search a clue for. */
const SMALL_WORDS = new Set([
  "a", "an", "and", "at", "for", "in", "is", "it", "of", "on", "or", "the", "to", "with",
]);

/**
 * Clues from the arcade's own bank that contain every word typed, best first:
 * a clue that is mostly the search comes before a long one that happens to
 * include it. An optional pattern narrows the answers.
 */
export function searchClues(bank: readonly ClueEntry[], typed: string, pattern = ""): ClueHit[] {
  const terms = typed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 0 && !SMALL_WORDS.has(term));
  if (terms.length === 0) return [];

  const allowed = pattern
    ? new Set(matchPattern(bank.map((entry) => entry.word), pattern))
    : null;
  const hits: Array<ClueHit & { rank: number }> = [];
  for (const entry of bank) {
    if (allowed && !allowed.has(entry.word)) continue;
    for (const clue of entry.clues) {
      const words = clue.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const found = terms.every((term) => words.some((word) => word.startsWith(term)));
      if (found) hits.push({ word: entry.word, clue, rank: words.length });
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.word.localeCompare(b.word, "en"));
  return hits.map(({ word, clue }) => ({ word, clue }));
}

/**
 * Pattern matches with the everyday words first. ENABLE is a tournament list:
 * most of what fits "?a?e" is a word nobody has met, and the answer to a
 * newspaper clue is almost always one of the ordinary ones.
 */
export function rankMatches(matches: readonly string[], common: ReadonlySet<string>): string[] {
  const first = matches.filter((word) => common.has(word));
  const rest = matches.filter((word) => !common.has(word));
  return [...first, ...rest];
}

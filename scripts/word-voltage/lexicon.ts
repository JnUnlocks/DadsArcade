/**
 * Word Voltage's two word lists, built from files already in the repo.
 *
 *   targets  words a board may be filled with: common, family words
 *   bonus    words the game accepts as a bonus: broader, still family-safe
 *
 * Neither is shipped to the phone. The generator works out, for each puzzle,
 * exactly which bonus words its wheel can spell and writes that list into the
 * pack, so the game never needs a dictionary at run time and never looks a
 * word up online. See scripts/word-voltage/LEXICON.md for sources and
 * licences.
 */

import { readFileSync } from "node:fs";

import { CLUES } from "../../src/games/crossword/clues.ts";
import { ANSWERS } from "../../src/games/letterlock/words.ts";

const MIN = 3;
const MAX = 8;

function wordsOf(path: URL): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .flatMap((line) => line.split(/\s+/))
    .filter(Boolean);
}

export interface WordLists {
  readonly targets: ReadonlySet<string>;
  readonly bonus: ReadonlySet<string>;
  /** Target candidates dropped because ENABLE doesn't have them: likely typos. */
  readonly notInEnable: readonly string[];
  /** Target candidates dropped by the deny list. */
  readonly denied: readonly string[];
  /** The deny list itself: never accepted, never shown. */
  readonly deny: ReadonlySet<string>;
}

let cached: WordLists | null = null;

export function loadWordLists(): WordLists {
  if (cached) return cached;
  const fits = (word: string) => /^[A-Z]+$/.test(word) && word.length >= MIN && word.length <= MAX;

  const deny = new Set(wordsOf(new URL("data/bonus-deny.txt", import.meta.url)).map((w) => w.toUpperCase()));

  // ENABLE (public domain), as the arcade ships it with swears already out.
  const enable = new Set(
    readFileSync(new URL("../../public/crossword-words.txt", import.meta.url), "utf8")
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter(fits),
  );
  const bonus = new Set([...enable].filter((w) => !deny.has(w)));

  const candidates = new Set(
    [
      ...CLUES.map((entry) => entry.word),
      ...ANSWERS,
      ...wordsOf(new URL("data/extra-targets.txt", import.meta.url)),
      ...wordsOf(new URL("data/extra-targets-2.txt", import.meta.url)),
    ]
      .map((w) => w.toUpperCase())
      .filter(fits),
  );
  const targets = new Set<string>();
  const notInEnable: string[] = [];
  const denied: string[] = [];
  for (const word of [...candidates].sort()) {
    if (deny.has(word)) denied.push(word);
    else if (!enable.has(word)) notInEnable.push(word);
    else targets.add(word);
  }
  cached = { targets, bonus, notInEnable, denied, deny };
  return cached;
}

export interface ThemeScene {
  readonly title: string;
  readonly words: readonly string[];
}

export interface ThemeWords {
  readonly id: string;
  readonly scenes: readonly ThemeScene[];
  /** Every word of every scene: what glows, and what this theme accepts. */
  readonly words: ReadonlySet<string>;
  /** Names this theme allows (they aren't in ENABLE). */
  readonly names: ReadonlySet<string>;
  /** Words left out: not in ENABLE (and not a listed name), denied, or the wrong length. */
  readonly dropped: readonly string[];
}

/** One theme's file: data/themes/<id>.txt. */
export function loadTheme(id: string): ThemeWords {
  const { bonus, deny } = loadWordLists();
  const text = readFileSync(new URL(`data/themes/${id}.txt`, import.meta.url), "utf8");
  const names = new Set<string>();
  const scenes: ThemeScene[] = [];
  const dropped: string[] = [];
  const words = new Set<string>();
  let scene: { title: string; words: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("names:")) {
      for (const name of line.slice(6).split(/\s+/).filter(Boolean)) names.add(name.toUpperCase());
      continue;
    }
    if (line.startsWith("==")) {
      scene = { title: line.slice(2).trim(), words: [] };
      scenes.push(scene);
      continue;
    }
    for (const token of line.split(/\s+/)) {
      const word = token.toUpperCase();
      const ok =
        /^[A-Z]+$/.test(word) &&
        word.length >= MIN &&
        word.length <= MAX &&
        !deny.has(word) &&
        (bonus.has(word) || names.has(word));
      if (!ok) {
        dropped.push(word);
        continue;
      }
      if (scene && !scene.words.includes(word)) scene.words.push(word);
      words.add(word);
    }
  }
  return { id, scenes, words, names, dropped: [...new Set(dropped)] };
}

/**
 * The Word Finder panel: type what you know of a word, get what fits.
 *
 * It's one panel used in two places. On the arcade floor it's a cabinet of
 * its own (games/wordfinder), for the crossword in the actual newspaper. Inside
 * Mom Mom's Crossword it opens over the grid with the current word's pattern
 * already typed, and tapping a result writes it in.
 *
 * Three searches (lookup.ts):
 *   PATTERN  C?T -- letters where you have them, ? where you don't
 *   ANAGRAM  the letters in any order
 *   CLUE     a word from the clue, searched against the arcade's own clues
 *
 * PATTERN and ANAGRAM search the public-domain ENABLE word list, about 168,000
 * words. That's 1.6 MB, far too much to make every visitor download for a
 * panel most of them never open, so it's a file of its own that is fetched
 * the first time the finder is used and kept by the service worker after
 * that. Until it arrives -- or if it can't, on a first visit with no signal --
 * the finder still answers from the words the arcade already has.
 *
 * CLUE can only search clues written for this arcade. The big lookup sites
 * search decades of published newspaper clues, which aren't ours to ship.
 */

import { ANSWERS } from "../letterlock/words";
import { CLUES, clueEntry } from "./clues";
import {
  anagrams,
  matchPattern,
  normalizePattern,
  rankMatches,
  searchClues,
  MAX_PATTERN,
} from "./lookup";

const DICTIONARY_URL = "/crossword-words.txt";

/** The most results put on screen; past this the list isn't worth reading. */
const MAX_SHOWN = 120;

let dictionary: Promise<readonly string[]> | null = null;

/** The big word list, fetched once. A failed fetch can be tried again. */
export function loadDictionary(): Promise<readonly string[]> {
  dictionary ??= fetch(DICTIONARY_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`dictionary: ${response.status}`);
      return response.text();
    })
    .then((text) => text.split("\n").filter((word) => word.length > 0))
    .catch((error: unknown) => {
      dictionary = null;
      throw error;
    });
  return dictionary;
}

/** Everyday words, shown first: the clue bank and Letter Lock's answers. */
const COMMON: ReadonlySet<string> = new Set([...CLUES.map((entry) => entry.word), ...ANSWERS]);

type Tab = "pattern" | "anagram" | "clue";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "pattern", label: "PATTERN" },
  { id: "anagram", label: "ANAGRAM" },
  { id: "clue", label: "CLUE" },
];

export interface FinderOptions {
  /** A pattern to start with, e.g. the word under the cursor. */
  pattern?: string;
  /** Makes results tappable: called with the word chosen. */
  onPick?: (word: string) => void;
  /** Adds a close button. */
  onClose?: () => void;
  /**
   * Leaves out everything that knows the arcade's own clues: the CLUE tab, and
   * the clue printed under a word. Inside the crossword those would simply be
   * the answer -- search for the clue on screen and read off the word.
   */
  wordsOnly?: boolean;
}

export function buildFinder(options: FinderOptions = {}): HTMLElement {
  const root = el("div", "finder");
  let tab: Tab = "pattern";
  let words: readonly string[] | null = null;
  let offline = false;

  const head = el("div", "finder-head");
  head.append(el("h2", "finder-title", "WORD FINDER"));
  if (options.onClose) {
    const close = el("button", "finder-close", "CLOSE");
    close.addEventListener("click", options.onClose);
    head.append(close);
  }

  const tabs = el("div", "finder-tabs");
  tabs.setAttribute("role", "tablist");
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  for (const { id, label } of TABS) {
    if (id === "clue" && options.wordsOnly) continue;
    const button = el("button", "finder-tab", label);
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      tab = id;
      refresh();
      main.focus();
    });
    tabButtons.set(id, button);
    tabs.append(button);
  }

  const main = textInput("finder-input");
  main.value = (options.pattern ?? "").toUpperCase();
  /** The CLUE tab's second box: an optional pattern to narrow the answers. */
  const narrow = textInput("finder-input finder-input--narrow");
  narrow.placeholder = "LETTERS YOU HAVE (OPTIONAL)   C?T";
  narrow.setAttribute("aria-label", "Letters you already have, with a question mark for each blank");

  const hint = el("p", "finder-hint");
  const status = el("p", "finder-status");
  status.setAttribute("aria-live", "polite");
  const results = el("ul", "finder-results");

  const form = el("div", "finder-form");
  form.append(main, narrow, hint);
  root.append(head, tabs, form, status, results);

  const refresh = (): void => {
    for (const [id, button] of tabButtons) {
      const on = id === tab;
      button.classList.toggle("finder-tab--on", on);
      button.setAttribute("aria-selected", String(on));
    }
    narrow.hidden = tab !== "clue";
    if (tab === "pattern") {
      main.placeholder = "C?T";
      main.maxLength = MAX_PATTERN;
      main.setAttribute("aria-label", "Pattern: letters you have, a question mark for each blank");
      hint.textContent = "Type the letters you have. Use ? for each blank square.";
    } else if (tab === "anagram") {
      main.placeholder = "TCA";
      main.maxLength = MAX_PATTERN;
      main.setAttribute("aria-label", "Letters to rearrange");
      hint.textContent = "Type the letters in any order. Use ? for any letter.";
    } else {
      main.placeholder = "A WORD FROM THE CLUE";
      main.maxLength = 40;
      main.setAttribute("aria-label", "A word from the clue");
      hint.textContent = "Searches the clues written for this arcade's own puzzles.";
    }
    search();
  };

  const search = (): void => {
    results.replaceChildren();
    const source = words ?? [...COMMON];
    const waiting = words === null && !offline;
    const note = offline ? " The full dictionary needs a connection the first time." : "";

    if (tab === "clue") {
      const pattern = normalizePattern(narrow.value);
      const hits = searchClues(CLUES, main.value, pattern);
      if (main.value.trim() === "") status.textContent = "";
      else status.textContent = hits.length === 0 ? "NO CLUES LIKE THAT" : countLabel(hits.length, "CLUE");
      for (const hit of hits.slice(0, MAX_SHOWN)) results.append(resultRow(hit.word, hit.clue));
      return;
    }

    const pattern = normalizePattern(main.value);
    if (pattern.length < 2) {
      status.textContent = waiting ? "LOADING THE DICTIONARY..." : "";
      return;
    }
    // Nothing but blanks would list every word of that length.
    if (tab === "pattern" && !/[a-z]/.test(pattern)) {
      status.textContent = "ADD AT LEAST ONE LETTER";
      return;
    }
    const found = tab === "pattern" ? matchPattern(source, pattern) : anagrams(source, pattern);
    const ranked = rankMatches(found, COMMON);
    status.textContent =
      (ranked.length === 0 ? "NOTHING FITS" : countLabel(ranked.length, "WORD")) +
      (ranked.length > MAX_SHOWN ? `, SHOWING ${MAX_SHOWN}` : "") +
      (waiting ? " SO FAR. LOADING THE DICTIONARY..." : "") +
      note;
    for (const word of ranked.slice(0, MAX_SHOWN)) {
      const clue = options.wordsOnly ? "" : (clueEntry(word)?.clues[0] ?? "");
      results.append(resultRow(word, clue));
    }
  };

  const resultRow = (word: string, clue: string): HTMLElement => {
    const item = el("li", "finder-row");
    const pick = options.onPick;
    const body = pick ? el("button", "finder-word finder-word--pick") : el("div", "finder-word");
    body.append(el("span", "finder-word-text", word.toUpperCase()));
    if (clue) body.append(el("span", "finder-word-clue", clue));
    if (pick) {
      body.setAttribute("aria-label", `Write in ${word}`);
      body.addEventListener("click", () => pick(word));
    }
    item.append(body);
    return item;
  };

  main.addEventListener("input", search);
  narrow.addEventListener("input", search);

  void loadDictionary().then(
    (loaded) => {
      words = loaded;
      if (root.isConnected) search();
    },
    () => {
      offline = true;
      if (root.isConnected) search();
    },
  );

  refresh();
  return root;
}

function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "S"}`;
}

function textInput(className: string): HTMLInputElement {
  const input = document.createElement("input");
  input.className = className;
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "characters");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("enterkeyhint", "search");
  return input;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

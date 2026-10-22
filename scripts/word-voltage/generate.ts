/**
 * Makes Word Voltage's content pack: public/word-voltage/pack-v1.json.
 *
 *   npm run wv:generate
 *
 * Run it at development time, never in the game. It is deterministic -- the
 * same word lists and the same seed give byte-for-byte the same file -- and it
 * refuses to write a pack the strict validator (src/games/wordvoltage/
 * validate.ts) rejects, so whatever it writes is fit to ship.
 *
 * How a puzzle is made:
 *   1. Pick a base word of the level's wheel size from the target list. Its
 *      letters are the wheel.
 *   2. Every target-list word the wheel can spell is a candidate.
 *   3. Lay candidates onto a board, each crossing one already placed, by a
 *      seeded search with restarts; keep the best-scoring board (crossings,
 *      compactness, a phone-friendly shape) with the level's word count.
 *   4. Every other lexicon word the wheel spells becomes the bonus list.
 *   5. Validate. Reject and log anything that fails, and try the next base.
 *
 * Once a pack has been released, don't regenerate it: its ids are what saves
 * and rewards are keyed on. Make pack-v2 instead and carry v1's puzzles over.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { Rng } from "../../src/core/rng.ts";
import { encodePuzzle, PACK_VERSION, type PackFile } from "../../src/games/wordvoltage/pack.ts";
import { letterCounts, letterSignature } from "../../src/games/wordvoltage/letters.ts";
import type { Difficulty, Pack, Placement, Puzzle } from "../../src/games/wordvoltage/types.ts";
import {
  LIMITS,
  MAX_ASPECT,
  NEAR_WINDOW,
  nearDuplicate,
  nextDate,
  validatePack,
  validatePuzzle,
} from "../../src/games/wordvoltage/validate.ts";
import { loadWordLists } from "./lexicon.ts";

const SEED = 0x57a7e;
const LEVELS = 100;
export const DAILY_START = "2026-10-21";
export const DAILY_DAYS = 100;

interface Spec {
  letters: number;
  words: number;
  /** Whether the wheel may repeat a letter (two Es, two Ts). */
  repeats: boolean;
}

/** The Family path: four letters to start, six by the last circuit. */
function familySpec(level: number): Spec {
  if (level <= 8) return { letters: 4, words: level <= 3 ? 3 : 4, repeats: false };
  if (level <= 30) return { letters: 5, words: level <= 18 ? 4 : 5, repeats: level > 20 };
  if (level <= 60) return { letters: 5, words: level <= 45 ? 5 : 6, repeats: true };
  if (level <= 80) return { letters: 6, words: level <= 70 ? 5 : 6, repeats: true };
  return { letters: 6, words: 7, repeats: true };
}

/** The Challenge path: five letters to start, seven by the end. */
function challengeSpec(level: number): Spec {
  if (level <= 15) return { letters: 5, words: level <= 8 ? 5 : 6, repeats: level > 10 };
  if (level <= 40) return { letters: 6, words: level <= 28 ? 6 : 7, repeats: true };
  if (level <= 60) return { letters: 7, words: level <= 50 ? 7 : 8, repeats: true };
  if (level <= 80) return { letters: 6, words: 8, repeats: true };
  return { letters: 7, words: level <= 90 ? 9 : 10, repeats: true };
}

function dailySpec(difficulty: Difficulty, day: number): Spec {
  if (difficulty === "family") {
    return day % 3 === 2 ? { letters: 6, words: 6, repeats: true } : { letters: 5, words: 5, repeats: true };
  }
  return day % 2 === 1 ? { letters: 7, words: 8, repeats: true } : { letters: 6, words: 7, repeats: true };
}

// ----- Laying words onto a board -----

interface Cell {
  letter: string;
  across: boolean;
  down: boolean;
}

class Layout {
  readonly cells = new Map<string, Cell>();
  readonly words: Placement[] = [];
  minRow = 0;
  maxRow = 0;
  minCol = 0;
  maxCol = 0;
  crossings = 0;

  clone(): Layout {
    const copy = new Layout();
    for (const [key, cell] of this.cells) copy.cells.set(key, { ...cell });
    copy.words.push(...this.words);
    copy.minRow = this.minRow;
    copy.maxRow = this.maxRow;
    copy.minCol = this.minCol;
    copy.maxCol = this.maxCol;
    copy.crossings = this.crossings;
    return copy;
  }

  get rows(): number {
    return this.maxRow - this.minRow + 1;
  }

  get cols(): number {
    return this.maxCol - this.minCol + 1;
  }

  letterAt(row: number, col: number): string | undefined {
    return this.cells.get(`${row},${col}`)?.letter;
  }

  /** How many letters this placement shares, or -1 if it isn't allowed. */
  check(p: Placement, maxSide: number): number {
    const dr = p.dir === "down" ? 1 : 0;
    const dc = p.dir === "across" ? 1 : 0;
    const n = p.word.length;
    // A gap before the first letter and after the last.
    if (this.letterAt(p.row - dr, p.col - dc) !== undefined) return -1;
    if (this.letterAt(p.row + dr * n, p.col + dc * n) !== undefined) return -1;
    let shared = 0;
    for (let i = 0; i < n; i += 1) {
      const row = p.row + dr * i;
      const col = p.col + dc * i;
      const cell = this.cells.get(`${row},${col}`);
      if (cell) {
        if (cell.letter !== p.word[i]) return -1;
        if (p.dir === "across" ? cell.across : cell.down) return -1;
        shared += 1;
      } else {
        // Nothing alongside a new letter, or it would make a stray run.
        if (this.letterAt(row - dc, col - dr) !== undefined) return -1;
        if (this.letterAt(row + dc, col + dr) !== undefined) return -1;
      }
    }
    if (this.words.length > 0 && (shared === 0 || shared === n)) return -1;
    const minRow = Math.min(this.minRow, p.row);
    const minCol = Math.min(this.minCol, p.col);
    const maxRow = Math.max(this.maxRow, p.row + dr * (n - 1));
    const maxCol = Math.max(this.maxCol, p.col + dc * (n - 1));
    if (this.words.length === 0) return 0;
    if (maxRow - minRow + 1 > maxSide || maxCol - minCol + 1 > maxSide) return -1;
    return shared;
  }

  place(p: Placement, shared: number): void {
    const dr = p.dir === "down" ? 1 : 0;
    const dc = p.dir === "across" ? 1 : 0;
    for (let i = 0; i < p.word.length; i += 1) {
      const key = `${p.row + dr * i},${p.col + dc * i}`;
      const cell = this.cells.get(key) ?? { letter: p.word[i]!, across: false, down: false };
      if (p.dir === "across") cell.across = true;
      else cell.down = true;
      this.cells.set(key, cell);
    }
    if (this.words.length === 0) {
      this.minRow = p.row;
      this.minCol = p.col;
      this.maxRow = p.row + dr * (p.word.length - 1);
      this.maxCol = p.col + dc * (p.word.length - 1);
    } else {
      this.minRow = Math.min(this.minRow, p.row);
      this.minCol = Math.min(this.minCol, p.col);
      this.maxRow = Math.max(this.maxRow, p.row + dr * (p.word.length - 1));
      this.maxCol = Math.max(this.maxCol, p.col + dc * (p.word.length - 1));
    }
    this.words.push(p);
    this.crossings += shared;
  }

  /** Every legal way to cross `word` with what's already down. */
  options(word: string, maxSide: number): Array<{ p: Placement; shared: number }> {
    const found = new Map<string, { p: Placement; shared: number }>();
    for (const [key, cell] of this.cells) {
      const [row, col] = key.split(",").map(Number) as [number, number];
      for (let i = 0; i < word.length; i += 1) {
        if (word[i] !== cell.letter) continue;
        const tries: Placement[] = [];
        if (!cell.across) tries.push({ word, row, col: col - i, dir: "across" });
        if (!cell.down) tries.push({ word, row: row - i, col, dir: "down" });
        for (const p of tries) {
          const id = `${p.dir}:${p.row}:${p.col}`;
          if (found.has(id)) continue;
          const shared = this.check(p, maxSide);
          if (shared > 0) found.set(id, { p, shared });
        }
      }
    }
    return [...found.values()].sort((a, b) =>
      a.p.dir === b.p.dir ? a.p.row - b.p.row || a.p.col - b.p.col : a.p.dir < b.p.dir ? -1 : 1,
    );
  }

  /** Higher is better: crossings, a compact board, and wider than tall. */
  score(): number {
    const area = this.rows * this.cols;
    const fill = this.cells.size / area;
    const tall = Math.max(0, this.rows - this.cols);
    const ratio = Math.max(this.rows, this.cols) / Math.min(this.rows, this.cols);
    return this.crossings * 6 + fill * 20 - area * 0.35 - tall * 2.5 - (ratio > 2 ? 8 : 0);
  }

  /** Moved to the top-left corner, as the pack stores it. */
  normalized(): Placement[] {
    return this.words.map((p) => ({
      word: p.word,
      row: p.row - this.minRow,
      col: p.col - this.minCol,
      dir: p.dir,
    }));
  }
}

/** The best board of exactly `count` words from `candidates`, or null. */
function layOut(
  base: string,
  candidates: readonly string[],
  count: number,
  maxSide: number,
  rng: Rng,
): Placement[] | null {
  let best: Layout | null = null;
  const others = candidates.filter((w) => w !== base);
  const RESTARTS = 160;
  for (let attempt = 0; attempt < RESTARTS; attempt += 1) {
    // Longer words first gives the board a spine; the shuffle gives variety.
    const order = shuffle(others, rng).sort((a, b) => b.length - a.length + (rng.next() - 0.5) * 2.2);
    let layout = new Layout();
    layout.place({ word: base, row: 0, col: 0, dir: rng.chance(0.85) ? "across" : "down" }, 0);
    for (const word of order) {
      if (layout.words.length >= count) break;
      const options = layout.options(word, maxSide);
      if (options.length === 0) continue;
      // Try a few of the options and keep the one that scores best.
      let pick: Layout | null = null;
      for (const option of shuffle(options, rng).slice(0, 6)) {
        const next = layout.clone();
        next.place(option.p, option.shared);
        if (!pick || next.score() > pick.score()) pick = next;
      }
      layout = pick!;
    }
    if (layout.words.length !== count) continue;
    const ratio = Math.max(layout.rows, layout.cols) / Math.min(layout.rows, layout.cols);
    if (ratio > MAX_ASPECT) continue;
    if (!best || layout.score() > best.score()) best = layout;
  }
  return best ? best.normalized() : null;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// ----- The pack -----

const { targets, bonus: bonusWords, deny: denied } = loadWordLists();
const targetList = [...targets].sort();
const bonusList = [...bonusWords].sort();

const lexicon = {
  isTarget: (word: string) => targets.has(word),
  isBonus: (word: string) => bonusWords.has(word),
};

/** Every word in `list` the wheel spells, shortest first then A-Z. */
function spellable(list: readonly string[], letters: string): string[] {
  const have = letterCounts(letters);
  return list.filter((word) => {
    if (word.length > letters.length) return false;
    const counts = [...have];
    for (const ch of word) {
      const at = ch.charCodeAt(0) - 65;
      counts[at]! -= 1;
      if (counts[at]! < 0) return false;
    }
    return true;
  });
}

const usedWheels = new Set<string>();
const usedBases = new Set<string>();
const rejections = new Map<string, number>();
const reject = (reason: string) => rejections.set(reason, (rejections.get(reason) ?? 0) + 1);

/** Shuffled once: the order bases are offered in, per wheel size. */
const rng = new Rng(SEED);
const basesBySize = new Map<number, string[]>();
for (const size of [4, 5, 6, 7]) {
  basesBySize.set(size, shuffle(targetList.filter((w) => w.length === size), rng));
}

function hasRepeat(word: string): boolean {
  return new Set(word).size !== word.length;
}

/**
 * A wheel order that gives nothing away and says nothing rude. The tokens sit
 * in a circle, so a word can be read from any of them, either way round. No
 * reading of any length may be on the deny list, and reading all the way
 * round mustn't spell one of the puzzle's own words.
 */
function wheelOrder(base: string, words: ReadonlySet<string>, rng: Rng): string | null {
  for (let tries = 0; tries < 400; tries += 1) {
    const order = shuffle([...base], rng).join("");
    const all = readings(order);
    if (all.some((reading) => denied.has(reading))) continue;
    if (all.some((reading) => reading.length === base.length && words.has(reading))) continue;
    return order;
  }
  return null;
}

/** Every word a circle of letters can be read as, from each start, both ways. */
function readings(order: string): string[] {
  const out: string[] = [];
  const back = [...order].reverse().join("");
  for (let start = 0; start < order.length; start += 1) {
    for (const ring of [order, back]) {
      const turned = ring.slice(start) + ring.slice(0, start);
      for (let length = 3; length <= turned.length; length += 1) out.push(turned.slice(0, length));
    }
  }
  return out;
}

function makePuzzle(id: string, difficulty: Difficulty, spec: Spec, recent: readonly Puzzle[]): Puzzle {
  const pool = basesBySize.get(spec.letters)!;
  const maxSide = LIMITS[difficulty].maxSide;
  for (const base of pool) {
    if (usedBases.has(base)) continue;
    if (hasRepeat(base) && !spec.repeats) continue;
    const wheel = letterSignature(base);
    if (usedWheels.has(wheel)) continue;
    const candidates = spellable(targetList, base);
    // A margin over the word count, so the board has choices to make.
    if (candidates.length < spec.words + 2) {
      reject("too few common words in the wheel");
      continue;
    }
    const placed = layOut(base, candidates, spec.words, maxSide, new Rng(SEED ^ hash(base)));
    if (!placed) {
      reject("no board with that many words fitted");
      continue;
    }
    const chosen = new Set(placed.map((p) => p.word));
    const letters = wheelOrder(base, chosen, new Rng(hash(base) + 7));
    if (!letters) {
      reject("every seating of the wheel reads as one of its words");
      continue;
    }
    const puzzle: Puzzle = {
      id,
      difficulty,
      letters,
      words: placed,
      bonus: spellable(bonusList, base).filter((w) => !chosen.has(w)),
    };
    if (recent.some((other) => nearDuplicate(puzzle, other))) {
      reject("too like a neighbouring level");
      continue;
    }
    const errors = validatePuzzle(puzzle, lexicon);
    if (errors.length > 0) {
      reject(`validator: ${errors[0]!.replace(/^[^:]+: /, "").replace(/[A-Z]{3,}/g, "WORD")}`);
      continue;
    }
    usedBases.add(base);
    usedWheels.add(wheel);
    return puzzle;
  }
  throw new Error(`Ran out of ${spec.letters}-letter wheels for ${id}`);
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const puzzles: Puzzle[] = [];

// The tutorial is written by hand: STAR across, TAR down through its T, RAT
// across through TAR's R. It is the fixture in the brief, so it is small,
// unmistakable, and every crossing is explained by its first two words.
const tutorialBase = "STAR";
const tutorialWords: Placement[] = [
  { word: "STAR", row: 0, col: 0, dir: "across" },
  { word: "TAR", row: 0, col: 1, dir: "down" },
  { word: "RAT", row: 2, col: 1, dir: "across" },
];
const tutorial: Puzzle = {
  id: "tutorial",
  difficulty: "family",
  letters: "TRSA",
  words: tutorialWords,
  bonus: spellable(bonusList, tutorialBase).filter((w) => !tutorialWords.some((p) => p.word === w)),
};
usedWheels.add(letterSignature(tutorialBase));
usedBases.add(tutorialBase);
puzzles.push(tutorial);

const campaign: Record<Difficulty, string[]> = { family: [], challenge: [] };
for (const difficulty of ["family", "challenge"] as const) {
  const recent: Puzzle[] = [];
  for (let level = 1; level <= LEVELS; level += 1) {
    const spec = difficulty === "family" ? familySpec(level) : challengeSpec(level);
    const id = `${difficulty[0]}-${String(level).padStart(3, "0")}`;
    const puzzle = makePuzzle(id, difficulty, spec, recent.slice(-(NEAR_WINDOW - 1)));
    puzzles.push(puzzle);
    campaign[difficulty].push(id);
    recent.push(puzzle);
  }
}

const daily: Record<string, Record<Difficulty, string>> = {};
const dailyRecent: Record<Difficulty, Puzzle[]> = { family: [], challenge: [] };
let date = DAILY_START;
for (let day = 0; day < DAILY_DAYS; day += 1) {
  const entry = {} as Record<Difficulty, string>;
  for (const difficulty of ["family", "challenge"] as const) {
    const id = `${difficulty[0]}d-${String(day + 1).padStart(3, "0")}`;
    const puzzle = makePuzzle(
      id,
      difficulty,
      dailySpec(difficulty, day),
      dailyRecent[difficulty].slice(-(NEAR_WINDOW - 1)),
    );
    puzzles.push(puzzle);
    dailyRecent[difficulty].push(puzzle);
    entry[difficulty] = id;
  }
  daily[date] = entry;
  date = nextDate(date);
}

const pack: Pack = {
  version: PACK_VERSION,
  tutorial: tutorial.id,
  campaign,
  daily,
  puzzles: Object.fromEntries(puzzles.map((p) => [p.id, p])),
};
const errors = validatePack(pack, lexicon);
if (errors.length > 0) {
  console.error(errors.slice(0, 40).join("\n"));
  throw new Error(`The pack failed validation with ${errors.length} errors; nothing was written.`);
}

const file: PackFile = {
  version: PACK_VERSION,
  tutorial: tutorial.id,
  campaign,
  daily,
  puzzles: [...puzzles].sort((a, b) => (a.id < b.id ? -1 : 1)).map(encodePuzzle),
};
const out = new URL(`../../public/word-voltage/pack-v${PACK_VERSION}.json`, import.meta.url);
mkdirSync(new URL(".", out), { recursive: true });
writeFileSync(out, JSON.stringify(file) + "\n");

// ----- The report -----

const lines: string[] = [];
lines.push(`Word Voltage pack v${PACK_VERSION}`, "");
for (const difficulty of ["family", "challenge"] as const) {
  const list = campaign[difficulty].map((id) => pack.puzzles[id]!);
  lines.push(`${difficulty}: ${list.length} campaign levels`);
  for (let circuit = 0; circuit < 5; circuit += 1) {
    const slice = list.slice(circuit * 20, circuit * 20 + 20);
    const letters = [...new Set(slice.map((p) => p.letters.length))].join("/");
    const words = slice.map((p) => p.words.length);
    const sides = slice.map((p) => {
      const rows = Math.max(...p.words.map((w) => w.row + (w.dir === "down" ? w.word.length : 1)));
      const cols = Math.max(...p.words.map((w) => w.col + (w.dir === "across" ? w.word.length : 1)));
      return Math.max(rows, cols);
    });
    lines.push(
      `  circuit ${circuit + 1}: ${letters} letters, ${Math.min(...words)}-${Math.max(...words)} words, boards up to ${Math.max(...sides)} squares`,
    );
  }
}
const dates = Object.keys(daily).sort();
lines.push("", `daily: ${dates.length} dates, ${dates[0]} to ${dates[dates.length - 1]}, both paths`);
lines.push("", "first ten levels of each path (wheel: targets):");
for (const difficulty of ["family", "challenge"] as const) {
  for (const id of campaign[difficulty].slice(0, 10)) {
    const p = pack.puzzles[id]!;
    lines.push(`  ${id}  ${p.letters}: ${p.words.map((w) => w.word).join(" ")}  (+${p.bonus.length} bonus)`);
  }
}
lines.push("", "candidates rejected on the way (a base word can be tried by many levels):");
for (const [reason, count] of [...rejections].sort((a, b) => b[1] - a[1])) {
  lines.push(`  ${count}  ${reason}`);
}
const report = lines.join("\n") + "\n";
writeFileSync(new URL("generation-report.txt", import.meta.url), report);
console.log(report);
console.log(`Wrote ${puzzles.length} puzzles to public/word-voltage/pack-v${PACK_VERSION}.json`);

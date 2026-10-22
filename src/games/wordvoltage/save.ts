/**
 * Word Voltage's save: one localStorage key, versioned, and careful.
 *
 * Kept under the arcade's `hyperdrive.` prefix like every other game's data
 * (see the note at the top of the README), and touching nothing else.
 *
 * Three rules hold it together:
 *
 *   - Permanent facts only grow. A finish, a best star count, a credited
 *     bonus word, a ledger line: two saves are merged by taking the union
 *     and the best, never by one overwriting the other. That's how a second
 *     tab, or a reload in the middle of a celebration, can't take anything
 *     away or give anything twice.
 *   - Every write reads what's on disk first and merges into it, so a stale
 *     tab can't wipe another tab's progress.
 *   - Nothing read back is trusted. Each field is checked on load, a bad one
 *     falls back alone, and a save that can't be read at all is replaced by
 *     a fresh one rather than crashing the cabinet.
 */

import type { Difficulty } from "./types.ts";
import {
  BONUS_BLOCK,
  bonusLine,
  circuitLine,
  dailyLine,
  firstLine,
  LEVELS_PER_CIRCUIT,
} from "./rewards.ts";

export const SAVE_KEY = "hyperdrive.wordvoltage";
export const SCHEMA_VERSION = 1;

export type InputMode = "swipe" | "tap";
export type Motion = "system" | "reduced" | "full";
export type Mode = "campaign" | "daily" | "tutorial";

export interface Preferences {
  difficulty: Difficulty;
  inputMode: InputMode;
  motion: Motion;
  cosmetic: string;
  updatedAt: number;
}

export interface AttemptRecord {
  puzzleId: string;
  pack: string;
  mode: Mode;
  difficulty: Difficulty;
  /** Daily only: the date the attempt began on, which it keeps past midnight. */
  date?: string;
  solved: string[];
  revealed: string[];
  bonus: string[];
  hints: number;
  /** Token indexes in the order they sit round the wheel. */
  order: number[];
  completed: boolean;
  updatedAt: number;
}

export interface Completion {
  stars: number;
  /** ISO time of the first finish. */
  at: string;
}

export interface DailyRecord extends Completion {
  puzzleId: string;
  hints: number;
  bonus: number;
}

export interface Save {
  schemaVersion: number;
  prefs: Preferences;
  campaign: Record<Difficulty, Record<string, Completion>>;
  attempts: Record<string, AttemptRecord>;
  /** Keyed `${date}:${difficulty}`. */
  daily: Record<string, DailyRecord>;
  /** Every bonus word ever credited, per puzzle identity (see bonusIdentity). */
  credited: Record<string, string[]>;
  ledger: string[];
  tutorial: { done: boolean; dismissed: string[] };
  /** One-off explanations already shown, like "hints are free". */
  notes: string[];
}

export function freshSave(): Save {
  return {
    schemaVersion: SCHEMA_VERSION,
    prefs: { difficulty: "family", inputMode: "swipe", motion: "system", cosmetic: "classic", updatedAt: 0 },
    campaign: { family: {}, challenge: {} },
    attempts: {},
    daily: {},
    credited: {},
    ledger: [],
    tutorial: { done: false, dismissed: [] },
    notes: [],
  };
}

/** Where an attempt lives. A daily is tied to its date as well as its puzzle. */
export function attemptKey(
  mode: Mode,
  difficulty: Difficulty,
  puzzleId: string,
  pack: string,
  date?: string,
): string {
  return mode === "daily"
    ? `daily:${difficulty}:${date}:${puzzleId}@${pack}`
    : `${mode}:${difficulty}:${puzzleId}@${pack}`;
}

/** Which puzzle a bonus word is credited against. Dailies carry their date. */
export function bonusIdentity(mode: Mode, puzzleId: string, date?: string): string {
  return mode === "daily" ? `daily:${date}:${puzzleId}` : puzzleId;
}

export const dailyKeyOf = (date: string, difficulty: Difficulty) => `${date}:${difficulty}`;

// ----- Reading a save back -----

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string"))] : [];
const isDifficulty = (v: unknown): v is Difficulty => v === "family" || v === "challenge";
const isMode = (v: unknown): v is Mode => v === "campaign" || v === "daily" || v === "tutorial";
const stars = (v: unknown): number => (v === 1 || v === 2 || v === 3 ? v : 0);
const count = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
const time = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isoTime = (v: unknown): string => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : "");

/**
 * Turn whatever was in storage into a Save, keeping every part that checks
 * out. Unknown future versions are read the same way: their fields are a
 * superset, and the merge never drops what it doesn't understand of the
 * permanent records it does.
 */
export function sanitize(raw: unknown): Save {
  const save = freshSave();
  if (!isRecord(raw)) return save;

  const prefs = isRecord(raw.prefs) ? raw.prefs : {};
  save.prefs = {
    difficulty: isDifficulty(prefs.difficulty) ? prefs.difficulty : "family",
    inputMode: prefs.inputMode === "tap" ? "tap" : "swipe",
    motion: prefs.motion === "reduced" || prefs.motion === "full" ? prefs.motion : "system",
    cosmetic: typeof prefs.cosmetic === "string" ? prefs.cosmetic : "classic",
    updatedAt: time(prefs.updatedAt),
  };

  const campaign = isRecord(raw.campaign) ? raw.campaign : {};
  for (const difficulty of ["family", "challenge"] as const) {
    const list = isRecord(campaign[difficulty]) ? campaign[difficulty] : {};
    for (const [id, value] of Object.entries(list)) {
      if (!isRecord(value) || stars(value.stars) === 0) continue;
      save.campaign[difficulty][id] = { stars: stars(value.stars), at: isoTime(value.at) };
    }
  }

  if (isRecord(raw.attempts)) {
    for (const [key, value] of Object.entries(raw.attempts)) {
      if (!isRecord(value) || typeof value.puzzleId !== "string" || !isMode(value.mode)) continue;
      if (!isDifficulty(value.difficulty) || typeof value.pack !== "string") continue;
      save.attempts[key] = {
        puzzleId: value.puzzleId,
        pack: value.pack,
        mode: value.mode,
        difficulty: value.difficulty,
        ...(typeof value.date === "string" ? { date: value.date } : {}),
        solved: strings(value.solved),
        revealed: strings(value.revealed),
        bonus: strings(value.bonus),
        hints: count(value.hints),
        order: Array.isArray(value.order) ? value.order.filter((n): n is number => Number.isInteger(n)) : [],
        completed: value.completed === true,
        updatedAt: time(value.updatedAt),
      };
    }
  }

  if (isRecord(raw.daily)) {
    for (const [key, value] of Object.entries(raw.daily)) {
      if (!isRecord(value) || typeof value.puzzleId !== "string" || stars(value.stars) === 0) continue;
      save.daily[key] = {
        puzzleId: value.puzzleId,
        stars: stars(value.stars),
        at: isoTime(value.at),
        hints: count(value.hints),
        bonus: count(value.bonus),
      };
    }
  }

  if (isRecord(raw.credited)) {
    for (const [identity, words] of Object.entries(raw.credited)) {
      const list = strings(words);
      if (list.length > 0) save.credited[identity] = list;
    }
  }

  save.ledger = strings(raw.ledger).sort();
  const tutorial = isRecord(raw.tutorial) ? raw.tutorial : {};
  save.tutorial = { done: tutorial.done === true, dismissed: strings(tutorial.dismissed) };
  save.notes = strings(raw.notes);
  return save;
}

// ----- Merging two saves -----

/**
 * Combine what's on disk with what this tab holds. Permanent records take
 * the union and the best; preferences and attempts, which genuinely change,
 * go to whichever was touched last.
 */
export function mergeSaves(disk: Save, mine: Save): Save {
  const merged = freshSave();
  merged.prefs = mine.prefs.updatedAt >= disk.prefs.updatedAt ? mine.prefs : disk.prefs;

  for (const difficulty of ["family", "challenge"] as const) {
    const out: Record<string, Completion> = { ...disk.campaign[difficulty] };
    for (const [id, record] of Object.entries(mine.campaign[difficulty])) {
      out[id] = bestOf(out[id], record);
    }
    merged.campaign[difficulty] = out;
  }

  merged.attempts = { ...disk.attempts };
  for (const [key, record] of Object.entries(mine.attempts)) {
    const theirs = merged.attempts[key];
    if (!theirs || record.updatedAt >= theirs.updatedAt) merged.attempts[key] = record;
  }

  merged.daily = { ...disk.daily };
  for (const [key, record] of Object.entries(mine.daily)) {
    const theirs = merged.daily[key];
    merged.daily[key] = theirs ? { ...record, ...bestOf(theirs, record) } : record;
  }

  merged.credited = { ...disk.credited };
  for (const [identity, words] of Object.entries(mine.credited)) {
    merged.credited[identity] = [...new Set([...(merged.credited[identity] ?? []), ...words])];
  }

  merged.ledger = [...new Set([...disk.ledger, ...mine.ledger])].sort();
  merged.tutorial = {
    done: disk.tutorial.done || mine.tutorial.done,
    dismissed: [...new Set([...disk.tutorial.dismissed, ...mine.tutorial.dismissed])],
  };
  merged.notes = [...new Set([...disk.notes, ...mine.notes])];
  return merged;
}

function bestOf(a: Completion | undefined, b: Completion): Completion {
  if (!a) return b;
  const at = [a.at, b.at].filter(Boolean).sort()[0] ?? "";
  return { stars: Math.max(a.stars, b.stars), at };
}

// ----- The two transitions that hand out rewards -----

export interface Finish {
  mode: Mode;
  difficulty: Difficulty;
  puzzleId: string;
  stars: number;
  hints: number;
  bonus: number;
  /** Daily only. */
  date?: string;
  /** Campaign only: the path's level ids, to tell when a circuit is complete. */
  campaignIds?: readonly string[];
  now: Date;
}

/**
 * Record a finished level: best stars, the first-finish time, and any
 * ledger lines it has earned. Recording the same finish twice changes
 * nothing the second time. Returns the lines that are new.
 */
export function recordFinish(save: Save, finish: Finish): { save: Save; earned: string[] } {
  const next: Save = structuredClone(save);
  const lines: string[] = [];
  const at = finish.now.toISOString();

  if (finish.mode === "campaign") {
    const book = next.campaign[finish.difficulty];
    book[finish.puzzleId] = bestOf(book[finish.puzzleId], { stars: finish.stars, at });
    lines.push(firstLine(finish.difficulty, finish.puzzleId));
    const ids = finish.campaignIds ?? [];
    const index = ids.indexOf(finish.puzzleId);
    if (index >= 0) {
      const circuit = Math.floor(index / LEVELS_PER_CIRCUIT);
      const slice = ids.slice(circuit * LEVELS_PER_CIRCUIT, (circuit + 1) * LEVELS_PER_CIRCUIT);
      if (slice.length === LEVELS_PER_CIRCUIT && slice.every((id) => book[id])) {
        lines.push(circuitLine(finish.difficulty, circuit));
      }
    }
  } else if (finish.mode === "daily" && finish.date) {
    const key = dailyKeyOf(finish.date, finish.difficulty);
    const before = next.daily[key];
    const best = bestOf(before, { stars: finish.stars, at });
    next.daily[key] = {
      puzzleId: finish.puzzleId,
      stars: best.stars,
      at: best.at,
      // The share text reports the run that set the best, or the first one.
      hints: before && before.stars >= finish.stars ? before.hints : finish.hints,
      bonus: before && before.stars >= finish.stars ? Math.max(before.bonus, finish.bonus) : finish.bonus,
    };
    lines.push(dailyLine(finish.date, finish.difficulty));
  } else if (finish.mode === "tutorial") {
    next.tutorial.done = true;
  }
  return addLines(next, lines);
}

/**
 * Credit a bonus word against its puzzle, once for ever. Every fifth word
 * ever credited on that puzzle earns a bolt, once per milestone.
 */
export function creditBonus(save: Save, identity: string, word: string): { save: Save; earned: string[] } {
  const known = save.credited[identity] ?? [];
  if (known.includes(word)) return { save, earned: [] };
  const next: Save = structuredClone(save);
  const words = [...known, word];
  next.credited[identity] = words;
  const lines: string[] = [];
  for (let milestone = BONUS_BLOCK; milestone <= words.length; milestone += BONUS_BLOCK) {
    lines.push(bonusLine(identity, milestone));
  }
  return addLines(next, lines);
}

function addLines(save: Save, lines: string[]): { save: Save; earned: string[] } {
  const have = new Set(save.ledger);
  const earned = lines.filter((line) => !have.has(line));
  if (earned.length > 0) save.ledger = [...have, ...earned].sort();
  return { save, earned };
}

// ----- Storage -----

/** The part of localStorage the store uses, so tests can hand it a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SaveStore {
  private readonly storage: StorageLike | null;
  /** False when nothing can be saved: the game says so and plays on. */
  readonly persistent: boolean;
  private save: Save;

  constructor(storage: StorageLike | null) {
    this.storage = storage;
    this.persistent = storage !== null && works(storage);
    this.save = this.readDisk() ?? freshSave();
  }

  get current(): Save {
    return this.save;
  }

  /** Pick up another tab's changes. */
  refresh(): Save {
    const disk = this.readDisk();
    if (disk) this.save = mergeSaves(disk, this.save);
    return this.save;
  }

  /** Merge with what's on disk, write, and keep the result. */
  write(next: Save): Save {
    const disk = this.readDisk();
    this.save = disk ? mergeSaves(disk, next) : next;
    if (this.persistent) {
      try {
        this.storage!.setItem(SAVE_KEY, JSON.stringify(this.save));
      } catch {
        // Quota or a revoked permission: keep playing from memory.
      }
    }
    return this.save;
  }

  /** Word Voltage's progress only. Every other game's data is untouched. */
  reset(): Save {
    if (this.persistent) {
      try {
        this.storage!.removeItem(SAVE_KEY);
      } catch {
        // Nothing to do.
      }
    }
    this.save = freshSave();
    return this.save;
  }

  private readDisk(): Save | null {
    if (!this.persistent) return null;
    try {
      const raw = this.storage!.getItem(SAVE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
}

function works(storage: StorageLike): boolean {
  try {
    const probe = `${SAVE_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** localStorage, or null where touching it throws (some private modes). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

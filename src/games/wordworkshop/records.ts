/**
 * What Word Workshop remembers for each player: workshop stamps, best scores,
 * the deck they were on, words to practice again, and a round left halfway.
 *
 * The players themselves -- names, grades, Digit's fur and closet -- are the
 * LEARN & PLAY players Fact Frenzy keeps (factfrenzy/profiles.ts). This file
 * only adds Word Workshop's own records beside them, under their own key, so
 * a spelling round can never touch a math score.
 *
 * Pure apart from load/store at the bottom.
 */

import { GRADES, type Grade } from "../factfrenzy/decks.ts";
import { OUTFITS, type Kid, type Outfit, type OutfitId } from "../factfrenzy/profiles.ts";
import type { ItemResult } from "./tasks.ts";
import { FIX_DECKS, SPELL_DECKS } from "./words.ts";

export type Mode = "build" | "fix";

export const ROUND_ITEMS = 5;

/**
 * Bumped if what earns a point ever changes, so a best set under the old
 * rules is never compared with one under the new.
 */
export const RULES = 1;

/** Stamps for the Red Cap and the Red Cape. */
export const CAP_STAMPS = 1;
export const CAPE_STAMPS = 3;

const QUEUE_MAX = 6;
const DONE_MAX = 40;

export interface Bench {
  /** One per round finished, helped or not. */
  stamps: number;
  /** Best score out of five, by bestKey(). */
  bests: Record<string, number>;
  mode: Mode;
  spellDeck: string;
  fixDeck: string;
  /** Has had Digit's cap-to-cape lesson. */
  tutorial: boolean;
  /** Item ids to bring back, by deck: ones that needed help. */
  queue: Record<string, string[]>;
}

/** A round in progress, saved after every item so a phone call doesn't lose it. */
export interface ActiveRound {
  id: string;
  kidId: string;
  mode: Mode;
  deckId: string;
  grade: Grade;
  items: string[];
  results: ItemResult[];
  /** Whether the item now on screen has already had help, so reopening can't wipe it. */
  helped: boolean;
}

export interface WorkSave {
  benches: Record<string, Bench>;
  /** Digit reads the words aloud. Separate from the arcade's sound effects. */
  voice: boolean;
  active: ActiveRound | null;
  /** Rounds already counted, so a round is never filed twice. */
  done: string[];
}

export function emptySave(): WorkSave {
  return { benches: {}, voice: true, active: null, done: [] };
}

/** The first deck of a mode for a grade, or the nearest grade that has one. */
export function startingDeck(mode: Mode, grade: Grade): string {
  const decks: readonly { id: string; grade: Grade }[] = mode === "build" ? SPELL_DECKS : FIX_DECKS;
  const at = GRADES.indexOf(grade);
  const byDistance = [...decks].sort((a, b) => Math.abs(GRADES.indexOf(a.grade) - at) - Math.abs(GRADES.indexOf(b.grade) - at));
  return byDistance[0]!.id;
}

export function newBench(grade: Grade): Bench {
  return {
    stamps: 0,
    bests: {},
    mode: "build",
    spellDeck: startingDeck("build", grade),
    fixDeck: startingDeck("fix", grade),
    tutorial: false,
    queue: {},
  };
}

export function benchFor(save: WorkSave, kid: Kid): Bench {
  return save.benches[kid.id] ?? newBench(kid.grade);
}

export function withBench(save: WorkSave, kidId: string, bench: Bench): WorkSave {
  return { ...save, benches: { ...save.benches, [kidId]: bench } };
}

/** Bests are only compared within one mode, deck, grade and set of rules. */
export function bestKey(mode: Mode, deckId: string, grade: Grade): string {
  return `${mode}|${deckId}|${grade}|r${RULES}`;
}

// ----- A finished round -----

export interface WorkOutcome {
  kind: "first" | "record" | "tie" | "under";
  score: number;
  total: number;
  previous: number | null;
  /** Stamps after this round. */
  stamps: number;
  prizes: Outfit[];
}

export interface FinishedRound {
  id: string;
  mode: Mode;
  deckId: string;
  grade: Grade;
  results: readonly ItemResult[];
}

/**
 * Files a round played to the end: its score against the best, a stamp,
 * the words to bring back, and any outfit won. Null if this round has been
 * filed already.
 */
export function commitRound(save: WorkSave, kid: Kid, round: FinishedRound): { save: WorkSave; kid: Kid; outcome: WorkOutcome } | null {
  if (save.done.includes(round.id)) return null;
  const bench = benchFor(save, kid);
  const key = bestKey(round.mode, round.deckId, round.grade);
  const score = round.results.filter((r) => r.own).length;
  const previous = bench.bests[key] ?? null;
  const kind: WorkOutcome["kind"] =
    previous === null ? "first" : score > previous ? "record" : score === previous ? "tie" : "under";

  const helped = round.results.filter((r) => !r.own).map((r) => r.id);
  const owned = new Set(round.results.filter((r) => r.own).map((r) => r.id));
  const queue = [...helped, ...(bench.queue[round.deckId] ?? []).filter((id) => !owned.has(id) && !helped.includes(id))].slice(0, QUEUE_MAX);

  const nextBench: Bench = {
    ...bench,
    stamps: bench.stamps + 1,
    bests: { ...bench.bests, [key]: Math.max(score, previous ?? 0) },
    queue: { ...bench.queue, [round.deckId]: queue },
  };

  const outfits = [...kid.outfits];
  const prizes: Outfit[] = [];
  const win = (id: OutfitId) => {
    if (outfits.includes(id)) return;
    outfits.push(id);
    prizes.push(OUTFITS.find((o) => o.id === id)!);
  };
  if (nextBench.stamps >= CAP_STAMPS) win("cap");
  if (nextBench.stamps >= CAPE_STAMPS) win("cape");

  const nextSave: WorkSave = {
    ...withBench(save, kid.id, nextBench),
    active: save.active?.id === round.id ? null : save.active,
    done: [...save.done, round.id].slice(-DONE_MAX),
  };
  return {
    save: nextSave,
    kid: { ...kid, outfits },
    outcome: { kind, score, total: round.results.length, previous, stamps: nextBench.stamps, prizes },
  };
}

/**
 * The line under the score: "4 of 5 on your own! Your best was 3." Without
 * the score at the front when the screen already shows it big.
 */
export function outcomeLine(outcome: WorkOutcome, withScore = true): string {
  const { score, total, previous } = outcome;
  const head = withScore ? `${score} of ${total} on your own` : "";
  switch (outcome.kind) {
    case "first":
      return withScore ? `${head}! That's the score to beat next time.` : "That's the score to beat next time.";
    case "record":
      return withScore ? `${head}! Your best was ${previous}.` : `Your best was ${previous}. You beat it!`;
    case "tie":
      return withScore ? `${head}. That matches your best. Nice steady work!` : "That matches your best. Nice steady work!";
    case "under":
      return withScore ? `${head}. Your best is ${previous}. Every round makes you stronger.` : `Your best is ${previous}. Every round makes you stronger.`;
  }
}

/** The next outfit stamps will win, and how far off it is. */
export function nextStampPrize(bench: Bench, kid: Kid): { outfit: Outfit; toGo: number } | null {
  for (const [id, need] of [["cap", CAP_STAMPS], ["cape", CAPE_STAMPS]] as const) {
    if (!kid.outfits.includes(id) && bench.stamps < need) return { outfit: OUTFITS.find((o) => o.id === id)!, toGo: need - bench.stamps };
  }
  return null;
}

// ----- On the device -----

const KEY = "hyperdrive.wordworkshop";

const isMode = (m: unknown): m is Mode => m === "build" || m === "fix";

export function parseWorkSave(raw: string | null): WorkSave {
  if (!raw) return emptySave();
  try {
    const data = JSON.parse(raw) as Partial<WorkSave>;
    const benches: Record<string, Bench> = {};
    if (data.benches && typeof data.benches === "object") {
      for (const [id, value] of Object.entries(data.benches)) {
        const bench = repairBench(value);
        if (bench) benches[id] = bench;
      }
    }
    return {
      benches,
      voice: data.voice !== false,
      active: repairActive(data.active),
      done: Array.isArray(data.done) ? data.done.filter((x): x is string => typeof x === "string").slice(-DONE_MAX) : [],
    };
  } catch {
    return emptySave();
  }
}

function repairBench(value: unknown): Bench | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Partial<Bench>;
  const bests: Record<string, number> = {};
  if (b.bests && typeof b.bests === "object") {
    for (const [k, n] of Object.entries(b.bests)) if (typeof n === "number" && n >= 0) bests[k] = Math.min(ROUND_ITEMS, Math.floor(n));
  }
  const queue: Record<string, string[]> = {};
  if (b.queue && typeof b.queue === "object") {
    for (const [k, ids] of Object.entries(b.queue)) if (Array.isArray(ids)) queue[k] = ids.filter((x): x is string => typeof x === "string").slice(0, QUEUE_MAX);
  }
  return {
    stamps: typeof b.stamps === "number" && b.stamps >= 0 ? Math.floor(b.stamps) : 0,
    bests,
    mode: isMode(b.mode) ? b.mode : "build",
    spellDeck: SPELL_DECKS.some((d) => d.id === b.spellDeck) ? b.spellDeck! : SPELL_DECKS[0]!.id,
    fixDeck: FIX_DECKS.some((d) => d.id === b.fixDeck) ? b.fixDeck! : FIX_DECKS[0]!.id,
    tutorial: b.tutorial === true,
    queue,
  };
}

function repairActive(value: unknown): ActiveRound | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Partial<ActiveRound>;
  if (typeof a.id !== "string" || typeof a.kidId !== "string" || !isMode(a.mode) || typeof a.deckId !== "string") return null;
  if (!GRADES.includes(a.grade as Grade) || !Array.isArray(a.items) || !Array.isArray(a.results)) return null;
  const decks: readonly { id: string }[] = a.mode === "build" ? SPELL_DECKS : FIX_DECKS;
  if (!decks.some((d) => d.id === a.deckId)) return null;
  const results = a.results.filter((r): r is ItemResult => !!r && typeof r.id === "string" && typeof r.own === "boolean");
  if (results.length >= a.items.length) return null;
  return {
    id: a.id,
    kidId: a.kidId,
    mode: a.mode,
    deckId: a.deckId,
    grade: a.grade as Grade,
    items: a.items.filter((x): x is string => typeof x === "string"),
    results,
    helped: a.helped === true,
  };
}

export function loadWorkSave(): WorkSave {
  try {
    return parseWorkSave(localStorage.getItem(KEY));
  } catch {
    return emptySave();
  }
}

export function storeWorkSave(save: WorkSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full or switched off: the round still played, it just won't be remembered.
  }
}

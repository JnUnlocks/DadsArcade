/**
 * The players on this device and everything Fact Frenzy remembers about
 * each: their best score on every deck, what Digit is wearing, what they've
 * won. Two children sharing a phone each keep their own.
 *
 * Every LEARN & PLAY cabinet shares these players and Digit's closet, so a
 * child is set up once and Digit wears the same outfit in every game. Word
 * Workshop reads and writes them here and keeps its own scores apart (see
 * wordworkshop/records.ts). The storage key keeps its first name so no
 * family's save has to move.
 *
 * Kept on the device only. A child's name never leaves it -- Fact Frenzy has
 * no scoreboard, because a second grader's 21 and a fifth grader's 21 aren't
 * the same thing, and the only score worth beating is your own.
 *
 * Pure apart from load/save at the bottom, so the rules about what a round
 * earns are tested without a browser.
 */

import { GRADES, STARTING_DECK, deckById, type Grade } from "./decks.ts";

// ----- Digit's closet -----

export type OutfitId = "overalls" | "goggles" | "jacket" | "rocket" | "wizard" | "champion" | "cap" | "cape";

export interface Outfit {
  id: OutfitId;
  name: string;
  /** How it's won, for a locked one in the closet. */
  earn: string;
  /** The LEARN & PLAY game that wins it, for the closet the games share. */
  game: "Fact Frenzy" | "Word Workshop";
}

export const OUTFITS: readonly Outfit[] = [
  { id: "overalls", name: "Work Overalls", earn: "Digit's everyday look.", game: "Fact Frenzy" },
  { id: "goggles", name: "Teal Goggles", earn: "Finish your first round.", game: "Fact Frenzy" },
  { id: "jacket", name: "Star Jacket", earn: "Beat one of your best scores.", game: "Fact Frenzy" },
  // The later three each reward something different: trying new facts,
  // getting every one right, and sticking with it.
  { id: "rocket", name: "Rocket Pilot", earn: "Set a best on 3 different decks.", game: "Fact Frenzy" },
  { id: "wizard", name: "Math Wizard", earn: "Get 10 or more right with no misses in one round.", game: "Fact Frenzy" },
  { id: "champion", name: "Arcade Champion", earn: "Beat your best 5 times.", game: "Fact Frenzy" },
  // Won in Word Workshop, worn everywhere.
  { id: "cap", name: "Red Cap", earn: "Finish a round in Word Workshop.", game: "Word Workshop" },
  { id: "cape", name: "Red Cape", earn: "Finish 3 rounds in Word Workshop.", game: "Word Workshop" },
];

/** The Math Wizard's perfect round: at least this many right, none missed. */
export const PERFECT_ROUND = 10;

/** Different decks with a best for the Rocket Pilot, and records for the Arcade Champion. */
export const ROCKET_DECKS = 3;
export const CHAMPION_RECORDS = 5;

export interface Fur {
  id: string;
  name: string;
  /** How to repaint Digit's purple: target hue, saturation and lightness change. Null keeps it. */
  paint: readonly [hue: number, saturation: number, lighten: number] | null;
  /** Rounds to finish before it unlocks. 0 is open from the start. */
  rounds: number;
  /** A swatch for the closet. */
  swatch: string;
}

/**
 * Purple, teal and blue are open from the start, so every child can have a
 * Digit that feels like theirs before they've played a round. The rest come
 * from finishing rounds, which keeps something to win after a best score has
 * got hard to beat.
 */
export const FURS: readonly Fur[] = [
  { id: "purple", name: "Arcade Purple", paint: null, rounds: 0, swatch: "#9a5bd6" },
  { id: "teal", name: "Turbo Teal", paint: [178, 0.95, 0], rounds: 0, swatch: "#2bb8b0" },
  { id: "blue", name: "Sky Blue", paint: [210, 1, 0.04], rounds: 0, swatch: "#4f86e0" },
  { id: "gray", name: "Classic Gray", paint: [230, 0.12, 0.05], rounds: 3, swatch: "#8b8f9c" },
  { id: "orange", name: "Fox Orange", paint: [22, 1.6, 0.18], rounds: 6, swatch: "#f08a3c" },
  { id: "pink", name: "Bubblegum Pink", paint: [328, 1, 0.06], rounds: 10, swatch: "#e05ba8" },
  { id: "red", name: "Rocket Red", paint: [356, 1.15, 0], rounds: 15, swatch: "#d84545" },
  { id: "green", name: "Lucky Green", paint: [120, 0.8, 0.02], rounds: 20, swatch: "#4cb35a" },
];

export function furById(id: string): Fur {
  return FURS.find((f) => f.id === id) ?? FURS[0]!;
}

// ----- Players -----

export interface Kid {
  id: string;
  name: string;
  grade: Grade;
  /** The deck PLAY starts. */
  deck: string;
  fur: string;
  outfit: OutfitId;
  outfits: OutfitId[];
  /** Rounds played to the end. */
  rounds: number;
  /** Times a best score has been beaten. */
  records: number;
  /** Best score by deck id. A deck with no entry has never been finished. */
  bests: Record<string, number>;
}

export interface Save {
  kids: Kid[];
  /** Who played last: the game opens on them. */
  current: string | null;
}

export const EMPTY_SAVE: Save = { kids: [], current: null };

export const NAME_MAX = 12;

export function newKid(id: string, name: string, grade: Grade, fur: string): Kid {
  return {
    id,
    name: cleanName(name),
    grade,
    deck: STARTING_DECK[grade],
    fur: furById(fur).rounds === 0 ? furById(fur).id : "purple",
    outfit: "overalls",
    outfits: ["overalls"],
    rounds: 0,
    records: 0,
    bests: {},
  };
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export function currentKid(save: Save): Kid | null {
  return save.kids.find((k) => k.id === save.current) ?? save.kids[0] ?? null;
}

/** The save with one kid replaced by `next`. */
export function withKid(save: Save, next: Kid): Save {
  return { ...save, kids: save.kids.map((k) => (k.id === next.id ? next : k)) };
}

export function furUnlocked(kid: Kid, fur: Fur): boolean {
  return kid.rounds >= fur.rounds;
}

/** The next fur colour still to win, and how many rounds away it is. */
export function nextFur(kid: Kid): { fur: Fur; roundsToGo: number } | null {
  const fur = FURS.find((f) => !furUnlocked(kid, f));
  return fur ? { fur, roundsToGo: fur.rounds - kid.rounds } : null;
}

// ----- A finished round -----

export type Prize = { kind: "outfit"; outfit: Outfit } | { kind: "fur"; fur: Fur };

export interface Outcome {
  /**
   * first: nothing to beat yet, so this is the score to beat next time.
   * record: beat the best. tie: matched it. under: didn't reach it.
   */
  kind: "first" | "record" | "tie" | "under";
  score: number;
  /** The best before this round; null on a first score. */
  previous: number | null;
  prizes: Prize[];
}

/**
 * Files a round played to the end. A round left early never reaches here.
 * `misses` is how many facts were missed at least once.
 */
export function finishRound(kid: Kid, deckId: string, score: number, misses = 0): { kid: Kid; outcome: Outcome } {
  const previous = kid.bests[deckId] ?? null;
  const kind: Outcome["kind"] =
    previous === null ? "first" : score > previous ? "record" : score === previous ? "tie" : "under";

  const next: Kid = {
    ...kid,
    rounds: kid.rounds + 1,
    records: kid.records + (kind === "record" ? 1 : 0),
    bests: { ...kid.bests, [deckId]: Math.max(score, previous ?? 0) },
    outfits: [...kid.outfits],
  };

  const prizes: Prize[] = [];
  const win = (id: OutfitId) => {
    if (next.outfits.includes(id)) return;
    next.outfits.push(id);
    prizes.push({ kind: "outfit", outfit: OUTFITS.find((o) => o.id === id)! });
  };
  if (next.rounds >= 1) win("goggles");
  if (next.records >= 1) win("jacket");
  if (Object.keys(next.bests).length >= ROCKET_DECKS) win("rocket");
  if (score >= PERFECT_ROUND && misses === 0) win("wizard");
  if (next.records >= CHAMPION_RECORDS) win("champion");
  for (const fur of FURS) {
    if (fur.rounds > 0 && kid.rounds < fur.rounds && next.rounds >= fur.rounds) prizes.push({ kind: "fur", fur });
  }
  return { kid: next, outcome: { kind, score, previous, prizes } };
}

/** The line under the score on the results card. */
export function outcomeLine(outcome: Outcome, name: string): string {
  const { score, previous } = outcome;
  const facts = score === 1 ? "fact" : "facts";
  switch (outcome.kind) {
    case "first":
      return `Your first score! You solved ${score} ${facts}. That's the one to beat next time.`;
    case "record": {
      const gain = score - (previous ?? 0);
      return `${name}, you solved ${gain} more than your best!`;
    }
    case "tie":
      return `You tied your best! One more next time beats it.`;
    case "under":
      return `Your best is ${previous}. Every round makes you faster. Go again?`;
  }
}

// ----- On the device -----

const KEY = "hyperdrive.factfrenzy";

export function parseSave(raw: string | null): Save {
  if (!raw) return { ...EMPTY_SAVE, kids: [] };
  try {
    const data = JSON.parse(raw) as Partial<Save>;
    const kids = Array.isArray(data.kids) ? data.kids.map(repairKid).filter((k): k is Kid => k !== null) : [];
    const current = typeof data.current === "string" && kids.some((k) => k.id === data.current) ? data.current : (kids[0]?.id ?? null);
    return { kids, current };
  } catch {
    return { ...EMPTY_SAVE, kids: [] };
  }
}

/** A saved player, mended where an older or damaged save left gaps. */
function repairKid(value: unknown): Kid | null {
  if (!value || typeof value !== "object") return null;
  const k = value as Partial<Kid>;
  if (typeof k.id !== "string" || typeof k.name !== "string") return null;
  const grade = GRADES.includes(k.grade as Grade) ? (k.grade as Grade) : "2";
  const outfits = (Array.isArray(k.outfits) ? k.outfits : []).filter((o): o is OutfitId =>
    OUTFITS.some((x) => x.id === o),
  );
  if (!outfits.includes("overalls")) outfits.unshift("overalls");
  const bests: Record<string, number> = {};
  if (k.bests && typeof k.bests === "object") {
    for (const [id, n] of Object.entries(k.bests)) if (typeof n === "number" && n >= 0) bests[id] = Math.floor(n);
  }
  const rounds = typeof k.rounds === "number" && k.rounds >= 0 ? Math.floor(k.rounds) : 0;
  const kid: Kid = {
    id: k.id,
    name: cleanName(k.name) || "Player",
    grade,
    deck: typeof k.deck === "string" && deckById(k.deck) ? k.deck : STARTING_DECK[grade],
    fur: furById(typeof k.fur === "string" ? k.fur : "purple").id,
    outfit: outfits.includes(k.outfit as OutfitId) ? (k.outfit as OutfitId) : "overalls",
    outfits,
    rounds,
    records: typeof k.records === "number" && k.records >= 0 ? Math.floor(k.records) : 0,
    bests,
  };
  if (!furUnlocked(kid, furById(kid.fur))) kid.fur = "purple";
  return kid;
}

export function loadSave(): Save {
  try {
    return parseSave(localStorage.getItem(KEY));
  } catch {
    return { ...EMPTY_SAVE, kids: [] };
  }
}

export function storeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full or switched off: the round still played, it just won't be remembered.
  }
}

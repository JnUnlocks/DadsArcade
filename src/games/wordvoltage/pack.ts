/**
 * The content pack: how it's stored, and how the game reads it.
 *
 * The pack is a JSON file in public/word-voltage/, named for its version. The
 * service worker fetches it when the arcade is installed (public/sw.js), so
 * every level and every daily works with no signal, even on a phone that has
 * never opened Word Voltage before going offline.
 *
 * A pack file is never edited once released. A later pack gets a new name,
 * keeps every puzzle id it inherits exactly as it was, and adds to the daily
 * calendar without rewriting a date that has been and gone. That's what lets
 * a saved attempt from an older build carry on in a newer one.
 */

import type { Difficulty, Orientation, Pack, Placement, Puzzle } from "./types.ts";

export const PACK_VERSION = "1";
export const PACK_URL = `/word-voltage/pack-v${PACK_VERSION}.json`;

/** One word as stored: [WORD, row, col, "A" | "D"]. */
type StoredWord = [string, number, number, "A" | "D"];

interface StoredPuzzle {
  id: string;
  difficulty: Difficulty;
  letters: string;
  words: StoredWord[];
  /** Space-separated, sorted. */
  bonus: string;
}

export interface PackFile {
  version: string;
  tutorial: string;
  campaign: Record<Difficulty, string[]>;
  daily: Record<string, Record<Difficulty, string>>;
  puzzles: StoredPuzzle[];
}

export function encodePuzzle(puzzle: Puzzle): StoredPuzzle {
  return {
    id: puzzle.id,
    difficulty: puzzle.difficulty,
    letters: puzzle.letters,
    words: puzzle.words.map((p) => [p.word, p.row, p.col, p.dir === "across" ? "A" : "D"]),
    bonus: [...puzzle.bonus].sort().join(" "),
  };
}

/** Throws on anything that isn't a pack: the caller shows an honest error. */
export function decodePack(raw: unknown): Pack {
  const file = raw as PackFile;
  if (!file || typeof file !== "object" || !Array.isArray(file.puzzles)) {
    throw new Error("Not a Word Voltage pack");
  }
  const puzzles: Record<string, Puzzle> = {};
  for (const stored of file.puzzles) {
    const words: Placement[] = stored.words.map(([word, row, col, dir]) => ({
      word,
      row,
      col,
      dir: (dir === "A" ? "across" : "down") as Orientation,
    }));
    puzzles[stored.id] = {
      id: stored.id,
      difficulty: stored.difficulty,
      letters: stored.letters,
      words,
      bonus: stored.bonus ? stored.bonus.split(" ") : [],
    };
  }
  return {
    version: String(file.version),
    puzzles,
    campaign: { family: [...file.campaign.family], challenge: [...file.campaign.challenge] },
    daily: file.daily,
    tutorial: file.tutorial,
  };
}

let loading: Promise<Pack> | null = null;

/** Fetch and decode the pack once per session. */
export function loadPack(): Promise<Pack> {
  if (!loading) {
    loading = fetch(PACK_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Pack request failed (${response.status})`);
        return response.json() as Promise<unknown>;
      })
      .then(decodePack)
      .catch((error: unknown) => {
        // Let a later visit try again, rather than remembering the failure.
        loading = null;
        throw error;
      });
  }
  return loading;
}

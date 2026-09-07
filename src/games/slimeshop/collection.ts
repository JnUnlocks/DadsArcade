/**
 * The Prize Jar -- everything ever dug out of a slime, kept between sessions.
 *
 * This is the part that makes the prizes worth chasing. A prize that vanishes
 * when you close the tab is a firework: nice once. A prize that goes into a jar
 * you can open and count turns every future slime into progress toward
 * something, which is what actually brings a child back tomorrow.
 *
 * Deliberately local-only. It never touches the leaderboard API, so there is
 * nothing to cheat at and nothing about a child's play habits leaving the
 * device -- the jar is hers, on her phone.
 *
 * Storage failures are swallowed the same way core/storage.ts does it: private
 * browsing can throw on access, and losing a prize is never worth interrupting
 * play over.
 */

import { ALL_PRIZES, type Prize } from "./prizes.ts";

const KEY = "hyperdrive.slimeshop.prizes";

/** emoji -> how many have been found. */
export type Collection = Record<string, number>;

export function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    // Filter to prizes we still ship, so retiring one from the table doesn't
    // leave an unrenderable ghost in the jar forever.
    const known = new Set(ALL_PRIZES.map((p) => p.emoji));
    const out: Collection = {};
    for (const [emoji, count] of Object.entries(parsed as Collection)) {
      if (known.has(emoji) && typeof count === "number" && count > 0) {
        out[emoji] = Math.floor(count);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(collection: Collection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(collection));
  } catch {
    // Quota or disabled storage. Not worth interrupting play.
  }
}

/**
 * Add one prize to the jar. Returns true when it's the first ever found,
 * which is what earns the "NEW!" badge and the louder fanfare.
 */
export function addToCollection(prize: Prize): boolean {
  const collection = loadCollection();
  const isNew = !collection[prize.emoji];
  collection[prize.emoji] = (collection[prize.emoji] ?? 0) + 1;
  save(collection);
  return isNew;
}

export interface CollectionStats {
  distinct: number;
  total: number;
  possible: number;
}

export function collectionStats(collection: Collection): CollectionStats {
  let total = 0;
  for (const count of Object.values(collection)) total += count;
  return {
    distinct: Object.keys(collection).length,
    total,
    possible: ALL_PRIZES.length,
  };
}

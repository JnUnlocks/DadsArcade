/**
 * Prizes buried in the slime.
 *
 * The point of this is not the prize, it's the *digging*. A prize that simply
 * appeared when the slime was finished would be a loot box: you'd tap once and
 * read the result. Making them surface only as you stretch and squash turns
 * the toy into the reward mechanism -- the playing *is* the opening -- which
 * is the whole reason to have a squish screen at all.
 *
 * So each prize sits at a depth, and stretching the slime does "work" against
 * it. Nothing is on a timer and nothing can be missed: keep squishing and
 * every prize surfaces eventually. There's no way to lose a prize, only to
 * not have found it yet.
 */

import type { Rng } from "../../core/rng.ts";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export interface Prize {
  emoji: string;
  name: string;
  rarity: Rarity;
}

/**
 * The prize table.
 *
 * Emoji rather than drawn art is a deliberate exception to the project's
 * no-assets rule: they're font glyphs, not files, so they cost nothing to
 * download and stay consistent with "every asset is drawn at runtime". They
 * also give us ~40 instantly recognisable collectables that would otherwise be
 * ~40 hand-written path functions.
 */
const TABLE: ReadonlyArray<Prize> = [
  // Common -- the everyday finds that keep a dig feeling productive.
  { emoji: "🍬", name: "Candy", rarity: "common" },
  { emoji: "⭐", name: "Star", rarity: "common" },
  { emoji: "🫧", name: "Bubble", rarity: "common" },
  { emoji: "🍓", name: "Strawberry", rarity: "common" },
  { emoji: "🐚", name: "Shell", rarity: "common" },
  { emoji: "🌸", name: "Blossom", rarity: "common" },
  { emoji: "🍀", name: "Clover", rarity: "common" },
  { emoji: "🔔", name: "Bell", rarity: "common" },
  { emoji: "🧊", name: "Ice Cube", rarity: "common" },
  { emoji: "🪙", name: "Coin", rarity: "common" },

  // Uncommon -- includes the taco, because of course it does.
  { emoji: "🌮", name: "Taco", rarity: "uncommon" },
  { emoji: "🧁", name: "Cupcake", rarity: "uncommon" },
  { emoji: "🍩", name: "Donut", rarity: "uncommon" },
  { emoji: "🦋", name: "Butterfly", rarity: "uncommon" },
  { emoji: "🐠", name: "Fish", rarity: "uncommon" },
  { emoji: "🎈", name: "Balloon", rarity: "uncommon" },
  { emoji: "🍪", name: "Cookie", rarity: "uncommon" },
  { emoji: "🌻", name: "Sunflower", rarity: "uncommon" },
  { emoji: "🎀", name: "Ribbon", rarity: "uncommon" },
  { emoji: "🪀", name: "Yo-yo", rarity: "uncommon" },

  // Rare -- worth a shout when one turns up.
  { emoji: "🦄", name: "Unicorn", rarity: "rare" },
  { emoji: "🐙", name: "Octopus", rarity: "rare" },
  { emoji: "🌈", name: "Rainbow", rarity: "rare" },
  { emoji: "🪩", name: "Disco Ball", rarity: "rare" },
  { emoji: "🦖", name: "Dino", rarity: "rare" },
  { emoji: "🚀", name: "Rocket", rarity: "rare" },
  { emoji: "🐝", name: "Queen Bee", rarity: "rare" },
  { emoji: "🧸", name: "Teddy", rarity: "rare" },

  // Legendary -- a handful a week, and they should feel like it.
  { emoji: "💎", name: "Diamond", rarity: "legendary" },
  { emoji: "👑", name: "Crown", rarity: "legendary" },
  { emoji: "🔮", name: "Crystal Ball", rarity: "legendary" },
  { emoji: "🏆", name: "Golden Cup", rarity: "legendary" },
  { emoji: "🐉", name: "Dragon", rarity: "legendary" },
];

export const ALL_PRIZES: ReadonlyArray<Prize> = TABLE;

/** How the table is weighted before luck is applied. */
const BASE_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 26,
  rare: 11,
  legendary: 3,
};

export const RARITY_COLOURS: Record<Rarity, string> = {
  common: "#8ea3c8",
  uncommon: "#3ddc97",
  rare: "#54e0ff",
  legendary: "#ffd84d",
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  legendary: "LEGENDARY",
};

/** A prize in the slime, and how far along the player is to freeing it. */
export interface BuriedPrize {
  prize: Prize;
  /** Where it sits in the blob, as a fraction of the radius. */
  offsetAngle: number;
  offsetDistance: number;
  /** Work needed to surface it. */
  threshold: number;
  /** Work done so far. */
  progress: number;
  found: boolean;
  /** True the first time this prize has ever been found on this device. */
  isNew: boolean;
}

/**
 * Roll the prizes hidden in one slime.
 *
 * `luck` (0..1) tilts the table toward the good stuff. In Shop Day it comes
 * from how well the order was mixed, which is the one thread tying the toy
 * back to the skill -- mixing carefully makes better prizes more likely
 * without ever making a bad mix unrewarding.
 */
export function rollPrizes(rng: Rng, count: number, luck = 0): Prize[] {
  const weights: Record<Rarity, number> = {
    common: Math.max(10, BASE_WEIGHTS.common - luck * 30),
    uncommon: BASE_WEIGHTS.uncommon + luck * 8,
    rare: BASE_WEIGHTS.rare + luck * 15,
    legendary: BASE_WEIGHTS.legendary + luck * 7,
  };

  const picked: Prize[] = [];
  for (let i = 0; i < count; i += 1) {
    const rarity = pickRarity(rng, weights);
    const pool = TABLE.filter((p) => p.rarity === rarity);
    // Avoid handing out the same prize twice in one slime -- finding two
    // identical things in one dig reads as a bug rather than as luck.
    const fresh = pool.filter((p) => !picked.some((q) => q.emoji === p.emoji));
    picked.push(rng.pick(fresh.length > 0 ? fresh : pool));
  }
  return picked;
}

function pickRarity(rng: Rng, weights: Record<Rarity, number>): Rarity {
  const total =
    weights.common + weights.uncommon + weights.rare + weights.legendary;
  let roll = rng.next() * total;
  for (const rarity of ["legendary", "rare", "uncommon"] as const) {
    roll -= weights[rarity];
    if (roll < 0) return rarity;
  }
  return "common";
}

/** Lay rolled prizes out inside the blob, at staggered depths. */
export function buryPrizes(rng: Rng, prizes: Prize[]): BuriedPrize[] {
  // Accumulated rather than computed from the index, so thresholds are
  // strictly increasing by construction.
  //
  // Spacing them as `base + i * step` looked equivalent but wasn't: the
  // rarity depth bonus (up to +7.2) could exceed the step (+7), leaving a
  // later prize shallower than an earlier one. Since digging works through
  // them in order against a cumulative energy total, that made the second
  // prize surface in the same frame as the first -- two pops at once, and a
  // child seeing only one of them.
  let depth = 1;

  return prizes.map((prize) => {
    // Tuned against DIG_RATE in index.ts: vigorous squishing earns roughly
    // 5 work per second, so the first prize is about a second and a half in
    // and a full set of five is under ten seconds of active play. Long enough
    // to feel dug out, short enough to hold a seven-year-old.
    depth += 7 + DEPTH_BY_RARITY[prize.rarity] * 6;
    return {
      prize,
      offsetAngle: rng.range(0, Math.PI * 2),
      offsetDistance: rng.range(0.18, 0.62),
      threshold: depth,
      progress: 0,
      found: false,
      isNew: false,
    };
  });
}

const DEPTH_BY_RARITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.3,
  rare: 0.7,
  legendary: 1.2,
};

/** How many prizes a slime hides. Never zero -- a dig always pays out. */
export function prizeCount(rng: Rng, quality = 0.5): number {
  const base = 2 + Math.floor(quality * 2); // 2..4
  return Math.max(1, Math.min(5, base + (rng.chance(0.25) ? 1 : 0)));
}

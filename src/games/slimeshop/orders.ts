/**
 * Order generation.
 *
 * Pure and seeded, and deliberately kept out of the game class so the daily
 * challenge can be tested for what it actually promises: that two people
 * playing on the same day get byte-for-byte the same six orders. That claim is
 * the whole reason the daily board is worth ranking, and it is not something to
 * take on trust.
 */

import { colourName, emptyRecipe, mixRecipe } from "./color.ts";
import type { Bottle } from "./color.ts";
import type { Rng } from "../../core/rng.ts";
import { MIX_INS, TEXTURES, type Order } from "./types.ts";

export const ORDERS_PER_DAY = 6;

/**
 * Build one order by inventing a recipe and mixing it, rather than picking a
 * colour and hoping.
 *
 * Generating a target colour at random would routinely ask for something no
 * combination of five bottles can produce, and losing points to an impossible
 * order is the fastest way to make a game feel unfair. Working forwards from a
 * recipe means every ticket is provably mixable, and the difficulty ramp
 * becomes "how many bottles, and how awkward a ratio".
 */
export function makeOrder(rng: Rng, index: number): Order {
  const recipe = emptyRecipe();
  const colours: Bottle[] = ["red", "yellow", "blue"];

  // Early orders: one or two bottles in a clean ratio. Later ones add a third
  // bottle and a tint or shade.
  const bottleCount = index < 2 ? 1 + (index % 2) : rng.int(2, 3);
  const chosen = shuffled(colours, rng).slice(0, bottleCount);

  for (let i = 0; i < chosen.length; i += 1) {
    const bottle = chosen[i]!;
    // The first bottle dominates; ratios stay small so they stay reachable in
    // a handful of taps.
    recipe[bottle] = index < 2 ? 1 : i === 0 ? rng.int(1, 3) : rng.int(1, 2);
  }

  if (index >= 3 && rng.chance(0.55)) {
    recipe[rng.chance(0.65) ? "white" : "black"] = rng.int(1, 2);
  }

  const colour = mixRecipe(recipe);

  const mixInCount = index === 0 ? rng.int(0, 1) : rng.int(1, 2);

  return {
    colour,
    colourLabel: colourName(colour),
    texture: rng.pick(TEXTURES),
    mixIns: shuffled([...MIX_INS], rng).slice(0, mixInCount),
    customer: rng.int(0, 5),
    recipe,
  };
}

/** A whole shop day, in order. */
export function makeShopDay(rng: Rng): Order[] {
  const orders: Order[] = [];
  for (let i = 0; i < ORDERS_PER_DAY; i += 1) orders.push(makeOrder(rng, i));
  return orders;
}

export function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy;
}

/**
 * The daily challenge makes one promise: everyone who plays today gets the
 * same six orders, so the scores on today's board are comparable. That promise
 * is the entire reason the board is worth ranking, and it is quiet when it
 * breaks -- nobody would notice their orders differed from yours, they'd just
 * see an unfair scoreboard.
 *
 * These tests hold the promise to account, and also check the property that
 * makes orders fair in the first place: every ticket is actually mixable.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dailyKey, dailySeed, Rng } from "../../core/rng.ts";
import { colourMatch, mixRecipe } from "./color.ts";
import { makeOrder, makeShopDay, ORDERS_PER_DAY } from "./orders.ts";
import { MIX_INS, TEXTURES } from "./types.ts";

/** A stable, comparable description of an order. */
function describeOrder(o: ReturnType<typeof makeOrder>): string {
  return JSON.stringify({
    colour: o.colour,
    label: o.colourLabel,
    texture: o.texture,
    mixIns: [...o.mixIns],
    customer: o.customer,
    recipe: o.recipe,
  });
}

describe("daily challenge", () => {
  it("gives two players on the same day identical orders", () => {
    const seed = dailySeed(new Date("2026-09-06T09:00:00"));
    const riley = makeShopDay(new Rng(seed)).map(describeOrder);
    const dad = makeShopDay(new Rng(seed)).map(describeOrder);
    assert.deepEqual(riley, dad);
  });

  it("gives the same orders at breakfast and at bedtime", () => {
    // Same local day, twelve hours apart. If the seed were derived from the
    // raw timestamp this would silently reshuffle mid-afternoon and the
    // board would be comparing different challenges.
    const morning = dailySeed(new Date("2026-09-06T07:30:00"));
    const evening = dailySeed(new Date("2026-09-06T19:45:00"));
    assert.equal(morning, evening);
  });

  it("gives a different set the next day", () => {
    const today = makeShopDay(new Rng(dailySeed(new Date("2026-09-06T12:00:00"))));
    const tomorrow = makeShopDay(new Rng(dailySeed(new Date("2026-09-07T12:00:00"))));
    assert.notDeepEqual(today.map(describeOrder), tomorrow.map(describeOrder));
  });

  it("derives the board id from the same local day as the seed", () => {
    // The seed and the board have to roll over together, or a run gets filed
    // against a board generated from a different set of orders.
    const date = new Date("2026-09-06T23:30:00");
    assert.equal(dailyKey(date), "2026-09-06");
    assert.equal(dailySeed(date), dailySeed(new Date("2026-09-06T00:30:00")));
    assert.notEqual(dailySeed(date), dailySeed(new Date("2026-09-07T00:30:00")));
  });
});

describe("order generation", () => {
  it("only ever asks for a colour that can actually be mixed", () => {
    // Every ticket is generated forwards from a recipe, so mixing that recipe
    // has to reproduce the target exactly. If this drifts, players lose points
    // to orders that were never achievable.
    for (let seed = 0; seed < 400; seed += 1) {
      const rng = new Rng(seed);
      for (const order of makeShopDay(rng)) {
        const remixed = mixRecipe(order.recipe);
        assert.equal(
          colourMatch(remixed, order.colour),
          1,
          `order colour is not reproducible from its own recipe (seed ${seed})`,
        );
      }
    }
  });

  it("produces a full day of well-formed orders", () => {
    const orders = makeShopDay(new Rng(12345));
    assert.equal(orders.length, ORDERS_PER_DAY);

    for (const order of orders) {
      assert.ok(TEXTURES.includes(order.texture));
      assert.ok(order.colourLabel.length > 0);
      assert.ok(order.customer >= 0 && order.customer <= 5);
      assert.ok(order.mixIns.length <= 2);
      assert.equal(new Set(order.mixIns).size, order.mixIns.length, "no duplicate mix-ins");
      for (const m of order.mixIns) assert.ok(MIX_INS.includes(m));
    }
  });

  it("eases the player in", () => {
    // The first two orders are single-ratio and use at most two bottles, so a
    // child's first customer is never a three-bottle tint.
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = new Rng(seed);
      for (const index of [0, 1]) {
        const { recipe } = makeOrder(rng, index);
        const used = (["red", "yellow", "blue"] as const).filter((b) => recipe[b] > 0);
        assert.ok(used.length <= 2, `order ${index} used ${used.length} bottles`);
        assert.equal(recipe.white, 0, "no tint in the opening orders");
        assert.equal(recipe.black, 0, "no shade in the opening orders");
        for (const b of used) assert.equal(recipe[b], 1, "opening ratios stay 1:1");
      }
    }
  });

  it("keeps every order reachable in a sensible number of taps", () => {
    // MAX_POURS in the game is 14; an order needing more than that would be
    // literally impossible to fill.
    for (let seed = 0; seed < 300; seed += 1) {
      for (const order of makeShopDay(new Rng(seed))) {
        const pours = Object.values(order.recipe).reduce((a, b) => a + b, 0);
        assert.ok(pours >= 1 && pours <= 10, `order needs ${pours} pours`);
      }
    }
  });
});

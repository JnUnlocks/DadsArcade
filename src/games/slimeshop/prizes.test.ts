/**
 * The prize system has one job it must never fail at: a child who keeps
 * squishing must always, eventually, get everything out of the slime. There
 * is no fail state in this game and "I dug forever and nothing came out" would
 * be one.
 *
 * The rest of these pin the tuning that makes a dig feel like a dig rather
 * than a loot box that pays out instantly.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Rng } from "../../core/rng.ts";
import {
  ALL_PRIZES,
  buryPrizes,
  prizeCount,
  rollPrizes,
  RARITY_COLOURS,
  RARITY_LABELS,
  type Rarity,
} from "./prizes.ts";

/** Mirrors DIG_RATE in index.ts. */
const DIG_RATE = 0.003;

describe("prize table", () => {
  it("has no duplicate emoji", () => {
    // The collection is keyed by emoji, so a duplicate would merge two
    // different prizes into one jar slot.
    const seen = new Set(ALL_PRIZES.map((p) => p.emoji));
    assert.equal(seen.size, ALL_PRIZES.length);
  });

  it("has entries at every rarity, and a colour and label for each", () => {
    for (const rarity of ["common", "uncommon", "rare", "legendary"] as const) {
      assert.ok(
        ALL_PRIZES.some((p) => p.rarity === rarity),
        `no ${rarity} prizes`,
      );
      assert.ok(RARITY_COLOURS[rarity]);
      assert.ok(RARITY_LABELS[rarity]);
    }
  });

  it("still has the taco", () => {
    // Riley asked for tacos. This is load-bearing.
    assert.ok(ALL_PRIZES.some((p) => p.emoji === "🌮"));
  });
});

describe("rolling prizes", () => {
  it("always hides at least one prize", () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const rng = new Rng(seed);
      assert.ok(prizeCount(rng, rng.next()) >= 1);
    }
  });

  it("never repeats a prize within one slime", () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const rng = new Rng(seed);
      const prizes = rollPrizes(rng, 5, rng.next());
      const emoji = prizes.map((p) => p.emoji);
      assert.equal(new Set(emoji).size, emoji.length, `duplicate at seed ${seed}`);
    }
  });

  it("makes good prizes likelier with luck, without ever guaranteeing them", () => {
    const count = (luck: number, wanted: Rarity[]) => {
      let hits = 0;
      for (let seed = 0; seed < 2000; seed += 1) {
        for (const p of rollPrizes(new Rng(seed), 3, luck)) {
          if (wanted.includes(p.rarity)) hits += 1;
        }
      }
      return hits;
    };

    const unlucky = count(0, ["rare", "legendary"]);
    const lucky = count(1, ["rare", "legendary"]);
    assert.ok(lucky > unlucky, `luck should help: ${unlucky} -> ${lucky}`);

    // But a bad mix still finds good things sometimes -- this is a toy, and
    // "you mixed badly so you get nothing nice" is the wrong lesson.
    assert.ok(unlucky > 0, "luck 0 should still roll rares sometimes");
    // ...and a perfect mix is not a guaranteed jackpot.
    const luckyCommons = count(1, ["common", "uncommon"]);
    assert.ok(luckyCommons > 0, "luck 1 should still roll ordinary prizes");
  });
});

describe("burying and digging", () => {
  it("orders prizes so they surface one at a time", () => {
    const buried = buryPrizes(new Rng(7), rollPrizes(new Rng(7), 5, 0.5));
    for (let i = 1; i < buried.length; i += 1) {
      assert.ok(
        buried[i]!.threshold > buried[i - 1]!.threshold,
        "each prize must sit deeper than the last",
      );
    }
  });

  it("keeps every prize inside the blob", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const b of buryPrizes(new Rng(seed), rollPrizes(new Rng(seed), 5))) {
        assert.ok(
          b.offsetDistance >= 0 && b.offsetDistance <= 0.75,
          `prize placed at ${b.offsetDistance} of the radius would sit outside the slime`,
        );
      }
    }
  });

  it("surfaces a full set in a reasonable amount of squishing", () => {
    // The guarantee that matters: keep dragging and everything comes out.
    // ~30 virtual units of drag per frame at 60fps is vigorous but ordinary
    // play; a full set should take seconds, not minutes.
    const perSecond = 30 * 60 * DIG_RATE;

    for (let seed = 0; seed < 200; seed += 1) {
      const buried = buryPrizes(new Rng(seed), rollPrizes(new Rng(seed), 5, 0.5));
      const deepest = buried[buried.length - 1]!.threshold;
      const seconds = deepest / perSecond;
      assert.ok(
        seconds > 1,
        `seed ${seed}: a full set in ${seconds.toFixed(1)}s is an instant payout, not a dig`,
      );
      assert.ok(
        seconds < 25,
        `seed ${seed}: ${seconds.toFixed(1)}s of squishing is too long for a seven-year-old`,
      );
    }
  });

  it("gives the first prize up quickly, so the mechanic explains itself", () => {
    const perSecond = 30 * 60 * DIG_RATE;
    for (let seed = 0; seed < 200; seed += 1) {
      const buried = buryPrizes(new Rng(seed), rollPrizes(new Rng(seed), 5, 0.5));
      const first = buried[0]!.threshold / perSecond;
      assert.ok(
        first < 4,
        `seed ${seed}: ${first.toFixed(1)}s before anything happens is too long a wait to learn from`,
      );
    }
  });
});

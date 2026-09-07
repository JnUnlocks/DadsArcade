/**
 * The mixing rules are the game's difficulty curve, so they're worth pinning
 * down. The tests that matter here aren't the numeric ones -- they're the
 * ones asserting that mixing behaves the way a child expects paint to behave.
 * If blue + yellow ever stops being green, every order in the game becomes
 * unfair at once, and it would show up as "the game feels broken" long before
 * anyone thought to suspect the colour space.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  colourMatch,
  colourName,
  emptyRecipe,
  mixRecipe,
  shift,
  totalPours,
  type Recipe,
} from "./color.ts";

function recipe(parts: Partial<Recipe>): Recipe {
  return { ...emptyRecipe(), ...parts };
}

/** Rough hue check: which channel dominates. */
function dominant(c: { r: number; g: number; b: number }): string {
  if (c.r >= c.g && c.r >= c.b) return "r";
  if (c.g >= c.r && c.g >= c.b) return "g";
  return "b";
}

describe("paint mixing", () => {
  it("makes green from blue and yellow", () => {
    // The one that justifies the whole RYB detour.
    const green = mixRecipe(recipe({ blue: 1, yellow: 1 }));
    assert.equal(dominant(green), "g", `expected green, got ${JSON.stringify(green)}`);
    assert.ok(green.g > green.r + 0.2, "green should clearly beat red");
    assert.ok(green.g > green.b + 0.2, "green should clearly beat blue");
  });

  it("makes orange from red and yellow", () => {
    const orange = mixRecipe(recipe({ red: 1, yellow: 1 }));
    assert.ok(orange.r > 0.8, "orange stays hot in red");
    assert.ok(orange.g > 0.3 && orange.g < 0.75, "mid green channel");
    assert.ok(orange.b < 0.2, "no blue in orange");
  });

  it("makes purple from red and blue", () => {
    const purple = mixRecipe(recipe({ red: 1, blue: 1 }));
    assert.ok(purple.g < purple.r, "purple is not green");
    assert.ok(purple.g < purple.b, "purple is not green");
  });

  it("keeps equal parts saturated rather than washing them out", () => {
    // Normalising by the sum instead of the max would land this halfway to
    // white and produce a muddy peach.
    const orange = mixRecipe(recipe({ red: 2, yellow: 2 }));
    const alsoOrange = mixRecipe(recipe({ red: 1, yellow: 1 }));
    assert.ok(colourMatch(orange, alsoOrange) > 0.99, "ratio is what counts, not volume");
  });

  it("treats an empty bowl as white, not black", () => {
    const empty = mixRecipe(emptyRecipe());
    assert.deepEqual(empty, { r: 1, g: 1, b: 1 });
  });

  it("lightens with white and darkens with black", () => {
    const plain = mixRecipe(recipe({ red: 2 }));
    const tinted = mixRecipe(recipe({ red: 2, white: 2 }));
    const shaded = mixRecipe(recipe({ red: 2, black: 2 }));

    const luma = (c: { r: number; g: number; b: number }) =>
      c.r * 0.299 + c.g * 0.587 + c.b * 0.114;

    assert.ok(luma(tinted) > luma(plain), "white should lighten");
    assert.ok(luma(shaded) < luma(plain), "black should darken");
  });

  it("lets one drop of white barely move a big batch", () => {
    // Ratio-based tinting is what makes fine-tuning a near-miss possible;
    // if a single pour swung the colour hard, high scores would be luck.
    const big = mixRecipe(recipe({ red: 8 }));
    const bigPlusDrop = mixRecipe(recipe({ red: 8, white: 1 }));
    const small = mixRecipe(recipe({ red: 1 }));
    const smallPlusDrop = mixRecipe(recipe({ red: 1, white: 1 }));

    assert.ok(
      colourMatch(big, bigPlusDrop) > colourMatch(small, smallPlusDrop),
      "the same drop should matter less in a bigger bowl",
    );
  });

  it("never leaves the unit cube, whatever you pour", () => {
    // Out-of-range channels would silently clip to garbage in toCss().
    const wild = mixRecipe(recipe({ red: 9, yellow: 3, blue: 7, white: 5, black: 6 }));
    for (const channel of [wild.r, wild.g, wild.b]) {
      assert.ok(channel >= 0 && channel <= 1, `channel out of range: ${channel}`);
    }
  });
});

describe("colour matching", () => {
  it("scores an exact match as 1", () => {
    const c = { r: 0.3, g: 0.7, b: 0.5 };
    assert.equal(colourMatch(c, c), 1);
  });

  it("scores black against white near 0", () => {
    const score = colourMatch({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 });
    assert.ok(score < 0.1, `expected a terrible score, got ${score}`);
  });

  it("is symmetric", () => {
    const a = { r: 0.9, g: 0.2, b: 0.4 };
    const b = { r: 0.1, g: 0.8, b: 0.3 };
    assert.equal(colourMatch(a, b), colourMatch(b, a));
  });

  it("rates a near miss well above a wild miss", () => {
    const target = { r: 0.2, g: 0.7, b: 0.3 };
    const close = colourMatch(target, { r: 0.25, g: 0.72, b: 0.32 });
    const wild = colourMatch(target, { r: 0.9, g: 0.1, b: 0.8 });
    assert.ok(close > 0.9, `near miss should stay generous, got ${close}`);
    assert.ok(close > wild + 0.3);
  });
});

describe("ticket wording", () => {
  it("names every mixable colour something", () => {
    for (const r of [0, 3]) {
      for (const y of [0, 3]) {
        for (const b of [0, 3]) {
          for (const w of [0, 2]) {
            const name = colourName(mixRecipe(recipe({ red: r, yellow: y, blue: b, white: w })));
            assert.ok(name.length > 0, "every colour needs a name for the ticket");
          }
        }
      }
    }
  });

  it("calls the obvious ones by their obvious names", () => {
    assert.equal(colourName(mixRecipe(recipe({ blue: 1, yellow: 1 }))), "Slime Green");
    assert.equal(colourName(mixRecipe(emptyRecipe())), "Vanilla");
    assert.equal(colourName(mixRecipe(recipe({ red: 1, blue: 1 }))), "Grape Soda");
    assert.equal(colourName(mixRecipe(recipe({ red: 1, yellow: 1 }))), "Taco Orange");
  });

  it("never calls a colourful slime a neutral", () => {
    // The bug this pins: mixing blue + 2 yellow + white makes a bright lime,
    // and it was being called "Storm Grey" because the scoring metric was
    // reused for naming and greys sit near the middle of RGB space, winning
    // ties against everything. A ticket that names a vivid colour after a
    // neutral is actively misleading.
    const neutrals = new Set(["Storm Grey", "Charcoal", "Vanilla", "Midnight Goo"]);

    for (const parts of [
      { blue: 1, yellow: 2, white: 1 },
      { blue: 1, yellow: 3 },
      { red: 2, yellow: 1, white: 1 },
      { red: 1, blue: 2, white: 1 },
      { yellow: 3, red: 1 },
      { blue: 2, yellow: 1, white: 2 },
    ]) {
      const colour = mixRecipe(recipe(parts));
      const hsl = toHsl(colour);
      if (hsl.s < 0.25) continue; // genuinely washed out; a neutral is fair

      const name = colourName(colour);
      assert.ok(
        !neutrals.has(name),
        `${JSON.stringify(parts)} is saturated (s=${hsl.s.toFixed(2)}) but was named "${name}"`,
      );
    }
  });

  it("gives a grey a neutral name", () => {
    // The other half of the same rule: neutrals must still win when the
    // colour really is one, or the fix would just move the bug.
    assert.ok(
      ["Storm Grey", "Charcoal", "Vanilla", "Midnight Goo"].includes(
        colourName({ r: 0.55, g: 0.55, b: 0.57 }),
      ),
    );
  });
});

/** Minimal HSL, only for the saturation assertion above. */
function toHsl(c: { r: number; g: number; b: number }): { s: number; l: number } {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { s: 0, l };
  return { s: l > 0.5 ? d / (2 - max - min) : d / (max + min), l };
}

describe("helpers", () => {
  it("counts pours across every bottle", () => {
    assert.equal(totalPours(recipe({ red: 2, blue: 1, black: 3 })), 6);
    assert.equal(totalPours(emptyRecipe()), 0);
  });

  it("shifts toward white and black without leaving the cube", () => {
    const c = { r: 0.5, g: 0.5, b: 0.5 };
    assert.deepEqual(shift(c, 1), { r: 1, g: 1, b: 1 });
    assert.deepEqual(shift(c, -1), { r: 0, g: 0, b: 0 });
    assert.deepEqual(shift(c, 0), c);
  });
});

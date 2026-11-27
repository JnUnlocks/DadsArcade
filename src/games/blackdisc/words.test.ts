import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES } from "./words.ts";

/** Folds case, punctuation and a leading "The" so "The Lorax" and "lorax" collide. */
function normalize(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/^the /, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Pass the Disc word lists", () => {
  it("has unique category ids", () => {
    const ids = CATEGORIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  for (const cat of CATEGORIES) {
    it(`${cat.label} has no repeated words`, () => {
      const seen = new Map<string, string>();
      const repeats: string[] = [];
      for (const word of cat.words) {
        const key = normalize(word);
        const earlier = seen.get(key);
        if (earlier !== undefined) repeats.push(`"${earlier}" / "${word}"`);
        else seen.set(key, word);
      }
      assert.deepEqual(repeats, []);
    });

    // A family game night burns through a list fast; below this the
    // repeats start showing up the same evening.
    it(`${cat.label} has at least 100 words`, () => {
      assert.ok(cat.words.length >= 100, `only ${cat.words.length}`);
    });

    it(`${cat.label} has no blank or padded words`, () => {
      for (const word of cat.words) assert.equal(word, word.trim());
      assert.ok(cat.words.every((w) => w.length > 0));
    });
  }
});

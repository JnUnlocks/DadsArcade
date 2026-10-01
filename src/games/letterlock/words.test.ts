/**
 * Letter Lock's word lists.
 *
 * Nine thousand words in a packed string is exactly the kind of thing that
 * goes wrong one character at a time, and the answer list is read by a
 * seven-year-old. Both get checked on every build.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ALLOWED, ANSWERS, isAllowedGuess } from "./words.ts";

/**
 * Words that must never be the answer, whatever else changes: swears, slurs,
 * and anything about bodies, fighting, drinking or drugs. Deliberately a
 * sample of each kind rather than a complete list -- it's here to fail loudly
 * if someone pastes a general-purpose word list over ANSWERS.
 */
const NEVER_AN_ANSWER = [
  // Swears and rude words.
  "bitch", "boobs", "booty", "bosom", "butts", "crap", "craps", "damns", "farts", "horny",
  "idiot", "naked", "nudes", "pissy", "poops", "sexes", "sissy", "sluts", "turds", "whore",
  // Slurs.
  "chink", "dykes", "gypsy", "homos", "spics",
  // Bodies.
  "belly", "blood", "bones", "groin", "naval", "navel", "penis", "skull", "spine", "sweat",
  // Fighting and dying.
  "blade", "bombs", "death", "fatal", "fight", "grave", "kills", "knife", "punch", "shoot",
  "slain", "sword", "wound",
  // Drinking, smoking and drugs.
  "booze", "cigar", "drugs", "drunk", "joint", "opium", "smoke", "tipsy", "vodka", "weeds",
] as const;

/** Rude enough that they aren't even accepted as a guess. */
const NEVER_A_GUESS = ["bitch", "boobs", "horny", "nudes", "sluts", "turds", "whore", "chink", "dykes", "homos", "spics"];

describe("the answers", () => {
  it("are all exactly five lower-case letters", () => {
    for (const word of ANSWERS) assert.match(word, /^[a-z]{5}$/, `bad answer "${word}"`);
  });

  it("has no duplicates", () => {
    assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  });

  it("lasts more than two years without a repeat", () => {
    assert.ok(ANSWERS.length >= 750, `only ${ANSWERS.length} answers`);
  });

  it("can all be typed as a guess", () => {
    for (const word of ANSWERS) assert.ok(isAllowedGuess(word), `"${word}" is an answer but not a guess`);
  });

  it("contains nothing a seven-year-old shouldn't be handed", () => {
    const answers = new Set(ANSWERS);
    for (const word of NEVER_AN_ANSWER) assert.ok(!answers.has(word), `"${word}" is on the answer list`);
  });
});

describe("the allowed guesses", () => {
  it("are all exactly five lower-case letters", () => {
    for (const word of ALLOWED) assert.match(word, /^[a-z]{5}$/, `bad guess "${word}"`);
  });

  it("unpacks to a much larger list than the answers, with nothing lost to a duplicate", () => {
    // 7,377 packed words plus the answers. If two packed words collided, or
    // one was also an answer, the set would come up short.
    assert.equal(ALLOWED.size, ANSWERS.length + 7377);
    assert.ok(ALLOWED.size > ANSWERS.length * 5);
  });

  it("accepts ordinary words that aren't answers", () => {
    for (const word of ["aahed", "crwth", "knife", "llama", "zowie", "zymes"]) {
      assert.ok(isAllowedGuess(word), `"${word}" should be a valid guess`);
    }
  });

  it("rejects things that aren't words", () => {
    for (const word of ["abcde", "zzzzz", "qwert", "", "cat", "plants", "PLANT"]) {
      assert.ok(!isAllowedGuess(word), `"${word}" should not be a valid guess`);
    }
  });

  it("doesn't accept the rudest words even as guesses", () => {
    for (const word of NEVER_A_GUESS) assert.ok(!isAllowedGuess(word), `"${word}" is accepted as a guess`);
  });
});

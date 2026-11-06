/**
 * Thumb Storm's rules: what counts as typing, and how it's scored. A swipe
 * that slips through, or a score off by a word, is the kind of thing the
 * family would notice on the high-score board first.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { change, liveWpm, newTyping, passage, PASSAGE_CHARS, result, SENTENCES, TYPE_MS } from "./type.ts";

/** Type `text` a letter at a time, 100 ms apart, from `at`. */
function typeOut(t: ReturnType<typeof newTyping>, text: string, at = 1000): number {
  for (const ch of text) {
    assert.equal(change(t, t.typed + ch, at), "ok");
    at += 100;
  }
  return at;
}

describe("thumb storm passage", () => {
  it("is long enough, lowercase words and single spaces only", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i += 1) {
      const p = passage(rand);
      assert.ok(p.length >= PASSAGE_CHARS);
      assert.match(p, /^[a-z]+( [a-z]+)*$/);
    }
  });

  it("every sentence is plain and about the same length", () => {
    for (const s of SENTENCES) {
      assert.match(s, /^[a-z]+( [a-z]+)*$/, s);
      assert.ok(s.length >= 40 && s.length <= 62, `${s.length}: ${s}`);
    }
    assert.equal(new Set(SENTENCES).size, SENTENCES.length);
  });

  it("doesn't repeat a sentence until the deck runs out", () => {
    const p = passage(Math.random, 300);
    const used = SENTENCES.filter((s) => p.includes(s));
    assert.ok(used.length >= p.split(" ").length / 12);
  });
});

describe("thumb storm typing", () => {
  it("starts the clock on the first letter, not before", () => {
    const t = newTyping("abc def");
    assert.equal(t.start, null);
    change(t, "a", 5000);
    assert.equal(t.start, 5000);
    assert.equal(t.deadline, 5000 + TYPE_MS);
  });

  it("refuses several letters at once: swipes, suggestions, pastes", () => {
    const t = newTyping("the dog sat");
    typeOut(t, "th");
    assert.equal(change(t, "the dog", 2000), "many");
    assert.equal(t.typed, "th");
    assert.equal(t.keystrokes, 2);
  });

  it("refuses letters swapped for others: autocorrect", () => {
    const t = newTyping("teh dog");
    typeOut(t, "teh");
    assert.equal(change(t, "tex", 2000), "swap");
    assert.notEqual(change(t, "the", 2000), "ok");
    assert.notEqual(change(t, "the ", 2000), "ok");
    assert.equal(t.typed, "teh");
  });

  it("lets backspace fix mistakes, and counts the slip against accuracy", () => {
    const t = newTyping("cat");
    typeOut(t, "cx");
    assert.equal(change(t, "c", 2000), "ok");
    typeOut(t, "at", 2100);
    const r = result(t);
    assert.equal(t.typed, "cat");
    assert.equal(r.correct, 3);
    assert.equal(r.wrong, 0);
    assert.equal(r.accuracy, 75); // 3 of 4 letters right first time
  });

  it("ignores case and curly quotes from helpful keyboards", () => {
    const t = newTyping("go now");
    typeOut(t, "G");
    assert.equal(t.typed, "g");
    assert.equal(result(t).correct, 1);
  });

  it("counts nothing after time is up", () => {
    const t = newTyping("abcdef");
    change(t, "a", 0);
    assert.equal(change(t, "ab", TYPE_MS), "over");
    assert.equal(change(t, "ab", TYPE_MS - 1), "ok");
  });

  it("never runs past the end of the passage", () => {
    const t = newTyping("ab");
    typeOut(t, "ab");
    assert.equal(change(t, "abc", 2000), "ok");
    assert.equal(t.typed, "ab");
  });
});

describe("thumb storm scoring", () => {
  it("is net words a minute over the 30 seconds", () => {
    // 100 right characters in 30 s = 20 words in half a minute = 40 WPM.
    const text = "a".repeat(100);
    const t = newTyping(text + "zzzz");
    typeOut(t, text, 0);
    assert.equal(result(t).wpm, 40);
    // Ten wrong ones left in take ten off the right ones: 90 -> 36 WPM.
    const u = newTyping("a".repeat(110));
    typeOut(u, "a".repeat(100) + "b".repeat(10), 0);
    assert.equal(result(u).wpm, 36);
  });

  it("can't go below zero by mashing", () => {
    const t = newTyping("abcdef");
    typeOut(t, "zzzzzz");
    assert.equal(result(t).wpm, 0);
    assert.equal(result(t).accuracy, 0);
  });

  it("shows no live speed for the first two seconds", () => {
    const t = newTyping("a".repeat(50));
    typeOut(t, "aaaaaaaaaa", 0);
    assert.equal(liveWpm(t, 1500), null);
    // 10 characters in 2.5 s = 2 words in 1/24 minute = 48 WPM.
    assert.equal(liveWpm(t, 2500), 48);
  });
});

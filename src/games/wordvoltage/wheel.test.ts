/**
 * The letter wheel: paths of physical tokens, backtracking, fast swipes, a
 * second E that is really a second E, and shuffle.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enterToken,
  hitRadius,
  initialOrder,
  pathWord,
  shuffleOrder,
  tapToken,
  tokenAt,
  tokenForLetter,
  tokensAlong,
  validOrder,
  wheelPositions,
  type Path,
} from "./wheel.ts";

const LETTER = "LETTER"; // tokens: 0 L, 1 E, 2 T, 3 T, 4 E, 5 R

/** Walk a finger over tokens in turn, the way the swipe handler does. */
function swipe(...tokens: number[]): Path {
  return tokens.reduce<Path>((path, token) => enterToken(path, token), []);
}

describe("a swiped path", () => {
  it("spells LETTER from six tokens, each used once", () => {
    const path = swipe(0, 1, 2, 3, 4, 5);
    assert.equal(pathWord(path, LETTER), "LETTER");
    assert.equal(new Set(path).size, 6);
  });

  it("can't use one E twice, however the finger wanders", () => {
    // L, E, T, then back across the same E and on to R.
    const path = swipe(0, 1, 2, 1, 2, 5);
    assert.equal(pathWord(path, LETTER), "LETR");
  });

  it("takes the last letter off when the finger goes back one", () => {
    assert.deepEqual(swipe(0, 1, 2, 1), [0, 1]);
    assert.deepEqual(swipe(0, 1, 0), [0]);
  });

  it("ignores an earlier token that isn't the one before last", () => {
    assert.deepEqual(swipe(0, 1, 2, 0), [0, 1, 2]);
  });

  it("stays put while the finger rests on one token", () => {
    assert.deepEqual(swipe(5, 5, 5), [5]);
  });
});

describe("hit testing", () => {
  const centers = wheelPositions(7, 100, 100, 70);
  const hit = hitRadius(7, 70, 26);

  it("never lets two tokens' circles overlap", () => {
    for (let i = 0; i < centers.length; i += 1) {
      const a = centers[i]!;
      const b = centers[(i + 1) % centers.length]!;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 2 * hit, "neighbours overlap");
    }
  });

  it("finds the token under a point, and none in the gap", () => {
    assert.equal(tokenAt(centers[3]!, centers, hit), 3);
    assert.equal(tokenAt({ x: 100, y: 100 }, centers, hit), null);
  });

  it("catches a token a fast swipe jumps clean over", () => {
    // Three tokens in a row, and a finger that gets from the first to the
    // last between two pointer events: the middle one still counts, in order.
    const row = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 120, y: 0 },
    ];
    assert.deepEqual(tokensAlong(row[0]!, row[2]!, row, 25), [0, 1, 2]);
    const path = tokensAlong(row[0]!, row[2]!, row, 25).reduce<Path>(enterToken, [0]);
    assert.deepEqual(path, [0, 1, 2]);
    // A move inside the empty middle of the wheel crosses nothing.
    assert.deepEqual(tokensAlong({ x: 100, y: 100 }, { x: 104, y: 92 }, centers, hit), []);
  });

  it("works the same after the wheel is resized", () => {
    const small = wheelPositions(7, 50, 50, 35);
    const smallHit = hitRadius(7, 35, 13);
    assert.equal(tokenAt(small[4]!, small, smallHit), 4);
  });
});

describe("tap and keyboard", () => {
  it("tap adds a letter, and tapping the last one takes it off", () => {
    let path: Path = [];
    path = tapToken(path, 0);
    path = tapToken(path, 1);
    path = tapToken(path, 1);
    assert.deepEqual(path, [0]);
    path = tapToken(path, 0);
    assert.deepEqual(path, []);
  });

  it("a typed letter takes the first unused token showing it", () => {
    const order = initialOrder(6);
    let path: Path = [];
    for (const letter of "LETTER") {
      const token = tokenForLetter(letter, LETTER, order, path);
      assert.notEqual(token, null, `no token left for ${letter}`);
      path = [...path, token!];
    }
    assert.equal(pathWord(path, LETTER), "LETTER");
    assert.equal(tokenForLetter("E", LETTER, order, path), null, "a third E isn't there");
    assert.equal(tokenForLetter("Z", LETTER, order, []), null);
  });

  it("follows the wheel's order after a shuffle", () => {
    const order = [4, 3, 2, 1, 0, 5];
    assert.equal(tokenForLetter("e", LETTER, order, []), 4);
  });
});

describe("shuffle", () => {
  it("moves the tokens and keeps every one", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const before = initialOrder(6);
    const after = shuffleOrder(before, random);
    assert.notDeepEqual(after, before);
    assert.deepEqual([...after].sort(), before);
    assert.ok(validOrder(after, 6));
  });

  it("still moves them with a broken random", () => {
    const after = shuffleOrder([0, 1, 2], () => 0.999999);
    assert.notDeepEqual(after, [0, 1, 2]);
  });

  it("only trusts a saved order that has every token once", () => {
    assert.equal(validOrder([0, 1, 2, 3], 4), true);
    assert.equal(validOrder([0, 1, 1, 3], 4), false);
    assert.equal(validOrder([0, 1, 2], 4), false);
    assert.equal(validOrder("0123", 4), false);
  });
});

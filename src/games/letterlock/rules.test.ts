/**
 * Letter Lock's rules: the things that fail quietly.
 *
 * A wrong mark on a repeated letter still looks like a plausible row of tiles.
 * A daily word that repeats looks fine for a fortnight. Neither would be
 * caught by playing it, so both are pinned down here.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dailyKey, dailySeed, previousDailyKey } from "../../core/rng.ts";
import {
  EPOCH_DAY,
  FIRST_GUESS_POINTS,
  MAX_GUESSES,
  POINTS_PER_EXTRA_GUESS,
  SPEED_POINTS,
  bestMarks,
  dailyWord,
  isOver,
  isSolved,
  markGuess,
  randomWord,
  scoreSolve,
  speedBonus,
  type Mark,
} from "./rules.ts";
import { ANSWERS } from "./words.ts";

/** "L" locked, "c" close, "." out -- so a row of marks reads at a glance. */
function row(guess: string, answer: string): string {
  const letter: Record<Mark, string> = { locked: "L", close: "c", out: "." };
  return markGuess(guess, answer)
    .map((mark) => letter[mark])
    .join("");
}

describe("marking a guess", () => {
  it("locks every tile of the right word", () => {
    assert.equal(row("plant", "plant"), "LLLLL");
  });

  it("marks a word with nothing in common as all out", () => {
    assert.equal(row("fuzzy", "plant"), ".....");
  });

  it("tells a letter in the right spot from one that's elsewhere", () => {
    // S and A are where "stain" has them. T is in it, one place along. L and
    // E aren't in it at all.
    assert.equal(row("slate", "stain"), "L.Lc.");
  });
});

describe("repeated letters", () => {
  it("LLAMA against HELLO: both Ls are close, because HELLO has two", () => {
    assert.equal(row("llama", "hello"), "cc...");
  });

  it("HELLO against LLAMA: the same two Ls, seen from the other side", () => {
    assert.equal(row("hello", "llama"), "..cc.");
  });

  it("lights up only as many of a letter as the word has", () => {
    // "erase" has two Es. SPEED offers two and both count; the S is in the
    // word but not there.
    assert.equal(row("speed", "erase"), "c.cc.");
    // "elder" has two Es. EERIE offers three: one locked, one close, one out.
    assert.equal(row("eerie", "elder"), "Lcc..");
  });

  it("gives the right spot first claim on a letter", () => {
    // "hello" has two Ls, at 3 and 4. ALLOY's second L is locked; its first
    // takes the other one and is close.
    assert.equal(row("alloy", "hello"), ".cLc.");
    // One R in "robot", and it's locked at the front. The other two Rs in
    // ERROR have nothing left to match, even though they come first.
    assert.equal(row("rarer", "robot"), "L....");
    assert.equal(row("error", "robot"), ".c.L.");
  });

  it("marks a repeated guess letter once when the word has it once", () => {
    // One E in "tiger": the first E of GEESE is close, the other two are out.
    assert.equal(row("geese", "tiger"), "cc...");
    // One S in "trash", and SASSY's third S is sitting on it. That locks, so
    // the two before it are out -- not close, however early they come.
    assert.equal(row("sassy", "trash"), ".c.L.");
  });

  it("never marks more of a letter than the answer holds, for every answer", () => {
    for (const answer of ANSWERS.slice(0, 200)) {
      for (const guess of ["geese", "llama", "sassy", "error", "daddy", "poppy"]) {
        const marks = markGuess(guess, answer);
        for (const letter of new Set(guess)) {
          const lit = [...guess].filter((l, i) => l === letter && marks[i] !== "out").length;
          const held = [...answer].filter((l) => l === letter).length;
          assert.ok(lit <= held, `${guess} vs ${answer}: ${lit} ${letter}s lit, ${held} in the word`);
        }
      }
    }
  });
});

describe("the keyboard", () => {
  it("shows the best thing learned about each letter", () => {
    const best = bestMarks(["slate", "stain"], "stain");
    assert.equal(best.get("s"), "locked");
    assert.equal(best.get("l"), "out");
    // Close in the first guess, locked in the second: locked wins.
    assert.equal(best.get("a"), "locked");
    assert.equal(best.get("t"), "locked");
    assert.equal(best.get("z"), undefined);
  });

  it("never downgrades a letter that has been locked", () => {
    // The E is locked by "tiger", then only close in "eaten".
    assert.equal(bestMarks(["tiger", "eaten"], "tiger").get("e"), "locked");
  });

  it("doesn't call a letter out when one copy of it was close", () => {
    // GEESE against TIGER: the second and third E are out, the first is close.
    assert.equal(bestMarks(["geese"], "tiger").get("e"), "close");
  });
});

describe("the end of a game", () => {
  it("is solved only when the last guess is the word", () => {
    assert.equal(isSolved([], "plant"), false);
    assert.equal(isSolved(["slate"], "plant"), false);
    assert.equal(isSolved(["slate", "plant"], "plant"), true);
  });

  it("is over when solved or out of tries, and not before", () => {
    const wrong = new Array<string>(MAX_GUESSES).fill("slate");
    assert.equal(isOver(wrong.slice(0, MAX_GUESSES - 1), "plant"), false);
    assert.equal(isOver(wrong, "plant"), true);
    assert.equal(isOver(["plant"], "plant"), true);
  });
});

describe("the daily word", () => {
  it("is the same for the same day, whatever the time", () => {
    const morning = dailySeed(new Date(2026, 9, 2, 7, 30));
    const bedtime = dailySeed(new Date(2026, 9, 2, 20, 45));
    assert.equal(dailyWord(morning), dailyWord(bedtime));
  });

  it("changes at local midnight, in step with the board id", () => {
    const before = new Date(2026, 9, 2, 23, 59, 59);
    const after = new Date(2026, 9, 3, 0, 0, 1);
    assert.notEqual(dailyKey(before), dailyKey(after));
    assert.equal(dailySeed(after), dailySeed(before) + 1);
    assert.notEqual(dailyWord(dailySeed(before)), dailyWord(dailySeed(after)));
  });

  it("starts its schedule on the day the game shipped", () => {
    assert.equal(dailySeed(new Date(2026, 9, 1, 12)), EPOCH_DAY);
  });

  it("uses every answer exactly once before any word comes back", () => {
    const seen = new Set<string>();
    for (let i = 0; i < ANSWERS.length; i += 1) seen.add(dailyWord(EPOCH_DAY + i));
    assert.equal(seen.size, ANSWERS.length);
  });

  it("has more than two years of words", () => {
    assert.ok(ANSWERS.length >= 750, `only ${ANSWERS.length} answers`);
  });

  it("isn't simply the list in alphabetical order", () => {
    const first = Array.from({ length: 20 }, (_, i) => dailyWord(EPOCH_DAY + i));
    assert.notDeepEqual(first, ANSWERS.slice(0, 20));
    assert.notDeepEqual(first, [...first].sort());
  });

  it("reshuffles for the second lap, without repeating across the join", () => {
    const words = ["apple", "bread", "chair", "dream", "eagle", "flame", "grape"];
    const lap = (n: number) =>
      Array.from({ length: words.length }, (_, i) => dailyWord(EPOCH_DAY + n * words.length + i, words));

    for (let n = -2; n < 40; n += 1) {
      const order = lap(n);
      assert.equal(new Set(order).size, words.length, `lap ${n} repeats a word`);
      assert.notEqual(order[0], lap(n - 1)[words.length - 1], `lap ${n} opens on yesterday's word`);
    }
    assert.notDeepEqual(lap(0), lap(1));
  });

  it("still gives a word for days before the schedule began", () => {
    assert.ok(ANSWERS.includes(dailyWord(EPOCH_DAY - 1)));
    assert.ok(ANSWERS.includes(dailyWord(EPOCH_DAY - 5000)));
  });
});

describe("the day before", () => {
  it("steps back across a month and a year", () => {
    assert.equal(previousDailyKey("2026-10-02"), "2026-10-01");
    assert.equal(previousDailyKey("2026-10-01"), "2026-09-30");
    assert.equal(previousDailyKey("2027-01-01"), "2026-12-31");
    assert.equal(previousDailyKey("2028-03-01"), "2028-02-29");
  });
});

describe("a random word", () => {
  it("comes from the answers", () => {
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      assert.ok(ANSWERS.includes(randomWord(() => r)));
    }
  });

  it("is never the word it was told to avoid", () => {
    const words = ["apple", "bread", "chair"];
    for (let i = 0; i < 30; i += 1) {
      assert.notEqual(randomWord(() => i / 30, "bread", words), "bread");
    }
  });
});

describe("scoring", () => {
  it("pays 1500 for a first-guess solve and 200 less for each guess after", () => {
    const slow = 10_000;
    assert.equal(FIRST_GUESS_POINTS, 1500);
    assert.equal(POINTS_PER_EXTRA_GUESS, 200);
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((guesses) => scoreSolve(guesses, slow)),
      [1500, 1300, 1100, 900, 700, 500],
    );
  });

  it("adds a speed bonus that fades and never goes negative", () => {
    assert.equal(speedBonus(0), SPEED_POINTS);
    assert.equal(speedBonus(60), SPEED_POINTS);
    assert.ok(speedBonus(200) > 0 && speedBonus(200) < SPEED_POINTS);
    assert.equal(speedBonus(360), 0);
    assert.equal(speedBonus(100_000), 0);
    assert.equal(scoreSolve(1, 0), 1700);
  });

  it("always values a saved guess above any amount of hurrying", () => {
    for (let guesses = 1; guesses < MAX_GUESSES; guesses += 1) {
      assert.ok(scoreSolve(guesses, 100_000) >= scoreSolve(guesses + 1, 0));
    }
  });

  it("always pays something for a solve", () => {
    assert.ok(scoreSolve(MAX_GUESSES, 100_000) > 0);
  });
});

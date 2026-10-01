/**
 * What Letter Lock keeps between sessions: the saved attempt and the streak.
 *
 * The attempt is read back from localStorage, where it may have been written
 * by an older build or mangled by hand, and resuming from it is what makes
 * "only the first attempt counts" true. So what it will and won't accept is
 * worth pinning down.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceStreak,
  breakStreak,
  liveStreak,
  parseDailyAttempt,
} from "./progress.ts";

const TODAY = "2026-10-02";

describe("a saved attempt", () => {
  it("comes back as it was saved, mid-game", () => {
    const stored = { date: TODAY, answer: "plant", guesses: ["mouse", "tiger"], seconds: 41.5, result: null };
    assert.deepEqual(parseDailyAttempt(JSON.parse(JSON.stringify(stored)), TODAY), stored);
  });

  it("comes back with its result once finished", () => {
    const stored = {
      date: TODAY,
      answer: "plant",
      guesses: ["mouse", "plant"],
      seconds: 60,
      result: { solved: true, guesses: 2, score: 1500, seconds: 60 },
    };
    assert.deepEqual(parseDailyAttempt(stored, TODAY), stored);
  });

  it("is ignored on any other day, so yesterday's guesses can't leak into today", () => {
    const stored = { date: "2026-10-01", answer: "plant", guesses: ["mouse"], seconds: 9, result: null };
    assert.equal(parseDailyAttempt(stored, TODAY), null);
  });

  it("is ignored when it isn't shaped like one", () => {
    const good = { date: TODAY, answer: "plant", guesses: ["mouse"], seconds: 9, result: null };
    for (const bad of [
      null,
      "plant",
      {},
      { ...good, answer: undefined },
      { ...good, answer: "plants" },
      { ...good, guesses: "mouse" },
      { ...good, guesses: ["mouse", 7] },
      { ...good, guesses: ["MOUSE"] },
      { ...good, guesses: ["mice"] },
      { ...good, guesses: new Array<string>(7).fill("mouse") },
    ]) {
      assert.equal(parseDailyAttempt(bad, TODAY), null, JSON.stringify(bad));
    }
  });

  it("treats a missing clock as zero rather than as not-a-number", () => {
    const stored = { date: TODAY, answer: "plant", guesses: [], result: null };
    assert.equal(parseDailyAttempt(stored, TODAY)?.seconds, 0);
  });
});

describe("the streak", () => {
  it("starts at one", () => {
    assert.deepEqual(advanceStreak({ last: "", count: 0 }, TODAY, "2026-10-01"), { last: TODAY, count: 1 });
  });

  it("grows when yesterday was solved", () => {
    assert.deepEqual(advanceStreak({ last: "2026-10-01", count: 4 }, TODAY, "2026-10-01"), {
      last: TODAY,
      count: 5,
    });
  });

  it("doesn't count the same day twice", () => {
    const streak = { last: TODAY, count: 5 };
    assert.deepEqual(advanceStreak(streak, TODAY, "2026-10-01"), streak);
  });

  it("starts again after a skipped day, and stops showing once it's broken", () => {
    const stale = { last: "2026-09-29", count: 9 };
    assert.equal(liveStreak(stale, TODAY, "2026-10-01"), 0);
    assert.equal(advanceStreak(stale, TODAY, "2026-10-01").count, 1);
  });

  it("is reset by a miss, and the next day's solve starts a new one", () => {
    const missed = breakStreak(TODAY);
    assert.equal(liveStreak(missed, TODAY, "2026-10-01"), 0);
    // Tomorrow, with today as its yesterday.
    assert.equal(liveStreak(missed, "2026-10-03", TODAY), 0);
    assert.deepEqual(advanceStreak(missed, "2026-10-03", TODAY), { last: "2026-10-03", count: 1 });
  });

  it("still shows today's streak after today's solve, and tomorrow before playing", () => {
    const solved = { last: TODAY, count: 3 };
    assert.equal(liveStreak(solved, TODAY, "2026-10-01"), 3);
    assert.equal(liveStreak(solved, "2026-10-03", TODAY), 3);
  });
});

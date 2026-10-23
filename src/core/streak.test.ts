/**
 * The daily streak's rules, played out over real-looking weeks.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dailyKey } from "./rng.ts";
import {
  addFinish,
  type DayLog,
  MAX_SHIELDS,
  nextDailyKey,
  nextMilestone,
  parseDayLog,
  streakState,
} from "./streak.ts";

/** `dailyKey()` for day `n` of a run starting 1 Oct 2026. */
const day = (n: number): string => dailyKey(new Date(2026, 9, 1 + n, 12));

function play(log: DayLog, n: number, ...games: string[]): DayLog {
  return games.reduce((next, game) => addFinish(next, game, day(n)), log);
}

/** Two dailies a day for days `from` up to, not including, `to`. */
function playDays(log: DayLog, from: number, to: number): DayLog {
  for (let n = from; n < to; n += 1) log = play(log, n, "letter-lock", "plasma-sort");
  return log;
}

describe("daily streak", () => {
  it("counts a day once two different dailies are done", () => {
    const log = playDays({}, 0, 10);
    const state = streakState(log, day(9));
    assert.equal(state.count, 10);
    assert.equal(state.litToday, true);
    assert.equal(state.atRisk, false);
  });

  it("never counts one game a day", () => {
    let log: DayLog = {};
    for (let n = 0; n < 5; n += 1) log = play(log, n, "letter-lock");
    const state = streakState(log, day(4));
    assert.equal(state.count, 0);
    assert.deepEqual(state.doneToday, ["letter-lock"]);
  });

  it("counts the same game twice as one", () => {
    const log = play({}, 0, "plasma-sort", "plasma-sort");
    assert.equal(streakState(log, day(0)).count, 0);
    assert.equal(log[day(0)]!.length, 1);
  });

  it("holds the streak until today is over, and says it's at risk", () => {
    let log = playDays({}, 0, 4);
    let state = streakState(log, day(4));
    assert.equal(state.count, 4);
    assert.equal(state.atRisk, true);

    log = play(log, 4, "crossword");
    assert.equal(streakState(log, day(4)).count, 4);

    log = play(log, 4, "word-voltage");
    state = streakState(log, day(4));
    assert.equal(state.count, 5);
    assert.equal(state.atRisk, false);
  });

  it("isn't at risk with no streak to lose", () => {
    assert.equal(streakState({}, day(0)).atRisk, false);
  });

  it("earns a shield every seventh day, and spends it on a missed day", () => {
    let log = playDays({}, 0, 8);
    assert.equal(streakState(log, day(7)).shields, 1);

    log = play(log, 9, "letter-lock", "forest-dash");
    const state = streakState(log, day(9));
    assert.equal(state.count, 9, "the covered day keeps the streak but doesn't add to it");
    assert.equal(state.shields, 0);
    assert.deepEqual(state.shieldDays, [day(8)]);
  });

  it("resets on a missed day with no shield", () => {
    let log = playDays({}, 0, 4);
    log = play(log, 5, "letter-lock", "forest-dash");
    assert.equal(streakState(log, day(5)).count, 1);
  });

  it("covers two missed days in a row with two shields", () => {
    let log = playDays({}, 0, 14);
    log = play(log, 16, "riley-slime-shop", "sudoku");
    const state = streakState(log, day(16));
    assert.equal(state.count, 15);
    assert.equal(state.shields, 0);
  });

  it("holds at most two shields", () => {
    const state = streakState(playDays({}, 0, 30), day(29));
    assert.equal(state.count, 30);
    assert.equal(state.shields, MAX_SHIELDS);
  });

  it("lets a puzzle finished after midnight complete the day it was started", () => {
    let log = playDays({}, 0, 3);
    log = play(log, 3, "letter-lock");
    assert.equal(streakState(log, day(4)).count, 0);

    // Started at 23:58 on day 3, finished at 00:03 on day 4: filed under day 3.
    log = addFinish(log, "plasma-sort", day(3));
    assert.equal(streakState(log, day(4)).count, 4);
  });

  it("gives back a shield when the day it covered is filled in late", () => {
    let log = playDays({}, 0, 7);
    log = play(log, 7, "letter-lock");
    assert.equal(streakState(log, day(8)).shields, 0);

    log = addFinish(log, "plasma-sort", day(7));
    assert.equal(streakState(log, day(8)).shields, 1);
  });

  it("starts again at one after a long gap, and remembers the best", () => {
    let log = playDays({}, 0, 7);
    log = play(log, 20, "letter-lock", "plasma-sort");
    const state = streakState(log, day(20));
    assert.equal(state.count, 1);
    assert.equal(state.best, 7);
    assert.equal(state.shields, 0);
  });

  it("ignores days logged in the future", () => {
    const log = playDays({}, 5, 7);
    assert.equal(streakState(log, day(0)).count, 0);
  });

  it("walks across month ends and daylight-saving changes", () => {
    // 1 Oct to 30 Nov takes in the end of October and the clocks going back.
    const log = playDays({}, 0, 61);
    assert.equal(streakState(log, day(60)).count, 61);
    assert.equal(nextDailyKey("2026-10-31"), "2026-11-01");
    assert.equal(nextDailyKey("2026-12-31"), "2027-01-01");
  });

  it("works out a year of play quickly", () => {
    const log = playDays({}, 0, 365);
    const started = performance.now();
    const state = streakState(log, day(364));
    assert.equal(state.count, 365);
    assert.ok(performance.now() - started < 50);
    assert.ok(JSON.stringify(log).length < 30_000);
  });
});

describe("day log on disk", () => {
  it("keeps good days and drops anything else", () => {
    const log = parseDayLog({
      "2026-10-01": ["letter-lock", "plasma-sort", "letter-lock", 4, ""],
      "2026-10-02": [],
      "yesterday": ["crossword"],
      "2026-10-03": "letter-lock",
    });
    assert.deepEqual(log, { "2026-10-01": ["letter-lock", "plasma-sort"] });
  });

  it("survives nothing at all", () => {
    assert.deepEqual(parseDayLog(null), {});
    assert.deepEqual(parseDayLog([1, 2]), {});
    assert.deepEqual(parseDayLog("{}"), {});
  });
});

describe("trophies", () => {
  it("points at the next one up", () => {
    assert.equal(nextMilestone(0), 3);
    assert.equal(nextMilestone(3), 7);
    assert.equal(nextMilestone(29), 30);
    assert.equal(nextMilestone(365), null);
  });
});

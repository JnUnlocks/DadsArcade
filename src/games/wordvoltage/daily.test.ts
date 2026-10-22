/**
 * Daily Charge's calendar: New York's date, whatever the phone's own zone,
 * across midnight and both daylight-saving changes.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dailyDate, dailyDateByRule, dailyPuzzleId, lastDailyDate, longDate, shareText } from "./daily.ts";
import { attemptKey } from "./save.ts";
import type { Pack } from "./types.ts";

describe("the daily date", () => {
  it("turns over at midnight in New York, not UTC", () => {
    // 11:30 p.m. EDT on Oct 21 is already Oct 22 in UTC.
    assert.equal(dailyDate(new Date("2026-10-22T03:30:00Z")), "2026-10-21");
    assert.equal(dailyDate(new Date("2026-10-22T04:00:00Z")), "2026-10-22");
    // In winter (EST) the turn is an hour later in UTC.
    assert.equal(dailyDate(new Date("2026-12-25T04:59:00Z")), "2026-12-24");
    assert.equal(dailyDate(new Date("2026-12-25T05:00:00Z")), "2026-12-25");
  });

  it("is right on the days the clocks change", () => {
    // Clocks go back at 2 a.m. EDT on Sunday Nov 1, 2026.
    assert.equal(dailyDate(new Date("2026-11-01T05:30:00Z")), "2026-11-01");
    assert.equal(dailyDate(new Date("2026-11-02T04:59:00Z")), "2026-11-01");
    assert.equal(dailyDate(new Date("2026-11-02T05:00:00Z")), "2026-11-02");
    // Clocks go forward at 2 a.m. EST on Sunday Mar 14, 2027.
    assert.equal(dailyDate(new Date("2027-03-14T04:59:00Z")), "2027-03-13");
    assert.equal(dailyDate(new Date("2027-03-14T05:00:00Z")), "2027-03-14");
    assert.equal(dailyDate(new Date("2027-03-15T03:59:00Z")), "2027-03-14");
    assert.equal(dailyDate(new Date("2027-03-15T04:00:00Z")), "2027-03-15");
  });

  it("is the same for a family member anywhere at the same moment", () => {
    // The answer depends only on the instant, never on the device's zone:
    // a Date is an instant, and dailyDate reads it through New York's
    // calendar. Here's the same instant written three ways.
    const instant = Date.UTC(2026, 9, 21, 12);
    for (const written of ["2026-10-21T12:00:00Z", "2026-10-21T05:00:00-07:00", "2026-10-21T22:00:00+10:00"]) {
      assert.equal(new Date(written).getTime(), instant);
      assert.equal(dailyDate(new Date(written)), "2026-10-21");
    }
  });

  it("works without Intl time zones, by the daylight-saving rule", () => {
    // Every hour for three years: the rule and Intl must agree.
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2029, 0, 1);
    for (let ms = start; ms < end; ms += 3_600_000) {
      const at = new Date(ms);
      assert.equal(dailyDateByRule(at), dailyDate(at), at.toISOString());
    }
  });
});

describe("the daily calendar", () => {
  const pack = {
    version: "1",
    tutorial: "t",
    campaign: { family: [], challenge: [] },
    puzzles: {
      "fd-001": { id: "fd-001", difficulty: "family", letters: "TRSA", words: [], bonus: [] },
      "cd-001": { id: "cd-001", difficulty: "challenge", letters: "TRSAE", words: [], bonus: [] },
    },
    daily: { "2026-10-21": { family: "fd-001", challenge: "cd-001" } },
  } as unknown as Pack;

  it("gives each path its own puzzle for the day", () => {
    assert.equal(dailyPuzzleId(pack, "2026-10-21", "family"), "fd-001");
    assert.equal(dailyPuzzleId(pack, "2026-10-21", "challenge"), "cd-001");
  });

  it("has nothing, rather than an old puzzle, for a day it doesn't cover", () => {
    assert.equal(dailyPuzzleId(pack, "2026-10-22", "family"), null);
    assert.equal(dailyPuzzleId(pack, "2026-10-20", "challenge"), null);
    assert.equal(lastDailyDate(pack), "2026-10-21");
  });

  it("keeps an attempt on the date it began, past midnight", () => {
    // A board started at 11:58 p.m. is saved under its own date; the next
    // day's daily is a different attempt, so nothing is replaced mid-swipe.
    const started = dailyDate(new Date("2026-10-22T03:58:00Z"));
    const later = dailyDate(new Date("2026-10-22T04:03:00Z"));
    assert.equal(started, "2026-10-21");
    assert.equal(later, "2026-10-22");
    assert.notEqual(
      attemptKey("daily", "family", "fd-001", "1", started),
      attemptKey("daily", "family", "fd-001", "1", later),
    );
  });
});

describe("sharing a result", () => {
  it("sends the result and the link, never the words", () => {
    const text = shareText(
      { date: "2026-10-21", difficulty: "family", stars: 3, hints: 0, bonusWords: 3 },
      "https://play.example/?play=word-voltage",
    );
    assert.equal(
      text,
      [
        "⚡ Dad's Arcade · Word Voltage",
        "Daily Charge · Oct 21, 2026 · Family",
        "⭐⭐⭐ · 0 hints · 3 bonus words",
        "Connect letters. Charge up.",
        "https://play.example/?play=word-voltage",
      ].join("\n"),
    );
  });

  it("says one hint, one bonus word", () => {
    const text = shareText(
      { date: "2027-01-02", difficulty: "challenge", stars: 2, hints: 1, bonusWords: 1 },
      "L",
    );
    assert.match(text, /Challenge/);
    assert.match(text, /⭐⭐ · 1 hint · 1 bonus word\n/);
  });

  it("writes dates the way people do", () => {
    assert.equal(longDate("2026-10-21"), "Oct 21, 2026");
    assert.equal(longDate("not a date"), "not a date");
  });
});

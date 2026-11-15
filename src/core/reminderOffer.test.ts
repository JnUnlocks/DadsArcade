/**
 * When the menu offers a daily reminder (core/reminderOffer.ts).
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_DECLINES, shouldOfferReminder } from "./reminderOffer.ts";

const fresh = { shownOn: "", declines: 0 };
const today = "2026-11-15";
const back = { "2026-11-12": ["letter-lock"], [today]: ["sudoku"] };

describe("the reminder offer", () => {
  it("is made to someone back for another day who just finished a daily", () => {
    assert.equal(shouldOfferReminder(back, today, fresh, false), true);
  });

  it("isn't made on a first day", () => {
    assert.equal(shouldOfferReminder({ [today]: ["sudoku", "letter-lock"] }, today, fresh, false), false);
  });

  it("waits until a daily is finished today", () => {
    assert.equal(shouldOfferReminder({ "2026-11-12": ["a"], "2026-11-13": ["b"] }, today, fresh, false), false);
  });

  it("is made once a day at most", () => {
    assert.equal(shouldOfferReminder(back, today, { shownOn: today, declines: 0 }, false), false);
    assert.equal(shouldOfferReminder(back, today, { shownOn: "2026-11-14", declines: 1 }, false), true);
  });

  it("stops after being turned down enough times", () => {
    assert.equal(shouldOfferReminder(back, today, { shownOn: "", declines: MAX_DECLINES }, false), false);
  });

  it("isn't made once reminders are on", () => {
    assert.equal(shouldOfferReminder(back, today, fresh, true), false);
  });
});

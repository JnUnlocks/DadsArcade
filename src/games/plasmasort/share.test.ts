/**
 * What a shared Plasma Sort result says -- and, as importantly, what it doesn't.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dailyShareText, shortDate } from "./share.ts";

const LINK = "https://example.test/?play=plasma-sort";

describe("dailyShareText", () => {
  it("shows a perfect solve as a clean rainbow with three stars", () => {
    const text = dailyShareText({ score: 1180, pours: 14, par: 14, seconds: 161 }, "2026-10-01", 0, LINK);
    assert.equal(
      text,
      [
        "Dad's Arcade · Plasma Sort · Oct 1",
        "🟥🟧🟨🟩🟦🟪",
        "⭐⭐⭐ 14 pours, par 14 · 2:41",
        LINK,
      ].join("\n"),
    );
  });

  it("adds one black square per pour over par", () => {
    const text = dailyShareText({ score: 950, pours: 17, par: 14, seconds: 75 }, "2026-10-01", 0, LINK);
    const lines = text.split("\n");
    assert.equal(lines[1], "🟥🟧🟨🟩🟦🟪⬛⬛⬛");
    assert.equal(lines[2], "⭐⭐ 17 pours, par 14 · 1:15");
  });

  it("caps the tail so it fits on one line", () => {
    const text = dailyShareText({ score: 100, pours: 40, par: 14, seconds: 600 }, "2026-10-01", 0, LINK);
    assert.equal(text.split("\n")[1], "🟥🟧🟨🟩🟦🟪" + "⬛".repeat(10) + "+");
  });

  it("mentions a streak only once there is one", () => {
    const result = { score: 1000, pours: 15, par: 14, seconds: 90 };
    assert.ok(!dailyShareText(result, "2026-10-01", 1, LINK).includes("streak"));
    assert.ok(dailyShareText(result, "2026-10-01", 5, LINK).includes("🔥 5-day streak"));
  });

  it("ends with the link, so chat apps preview it", () => {
    const text = dailyShareText({ score: 1000, pours: 15, par: 14, seconds: 90 }, "2026-10-01", 3, LINK);
    assert.ok(text.endsWith(`\n${LINK}`));
  });
});

describe("shortDate", () => {
  it("formats a local date key for a chat", () => {
    assert.equal(shortDate("2026-10-01"), "Oct 1");
    assert.equal(shortDate("2026-12-25"), "Dec 25");
  });

  it("falls back to the key rather than printing nonsense", () => {
    assert.equal(shortDate("garbage"), "garbage");
  });
});

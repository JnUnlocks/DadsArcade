import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EXISTING,
  daysBetween,
  installKind,
  isNewcomer,
  suggestGames,
  triedCount,
} from "./welcome.ts";

describe("isNewcomer", () => {
  it("is true on the first day, before any game", () => {
    assert.equal(isNewcomer("2026-10-29", "2026-10-29", {}), true);
  });

  it("is never true for a phone that had the arcade already", () => {
    assert.equal(isNewcomer(EXISTING, "2026-10-29", {}), false);
  });

  it("ends after a week", () => {
    assert.equal(isNewcomer("2026-10-22", "2026-10-28", {}), true);
    assert.equal(isNewcomer("2026-10-22", "2026-10-29", {}), false);
  });

  it("ends once three different cabinets have been opened", () => {
    assert.equal(isNewcomer("2026-10-29", "2026-10-29", { a: 4, b: 1 }), true);
    assert.equal(isNewcomer("2026-10-29", "2026-10-29", { a: 1, b: 1, c: 1 }), false);
  });

  it("ignores a clock set backwards and anything that isn't a day", () => {
    assert.equal(isNewcomer("2026-10-29", "2026-10-20", {}), false);
    assert.equal(isNewcomer("", "2026-10-29", {}), false);
  });
});

describe("daysBetween and triedCount", () => {
  it("counts across a month end", () => {
    assert.equal(daysBetween("2026-10-30", "2026-11-02"), 3);
  });

  it("counts only cabinets actually opened", () => {
    assert.equal(triedCount({ a: 2, b: 0, c: 1 }), 2);
  });
});

describe("suggestGames", () => {
  const games = [
    { id: "plasma-sort" },
    { id: "letter-lock" },
    { id: "word-finder" },
    { id: "black-disc" },
    { id: "word-voltage", beta: true },
    { id: "snake" },
    { id: "starfighter" },
  ];

  it("follows the arcade order and skips what has been played", () => {
    assert.deepEqual(
      suggestGames(games, { "plasma-sort": 1 }, "plasma-sort").map((g) => g.id),
      ["letter-lock", "snake"],
    );
  });

  it("never suggests the helper, the party game, BETA, or the game just played", () => {
    const ids = suggestGames(games, {}, "letter-lock", 10).map((g) => g.id);
    assert.deepEqual(ids, ["plasma-sort", "snake", "starfighter"]);
  });

  it("returns fewer, not repeats, when little is left", () => {
    const played = { "plasma-sort": 1, "letter-lock": 1, snake: 1 };
    assert.deepEqual(suggestGames(games, played, null).map((g) => g.id), ["starfighter"]);
  });
});

describe("installKind", () => {
  const base = { userAgent: "Mozilla/5.0 (iPhone) Safari", standalone: false, canPrompt: false, ios: true };

  it("offers nothing once on the home screen", () => {
    assert.equal(installKind({ ...base, standalone: true }), null);
  });

  it("spots Facebook's and Instagram's own browsers", () => {
    assert.equal(installKind({ ...base, userAgent: "Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/480.0]" }), "in-app");
    assert.equal(installKind({ ...base, userAgent: "Mozilla/5.0 Instagram 300.0" }), "in-app");
  });

  it("uses Android's own dialog when it has offered one", () => {
    assert.equal(installKind({ ...base, ios: false, canPrompt: true }), "prompt");
  });

  it("explains the Share menu on an iPhone", () => {
    assert.equal(installKind(base), "ios");
  });

  it("offers nothing on a desktop browser", () => {
    assert.equal(installKind({ ...base, ios: false, userAgent: "Mozilla/5.0 (Windows NT 10.0)" }), null);
  });
});

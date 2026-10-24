/**
 * The save and the reward ledger: progress survives a reload, rewards are
 * given once however many times a finish is recorded, two tabs merge
 * instead of overwriting, and a broken save never breaks the game.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BADGES, boltsIn, circuitLine, COSMETICS, describeNew, firstLine } from "./rewards.ts";
import {
  attemptKey,
  bonusIdentity,
  creditBonus,
  findAttempt,
  freshSave,
  mergeSaves,
  recordFinish,
  sanitize,
  SAVE_KEY,
  SaveStore,
  type Save,
  type StorageLike,
} from "./save.ts";

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("SecurityError");
  }
  setItem(): void {
    throw new Error("QuotaExceededError");
  }
  removeItem(): void {
    throw new Error("SecurityError");
  }
}

const IDS = Array.from({ length: 40 }, (_, i) => `f-${String(i + 1).padStart(3, "0")}`);
const NOW = new Date("2026-10-21T15:00:00Z");

function finish(save: Save, id: string, stars: number) {
  return recordFinish(save, {
    mode: "campaign",
    difficulty: "family",
    puzzleId: id,
    stars,
    hints: 3 - stars,
    bonus: 0,
    campaignIds: IDS,
    now: NOW,
  });
}

describe("finishing a level", () => {
  it("earns a bolt the first time and nothing the second", () => {
    const first = finish(freshSave(), "f-001", 2);
    assert.deepEqual(first.earned, [firstLine("family", "f-001")]);
    const again = finish(first.save, "f-001", 2);
    assert.deepEqual(again.earned, []);
    assert.equal(boltsIn(again.save.ledger), 1);
  });

  it("keeps the best stars across replays, and the first finish time", () => {
    let save = finish(freshSave(), "f-001", 1).save;
    const firstAt = save.campaign.family["f-001"]!.at;
    save = recordFinish(save, {
      mode: "campaign",
      difficulty: "family",
      puzzleId: "f-001",
      stars: 3,
      hints: 0,
      bonus: 0,
      campaignIds: IDS,
      now: new Date("2026-10-25T10:00:00Z"),
    }).save;
    save = finish(save, "f-001", 2).save;
    assert.equal(save.campaign.family["f-001"]!.stars, 3);
    assert.equal(save.campaign.family["f-001"]!.at, firstAt);
  });

  it("completes a circuit on its twentieth level, once", () => {
    let save = freshSave();
    const earned: string[] = [];
    for (const id of IDS.slice(0, 20)) {
      const result = finish(save, id, 3);
      save = result.save;
      earned.push(...result.earned);
    }
    assert.ok(earned.includes(circuitLine("family", 0)));
    assert.ok(!earned.includes(circuitLine("family", 1)));
    assert.deepEqual(finish(save, "f-007", 3).earned, []);
    const ledger = new Set(save.ledger);
    assert.ok(BADGES.find((b) => b.id === "first-spark")!.earned(ledger));
    assert.ok(BADGES.find((b) => b.id === "family-starter")!.earned(ledger));
    assert.ok(!BADGES.find((b) => b.id === "challenge-starter")!.earned(ledger));
    assert.ok(COSMETICS.find((c) => c.id === "starter")!.unlocked(ledger));
  });

  it("keeps the daily apart from the campaign", () => {
    const result = recordFinish(freshSave(), {
      mode: "daily",
      difficulty: "challenge",
      puzzleId: "cd-001",
      stars: 3,
      hints: 0,
      bonus: 4,
      date: "2026-10-21",
      now: NOW,
    });
    assert.deepEqual(result.earned, ["daily:2026-10-21:challenge"]);
    assert.deepEqual(result.save.campaign.challenge, {});
    assert.equal(result.save.daily["2026-10-21:challenge"]!.bonus, 4);
    const again = recordFinish(result.save, {
      mode: "daily",
      difficulty: "challenge",
      puzzleId: "cd-001",
      stars: 1,
      hints: 5,
      bonus: 0,
      date: "2026-10-21",
      now: NOW,
    });
    assert.deepEqual(again.earned, [], "a second finish of the same daily earns nothing");
    assert.equal(again.save.daily["2026-10-21:challenge"]!.stars, 3, "and doesn't lower the best");
  });

  it("gives the tutorial no campaign reward at all", () => {
    const result = recordFinish(freshSave(), {
      mode: "tutorial",
      difficulty: "family",
      puzzleId: "tutorial",
      stars: 3,
      hints: 0,
      bonus: 0,
      now: NOW,
    });
    assert.deepEqual(result.earned, []);
    assert.equal(result.save.tutorial.done, true);
    assert.equal(boltsIn(result.save.ledger), 0);
  });

  it("describes new rewards for the result card", () => {
    const before = new Set<string>();
    assert.deepEqual(describeNew([firstLine("family", "f-001")], before), [
      "+1 bolt",
      "Badge: First Spark",
    ]);
  });
});

describe("bonus words", () => {
  it("credits each word once per puzzle, and a bolt every five", () => {
    let save = freshSave();
    const identity = bonusIdentity("campaign", "f-001");
    const earned: string[] = [];
    for (const word of ["ART", "ARTS", "ART", "RATS", "TARS", "TSAR", "ARTS"]) {
      const result = creditBonus(save, identity, word);
      save = result.save;
      earned.push(...result.earned);
    }
    assert.deepEqual(save.credited[identity], ["ART", "ARTS", "RATS", "TARS", "TSAR"]);
    assert.deepEqual(earned, [`bonus:${identity}:5`]);
  });

  it("keeps a daily's credit to its own date", () => {
    assert.equal(bonusIdentity("daily", "fd-001", "2026-10-21"), "daily:2026-10-21:fd-001");
    assert.notEqual(bonusIdentity("daily", "fd-001", "2026-10-21"), bonusIdentity("campaign", "fd-001"));
  });
});

describe("two tabs", () => {
  it("merge permanent facts instead of overwriting them", () => {
    const a = finish(finish(freshSave(), "f-001", 3).save, "f-002", 1).save;
    const b = finish(freshSave(), "f-002", 3).save;
    const merged = mergeSaves(a, b);
    assert.equal(merged.campaign.family["f-001"]!.stars, 3);
    assert.equal(merged.campaign.family["f-002"]!.stars, 3);
    assert.equal(boltsIn(merged.ledger), 2, "f-002's bolt is counted once");
  });

  it("let the newer attempt and preferences win", () => {
    const key = attemptKey("campaign", "family", "f-001", "1");
    const older = freshSave();
    older.attempts[key] = attempt(["STAR"], 10);
    older.prefs = { ...older.prefs, inputMode: "tap", updatedAt: 50 };
    const newer = freshSave();
    newer.attempts[key] = attempt(["STAR", "TAR"], 20);
    newer.prefs = { ...newer.prefs, inputMode: "swipe", updatedAt: 40 };
    const merged = mergeSaves(older, newer);
    assert.deepEqual(merged.attempts[key]!.solved, ["STAR", "TAR"]);
    assert.equal(merged.prefs.inputMode, "tap");
  });

  it("a stale tab's write keeps the other tab's progress", () => {
    const storage = new MemoryStorage();
    const tabA = new SaveStore(storage);
    const tabB = new SaveStore(storage);
    tabA.write(finish(tabA.current, "f-001", 3).save);
    // Tab B never refreshed, and now finishes a different level.
    const written = tabB.write(finish(tabB.current, "f-002", 2).save);
    assert.ok(written.campaign.family["f-001"]);
    assert.ok(written.campaign.family["f-002"]);
    const reloaded = new SaveStore(storage).current;
    assert.equal(boltsIn(reloaded.ledger), 2);
  });
});

describe("a new pack", () => {
  it("carries on an attempt begun under the old one", () => {
    const save = freshSave();
    save.attempts[attemptKey("campaign", "challenge", "c-042", "1")] = attempt(["STAR"], 10);
    assert.deepEqual(findAttempt(save, "campaign", "challenge", "c-042")?.solved, ["STAR"]);
    // Once it's saved again under the new pack, that copy is the one used.
    save.attempts[attemptKey("campaign", "challenge", "c-042", "2")] = attempt(["STAR", "TAR"], 20);
    assert.deepEqual(findAttempt(save, "campaign", "challenge", "c-042")?.solved, ["STAR", "TAR"]);
    assert.equal(findAttempt(save, "campaign", "challenge", "c-04"), undefined);
    assert.equal(findAttempt(save, "campaign", "family", "c-042"), undefined);
  });

  it("keeps a daily's attempt to its own date", () => {
    const save = freshSave();
    save.attempts[attemptKey("daily", "family", "fd-004", "1", "2026-10-24")] = attempt(["CAT"], 5);
    assert.ok(findAttempt(save, "daily", "family", "fd-004", "2026-10-24"));
    assert.equal(findAttempt(save, "daily", "family", "fd-004", "2026-10-25"), undefined);
  });

  it("has badges for Challenge's new circuits and none Family can't earn", () => {
    assert.ok(BADGES.some((b) => b.id === "challenge-max"));
    assert.ok(!BADGES.some((b) => b.id === "family-max"));
    let save = freshSave();
    const ids = Array.from({ length: 200 }, (_, i) => `c-${String(i + 1).padStart(3, "0")}`);
    for (const id of ids.slice(100, 120)) {
      save = recordFinish(save, {
        mode: "campaign",
        difficulty: "challenge",
        puzzleId: id,
        stars: 3,
        hints: 0,
        bonus: 0,
        campaignIds: ids,
        now: NOW,
      }).save;
    }
    const ledger = new Set(save.ledger);
    assert.ok(ledger.has(circuitLine("challenge", 5)));
    assert.ok(BADGES.find((b) => b.id === "challenge-laser")!.earned(ledger));
    assert.ok(COSMETICS.find((c) => c.id === "laser")!.unlocked(ledger));
  });
});

describe("storage", () => {
  it("survives a reload", () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    const key = attemptKey("campaign", "family", "f-003", "1");
    const save = structuredClone(store.current);
    save.attempts[key] = attempt(["CAT"], 5);
    save.attempts[key]!.order = [2, 0, 1];
    store.write(save);
    const again = new SaveStore(storage).current;
    assert.deepEqual(again.attempts[key]!.solved, ["CAT"]);
    assert.deepEqual(again.attempts[key]!.order, [2, 0, 1]);
  });

  it("plays on, unsaved, when storage throws", () => {
    const store = new SaveStore(new BrokenStorage());
    assert.equal(store.persistent, false);
    const written = store.write(finish(store.current, "f-001", 3).save);
    assert.ok(written.campaign.family["f-001"], "progress is kept for the session");
    assert.doesNotThrow(() => store.reset());
  });

  it("plays on with no storage at all", () => {
    const store = new SaveStore(null);
    assert.equal(store.persistent, false);
    assert.doesNotThrow(() => store.write(freshSave()));
  });

  it("starts fresh from a save that isn't JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, "{not json");
    assert.deepEqual(new SaveStore(storage).current, freshSave());
  });

  it("keeps the good parts of a damaged save", () => {
    const clean = sanitize({
      prefs: { difficulty: "challenge", inputMode: "sideways", motion: 7 },
      campaign: {
        family: { "f-001": { stars: 3, at: "2026-10-21T00:00:00.000Z" }, "f-002": { stars: 9 } },
        challenge: "lots",
      },
      attempts: { good: attempt(["CAT"], 1), bad: { puzzleId: 4 } },
      ledger: ["first:family:f-001", 12, "first:family:f-001"],
      credited: { "f-001": ["ART", 3] },
    });
    assert.equal(clean.prefs.difficulty, "challenge");
    assert.equal(clean.prefs.inputMode, "swipe");
    assert.equal(clean.prefs.motion, "system");
    assert.deepEqual(Object.keys(clean.campaign.family), ["f-001"]);
    assert.deepEqual(clean.campaign.challenge, {});
    assert.deepEqual(Object.keys(clean.attempts), ["good"]);
    assert.deepEqual(clean.ledger, ["first:family:f-001"]);
    assert.deepEqual(clean.credited["f-001"], ["ART"]);
  });

  it("reset clears Word Voltage and nothing else", () => {
    const storage = new MemoryStorage();
    storage.setItem("hyperdrive.settings", '{"muted":true}');
    const store = new SaveStore(storage);
    store.write(finish(store.current, "f-001", 3).save);
    store.reset();
    assert.equal(storage.getItem(SAVE_KEY), null);
    assert.equal(storage.getItem("hyperdrive.settings"), '{"muted":true}');
  });
});

function attempt(solved: string[], updatedAt: number) {
  return {
    puzzleId: "f-001",
    pack: "1",
    mode: "campaign" as const,
    difficulty: "family" as const,
    solved,
    revealed: [],
    bonus: [],
    hints: 0,
    order: [0, 1, 2],
    completed: false,
    updatedAt,
  };
}

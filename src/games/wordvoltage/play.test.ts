/**
 * A level's rules: what each kind of word does, hints, crossings finishing
 * words by themselves, stars and charge.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  charge,
  FRESH_ATTEMPT,
  hintTarget,
  makeLevel,
  restoreAttempt,
  starsFor,
  submitWord,
  useHint,
  type Attempt,
} from "./play.ts";
import type { Puzzle } from "./types.ts";

const STAR: Puzzle = {
  id: "fixture-star",
  difficulty: "family",
  letters: "TRSA",
  words: [
    { word: "STAR", row: 0, col: 0, dir: "across" },
    { word: "TAR", row: 0, col: 1, dir: "down" },
    { word: "RAT", row: 2, col: 1, dir: "across" },
  ],
  bonus: ["ART", "ARTS", "RATS", "TARS", "TSAR"],
};

function send(level: ReturnType<typeof makeLevel>, attempt: Attempt, ...words: string[]) {
  let current = attempt;
  const outcomes = [];
  for (const word of words) {
    const result = submitWord(level, current, word);
    current = result.attempt;
    outcomes.push(result.outcome);
  }
  return { attempt: current, outcomes };
}

describe("sending a word", () => {
  const level = makeLevel(STAR);

  it("solves a target, and says so once", () => {
    const { attempt, outcomes } = send(level, FRESH_ATTEMPT, "star", "STAR");
    assert.equal(outcomes[0]!.kind, "solved");
    assert.equal(outcomes[1]!.kind, "already");
    assert.deepEqual(attempt.solved, ["STAR"]);
  });

  it("counts a bonus word once, and never a target as a bonus", () => {
    const { attempt, outcomes } = send(level, FRESH_ATTEMPT, "ART", "art", "RAT");
    assert.deepEqual(
      outcomes.map((o) => o.kind),
      ["bonus", "bonus-again", "solved"],
    );
    assert.deepEqual(attempt.bonus, ["ART"]);
    assert.ok(!attempt.bonus.includes("RAT"));
  });

  it("is gentle with everything else", () => {
    const { attempt, outcomes } = send(level, FRESH_ATTEMPT, "SAT", "TAT", "ST", "", "ta-r");
    assert.deepEqual(
      outcomes.map((o) => o.kind),
      ["unknown", "unknown", "short", "unknown", "unknown"],
    );
    assert.deepEqual(attempt, FRESH_ATTEMPT, "a wrong word changes nothing");
  });

  it("finishes the level on the last target, exactly once", () => {
    const { attempt, outcomes } = send(level, FRESH_ATTEMPT, "STAR", "TAR", "RAT", "ARTS");
    assert.equal(outcomes[2]!.kind, "solved");
    assert.equal(outcomes[2]!.kind === "solved" && outcomes[2]!.completed, true);
    assert.equal(outcomes[3]!.kind, "finished", "nothing counts after the finish");
    assert.equal(attempt.completed, true);
    assert.equal(charge(level, attempt), 1);
  });
});

describe("crossings and hints", () => {
  // A board where one word is all crossings: TEA down through the T of
  // TEN, the E of ... built so that solving the crossers spells the middle.
  const GRID: Puzzle = {
    id: "fixture-cross",
    difficulty: "family",
    letters: "TENAS",
    words: [
      { word: "TEN", row: 0, col: 0, dir: "across" },
      { word: "TEA", row: 0, col: 0, dir: "down" },
      { word: "NET", row: 0, col: 2, dir: "down" },
      { word: "AT", row: 2, col: 0, dir: "across" },
    ].filter((p) => p.word.length >= 3) as Puzzle["words"],
    bonus: ["EAT", "ATE"],
  };
  const level = makeLevel(GRID);

  it("finishes a word whose squares a hint uncovers", () => {
    // TEA: T is shared with TEN. Solve TEN, then hint the rest of TEA.
    let attempt = submitWord(level, FRESH_ATTEMPT, "TEN").attempt;
    const first = useHint(level, attempt, 1);
    attempt = first.attempt;
    assert.equal(first.cell, "1,0");
    assert.deepEqual(first.words, []);
    const second = useHint(level, attempt, 1);
    assert.equal(second.cell, "2,0");
    assert.deepEqual(second.words, ["TEA"], "the last hidden square solves it");
    assert.equal(second.attempt.hints, 2);
    assert.ok(second.attempt.solved.includes("TEA"));
  });

  it("prefers the focused word, and otherwise the first unsolved one", () => {
    assert.equal(hintTarget(level, FRESH_ATTEMPT, 2), "0,2");
    assert.equal(hintTarget(level, FRESH_ATTEMPT, null), "0,0");
  });

  it("never charges for a hint with nothing left to show", () => {
    const done = send(level, FRESH_ATTEMPT, "TEN", "TEA", "NET").attempt;
    assert.equal(done.completed, true);
    const result = useHint(level, done);
    assert.equal(result.cell, null);
    assert.equal(result.attempt.hints, 0);
  });

  it("can finish a level with hints alone", () => {
    let attempt = FRESH_ATTEMPT;
    for (let i = 0; i < 20 && !attempt.completed; i += 1) attempt = useHint(level, attempt).attempt;
    assert.equal(attempt.completed, true);
    assert.equal(attempt.hints, level.board.cells.size);
  });
});

describe("stars and charge", () => {
  it("follow the hints used", () => {
    assert.equal(starsFor(0), 3);
    assert.equal(starsFor(1), 2);
    assert.equal(starsFor(2), 2);
    assert.equal(starsFor(3), 1);
    assert.equal(starsFor(12), 1);
  });

  it("charge is solved words over target words, and bonus words don't move it", () => {
    const level = makeLevel(STAR);
    const { attempt } = send(level, FRESH_ATTEMPT, "ARTS", "TSAR", "STAR");
    assert.equal(charge(level, attempt), 1 / 3);
  });
});

describe("restoring a save", () => {
  const level = makeLevel(STAR);

  it("drops what doesn't belong and re-solves what does", () => {
    const restored = restoreAttempt(level, {
      solved: ["STAR", "NOPE", "STAR"],
      revealed: ["1,1", "2,2", "2,3", "9,9"],
      bonus: ["ART", "RAT", "ZZZ"],
      hints: 3,
    });
    // TAR is S-T-A-R's T, plus revealed 1,1 and RAT's R... RAT's squares are
    // 2,1 (unknown), so TAR isn't finished; RAT needs 2,1 too.
    assert.deepEqual(restored.solved, ["STAR"]);
    assert.deepEqual(restored.revealed, ["1,1", "2,2", "2,3"]);
    assert.deepEqual(restored.bonus, ["ART"]);
    assert.equal(restored.hints, 3);
    assert.equal(restored.completed, false);
  });

  it("treats junk as a fresh start", () => {
    assert.deepEqual(restoreAttempt(level, undefined), FRESH_ATTEMPT);
    assert.deepEqual(restoreAttempt(level, { solved: "STAR" as never, hints: -4 }), FRESH_ATTEMPT);
  });
});

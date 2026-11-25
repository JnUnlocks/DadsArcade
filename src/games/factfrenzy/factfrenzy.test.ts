/**
 * Fact Frenzy: every deck deals right answers, the round scores only correct
 * first taps, and each child's bests and prizes are their own.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Rng } from "../../core/rng.ts";
import { DECKS, GRADES, STARTING_DECK, decimal, deckById, decksFor, fraction, numeric, type Fact } from "./decks.ts";
import { HINT_SECONDS, ROUND_SECONDS, Round, clockText } from "./round.ts";
import {
  FURS,
  finishRound,
  newKid,
  nextFur,
  outcomeLine,
  parseSave,
  withKid,
  type Kid,
  type Save,
} from "./profiles.ts";

/** What the fact actually comes to, worked out from its numbers. */
function solve(fact: Fact): number {
  const l = numeric(fact.left);
  const r = numeric(fact.right);
  const value = fact.op === "+" ? l + r : fact.op === "−" ? l - r : fact.op === "×" ? l * r : l / r;
  return fact.blank === "right" ? numeric(fact.result) / l : value;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("fact frenzy decks", () => {
  it("covers every grade, and each grade's starting deck is one of its own", () => {
    for (const grade of GRADES) {
      assert.ok(decksFor(grade).length >= 1, `no deck for ${grade}`);
      assert.equal(deckById(STARTING_DECK[grade])?.grade, grade);
    }
    assert.equal(new Set(DECKS.map((d) => d.id)).size, DECKS.length, "deck ids repeat");
  });

  for (const deck of DECKS) {
    it(`${deck.id} deals right answers among four different choices`, () => {
      const rng = new Rng(7);
      for (let i = 0; i < 3000; i += 1) {
        const fact = deck.make(rng);
        const where = `${deck.id}: ${fact.left} ${fact.op} ${fact.right} = ${fact.result}`;
        assert.ok(close(numeric(fact.answer), solve(fact)), `${where} answer ${fact.answer}`);
        if (fact.blank === "result") assert.equal(fact.answer, fact.result, where);
        assert.equal(fact.choices.length, 4, where);
        assert.ok(fact.choices.includes(fact.answer), `${where} misses its answer`);
        const values = fact.choices.map(numeric);
        assert.equal(new Set(values).size, 4, `${where} offers the same value twice: ${fact.choices}`);
        for (let k = 1; k < values.length; k += 1) assert.ok(values[k - 1]! < values[k]!, `${where} not in order`);
        for (const v of [...values, numeric(fact.left), numeric(fact.right), numeric(fact.result)]) {
          assert.ok(Number.isFinite(v) && v >= 0, `${where} has ${v}`);
        }
        assert.ok(fact.hint.say.length > 0, `${where} has no hint`);
      }
    });
  }

  it("keeps Grade 2's facts inside 20 and Kindergarten's inside 5", () => {
    const rng = new Rng(3);
    for (const [id, max] of [["g2-mix20", 20], ["g1-mix10", 10], ["k-pictures", 5]] as const) {
      for (let i = 0; i < 2000; i += 1) {
        const fact = deckById(id)!.make(rng);
        for (const n of [fact.left, fact.right, fact.result, ...fact.choices]) assert.ok(numeric(n) <= max, `${id}: ${n}`);
      }
    }
  });

  it("shows Kindergarten pictures and every other deck numerals", () => {
    const rng = new Rng(5);
    assert.ok(deckById("k-pictures")!.make(rng).picture);
    assert.equal(deckById("g2-mix20")!.make(rng).picture, undefined);
  });

  it("keeps a slip inside the deck: 14 − 8 never offers 22 in a within-20 deck", () => {
    let offered = false;
    const rng = new Rng(11);
    for (let i = 0; i < 4000 && !offered; i += 1) {
      const fact = deckById("g2-take20")!.make(rng);
      if (fact.key === "14−8") offered = fact.choices.includes("22") || offered;
    }
    assert.equal(offered, false);
  });

  it("writes decimals and fractions one way only", () => {
    assert.equal(decimal(130), "1.3");
    assert.equal(decimal(65), "0.65");
    assert.equal(decimal(5), "0.05");
    assert.equal(decimal(200), "2");
    assert.equal(fraction(2, 4), "1/2");
    assert.equal(fraction(4, 4), "1");
    assert.equal(fraction(6, 12), "1/2");
  });
});

/** A deck that always deals the same fact. */
const oneFact = {
  id: "test",
  grade: "2" as const,
  skill: "Test",
  range: "",
  make: () => ({
    key: "14−8",
    left: "14",
    op: "−" as const,
    right: "8",
    result: "6",
    blank: "result" as const,
    answer: "6",
    choices: ["5", "6", "7", "8"],
    hint: { kind: "frames" as const, op: "−" as const, a: 14, b: 8, say: "Count!" },
  }),
};

describe("fact frenzy round", () => {
  it("scores a right first tap and not a right second one", () => {
    const round = new Round(oneFact, new Rng(1));
    assert.equal(round.tap("6"), "right");
    assert.equal(round.score, 1);
    assert.equal(round.tap("5"), "wrong");
    assert.equal(round.tap("5"), "ignored", "a tried answer is dark");
    assert.equal(round.tap("6"), "fixed");
    assert.equal(round.score, 1);
    assert.equal(round.answered, 2);
    assert.deepEqual(round.missed.map((f) => f.key), ["14−8"]);
  });

  it("stops the clock for a few seconds after a miss, then runs it again", () => {
    const round = new Round(oneFact, new Rng(1));
    round.tick(10);
    assert.equal(round.timeLeft, ROUND_SECONDS - 10);
    round.tap("7");
    assert.ok(round.clockHeld);
    round.tick(HINT_SECONDS - 1);
    assert.equal(round.timeLeft, ROUND_SECONDS - 10);
    round.tick(3);
    assert.equal(round.timeLeft, ROUND_SECONDS - 12);
    assert.equal(round.clockHeld, false);
  });

  it("ends at two minutes and takes no taps after", () => {
    const round = new Round(oneFact, new Rng(1));
    for (let t = 0; t < ROUND_SECONDS * 60 + 5; t += 1) round.tick(1 / 60);
    assert.ok(round.finished);
    assert.equal(round.tap("6"), "ignored");
    assert.equal(round.score, 0);
  });

  it("brings a missed fact back a few facts later", () => {
    const deck = deckById("g2-mix20")!;
    const round = new Round(deck, new Rng(9));
    const missed = round.fact;
    const wrong = missed.choices.find((c) => c !== missed.answer)!;
    round.tap(wrong);
    round.tap(missed.answer);
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      seen.push(round.fact.key);
      round.tap(round.fact.answer);
    }
    assert.ok(seen.includes(missed.key), `${missed.key} never came back: ${seen}`);
  });

  it("doesn't repeat a fact straight away", () => {
    const round = new Round(deckById("g3-times")!, new Rng(2));
    let last = "";
    for (let i = 0; i < 200; i += 1) {
      assert.notEqual(round.fact.key, last);
      last = round.fact.key;
      round.tap(round.fact.answer);
    }
  });

  it("prints the clock as a child reads it", () => {
    assert.equal(clockText(120), "2:00");
    assert.equal(clockText(84), "1:24");
    assert.equal(clockText(0.2), "0:01");
    assert.equal(clockText(0), "0:00");
  });
});

describe("fact frenzy players", () => {
  const riley = () => newKid("r", "  Riley  ", "2", "purple");

  it("starts a player on their grade's deck in overalls", () => {
    const kid = riley();
    assert.equal(kid.name, "Riley");
    assert.equal(kid.deck, "g2-mix20");
    assert.deepEqual(kid.outfits, ["overalls"]);
  });

  it("files a first score, then a record, a tie and a lower one", () => {
    let kid: Kid = riley();
    let step = finishRound(kid, "g2-mix20", 18);
    assert.equal(step.outcome.kind, "first");
    assert.equal(step.outcome.previous, null);
    assert.match(outcomeLine(step.outcome, "Riley"), /first score.*18/);
    kid = step.kid;

    step = finishRound(kid, "g2-mix20", 21);
    assert.equal(step.outcome.kind, "record");
    assert.equal(step.outcome.previous, 18);
    assert.equal(outcomeLine(step.outcome, "Riley"), "Riley, you solved 3 more than your best!");
    kid = step.kid;
    assert.equal(kid.bests["g2-mix20"], 21);

    step = finishRound(kid, "g2-mix20", 21);
    assert.equal(step.outcome.kind, "tie");
    kid = step.kid;
    step = finishRound(kid, "g2-mix20", 15);
    assert.equal(step.outcome.kind, "under");
    assert.equal(step.kid.bests["g2-mix20"], 21, "a lower score never lowers the best");
  });

  it("keeps a separate best for every deck", () => {
    let kid = finishRound(riley(), "g2-mix20", 18).kid;
    const step = finishRound(kid, "g2-mix100", 6);
    assert.equal(step.outcome.kind, "first", "a harder deck sets its own first score");
    kid = step.kid;
    assert.deepEqual(kid.bests, { "g2-mix20": 18, "g2-mix100": 6 });
  });

  const won = (step: { outcome: { prizes: readonly ({ kind: "outfit"; outfit: { id: string } } | { kind: "fur"; fur: { id: string } })[] } }) =>
    step.outcome.prizes.map((p) => (p.kind === "outfit" ? p.outfit.id : p.fur.id));

  it("wins the goggles on the first round and the jacket on the first record", () => {
    let step = finishRound(riley(), "g2-mix20", 18, 2);
    assert.deepEqual(won(step), ["goggles"]);
    step = finishRound(step.kid, "g2-mix20", 17, 2);
    assert.deepEqual(step.outcome.prizes, [], "nothing new for a lower round");
    step = finishRound(step.kid, "g2-mix20", 21, 1);
    assert.deepEqual(won(step), ["jacket", "gray"]);
    step = finishRound(step.kid, "g2-mix20", 25, 1);
    assert.ok(!step.outcome.prizes.some((p) => p.kind === "outfit"), "the jacket is won once");
  });

  it("wins the Math Wizard for 10 or more right with no misses", () => {
    let step = finishRound(riley(), "g2-mix20", 9, 0);
    assert.ok(!won(step).includes("wizard"), "nine isn't enough");
    step = finishRound(step.kid, "g2-mix20", 14, 1);
    assert.ok(!won(step).includes("wizard"), "a miss spoils it");
    step = finishRound(step.kid, "g2-mix20", 10, 0);
    assert.ok(won(step).includes("wizard"));
  });

  it("wins the Rocket Pilot for bests on three different decks", () => {
    let step = finishRound(riley(), "g2-add20", 5, 1);
    step = finishRound(step.kid, "g2-take20", 5, 1);
    assert.ok(!step.kid.outfits.includes("rocket"));
    step = finishRound(step.kid, "g2-take20", 6, 1);
    assert.ok(!won(step).includes("rocket"), "the same deck twice doesn't count");
    step = finishRound(step.kid, "g2-mix100", 3, 1);
    assert.ok(won(step).includes("rocket"));
  });

  it("wins the Arcade Champion on the fifth record", () => {
    let step = finishRound(riley(), "g2-mix20", 1, 1);
    const records: number[] = [];
    for (let score = 2; score <= 6; score += 1) {
      step = finishRound(step.kid, "g2-mix20", score, 1);
      if (won(step).includes("champion")) records.push(step.kid.records);
    }
    assert.deepEqual(records, [5]);
  });

  it("unlocks a fur colour every few rounds, even without a record", () => {
    let kid = riley();
    const won: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const step = finishRound(kid, "g2-mix20", 5);
      kid = step.kid;
      for (const p of step.outcome.prizes) if (p.kind === "fur") won.push(p.fur.id);
    }
    assert.deepEqual(won, FURS.filter((f) => f.rounds > 0).map((f) => f.id));
    assert.equal(nextFur(kid), null);
  });

  it("keeps two children's scores and outfits apart", () => {
    const a = newKid("a", "Riley", "2", "purple");
    const b = newKid("b", "Nathan", "4", "blue");
    let save: Save = { kids: [a, b], current: "a" };
    save = withKid(save, { ...finishRound(a, "g2-mix20", 21).kid, outfit: "goggles" });
    const [ra, rb] = save.kids;
    assert.equal(ra!.bests["g2-mix20"], 21);
    assert.deepEqual(rb!.bests, {});
    assert.equal(ra!.outfit, "goggles");
    assert.equal(rb!.outfit, "overalls");
    assert.equal(rb!.fur, "blue");
    assert.equal(rb!.deck, "g4-mixed");
  });

  it("reads back what it saved, and survives a damaged save", () => {
    const kid = { ...finishRound(riley(), "g2-mix20", 21).kid, outfit: "goggles" as const, fur: "teal" };
    const save: Save = { kids: [kid], current: "r" };
    assert.deepEqual(parseSave(JSON.stringify(save)), save);
    assert.deepEqual(parseSave("{not json"), { kids: [], current: null });
    assert.deepEqual(parseSave(null), { kids: [], current: null });
    const damaged = parseSave(JSON.stringify({ kids: [{ id: "x", name: "Sam", outfit: "cloak", fur: "pink", deck: "gone" }] }));
    const sam = damaged.kids[0]!;
    assert.equal(sam.outfit, "overalls");
    assert.equal(sam.fur, "purple", "a colour not yet won is taken back off");
    assert.equal(sam.deck, "g2-mix20");
    assert.equal(damaged.current, "x");
  });
});

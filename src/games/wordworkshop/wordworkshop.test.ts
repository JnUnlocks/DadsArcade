/**
 * Word Workshop: the words and sentences are sound, a point is only for
 * getting it right on your own the first time, and each child's bests,
 * stamps and outfits are their own -- in the closet Fact Frenzy shares.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Rng } from "../../core/rng.ts";
import { newKid, parseSave, type Kid } from "../factfrenzy/profiles.ts";
import {
  bestKey,
  commitRound,
  emptySave,
  nextStampPrize,
  outcomeLine,
  parseWorkSave,
  startingDeck,
  benchFor,
  type FinishedRound,
  type WorkSave,
} from "./records.ts";
import { spelledOut } from "./speech.ts";
import { BuildTask, FixTask, MODEL_AFTER, type ItemResult } from "./tasks.ts";
import { FIX_DECKS, SPELL_DECKS, choicesFor, deal, fixedParts, sentenceText, trayFor, type SpellWord } from "./words.ts";

const riley = (): Kid => newKid("r", "Riley", "2", "purple");
const nathan = (): Kid => newKid("n", "Nathan", "4", "teal");

/** A round of five with the given number scored on your own. */
function round(id: string, own: number, deckId = "w2-short", mode: "build" | "fix" = "build"): FinishedRound {
  const results: ItemResult[] = Array.from({ length: 5 }, (_, i) => ({ id: `item${i}`, own: i < own }));
  return { id, mode, deckId, grade: "2", results };
}

function play(save: WorkSave, kid: Kid, r: FinishedRound) {
  const done = commitRound(save, kid, r);
  assert.ok(done, "a new round is filed");
  return done;
}

describe("Word Workshop words", () => {
  it("every spelling word is lowercase letters, appears in its sentence, and has a hint", () => {
    for (const deck of SPELL_DECKS) {
      assert.ok(deck.words.length >= 10, `${deck.id} has enough words for a few rounds`);
      assert.equal(new Set(deck.words.map((w) => w.id)).size, deck.words.length, `${deck.id} ids are unique`);
      for (const word of deck.words) {
        assert.match(word.word, /^[a-z]{2,6}$/, word.word);
        assert.ok(new RegExp(`\\b${word.word}\\b`, "i").test(word.sentence), `${word.word} is in "${word.sentence}"`);
        assert.match(word.sentence, /^[A-Z].*[.?!]$/, word.sentence);
        assert.ok(word.hint.length > 10, `${word.word} has a hint`);
      }
    }
  });

  it("every sentence has one fix, a capital, and an ending mark once fixed", () => {
    for (const deck of FIX_DECKS) {
      assert.ok(deck.items.length >= 10, `${deck.id} has enough sentences`);
      assert.equal(new Set(deck.items.map((s) => s.id)).size, deck.items.length);
      for (const item of deck.items) {
        assert.ok(item.at >= 0 && item.at < item.parts.length, item.id);
        assert.notEqual(item.parts[item.at], item.fix, `${item.id} really changes something`);
        assert.ok(!item.others.includes(item.fix), `${item.id}'s wrong choices don't include the fix`);
        assert.equal(new Set([item.fix, ...item.others]).size, item.others.length + 1, `${item.id} choices are distinct`);
        assert.match(item.parts[item.parts.length - 1]!, /^[.?!]?$/, `${item.id} ends with a mark or an empty box`);
        const fixed = sentenceText(fixedParts(item));
        assert.match(fixed, /^[A-Z].*[a-zA-Z][.?!]$/, `${item.id} reads "${fixed}"`);
        assert.ok(item.why.length > 10 && item.look.length > 5);
      }
    }
  });

  it("writes the brief's own example right", () => {
    const dogs = FIX_DECKS.flatMap((d) => d.items).find((s) => s.id === "dogs-is")!;
    assert.equal(sentenceText(dogs.parts), "The dogs is wet.");
    assert.equal(sentenceText(fixedParts(dogs)), "The dogs are wet.");
    const frog = FIX_DECKS.flatMap((d) => d.items).find((s) => s.id === "see-frog")!;
    assert.equal(sentenceText(frog.parts), "I see a frog", "a missing period shows as nothing");
    assert.equal(sentenceText(fixedParts(frog)), "I see a frog.");
  });

  it("deals a tray of the word's letters and two spares that never spell a sound-alike", () => {
    for (const deck of SPELL_DECKS) {
      for (const word of deck.words) {
        for (let seed = 1; seed <= 25; seed += 1) {
          const tiles = trayFor(word, deck.spares, new Rng(seed));
          assert.equal(tiles.length, word.word.length + 2);
          assert.equal(new Set(tiles.map((t) => t.id)).size, tiles.length, "every tile has its own id");
          const spares = [...tiles.map((t) => t.letter)];
          for (const ch of word.word) spares.splice(spares.indexOf(ch), 1);
          assert.equal(spares.length, 2);
          for (const s of spares) assert.ok(!word.word.includes(s), `${word.word}: spare ${s} is not in the word`);
          assert.notEqual(tiles.slice(0, word.word.length).map((t) => t.letter).join(""), word.word, "not already spelled");
          for (const other of word.not ?? []) {
            const left = tiles.map((t) => t.letter);
            const spellable = [...other].every((ch) => {
              const i = left.indexOf(ch);
              if (i < 0) return false;
              left.splice(i, 1);
              return true;
            });
            assert.ok(!spellable, `${word.word}'s tray can't spell ${other}`);
          }
        }
      }
    }
  });

  it("deals five different items, bringing back at most two that needed help", () => {
    const words = SPELL_DECKS[0]!.words;
    for (let seed = 1; seed < 30; seed += 1) {
      const hand = deal(words, 5, ["hot", "rug", "pig"], new Rng(seed));
      assert.equal(hand.length, 5);
      assert.equal(new Set(hand.map((w) => w.id)).size, 5);
      const back = hand.filter((w) => ["hot", "rug", "pig"].includes(w.id)).map((w) => w.id);
      assert.ok(back.includes("hot") && back.includes("rug"), "the first two queued come back");
    }
  });

  it("spells a word out letter by letter", () => {
    assert.equal(spelledOut("ship"), "S, H, I, P.");
  });
});

describe("Build a Word", () => {
  const word: SpellWord = SPELL_DECKS[1]!.words[0]!; // ship
  const tray = () => trayFor(word, "cshtkw", new Rng(7));
  const build = (task: BuildTask, spelling: string) => {
    task.clear();
    for (const ch of spelling) {
      const tile = task.tiles.find((t) => t.letter === ch && !task.placed(t.id));
      assert.ok(tile, `a ${ch} tile`);
      task.place(tile.id);
    }
  };

  it("scores a right first Check, however much the tiles moved first", () => {
    const task = new BuildTask(word, tray());
    build(task, "sihp");
    task.lift(1);
    task.lift(2);
    task.place(task.tiles.find((t) => t.letter === "h")!.id);
    task.place(task.tiles.find((t) => t.letter === "i")!.id);
    assert.equal(task.spelled, "ship");
    assert.equal(task.check(), "right");
    assert.ok(task.own);
  });

  it("won't Check until every space is filled", () => {
    const task = new BuildTask(word, tray());
    build(task, "shi");
    assert.equal(task.check(), "not-full");
    assert.equal(task.misses, 0);
  });

  it("keeps a wrong try editable, and a fix after it is done but not scored", () => {
    const task = new BuildTask(word, tray());
    const spare = task.tiles.find((t) => !"ship".includes(t.letter))!;
    build(task, "shi");
    task.place(spare.id);
    assert.equal(task.check(), "wrong");
    assert.ok(task.full, "the letters stay where they were");
    task.lift(3);
    task.place(task.tiles.find((t) => t.letter === "p")!.id);
    assert.equal(task.check(), "right");
    assert.ok(task.solved && !task.own);
  });

  it("a hint means help", () => {
    const task = new BuildTask(word, tray());
    assert.match(task.hint(), /two letters/);
    build(task, "ship");
    task.check();
    assert.ok(!task.own);
  });

  it(`offers Show me after ${MODEL_AFTER} misses, then points at each letter in turn`, () => {
    const task = new BuildTask(word, tray());
    const spare = task.tiles.find((t) => !"ship".includes(t.letter))!;
    for (let i = 0; i < MODEL_AFTER; i += 1) {
      build(task, "shi");
      task.place(spare.id);
      task.check();
    }
    assert.ok(task.offerModel);
    task.model();
    assert.ok(task.slots.every((s) => s === null), "Show me clears the row to build together");
    for (const ch of "ship") {
      const next = task.nextTogether()!;
      assert.equal(task.letterOf(next), ch);
      task.place(next);
    }
    assert.equal(task.nextTogether(), null);
    assert.equal(task.check(), "right");
    assert.ok(!task.own);
  });

  it("gives duplicate letters their own tiles", () => {
    const shell = SPELL_DECKS[1]!.words.find((w) => w.word === "shell")!;
    const task = new BuildTask(shell, trayFor(shell, "cshtkw", new Rng(3)));
    assert.equal(task.tiles.filter((t) => t.letter === "l").length, 2);
    build(task, "shell");
    assert.equal(task.check(), "right");
  });
});

describe("Fix a Sentence", () => {
  const dogs = FIX_DECKS[0]!.items.find((s) => s.id === "dogs-is")!;

  it("scores tapping the right part and the right choice first time", () => {
    const task = new FixTask(dogs, choicesFor(dogs, new Rng(1)));
    assert.equal(task.choose("are"), "ignored", "no choosing before the part is found");
    assert.equal(task.tapPart(2), "found");
    assert.equal(task.choose("are"), "right");
    assert.ok(task.own);
  });

  it("counts tapping the wrong part as help", () => {
    const task = new FixTask(dogs, choicesFor(dogs, new Rng(1)));
    assert.equal(task.tapPart(1), "wrong-spot");
    task.tapPart(2);
    task.choose("are");
    assert.ok(task.solved && !task.own);
  });

  it("a wrong choice, then the right one, is done but not scored", () => {
    const task = new FixTask(dogs, choicesFor(dogs, new Rng(1)));
    task.tapPart(2);
    assert.equal(task.choose("am"), "wrong");
    assert.equal(task.choose("are"), "right");
    assert.ok(!task.own);
  });

  it("an ending mark is its own part, even when it's missing", () => {
    const frog = FIX_DECKS[1]!.items.find((s) => s.id === "see-frog")!;
    const task = new FixTask(frog, choicesFor(frog, new Rng(2)));
    assert.equal(frog.parts[frog.parts.length - 1], "");
    assert.equal(task.tapPart(frog.parts.length - 1), "found");
    assert.equal(task.choose("."), "right");
  });

  it("shuffles the choices", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed < 20; seed += 1) orders.add(choicesFor(dogs, new Rng(seed)).join());
    assert.ok(orders.size > 1);
  });
});

describe("Word Workshop records", () => {
  it("files the brief's round: three on your own, one hint, one retry is 3 of 5 and a stamp", () => {
    const results: ItemResult[] = [];
    for (const [i, how] of (["own", "own", "own", "hint", "retry"] as const).entries()) {
      const word = SPELL_DECKS[0]!.words[i]!;
      const task = new BuildTask(word, trayFor(word, "aeiou", new Rng(i + 1)));
      if (how === "hint") task.hint();
      const spare = task.tiles.find((t) => !word.word.includes(t.letter))!;
      if (how === "retry") {
        for (let j = 0; j < word.word.length - 1; j += 1) task.place(task.tiles.find((t) => t.letter === word.word[j] && !task.placed(t.id))!.id);
        task.place(spare.id);
        assert.equal(task.check(), "wrong");
        task.clear();
      }
      for (const ch of word.word) task.place(task.tiles.find((t) => t.letter === ch && !task.placed(t.id))!.id);
      assert.equal(task.check(), "right");
      results.push({ id: word.id, own: task.own });
    }
    const { save, kid, outcome } = play(emptySave(), riley(), { id: "a", mode: "build", deckId: "w2-short", grade: "2", results });
    assert.equal(outcome.score, 3);
    assert.equal(outcome.kind, "first");
    assert.equal(outcome.stamps, 1);
    assert.equal(benchFor(parseWorkSave(JSON.stringify(save)), kid).stamps, 1, "the stamp survives a reload");
    assert.deepEqual(benchFor(save, kid).queue["w2-short"], [SPELL_DECKS[0]!.words[3]!.id, SPELL_DECKS[0]!.words[4]!.id], "the helped words come back next time");
  });

  it("then a record, a tie, and a lower score", () => {
    let save = emptySave();
    let kid = riley();
    const go = (id: string, own: number) => {
      const done = play(save, kid, round(id, own));
      save = done.save;
      kid = done.kid;
      return done.outcome;
    };
    assert.equal(go("1", 3).kind, "first");
    const record = go("2", 4);
    assert.equal(record.kind, "record");
    assert.equal(outcomeLine(record), "4 of 5 on your own! Your best was 3.");
    const tie = go("3", 4);
    assert.equal(tie.kind, "tie");
    assert.match(outcomeLine(tie), /matches your best/);
    assert.equal(go("4", 2).kind, "under");
    assert.equal(benchFor(save, kid).bests[bestKey("build", "w2-short", "2")], 4);
  });

  it("keeps separate bests for each deck, each game and each child", () => {
    let save = play(emptySave(), riley(), round("1", 4)).save;
    assert.equal(play(save, riley(), round("2", 1, "w2-silente")).outcome.kind, "first", "a new deck starts fresh");
    assert.equal(play(save, riley(), round("3", 1, "s2-agree", "fix")).outcome.kind, "first", "so does the other game");
    save = play(save, nathan(), round("4", 2)).save;
    assert.equal(benchFor(save, nathan()).bests[bestKey("build", "w2-short", "2")], 2);
    assert.equal(benchFor(save, riley()).bests[bestKey("build", "w2-short", "2")], 4, "Riley's best is untouched");
  });

  it("files a round once, however many times it's sent", () => {
    const first = play(emptySave(), riley(), round("same", 4));
    assert.equal(commitRound(first.save, first.kid, round("same", 4)), null);
  });

  it("wins the Red Cap with the first stamp and the Red Cape with the third", () => {
    let save = emptySave();
    let kid = riley();
    const prizes: string[][] = [];
    for (let i = 0; i < 4; i += 1) {
      const done = play(save, kid, round(`r${i}`, i === 0 ? 0 : 2));
      save = done.save;
      kid = done.kid;
      prizes.push(done.outcome.prizes.map((p) => p.id));
    }
    assert.deepEqual(prizes, [["cap"], [], ["cape"], []], "even a round with no points earns its stamp");
    assert.ok(kid.outfits.includes("cap") && kid.outfits.includes("cape"));
    assert.equal(nextStampPrize(benchFor(save, kid), kid), null);
  });

  it("keeps the cap and cape when Fact Frenzy reads the shared players back", () => {
    const { kid } = play(emptySave(), riley(), round("1", 3));
    const worn = { ...kid, outfit: "cap" as const };
    const back = parseSave(JSON.stringify({ kids: [worn], current: "r" })).kids[0]!;
    assert.ok(back.outfits.includes("cap"));
    assert.equal(back.outfit, "cap");
    assert.deepEqual(back.bests, riley().bests, "no math score is touched");
  });

  it("clears the round left halfway once it's filed", () => {
    const save: WorkSave = {
      ...emptySave(),
      active: { id: "x", kidId: "r", mode: "build", deckId: "w2-short", grade: "2", items: ["cap", "bed"], results: [], helped: false },
    };
    assert.equal(play(save, riley(), round("x", 2)).save.active, null);
  });

  it("reads back what it saved, and survives a damaged save", () => {
    const { save } = play(emptySave(), riley(), round("1", 3));
    assert.deepEqual(parseWorkSave(JSON.stringify(save)), save);
    assert.deepEqual(parseWorkSave("{oops"), emptySave());
    const damaged = parseWorkSave(
      JSON.stringify({ benches: { r: { stamps: -2, bests: { k: 9 }, mode: "draw", spellDeck: "gone" } }, voice: false, active: { id: 1 } }),
    );
    const bench = damaged.benches["r"]!;
    assert.equal(bench.stamps, 0);
    assert.equal(bench.bests["k"], 5, "a best can't be more than five");
    assert.equal(bench.mode, "build");
    assert.equal(bench.spellDeck, SPELL_DECKS[0]!.id);
    assert.equal(damaged.voice, false);
    assert.equal(damaged.active, null);
  });

  it("starts a child in any grade on the nearest grade's deck", () => {
    assert.equal(startingDeck("build", "2"), "w2-short");
    assert.equal(startingDeck("fix", "5"), FIX_DECKS[0]!.id);
    assert.equal(startingDeck("build", "K"), "w2-short");
  });
});

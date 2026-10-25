/**
 * The shipped content pack, checked whole on every build.
 *
 * Every puzzle through the strict validator with the real word lists; the
 * counts the release notes and README claim; the daily calendar's coverage;
 * and the things a validator doesn't know to look for, like a wheel that
 * reads as a rude word round its circle.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { loadTheme, loadWordLists } from "../../../scripts/word-voltage/lexicon.ts";
import { dailyDate } from "./daily.ts";
import { canSpell } from "./letters.ts";
import { decodePack, PACK_URL } from "./pack.ts";
import { FRESH_ATTEMPT, makeLevel, useHint } from "./play.ts";
import { buildBoard } from "./board.ts";
import { LEVELS_PER_CIRCUIT, PATH_CIRCUITS, THEMES } from "./rewards.ts";
import { validatePack } from "./validate.ts";

const pack = decodePack(
  JSON.parse(readFileSync(new URL(`../../../public${PACK_URL}`, import.meta.url), "utf8")),
);
const words = loadWordLists();
/** Each theme's own words: accepted on its levels, and reviewed in its file. */
const themeWords = new Map(THEMES.map((t) => [t.id, loadTheme(t.id).words]));
const anyTheme = (w: string) => [...themeWords.values()].some((set) => set.has(w));
const lexicon = {
  isTarget: (w: string) => words.targets.has(w) || anyTheme(w),
  isBonus: (w: string) => words.bonus.has(w) || anyTheme(w),
};
const themeOf = new Map(Object.entries(pack.themes).flatMap(([id, ids]) => ids.map((p) => [p, id] as const)));

/** The day Word Voltage is planned to go out. The calendar must start by then. */
const RELEASE_DATE = "2026-10-21";

describe("the content pack", () => {
  it("passes the strict validator, with the real word lists", () => {
    const errors = validatePack(pack, lexicon, 90);
    assert.deepEqual(errors.slice(0, 20), []);
  });

  it("has 100 Family levels and 500 Challenge, a circuit of 20 at a time", () => {
    assert.equal(pack.campaign.family.length, 100);
    assert.equal(pack.campaign.challenge.length, 500);
    for (const difficulty of ["family", "challenge"] as const) {
      assert.equal(pack.campaign[difficulty].length, PATH_CIRCUITS[difficulty] * LEVELS_PER_CIRCUIT);
    }
  });

  it("covers at least ninety days of Daily Charge from release", () => {
    const dates = Object.keys(pack.daily).sort();
    assert.ok(dates[0]! <= RELEASE_DATE, `the calendar starts ${dates[0]}`);
    const fromRelease = dates.filter((d) => d >= RELEASE_DATE);
    assert.ok(fromRelease.length >= 90, `only ${fromRelease.length} days`);
    for (const date of dates) {
      assert.ok(pack.daily[date]!.family !== pack.daily[date]!.challenge);
    }
  });

  it("keeps each path inside its letter and word ranges", () => {
    for (const [difficulty, range] of [
      ["family", { letters: [4, 6], words: [3, 7], side: 8 }],
      ["challenge", { letters: [5, 8], words: [5, 14], side: 11 }],
    ] as const) {
      for (const id of [...pack.campaign[difficulty], ...Object.values(pack.daily).map((d) => d[difficulty])]) {
        const p = pack.puzzles[id]!;
        assert.ok(p.letters.length >= range.letters[0] && p.letters.length <= range.letters[1], id);
        assert.ok(p.words.length >= range.words[0] && p.words.length <= range.words[1], id);
        const board = buildBoard(p);
        assert.ok(board.rows <= range.side && board.cols <= range.side, id);
      }
    }
  });

  it("starts each path gently", () => {
    for (const id of pack.campaign.family.slice(0, 8)) {
      const p = pack.puzzles[id]!;
      assert.equal(p.letters.length, 4, id);
      assert.ok(p.words.length <= 4, id);
      assert.ok(new Set(p.letters).size === p.letters.length, `${id} repeats a letter too early`);
    }
    for (const id of pack.campaign.challenge.slice(0, 8)) {
      assert.equal(pack.puzzles[id]!.letters.length, 5, id);
    }
  });

  it("lists every bonus word its wheel spells, so a total shown is honest", () => {
    const bonus = [...words.bonus];
    for (const puzzle of Object.values(pack.puzzles)) {
      const targets = new Set(puzzle.words.map((p) => p.word));
      // A themed level also takes its theme's words, names included.
      const theme = themeOf.get(puzzle.id);
      const pool = theme ? [...new Set([...bonus, ...themeWords.get(theme)!])] : bonus;
      const expected = pool
        .filter((w) => w.length <= puzzle.letters.length && canSpell(w, puzzle.letters) && !targets.has(w))
        .sort();
      assert.deepEqual([...puzzle.bonus].sort(), expected, puzzle.id);
    }
  });

  it("never seats a wheel so it reads as a denied word, or round to a target", () => {
    for (const puzzle of Object.values(pack.puzzles)) {
      const ring = puzzle.letters;
      const back = [...ring].reverse().join("");
      for (let start = 0; start < ring.length; start += 1) {
        for (const r of [ring, back]) {
          const turned = r.slice(start) + r.slice(0, start);
          for (let n = 3; n <= turned.length; n += 1) {
            const reading = turned.slice(0, n);
            assert.ok(!words.deny.has(reading), `${puzzle.id} reads ${reading}`);
            if (n === ring.length) {
              assert.ok(!puzzle.words.some((p) => p.word === reading), `${puzzle.id} gives away ${reading}`);
            }
          }
        }
      }
    }
  });

  it("can be finished from its targets alone, with hints if need be", () => {
    for (const puzzle of Object.values(pack.puzzles)) {
      const level = makeLevel(puzzle);
      let attempt = FRESH_ATTEMPT;
      for (let i = 0; i < 200 && !attempt.completed; i += 1) attempt = useHint(level, attempt).attempt;
      assert.ok(attempt.completed, puzzle.id);
    }
  });

  it("has the three themes, twenty levels each, every one named and on theme", () => {
    assert.deepEqual(Object.keys(pack.themes).sort(), THEMES.map((t) => t.id).sort());
    for (const theme of THEMES) {
      const ids = pack.themes[theme.id]!;
      assert.equal(ids.length, 20, theme.id);
      for (const id of ids) {
        const puzzle = pack.puzzles[id]!;
        assert.ok(puzzle.title, id);
        assert.ok((puzzle.theme ?? []).length >= 2, id);
        for (const w of puzzle.theme!) assert.ok(themeWords.get(theme.id)!.has(w), `${id}: ${w}`);
        // Themed boards stay friendly-sized.
        const board = buildBoard(puzzle);
        assert.ok(board.rows <= 9 && board.cols <= 9, id);
      }
    }
  });

  it("never names a car maker", () => {
    for (const id of pack.themes.garage ?? []) {
      const puzzle = pack.puzzles[id]!;
      const text = [puzzle.title, ...puzzle.words.map((p) => p.word), ...puzzle.bonus].join(" ").toUpperCase();
      assert.doesNotMatch(text, /CHEV|FORD|DODGE|TOYOTA|HONDA/, id);
    }
  });

  for (const released of ["1", "2", "3"]) {
    it(`keeps every puzzle, level and daily of pack v${released}, already on phones`, () => {
      // Saves, stars and rewards are keyed on these ids: a released pack's
      // content must come through every later pack exactly as it was.
      const old = decodePack(
        JSON.parse(
          readFileSync(new URL(`../../../public/word-voltage/pack-v${released}.json`, import.meta.url), "utf8"),
        ),
      );
      for (const [id, puzzle] of Object.entries(old.puzzles)) {
        assert.deepEqual(pack.puzzles[id], puzzle, id);
      }
      for (const difficulty of ["family", "challenge"] as const) {
        assert.deepEqual(pack.campaign[difficulty].slice(0, old.campaign[difficulty].length), old.campaign[difficulty]);
      }
      for (const [date, entry] of Object.entries(old.daily)) assert.deepEqual(pack.daily[date], entry, date);
      assert.equal(pack.tutorial, old.tutorial);
    });
  }

  it("gets harder past level 100 on Challenge", () => {
    for (const [index, id] of pack.campaign.challenge.entries()) {
      const puzzle = pack.puzzles[id]!;
      const board = buildBoard(puzzle);
      const shortest = Math.min(...puzzle.words.map((p) => p.word.length));
      // Eight letters and 11x11 boards are only for levels 301 and up.
      if (index < 300) assert.ok(puzzle.letters.length <= 7, id);
      if (index < 400) assert.ok(board.rows <= 10 && board.cols <= 10, id);
      if (index < 100) continue;
      assert.equal(puzzle.letters.length, index < 300 ? 7 : 8, id);
      assert.ok(puzzle.words.length >= (index < 200 ? 9 : 10), id);
      if (index >= 140) assert.ok(shortest >= 4, `${id} has a three-letter word`);
      if (index >= 469) assert.ok(shortest >= 5, `${id} has a four-letter word`);
    }
  });

  it("has a daily for today, while this pack is current", () => {
    const today = dailyDate();
    const dates = Object.keys(pack.daily).sort();
    // Not a failure once the calendar has run out -- that's the "needs an
    // update" message's job -- but say so loudly in the test output.
    if (today > dates[dates.length - 1]!) {
      console.warn(`Word Voltage's daily calendar ended ${dates[dates.length - 1]}: ship a new pack.`);
    } else if (today >= dates[0]!) {
      assert.ok(pack.daily[today], `no daily for ${today}`);
    }
  });
});

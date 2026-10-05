/**
 * Today's course: a new one every day, the same for everyone.
 *
 * It's the hand-built courses' own pieces, put in an order chosen by the
 * date. Each piece is a whole fair thing -- an obstacle with the ground it
 * needs after it -- so any order of them is a course you can run.
 *
 * "Can run" isn't taken on trust. Every day's course is run by the computer
 * racer before anyone sees it, and one it can't finish cleanly in a sensible
 * time is thrown away and the next arrangement tried. The racer plays by the
 * player's rules, so a course it clears is a course that can be cleared.
 */

import { dailyKey, dailySeed, Rng, shortDate } from "../../core/rng.ts";
import { recordBotRun } from "./rules.ts";
import { buildTrack, TrackBuilder, type Course, type Track } from "./track.ts";

const STEP = 1 / 60;
/** Start line to finish line, about the same as the hand-built courses. */
const TARGET_LENGTH = 8800;
/** Arrangements tried for one day before giving up and using the Mossy Floor. */
const MAX_ATTEMPTS = 20;

interface Piece {
  name: string;
  /** How many times it may appear in one course. */
  max: number;
  /** Gentle enough to be one of the first two things on the course. */
  opener?: boolean;
  add(b: TrackBuilder, rng: Rng): void;
}

/** A length in steps of ten, so courses differ in spacing as well as order. */
function run(rng: Rng, min: number, max: number): number {
  return rng.int(min / 10, max / 10) * 10;
}

/** Every piece starts and ends on the forest floor, so any can follow any. */
const PIECES: readonly Piece[] = [
  {
    name: "log",
    max: 3,
    opener: true,
    add: (b, rng) => {
      b.log().flat(run(rng, 260, 320));
    },
  },
  {
    name: "two logs",
    max: 2,
    add: (b, rng) => {
      b.log().flat(run(rng, 170, 230)).log().flat(300);
    },
  },
  {
    name: "bramble",
    max: 2,
    add: (b, rng) => {
      b.bramble().flat(run(rng, 280, 320));
    },
  },
  {
    name: "puddle",
    max: 2,
    opener: true,
    add: (b, rng) => {
      b.acorns(4, 20).puddle(rng.pick([140, 150])).flat(run(rng, 240, 280));
    },
  },
  {
    name: "hop",
    max: 4,
    opener: true,
    add: (b, rng) => {
      const width = rng.pick([110, 120, 130, 140]);
      b.arc(3, width, 50).gap(width).flat(run(rng, 260, 320));
    },
  },
  {
    name: "glide",
    max: 3,
    add: (b, rng) => {
      b.arc(5, 300, 60).gap(300).flat(run(rng, 320, 340));
    },
  },
  {
    name: "cap",
    max: 2,
    add: (b) => {
      b.capGap(380, [[150, 30]]).flat(320);
    },
  },
  {
    name: "two caps",
    max: 2,
    add: (b) => {
      b.capGap(650, [
        [150, 40],
        [400, 70],
      ]).flat(380);
    },
  },
  {
    // Hold on through an updraft and you come down a long way past it, so
    // the piece carries its own long stretch of ground to land on.
    name: "updraft",
    max: 2,
    add: (b) => {
      b.updraftGap(560, 120, 400, 260).flat(340);
      b.log().flat(300).acorns(4, 20).flat(320);
    },
  },
  {
    name: "ledge",
    max: 2,
    add: (b, rng) => {
      b.step(rng.pick([40, 50])).flat(run(rng, 280, 300));
      b.arc(3, 120, 40).gap(120, 0).flat(run(rng, 260, 280));
    },
  },
  {
    name: "two ledges",
    max: 1,
    add: (b, rng) => {
      b.step(50).flat(run(rng, 220, 240)).step(100).flat(300);
      b.gap(150, 0).flat(260);
    },
  },
];

function arrange(seed: number): Track {
  const rng = new Rng(seed);
  const b = new TrackBuilder();
  b.flat(140).start().flat(420);
  const startX = b.x;

  const used = new Map<string, number>();
  let last = "";
  let placed = 0;
  while (b.x - startX < TARGET_LENGTH) {
    const choices = PIECES.filter(
      (p) =>
        p.name !== last && (used.get(p.name) ?? 0) < p.max && (placed >= 2 || p.opener === true),
    );
    // Every piece used up: can't happen at this length, but never spin.
    if (choices.length === 0) break;
    const piece = rng.pick(choices);
    piece.add(b, rng);
    used.set(piece.name, (used.get(piece.name) ?? 0) + 1);
    last = piece.name;
    placed += 1;
  }

  b.acorns(5, 20).flat(240).finish().flat(600);
  return b.build();
}

/** True when the computer racer finishes without a fall, in a sensible time. */
function fair(track: Track): boolean {
  const bot = recordBotRun(track, STEP, 90);
  return (
    bot.finishTime > 30 && bot.finishTime < 60 && bot.points.every((p) => p.pose !== "gone")
  );
}

/**
 * The course for a day's seed, and how many arrangements it took to find a
 * fair one. `attempts` is MAX_ATTEMPTS when none was, and the course is then
 * the Mossy Floor: a day with a familiar course beats a day with a broken one.
 */
export function generateDaily(seed: number): { track: Track; attempts: number } {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const track = arrange((Math.imul(seed, 31) + attempt) >>> 0);
    if (fair(track)) return { track, attempts: attempt + 1 };
  }
  return { track: buildTrack(), attempts: MAX_ATTEMPTS };
}

const built = new Map<number, Track>();

/** Today's course as an entry for the title card. */
export function dailyCourse(date = new Date()): Course {
  const seed = dailySeed(date);
  const key = dailyKey(date);
  return {
    // "daily-YYYYMMDD": the saved-run keys built from it sort by date, which
    // is how the server finds old days' runs to clear out.
    id: `daily-${key.replace(/-/g, "")}`,
    name: "TODAY'S COURSE",
    short: "TODAY",
    blurb: `${shortDate(key)}. A new course every day, the same one for everyone.`,
    build: () => {
      let track = built.get(seed);
      if (!track) {
        track = generateDaily(seed).track;
        built.set(seed, track);
      }
      // A copy each time: a race must never be handed a track another race
      // could have changed.
      return structuredClone(track);
    },
  };
}

/**
 * Release notes -- the single record of what changed and when.
 *
 * This file is the source of truth for both the in-app "What's new" screen and
 * the version number. `package.json` must match the newest entry, and
 * releases.test.ts fails the build if it doesn't, so a version can't be bumped
 * without a note or a note added without a bump.
 *
 * Why that guard exists: the app reported v0.1.0 from the first build in August
 * through eight releases. The version is stamped into every feedback note so a
 * report can be tied to a build, and for six weeks every report said the same
 * thing. Versions 0.2.0-0.8.0 below were assigned afterwards from the git
 * history, with the real dates.
 *
 * HOW TO ADD A RELEASE
 *   1. Add an entry at the TOP of RELEASES.
 *   2. Set the same version in package.json.
 *   3. `npm test` checks the two agree and the history is in order.
 *
 * Notes are written for the family, not for developers: say what someone will
 * notice when they open the app, not which file changed.
 */

export interface Release {
  /** Semantic version, e.g. "0.9.0". */
  version: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** One line: the headline of this release. */
  title: string;
  /** What someone opening the app will notice. */
  notes: readonly string[];
}

export const RELEASES: readonly Release[] = [
  {
    version: "0.11.0",
    date: "2026-09-17",
    title: "JB's Tower Trouble",
    notes: [
      "A new cabinet: JB's Tower Trouble. The Scrap King robot has the good boy stuck on the roof. Climb the tower and rescue him.",
      "Drag anywhere to walk and climb. Tap JUMP to hop over tyres, cable spools, paint cans and toolboxes.",
      "Grab a wrench to smash junk for a few seconds. You can't climb while you're holding it.",
      "Three hearts, plus one for every rescue. Getting hit puts you back on the girder you reached, not at the bottom.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-09-16",
    title: "High scores for every game",
    notes: [
      "HIGH SCORES on the menu now shows every game. It used to show only Starfighter.",
      "Filter by game along the top of the screen, or see every game's top three at once.",
      "Every score shows which game it's from, in that game's colour, with SEE ALL to open its full board.",
      "Scores show each game's own progress: LV for level, RD for round, ORD for orders, instead of W for everything.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-09-16",
    title: "Brickfall levels up sooner",
    notes: [
      "Brickfall's first three levels now take 4 lines each instead of 8, so the first level-up arrives in a minute or two rather than never.",
      "The Brickfall side panel counts down how many lines until the next level.",
      "A \"What's new\" page (this one), reachable from the arcade menu and from Settings.",
      "The version number is correct again. It had said 0.1.0 since August.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-09-16",
    title: "Brickfall, and music",
    notes: [
      "New machine: Brickfall. Falling blocks across twenty-five levels.",
      "Brickfall plays music: our own arrangement of \"Korobeiniki\", a public-domain folk tune. It speeds up as you climb.",
      "Settings has a separate Music switch, so the tune can go off without silencing everything else.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-09-15",
    title: "Highway Hop, and a new arcade floor",
    notes: [
      "New machine: Highway Hop. Get the frog across the road and the river and into all five burrows.",
      "The menu is now a floor of cabinets, each with its own artwork and a one-line hint on how to play.",
      "Highway Hop fixes before release: collisions now match where the frog is drawn, swiping sideways works on touch, and you can't lose a life by missing a burrow.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-09-12",
    title: "Dad's Arcade",
    notes: [
      "The arcade has its proper name. Scores, settings and prizes all carried over.",
      "The menu scrolls on short phone screens instead of cutting off the title.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-09-07",
    title: "Prizes in the slime",
    notes: [
      "After mixing a slime, play with it: stretch and squish it to dig out hidden prizes.",
      "Prizes come in four rarities, from common candy to legendary dragons.",
      "The Prize Jar keeps everything you've ever found.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-06",
    title: "Riley's Slime Shop",
    notes: [
      "New machine: Riley's Slime Shop. Mix colours like paint to match customers' orders.",
      "Slime Lab for free play, with no score and no timer.",
      "Today's Special: everyone gets the same six orders each day, with its own TODAY high-score board.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-08-10",
    title: "Miss Riley's Reef",
    notes: [
      "New machine: Miss Riley's Reef. Swim the maze, eat the bubbles, dodge the jellyfish.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-08-04",
    title: "Nathan's Mallard Challenge",
    notes: [
      "New machine: Nathan's Mallard Challenge, complete with a dog that laughs when you miss.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-08-04",
    title: "The first machine",
    notes: [
      "Starfighter, a shared high-score board, and an arcade you can add to your home screen.",
      "The Story, and a way to send a note.",
    ],
  },
];

export const LATEST_RELEASE: Release = RELEASES[0]!;

/** Compare two "x.y.z" versions: negative if a < b, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Releases newer than the one a player last saw.
 *
 * A player who has never opened the notes gets everything flagged, which is
 * the right call for this family: everyone playing today installed before this
 * page existed, and every one of them should see the badge once.
 */
export function unseenReleases(lastSeen: string | null): readonly Release[] {
  if (!lastSeen) return RELEASES;
  return RELEASES.filter((r) => compareVersions(r.version, lastSeen) > 0);
}

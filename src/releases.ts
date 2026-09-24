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
    version: "0.12.4",
    date: "2026-09-23",
    title: "A TODAY badge for the daily challenge",
    notes: [
      "Riley's Slime Shop now flags its cabinet with a TODAY badge whenever the day's special hasn't been played yet, so it's not just hiding behind Shop Day in the mode picker.",
    ],
  },
  {
    version: "0.12.3",
    date: "2026-09-22",
    title: "More Black Disc phrases",
    notes: [
      "Bible Stories and Holidays & Celebrations each grew from 56 phrases to 108, so replaying either category on the same game night means a lot fewer repeats.",
    ],
  },
  {
    version: "0.12.2",
    date: "2026-09-22",
    title: "Two more categories for Black Disc",
    notes: [
      "Black Disc: two new categories to pick from -- Bible Stories and Holidays & Celebrations, alongside Everyday Life, Animals & Nature, Movies & Characters, and Arcade Nights.",
    ],
  },
  {
    version: "0.12.1",
    date: "2026-09-21",
    title: "Skipping a word now costs you",
    notes: [
      "Black Disc: your first SKIP each round is free, but every one after that knocks a few seconds off the clock — so skipping past a hard word is still an option, just not a free one.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-09-21",
    title: "Black Disc",
    notes: [
      "A new cabinet: Black Disc. Pass the phone, describe the word, and don't get caught holding it when it buzzes.",
      "Team 1 vs Team 2, first to seven wins.",
      "No on-screen timer on purpose — just a loading bar and a tick that starts slow and speeds up (and gets louder) the closer it gets to buzzing, so nobody can count down the seconds.",
      "RULE BREAK ends a round on the spot if someone says the word; SKIP moves on to a new one without losing the disc.",
      "Fixed a bug that could clear a game's own controls (Tower Trouble's D-pad, Slime Shop's counter) after resuming from pause.",
    ],
  },
  {
    version: "0.11.2",
    date: "2026-09-17",
    title: "A bigger tower",
    notes: [
      "Tower Trouble fills the screen again. The D-pad update left a thick black band under the tower and shrank the game to fit it.",
    ],
  },
  {
    version: "0.11.1",
    date: "2026-09-17",
    title: "A D-pad for Tower Trouble",
    notes: [
      "Tower Trouble has a D-pad in the bottom-left corner, like a handheld. Hold a direction to walk or climb, and slide your thumb to change direction without lifting it.",
      "JUMP moved to a big round button under your right thumb.",
      "The first-time \"How to play\" screen only appears before Starfighter now. It was showing Starfighter's instructions in front of whichever game a new phone opened first.",
    ],
  },
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

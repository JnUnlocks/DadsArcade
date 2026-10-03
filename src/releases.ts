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
    version: "0.16.0",
    date: "2026-10-02",
    title: "Starfighter gets bosses, bonus stages and a wingman",
    notes: [
      "Every fifth wave of STARFIGHTER is now a boss. A dreadnought slides in across the top, fires in fans, and takes a lot of knocking down. There's a bar under the score showing how close it is to going up, and its core beats faster the nearer it gets. Each one you meet is tougher than the last.",
      "Wave 3, and every fourth wave after that, is a bonus stage. Nothing shoots at you and nothing can crash into you -- four squadrons just fly past and you shoot at them. Hit all twenty and a second jet joins you for the rest of the run.",
      "You can fly up to three jets at once. Three jets is three times the guns. You can still earn one the old way too, by shooting down the cruiser that stole your fighter.",
      "While you're flying more than one jet, getting hit costs you a jet instead of a life.",
    ],
  },
  {
    version: "0.15.1",
    date: "2026-10-02",
    title: "Hyper Snake goes through walls",
    notes: [
      "In HYPER, the edges of the board are open now. Go out through one side and you come back in on the other, still heading the same way. The inside of the frame glows blue to show it.",
      "Crates, lasers and your own tail are as solid as ever, and something can be waiting just inside the far edge, so look before you go through.",
      "CLASSIC hasn't changed. Its wall is still a wall.",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-10-02",
    title: "JB's Hyper Snake",
    notes: [
      "A new cabinet, the last tile on the menu: JB's Hyper Snake. It's two games. CLASSIC is the snake from the old phone, on the old phone's green screen: one life, solid walls, and a bonus critter every fifth bite that's worth less the longer you leave it.",
      "HYPER is the same snake in neon. Each stage has a number of apples to eat, crates to steer round, and from stage 2, lasers. A laser always shows a flickering red line for a second before it fires. You get three lives.",
      "In HYPER, hold BOOST to sprint. Anything you eat at a sprint scores double. There are pickups too: a shield that forgives one crash, a magnet that drags apples toward you, and gold nuts for points.",
      "Swipe anywhere to turn. You don't have to lift your thumb between turns, and two quick turns in a row both count.",
      "CLASSIC and HYPER keep separate scores. Pick SNAKE on the high-score screen and there's a CLASSIC tab next to ALL TIME and THIS WEEK.",
    ],
  },
  {
    version: "0.14.2",
    date: "2026-10-02",
    title: "The story catches up",
    notes: [
      "The Story said there were six machines. There are ten now, so its last line no longer counts them -- it just says there's a whole arcade, and room for more.",
      "When you share the arcade's link, the preview now names every game, starting with the newest two: Letter Lock and Plasma Sort.",
    ],
  },
  {
    version: "0.14.1",
    date: "2026-10-01",
    title: "How to play Plasma Sort",
    notes: [
      "There's a HOW TO PLAY link under UNDO and RESET in Plasma Sort. Tap it for the rules: how pouring works, what UNDO and RESET do, and what par and the stars mean.",
      "The clock stops while the rules are open, so reading them doesn't cost you any time.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-10-01",
    title: "Letter Lock: a new word every day",
    notes: [
      "A new cabinet, the arcade's tenth: Letter Lock. Guess the five-letter word in six tries. After each guess the tiles tell you how close you are: a solid blue tile is the right letter in the right spot, an orange ring is a letter that's in the word but somewhere else, and a dark tile isn't in the word at all.",
      "TODAY'S WORD is the same for everyone, with its own scoreboard for the day. Your first go is the one that counts, and it's saved after every guess, so you can put the phone down and come back to it.",
      "Finish it and tap SHARE to send your grid to the family chat. It shows the colours of each guess but never the letters, so it can't spoil the word for anyone, and the link opens Letter Lock straight to today's word.",
      "Run out of tries and it simply tells you the word. Nothing goes on the scoreboard, and there's a new word tomorrow. FREE PLAY and PRACTICE give you a fresh word whenever you like.",
      "Letter Lock and Plasma Sort now share the top row of the arcade, so both of the day's puzzles are the first thing you see.",
    ],
  },
  {
    version: "0.13.3",
    date: "2026-10-01",
    title: "Share today's puzzle with the family",
    notes: [
      "Solve Today's Puzzle in Plasma Sort and a SHARE button appears under your result. It opens your phone's share sheet, so it's one tap into the family group chat.",
      "What gets sent gives nothing away: a row of six coloured squares for the six tubes you sorted, a black square for every pour over par, your stars, your time and your streak. A perfect solve is a clean rainbow.",
      "The link at the bottom opens Plasma Sort straight to today's puzzle, so whoever taps it can have a go and send theirs back.",
      "Missed the moment? Today's result stays shareable all day from the SHARE button next to TODAY'S PUZZLE.",
    ],
  },
  {
    version: "0.13.2",
    date: "2026-09-30",
    title: "Sort the arcade your way",
    notes: [
      "A new SORT button next to SETTINGS. Tap it to switch between the usual arcade order, MOST PLAYED (the games you open most on this phone come first) and A-Z. It remembers your choice.",
      "Every cabinet now has its own colour. Starfighter, Plasma Sort and the Reef were all the same blue, and the Mallard Challenge was a muddy brown -- they're now blue, magenta, a deeper ocean blue, and gold.",
    ],
  },
  {
    version: "0.13.1",
    date: "2026-09-30",
    title: "Plasma Sort moves to the front row",
    notes: [
      "Plasma Sort now sits on the top row of the arcade, right next to Starfighter, so the day's puzzle is the first thing you see.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-09-30",
    title: "Plasma Sort: a new puzzle every day",
    notes: [
      "A new cabinet: Plasma Sort. Tap a tube, tap another, and the colour on top pours across. Get every tube down to one colour.",
      "TODAY'S PUZZLE is the same for everyone, with its own scoreboard for the day. Your first solve is the one that counts, so take your time -- there's no clock running out, and UNDO always works.",
      "Every puzzle has a PAR: the fewest pours it can be done in. Match it for three stars. A pour you take back still counts, so it pays to look before you pour.",
      "Solve the daily puzzle on back-to-back days and the game keeps your streak. FREE PLAY deals a fresh puzzle whenever you like, and WARM-UP is a smaller one with no score at all.",
    ],
  },
  {
    version: "0.12.8",
    date: "2026-09-30",
    title: "An easier way to send a note",
    notes: [
      "Sending us a note is much easier on a phone. SEND A NOTE now sits right next to BACK in Settings, and opens its own screen with the box and the SEND button at the top, above the keyboard, instead of hiding at the bottom of the list.",
      "If you back out halfway through writing a note, it's still there when you come back.",
      "Settings is tidier: the rows are no longer squashed, so every description has room to breathe.",
    ],
  },
  {
    version: "0.12.7",
    date: "2026-09-30",
    title: "A slime that holds its stretch",
    notes: [
      "Riley's Slime Shop: pulling the slime and then holding still no longer lets it spring back on its own -- it stays stretched until you actually let go, the way real slime does.",
    ],
  },
  {
    version: "0.12.6",
    date: "2026-09-30",
    title: "A sturdier scoreboard",
    notes: [
      "The high score boards load faster and stay quick no matter how many games get played, so the arcade can be shared with more friends without slowing down.",
      "The arcade now counts which games get played, including Black Disc, so we can tell what everyone enjoys most. Nothing personal is sent -- just the game and the day.",
    ],
  },
  {
    version: "0.12.5",
    date: "2026-09-24",
    title: "A bigger squish screen",
    notes: [
      "Riley's Slime Shop: the slime is noticeably bigger once you're squishing it for prizes, and the last customer's order card no longer lingers on screen while you dig.",
    ],
  },
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

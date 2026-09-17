# Dad's Arcade

A mobile-first PWA arcade, built for Dad. Six games, a shared online
leaderboard, a real pause button, and it plays with no signal.

**[play.hyperdrive-arcade.workers.dev](https://play.hyperdrive-arcade.workers.dev)**
— open it on a phone and Add to Home Screen.

> **Why does the code still say `hyperdrive`?** The arcade was called Hyperdrive
> when it was one game, and the name stuck to a few things that are *identifiers
> rather than branding*: the deployed URL, the D1 database name, and the
> `hyperdrive.*` localStorage keys. Those were left alone deliberately — renaming
> them would change the URL people have on their home screens, point the worker
> at a new empty database, and wipe every saved setting, personal best and Prize
> Jar on every device. The name on the screen is what matters; those strings are
> just keys.

| Game | Owes its rules to | What it keeps |
| --- | --- | --- |
| **Starfighter** | Galaga | Bezier entry flights, dive attacks, only two shots on screen at once, and a cruiser that steals your fighter — shoot it down and you fly two abreast |
| **Nathan's Mallard Challenge** | Duck Hunt | The dog's whole routine: walks the field, sniffs, flushes the birds, and rears up laughing when you miss |
| **Miss Riley's Reef** | Ms. Pac-Man | Tile-snapped movement with buffered turns, scatter/chase waves, and four pursuers that each hunt differently |
| **Highway Hop** | Frogger | Stepped movement you commit to, a river half where the rule inverts — empty water kills and the logs that save you also carry you off the edge — and five burrows to fill rather than one crossing |
| **Brickfall** | Falling-block puzzles | A shuffled bag so you never wait twenty pieces for a straight one, a lock delay so a piece that lands beside a gap can still be slid into it, and twenty-five levels that are each measurably faster than the last |
| **JB's Tower Trouble** | Donkey Kong | Junk that rolls downhill, drops off the open end of each girder and sometimes takes a ladder down instead; jumps you commit to at take-off; and a wrench that smashes junk but stops you climbing while you hold it |
| **Riley's Slime Shop** | Slime-mixing toys, by way of a diner order queue | Bottles that mix like paint rather than like pixels, so blue and yellow make green — plus prizes you have to physically squish out of the slime, and a daily challenge everyone plays from the same seed |

Every theme is original — no trademarked names, art or audio anywhere — so it's
safe to share with anyone. All art is vector paths drawn at runtime and every
sound is synthesised from oscillators and noise. There isn't a single image or
audio asset in the project, which is why the whole arcade is a ~60 KB download — music included.

---

## Running it locally

```bash
npm install
npm run dev          # game at http://localhost:5173
```

For the leaderboard as well, run the API in a second terminal:

```bash
npm run db:local     # once, to create the local database
npm run cf:dev       # worker + API at http://localhost:8787
```

The Vite dev server proxies `/api` to the worker, so `localhost:5173` gets both
live-reloading game code and a working scoreboard.

To try it on your actual phone while developing, `npm run dev` prints a
`Network:` URL — open that on a device on the same Wi-Fi.

```bash
npm run typecheck    # app + worker
npm test             # pause/resume, reef maze, slime colour + daily seeding,
                     # crossing solvability + hop rules, brickfall board + music
npm run build        # typecheck, then production bundle into dist/
```

---

## Deploying

Two commands:

```bash
npx wrangler login    # opens a browser — free account, no card
npm run deploy
```

`npm run deploy` finds or creates the D1 database, writes its id into
`wrangler.jsonc`, creates the tables, builds, and ships. It's safe to re-run —
every step checks for existing state first, so later runs are updates rather
than duplicates. Use it for all subsequent deploys too.

<details>
<summary>Doing it by hand instead</summary>

```bash
npx wrangler login
npx wrangler d1 create hyperdrive-arcade   # prints a database_id
# paste that id into wrangler.jsonc, replacing REPLACE_WITH_DATABASE_ID
npm run db:remote                          # creates the tables
npm run cf:deploy
```

</details>

No database migration is needed to pick up the daily board — `board_id` has
been in `worker/schema.sql` since the first release and the slime shop only
started writing to it. `npm run db:remote` is idempotent (`CREATE TABLE IF NOT
EXISTS`), so re-running it on an existing deployment is safe and a no-op.

Wrangler prints the live URL. Open it on the phone → Share → **Add to Home
Screen**. It then launches full-screen with no browser chrome, and works with no
signal.

Optional, to enable deleting a bogus score:

```bash
npx wrangler secret put ADMIN_TOKEN
# then: curl -X DELETE https://<your-url>/api/scores/<id> -H "X-Admin-Token: <token>"
```

Without that secret set, the delete endpoint is disabled entirely rather than
left open.

---

## Reading feedback

There's a **Feedback** box at the bottom of the in-game Settings screen. Notes
go into the same D1 database as the scores, tagged with the sender's initials
plus app version, screen size and whether they'd installed it — enough to act on
a report without having to ask non-technical questions.

To read what's come in:

```bash
npm run feedback           # live
npm run feedback:local     # your local dev database
```

There's deliberately no read endpoint on the API — reading goes through your
existing Wrangler login, so there's no admin token to leak.

## Check on a real phone

Emulators can't tell you how the controls feel. Worth doing once:

- [ ] Add to Home Screen, then launch from the icon — no browser bars.
- [ ] Dragging feels right. Adjust **Settings → Steering speed** to taste.
- [ ] Tap pause mid-wave; confirm the 3-2-1 countdown before it resumes.
- [ ] Switch apps mid-wave (or take a call) — it should pause on its own.
- [ ] Turn on airplane mode, play a run, and confirm the score says it'll upload
      later. Turn Wi-Fi back on and check it lands on the board.
- [ ] Screen shouldn't dim during a long run.
- [ ] Slime Shop: the counter is reachable one-handed, and dragging anywhere
      squishes the slime.
- [ ] Play **Today's Special** on two devices and confirm both get the same six
      orders, and that both land on the **TODAY** board.
- [ ] Squish a slime until every prize is out, then open the **Prize Jar** and
      confirm they're still there after a reload.
- [ ] Highway Hop: tap-to-hop feels right under a thumb, and the burrow row is
      readable — it should be obvious you aim for a ring, not the bank.
- [ ] Every cabinet tile on the menu shows its control hint. That line is the
      only place the controls are explained.
- [ ] Tower Trouble: dragging with one thumb walks and climbs while the other
      thumb reaches JUMP, and junk coming down a ladder is visible in time.
- [ ] Brickfall: the music starts, and **Settings → Music** silences it without
      silencing the sound effects. Leaving the game stops it.

---

## Riley's Slime Shop, and the daily board

The other three cabinets are arcade classics. This one is a toy, and toys are
awkward to score: there is nothing to lose at, which is exactly why slime apps
have no high-score table. Bolting a timer onto a creative toy would have
spoiled the toy without producing a real skill to rank.

So the scoreable skill is **colour matching**. The five bottles mix in RYB
paint space ([`color.ts`](src/games/slimeshop/color.ts)), so blue and yellow
make green the way a child expects and not the muddy grey that averaging RGB
would give. A customer asks for a specific colour; how close you got is
measurable, practisable, and quietly teaches colour theory.

Orders are generated **backwards from a recipe** rather than by picking a
random colour, so every ticket is provably mixable. Losing points to an
impossible order is the fastest way to make a game feel unfair, and there is a
test over 400 seeds asserting it can't happen.

The toy rules survive intact: you cannot lose, wrong mix-ins cost nothing (they
just earn nothing), the speed bonus only ever adds, and **Slime Lab** is a pure
sandbox with no score at all.

### How you play it

Pick a mode, then work the counter at the bottom of the screen:

| Control | What it does |
| --- | --- |
| **Bottles** (red / yellow / blue / white / black) | Tap to pour. The badge shows how many parts are in the bowl. |
| **Texture** | Cloud, butter, clear, crunchy, fluffy — changes how the slime looks and jiggles. |
| **Mix-ins** | Glitter, beads, boba, and star / heart / taco charms. Toggle on and off freely. |
| **DUMP** | Empties the bowl. Free, unlimited, no penalty. |
| **PLAY WITH IT** / **SERVE** | Takes the slime to the squish screen (lab), or hands it to the customer (shop). Disabled while the bowl is empty. |
| **Drag anywhere** | Squishes and stretches the slime. You don't have to touch the blob. |

Three modes:

- **SLIME LAB** — free play. No score, no timer, no orders. DONE leaves.
- **SHOP DAY** — six random customers, ranked on the all-time board.
- **TODAY'S SPECIAL** — six *seeded* customers, ranked on today's board.

Each order scores on colour accuracy (worth more than everything else
combined), texture match, mix-ins, and a speed bonus, with a streak multiplier
on consecutive perfect orders.

### The squish screen, and prizes

Every finished slime has prizes buried in it, and the only way to get them out
is to actually stretch and squash the thing.

That's the point. A prize that appeared the moment the slime was finished would
be a loot box — one tap, read the result, done. Making them surface only as you
work the slime means **the playing is the opening**, which is the whole reason
to have a squish screen rather than a results screen.

- **Nothing is on a timer and nothing can be missed.** Keep squishing and
  everything comes out. There's no way to lose a prize, only to not have found
  it yet.
- Prizes surface **one at a time**, shallowest first, so a child never misses
  two because they popped together. `buryPrizes()` makes the depths strictly
  increasing by construction rather than by arithmetic that can invert — a test
  holds that line.
- A vague lump shows through the slime before a prize breaks the surface. Fully
  hidden gives you nothing to aim at; fully visible removes the reason to dig.
- **Rarity** runs common → uncommon → rare → legendary, each with its own
  colour and its own fanfare. A legendary is deliberately the loudest sound in
  the arcade.
- Mixing well **tilts the odds** toward better prizes (a Shop Day's colour
  accuracy becomes the `luck` argument), but never gates them. A badly mixed
  slime still hides prizes, because the toy is not something you can fail.

Shop Day now ends on a reward slime — the day's takings, one last thing to pull
apart — instead of going straight to a score card.

### The Prize Jar

Everything ever dug out is kept in **`hyperdrive.slimeshop.prizes`**, so the jar
survives between sessions and every future slime is progress toward completing
it. Undiscovered prizes show as silhouettes, so the jar doubles as a want-list;
duplicates show a count.

Deliberately local-only — it never touches the leaderboard API. There's nothing
to cheat at, and nothing about a child's play habits leaves the device.

Emoji are the one exception to the project's no-assets rule. They're font
glyphs rather than files, so they cost nothing to download and still honour
"every asset is drawn at runtime" — and they buy ~33 instantly recognisable
collectables that would otherwise be ~33 hand-written path functions.

### Three boards, not one

`board_id` had been in the schema since day one, and `weeklySeed()` had been
sitting in `core/rng.ts` unused with a comment explaining the feature it was
waiting for. This is that feature.

| Tab | What it ranks |
| --- | --- |
| **ALL TIME** | Every ranked run, as before |
| **THIS WEEK** | Same board, last seven days |
| **TODAY** | The daily challenge — its own board, per day |

**Today's Special** seeds the day's six orders from the local date, so everyone
playing on a given day gets the *identical* six orders. That is what makes the
scores on that board genuinely comparable rather than luck-of-the-draw, and it
turns the leaderboard from a wall of unrelated numbers into a head-to-head on
the same challenge — which is a far better reason for a seven-year-old to come
back tomorrow than an abstract number.

Runs are filed under `daily-YYYY-MM-DD`. The seed and the board id come from
the same local date, so they always roll over together — deliberately local
rather than UTC, because a challenge that changes at 3pm is a bug however
correct the clock is.

Any future game gets the same treatment by setting `hasDailyChallenge` and
returning a `boardId` from its `RunSummary`.

---

## Brickfall, and where the music comes from

**The tune is "Korobeiniki", a Russian folk melody from 1861, and it is in the
public domain.** What is *not* public domain is any particular arrangement of
it, so `src/core/music.ts` contains our own: the melody transcribed into
note/beat pairs and voiced on a square lead over a triangle bass, synthesised
at runtime like every other sound in this project. No audio file was added.

Music needed a new piece of the audio engine. Effects are one-shots fired at
"now"; a melody scheduled that way audibly wanders, because `setTimeout` drifts
by tens of milliseconds. `MusicPlayer` instead keeps a cursor in AudioContext
time and schedules every note inside a short lookahead window, topping it up on
a coarse timer — so the timer can be late without any note being late. The
tempo lifts as the level climbs.

Music has its own switch in Settings, separate from the effects mute. A looping
tune is the first thing an adult in the room wants off and the last thing a
child does.

### A word on this genre specifically

Everywhere else in this arcade, "game mechanics aren't copyrightable" is the
whole story. This is the one genre where it isn't. In **Tetris Holding v. Xio
Interactive (2012)** the court agreed the rules were free to use and then found
against the clone anyway, because it had copied protectable *expression* — the
distinctive piece colours and the overall look.

So Brickfall takes the rules and none of the look: its own name, its own
palette drawn from this arcade's existing accents, its own art, its own music.
The seven shapes themselves are simply the complete set of four-cell
polyominoes, which is a mathematical fact rather than anyone's creative choice.

---

## JB's Tower Trouble

A climbing game built from an AI mock-up: JB in his cap and flannel, a crowned
scrap robot throwing junk, and the family dog waiting on the roof. The art was
redrawn as runtime vector paths like everything else here, so the mock-up
itself isn't in the project.

It keeps the genre's rules: junk rolls downhill and zig-zags down the tower,
sometimes taking a ladder instead, jumps are committed at take-off, and the
power-up that smashes junk also stops you climbing. None of the look is
borrowed: no ape, no plumber, no hammer, no damsel.

It is kinder than the original in three places, all deliberate:

- **A hit doesn't send you back to the bottom.** JB restarts on the girder he'd
  reached, at the foot of the ladder he came up, with the junk cleared and two
  seconds of safety. Losing a whole climb to one tyre is the part of the genre
  most likely to make a child put the phone down.
- **You can't walk off a girder**, and the bonus timer only drains points. The
  only thing that ends a run is running out of hearts.
- **Every rescue gives a heart back**, up to five.

The tower's geometry is pure data in `src/games/tower/level.ts`, and
`level.test.ts` checks the things that fail silently: every girder's open end
has a girder below it to catch the junk, every ladder sits fully on both
girders, the roof can be reached, junk always makes it to the bin, and a jump
clears the fastest junk the game ever throws.

---

## Versions and release notes

Every release is recorded in [`src/releases.ts`](src/releases.ts), which feeds
the in-app **What's new** screen (menu footer, and *Settings → Release notes*).
The menu shows a **NEW** badge until a player has opened the latest notes.

To ship a release:

1. Add an entry at the **top** of `RELEASES` — version, date, a title, and
   notes written for the family (what someone will *notice*, not which file
   changed).
2. Set the same version in `package.json`.
3. `npm test` — `releases.test.ts` fails if the two disagree or the history is
   out of order.

That test exists because the version sat at `0.1.0` from August through eight
releases. It's stamped into every feedback note so a report can be tied to a
build, and for six weeks every report said the same thing. Versions 0.2.0–0.8.0
were assigned afterwards from the git history, using the real dates.

Bump `CACHE_VERSION` in `public/sw.js` too whenever the shell changes, or an
installed phone keeps serving the old one.

### Brickfall's levels

The first three levels take **4** cleared lines each, every level after that
takes **8**, and reaching level 25 takes **180** lines in all. The side panel
counts down to the next level. The early levels are short on purpose: the
first playtest ran 3:39 without a single level-up.

---

## Adding another game

The shell owns the loop, pause, audio, scoring, HUD and leaderboard. A game
implements [`GameModule`](src/core/game.ts) — `update`, `render`, `hud` — and
gets all of that for free.

1. Write `src/games/<name>/index.ts` exporting a `GameModule`.
2. Add it to the array in [`src/games/index.ts`](src/games/index.ts).

Its cabinet appears on the arcade floor automatically, drawing the marquee art
from the module's own `drawIcon`.

That's the whole integration. Its scores are keyed on the module's `id`, so it
gets its own leaderboard automatically. Don't change an `id` once it's live —
that's the leaderboard key.

A few optional hooks, all of which default to the old behaviour:

- `drawLifeIcon` reskins the HUD's life pips (Slime Shop draws jars still to
  fill, because a slime counter has no lives).
- `extraControls()` mounts DOM chrome for games that need real tap targets
  rather than canvas hit-testing — Slime Shop's whole counter is DOM for the
  same reason the leaderboard is: real targets, real focus rings, and it grows
  with the large-text setting.
- `RunSummary.ranked: false` marks a run as practice, so the shell skips
  submission and the personal best instead of posting a zero.
- `RunSummary.boardId` files a run on a specific board (see the daily board
  above); `RunSummary.headline` replaces "GAME OVER" for modes where losing
  isn't a concept.

---

## Layout

```
src/core/     loop, input, audio, storage, api, view, wakelock, game contract
src/ui/       hud, leaderboard, settings
src/games/    one folder per game
worker/       leaderboard API + D1 schema
```

The arcade menu is a grid of cabinet tiles, each rendering its game's
`drawIcon` marquee into a small canvas. Five machines as a column of
full-width buttons no longer fitted a phone.

Slime Shop is the one game split across several files, because its rules are
worth testing away from the DOM:

```
src/games/slimeshop/
  color.ts       RYB paint mixing, colour matching, colour naming
  orders.ts      seeded order generation (pure, so the daily seed is testable)
  prizes.ts      the prize table, rarity rolls, and how deep each one is buried
  collection.ts  the Prize Jar, persisted to localStorage
  render.ts      the springy blob, the cast, the counter, the ticket, the prizes
  types.ts       textures, mix-ins, order and verdict shapes
  index.ts       the GameModule: modes, scoring, digging, the DOM panels
```

Highway Hop is split the same way, and for the same reason:

```
src/games/crossing/
  types.ts       the board, and traffic as a pure function of the clock
  lanes.ts       seeded level generation, with the crossability clamps
  render.ts      frog, cars, trucks, logs, turtles, road, river
  index.ts       the GameModule: hopping, riding, scoring
```

The rule of thumb across both: anything whose *rules* can be got wrong lives in
a DOM-free module with a test beside it. `color.ts`, `orders.ts`, `prizes.ts`,
`lanes.ts` and the reef's `maze.ts` all qualify. Note that every module a test
can reach needs real `.ts` extensions on its relative imports, and must avoid
TypeScript parameter properties (`constructor(private x: T)`) — Node's
strip-only mode supports neither.
Note that both use explicit `.ts` extensions on their relative imports — Node's
type stripping requires it for anything reachable from a test.

## Notes on scores

Anyone determined can forge a score POST — this is a browser game with no
server-side simulation, and it would be dishonest to claim otherwise. The
server does validate shape and ranges, reject physically implausible
score/time/wave combinations, and rate-limit submissions, which handles casual
tampering. For a board shared between family and friends that's the right
amount; the `ADMIN_TOKEN` delete is there for anything that slips through.

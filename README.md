# Hyperdrive Arcade

A mobile-first PWA arcade, built as a family project. Four games, a shared
online leaderboard, a real pause button, and it plays with no signal.

**[play.hyperdrive-arcade.workers.dev](https://play.hyperdrive-arcade.workers.dev)**
— open it on a phone and Add to Home Screen.

| Game | Owes its rules to | What it keeps |
| --- | --- | --- |
| **Starfighter** | Galaga | Bezier entry flights, dive attacks, only two shots on screen at once, and a cruiser that steals your fighter — shoot it down and you fly two abreast |
| **Nathan's Mallard Challenge** | Duck Hunt | The dog's whole routine: walks the field, sniffs, flushes the birds, and rears up laughing when you miss |
| **Miss Riley's Reef** | Ms. Pac-Man | Tile-snapped movement with buffered turns, scatter/chase waves, and four pursuers that each hunt differently |
| **Riley's Slime Shop** | Slime-mixing toys, by way of a diner order queue | Bottles that mix like paint rather than like pixels, so blue and yellow make green — and a daily challenge everyone plays from the same seed |

Every theme is original — no trademarked names, art or audio anywhere — so it's
safe to share with anyone. All art is vector paths drawn at runtime and every
sound is synthesised from oscillators and noise. There isn't a single image or
audio asset in the project, which is why the whole arcade is a ~37 KB download.

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
npm test             # pause/resume, reef maze validation, slime colour + daily seeding
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
| **SERVE** | Hands it over. Disabled while the bowl is empty. |
| **Drag anywhere** | Squishes and stretches the slime. You don't have to touch the blob. |

Three modes:

- **SLIME LAB** — free play. No score, no timer, no orders. DONE leaves.
- **SHOP DAY** — six random customers, ranked on the all-time board.
- **TODAY'S SPECIAL** — six *seeded* customers, ranked on today's board.

Each order scores on colour accuracy (worth more than everything else
combined), texture match, mix-ins, and a speed bonus, with a streak multiplier
on consecutive perfect orders.

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

## Adding another game

The shell owns the loop, pause, audio, scoring, HUD and leaderboard. A game
implements [`GameModule`](src/core/game.ts) — `update`, `render`, `hud` — and
gets all of that for free.

1. Write `src/games/<name>/index.ts` exporting a `GameModule`.
2. Add it to the array in [`src/games/index.ts`](src/games/index.ts).

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

Slime Shop is the one game split across several files, because its rules are
worth testing away from the DOM:

```
src/games/slimeshop/
  color.ts      RYB paint mixing, colour matching, colour naming
  orders.ts     seeded order generation (pure, so the daily seed is testable)
  render.ts     the springy blob, the cast, the counter, the ticket
  types.ts      textures, mix-ins, order and verdict shapes
  index.ts      the GameModule: modes, scoring, the DOM counter panel
```

`color.ts` and `orders.ts` have no DOM dependencies and carry the test suite.
Note that both use explicit `.ts` extensions on their relative imports — Node's
type stripping requires it for anything reachable from a test.

## Notes on scores

Anyone determined can forge a score POST — this is a browser game with no
server-side simulation, and it would be dishonest to claim otherwise. The
server does validate shape and ranges, reject physically implausible
score/time/wave combinations, and rate-limit submissions, which handles casual
tampering. For a board shared between family and friends that's the right
amount; the `ADMIN_TOKEN` delete is there for anything that slips through.

# Hyperdrive Arcade

A mobile-first PWA arcade. v1 ships **STARFIGHTER**, a Galaga-shaped shooter,
with a shared online leaderboard and a real pause button.

Original space-opera theme throughout — no trademarked names, art or audio — so
it's safe to share with anyone.

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
npm test             # game-loop / pause behaviour
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

---

## Layout

```
src/core/     loop, input, audio, storage, api, view, wakelock, game contract
src/ui/       hud, leaderboard, settings
src/games/    one folder per game
worker/       leaderboard API + D1 schema
```

## Notes on scores

Anyone determined can forge a score POST — this is a browser game with no
server-side simulation, and it would be dishonest to claim otherwise. The
server does validate shape and ranges, reject physically implausible
score/time/wave combinations, and rate-limit submissions, which handles casual
tampering. For a board shared between family and friends that's the right
amount; the `ADMIN_TOKEN` delete is there for anything that slips through.

-- Dad's Arcade leaderboard.
--
-- This file is applied on EVERY deploy (scripts/deploy.mjs step 4), so every
-- statement in it must be safe to run again: CREATE ... IF NOT EXISTS,
-- DROP INDEX IF EXISTS, INSERT OR IGNORE. Never put a bare DROP TABLE,
-- DELETE or UPDATE in here.
--
-- `board_id` exists from day one even though v1 only ever writes 'global'.
-- Adding private share-code boards later is then a feature, not a migration.

-- Every submitted run, forever. The history: "my top 10", the weekly board,
-- recent scores on /admin. Leaderboards do NOT read this table any more (see
-- best_scores below).
CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    TEXT    NOT NULL DEFAULT 'global',
  game_id     TEXT    NOT NULL,
  initials    TEXT    NOT NULL,
  device_id   TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  wave        INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Serves "my best runs".
CREATE INDEX IF NOT EXISTS idx_scores_device
  ON scores (device_id, game_id, score DESC);

-- Serves /admin's "last 7 days" counts and "recent scores".
CREATE INDEX IF NOT EXISTS idx_scores_created
  ON scores (created_at);

-- Serves the per-device rate limit: only that device's last minute is read,
-- instead of every run the device has ever made.
CREATE INDEX IF NOT EXISTS idx_scores_device_created
  ON scores (device_id, created_at);

-- Serves the weekly board: only this game's last 7 days are read.
CREATE INDEX IF NOT EXISTS idx_scores_board_game_created
  ON scores (board_id, game_id, created_at);

-- Was the all-time board's index. Boards now read best_scores, so this only
-- cost an extra row write on every run.
DROP INDEX IF EXISTS idx_scores_board_game_score;

-- One row per device per game per board: that device's best run, plus how
-- many runs it has submitted there. Written alongside every score.
--
-- Why it exists: D1's free plan allows 5M rows READ per day, and reads are
-- counted per row scanned. The old all-time board and the rank lookup both
-- scanned every run a game had ever had, so each view got more expensive as
-- history grew. Reading this table instead costs about one row per player
-- shown, however many runs exist.
CREATE TABLE IF NOT EXISTS best_scores (
  board_id    TEXT    NOT NULL,
  game_id     TEXT    NOT NULL,
  device_id   TEXT    NOT NULL,
  initials    TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  wave        INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  runs        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (board_id, game_id, device_id)
) WITHOUT ROWID;

-- Serves the all-time board (top N) and the rank lookup (count above me).
CREATE INDEX IF NOT EXISTS idx_best_board_game_score
  ON best_scores (board_id, game_id, score DESC, created_at ASC);

-- One-time backfill from history. OR IGNORE makes re-runs a no-op for rows
-- that already exist, so a later, better score written by the Worker is never
-- overwritten by this. SQLite's bare-column rule takes the other columns from
-- the row that produced MAX(score).
INSERT OR IGNORE INTO best_scores
  (board_id, game_id, device_id, initials, score, wave, duration_ms, created_at, runs)
SELECT board_id, game_id, device_id, initials, MAX(score), wave, duration_ms, created_at, COUNT(*)
  FROM scores
 GROUP BY board_id, game_id, device_id;

-- Player feedback. Deliberately in the same database as scores so there's one
-- thing to deploy and one place to read from (`npm run feedback`).
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT    NOT NULL,
  initials   TEXT,
  message    TEXT    NOT NULL,
  -- Small JSON blob: app version, screen size, installed-or-browser. Enough to
  -- act on a report without having to ask non-technical questions.
  context    TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON feedback (created_at DESC);

-- Plays, rolled up per UTC day, game and device: one row however many times
-- that device starts that game that day, so it costs one row write per start
-- and stays small. This is what counts games with no leaderboard (Black Disc,
-- practice runs) and runs that were quit before game over.
CREATE TABLE IF NOT EXISTS play_days (
  day        TEXT    NOT NULL,  -- YYYY-MM-DD, UTC
  game_id    TEXT    NOT NULL,
  device_id  TEXT    NOT NULL,
  plays      INTEGER NOT NULL DEFAULT 1,
  installed  INTEGER NOT NULL DEFAULT 0,  -- 1 = launched from the home screen
  version    TEXT,
  PRIMARY KEY (day, game_id, device_id)
) WITHOUT ROWID;

-- Scores the server refused, counted per UTC day and reason. A jump in
-- implausible_score or invalid_* is the first sign someone is poking the API.
CREATE TABLE IF NOT EXISTS rejections (
  day    TEXT    NOT NULL,
  reason TEXT    NOT NULL,
  n      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, reason)
) WITHOUT ROWID;

-- Devices the admin has marked as their own (family, testing), so /admin can
-- describe real players. kind 'device' = one device id; kind 'initials' = every
-- device that has submitted a score under those initials, including ones that
-- show up later. Only /admin reads this; the game never does.
CREATE TABLE IF NOT EXISTS mine (
  kind       TEXT    NOT NULL,   -- 'device' | 'initials'
  value      TEXT    NOT NULL,
  label      TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, value)
) WITHOUT ROWID;

-- A saved race: one device's fastest run of one course, kept as the button
-- presses that made it (a JSON array of a few hundred small numbers), so
-- another device can replay it and race against it. One row per device per
-- course, replaced only by a faster run, so it stays as small as the family.
-- `course` includes a fingerprint of the layout and rules the run was made on
-- (see courseKey in src/games/forestdash/track.ts).
CREATE TABLE IF NOT EXISTS ghosts (
  game_id    TEXT    NOT NULL,
  course     TEXT    NOT NULL,
  device_id  TEXT    NOT NULL,
  initials   TEXT    NOT NULL DEFAULT '',
  character  TEXT    NOT NULL,
  time_ms    INTEGER NOT NULL,
  log        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, course, device_id)
) WITHOUT ROWID;

-- Serves "the fastest few runs of this course".
CREATE INDEX IF NOT EXISTS idx_ghosts_course_time
  ON ghosts (game_id, course, time_ms);

-- Serves "devices that belong to these initials" for the mine filter, and the
-- per-player rollup on /admin.
CREATE INDEX IF NOT EXISTS idx_best_initials
  ON best_scores (initials);

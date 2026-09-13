-- Dad's Arcade leaderboard.
--
-- `board_id` exists from day one even though v1 only ever writes 'global'.
-- Adding private share-code boards later is then a feature, not a migration.

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

-- Serves the main board query: top N for a game, newest-first tiebreak.
CREATE INDEX IF NOT EXISTS idx_scores_board_game_score
  ON scores (board_id, game_id, score DESC);

-- Serves "my best runs".
CREATE INDEX IF NOT EXISTS idx_scores_device
  ON scores (device_id, game_id, score DESC);

-- Serves the weekly board and the rate-limit lookback.
CREATE INDEX IF NOT EXISTS idx_scores_created
  ON scores (created_at);

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

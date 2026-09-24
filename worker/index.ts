/**
 * Dad's Arcade worker: leaderboard API + static site, one deployment.
 *
 * A note on cheating, since it would be easy to oversell what this does.
 * This is a browser game with no server-side simulation, so anyone willing to
 * open devtools can POST a number. What's here raises the bar past casual
 * tampering and keeps the board sane:
 *   - shape and range validation,
 *   - physical plausibility (score vs. time vs. wave),
 *   - a short-window rate limit,
 *   - an admin token for deleting anything silly.
 * It is deliberately NOT cryptographic integrity. For a board shared between
 * family and friends that is the right amount of effort.
 *
 * The plausibility bounds are intentionally generous. Wrongly rejecting a
 * genuine personal best is a much worse outcome here than admitting a fake one.
 */

import { ADMIN_PAGE_HTML } from "./admin-page";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Optional: set via `wrangler secret put ADMIN_TOKEN` to enable deletes and `/admin`. */
  ADMIN_TOKEN?: string;
}

interface ScoreSubmission {
  gameId: string;
  initials: string;
  deviceId: string;
  score: number;
  wave: number;
  durationMs: number;
  boardId: string;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Ceiling on points per second of play, well above real-world scoring. */
const MAX_POINTS_PER_SECOND = 3000;
/** Ceiling on points per wave reached. */
const MAX_POINTS_PER_WAVE = 15000;
/** Slack so short, early runs aren't judged too harshly. */
const SCORE_GRACE = 10000;

/** Submissions allowed per device in the rate-limit window. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Feedback is lower-volume and longer-form, so it gets its own looser limit. */
const FEEDBACK_MAX_LENGTH = 2000;
const FEEDBACK_LIMIT = 5;
const FEEDBACK_WINDOW_MS = 10 * 60_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Not part of the built SPA and not asset-served: the Worker answers this
    // one directly. `run_worker_first` in wrangler.jsonc must list it, or the
    // asset router's SPA fallback would serve index.html here instead.
    if (url.pathname === "/admin") {
      return request.method === "GET" ? adminPage() : json({ error: "method_not_allowed" }, 405);
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await route(request, env, url);
    } catch (error) {
      console.error("Unhandled API error", error);
      return json({ error: "internal_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function adminPage(): Response {
  return new Response(ADMIN_PAGE_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;

  if (pathname === "/api/scores" && request.method === "GET") {
    return getScores(env, url);
  }
  if (pathname === "/api/scores" && request.method === "POST") {
    return postScore(request, env);
  }
  if (pathname === "/api/scores/me" && request.method === "GET") {
    return getMyScores(env, url);
  }
  if (pathname === "/api/feedback" && request.method === "POST") {
    return postFeedback(request, env);
  }
  if (pathname.startsWith("/api/scores/") && request.method === "DELETE") {
    return deleteScore(request, env, pathname);
  }
  if (pathname.startsWith("/api/admin/")) {
    if (!isAuthorizedAdmin(request, env)) return json({ error: "forbidden" }, 403);
    if (pathname === "/api/admin/overview" && request.method === "GET") {
      return getAdminOverview(env);
    }
    return json({ error: "not_found" }, 404);
  }
  return json({ error: "not_found" }, 404);
}

// ----- Handlers -----

async function getScores(env: Env, url: URL): Promise<Response> {
  const gameId = url.searchParams.get("game")?.trim();
  if (!gameId) return json({ error: "missing_game" }, 400);

  const boardId = url.searchParams.get("board")?.trim() || "global";
  if (!/^[a-z0-9-]{1,40}$/.test(boardId)) return json({ error: "invalid_board" }, 400);
  const limit = clampInt(
    Number(url.searchParams.get("limit")) || DEFAULT_LIMIT,
    1,
    MAX_LIMIT,
  );
  const since =
    url.searchParams.get("period") === "week" ? Date.now() - WEEK_MS : 0;
  // Optional: lets the server flag which row belongs to the caller without
  // ever sending other players' device ids back to the client.
  const deviceId = url.searchParams.get("device")?.trim() ?? "";

  // One row per device: the board should read as a list of players, not the
  // same person's twenty best runs. SQLite's bare-column rule guarantees the
  // other columns come from the same row that produced MAX(score).
  const { results } = await env.DB.prepare(
    `SELECT initials,
            MAX(score) AS score,
            wave,
            duration_ms,
            created_at,
            (device_id = ?5) AS is_you
       FROM scores
      WHERE board_id = ?1 AND game_id = ?2 AND created_at >= ?3
      GROUP BY device_id
      ORDER BY score DESC, created_at ASC
      LIMIT ?4`,
  )
    .bind(boardId, gameId, since, limit, deviceId)
    .all();

  return json({ scores: results ?? [] });
}

async function getMyScores(env: Env, url: URL): Promise<Response> {
  const gameId = url.searchParams.get("game")?.trim();
  const deviceId = url.searchParams.get("device")?.trim();
  if (!gameId || !deviceId) return json({ error: "missing_params" }, 400);

  const { results } = await env.DB.prepare(
    `SELECT initials, score, wave, duration_ms, created_at
       FROM scores
      WHERE game_id = ?1 AND device_id = ?2
      ORDER BY score DESC
      LIMIT 10`,
  )
    .bind(gameId, deviceId)
    .all();

  return json({ scores: results ?? [] });
}

async function postScore(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const submission = validate(body);
  if ("error" in submission) return json(submission, 400);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE device_id = ?1 AND created_at > ?2`,
  )
    .bind(submission.deviceId, Date.now() - RATE_LIMIT_WINDOW_MS)
    .first<{ n: number }>();

  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    return json({ error: "rate_limited" }, 429);
  }

  await env.DB.prepare(
    `INSERT INTO scores
       (board_id, game_id, initials, device_id, score, wave, duration_ms, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      submission.boardId,
      submission.gameId,
      submission.initials,
      submission.deviceId,
      submission.score,
      submission.wave,
      submission.durationMs,
      Date.now(),
    )
    .run();

  // Tell the client where it landed, so the game-over screen can say
  // "3rd on the board" instead of just "submitted". Ranked within the board it
  // was actually filed under -- being told you came 4th all-time when you were
  // playing today's challenge would be a lie, and a discouraging one.
  const rank = await env.DB.prepare(
    `SELECT COUNT(*) + 1 AS rank
       FROM (SELECT MAX(score) AS best
               FROM scores
              WHERE board_id = ?1 AND game_id = ?2
              GROUP BY device_id)
      WHERE best > ?3`,
  )
    .bind(submission.boardId, submission.gameId, submission.score)
    .first<{ rank: number }>();

  return json({ ok: true, rank: rank?.rank ?? null });
}

/**
 * Player feedback. There is no GET counterpart on purpose -- reading it goes
 * through `npm run feedback`, which uses your existing Wrangler login. That
 * means no admin token to leak and no endpoint to secure.
 */
async function postFeedback(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "invalid_body" }, 400);
  }
  const raw = body as Record<string, unknown>;

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length === 0) return json({ error: "empty_message" }, 400);
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return json({ error: "message_too_long" }, 400);
  }

  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.trim() : "";
  if (deviceId.length < 8 || deviceId.length > 64) {
    return json({ error: "invalid_device" }, 400);
  }

  const initials =
    typeof raw.initials === "string"
      ? raw.initials.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)
      : null;

  const context =
    typeof raw.context === "string" ? raw.context.slice(0, 500) : null;

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM feedback WHERE device_id = ?1 AND created_at > ?2`,
  )
    .bind(deviceId, Date.now() - FEEDBACK_WINDOW_MS)
    .first<{ n: number }>();

  if ((recent?.n ?? 0) >= FEEDBACK_LIMIT) {
    return json({ error: "rate_limited" }, 429);
  }

  await env.DB.prepare(
    `INSERT INTO feedback (device_id, initials, message, context, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(deviceId, initials, message, context, Date.now())
    .run();

  return json({ ok: true });
}

/** Without a configured token, admin access is disabled entirely rather than open. */
function isAuthorizedAdmin(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  const provided = request.headers.get("X-Admin-Token");
  return Boolean(token && provided && timingSafeEqual(provided, token));
}

async function deleteScore(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (!isAuthorizedAdmin(request, env)) return json({ error: "forbidden" }, 403);

  const id = Number(pathname.slice("/api/scores/".length));
  if (!Number.isInteger(id) || id <= 0) return json({ error: "bad_id" }, 400);

  await env.DB.prepare(`DELETE FROM scores WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}

interface GameStatsRow {
  gameId: string;
  totalScores: number;
  weekScores: number;
  uniqueDevices: number;
}

interface RecentScoreRow {
  gameId: string;
  initials: string;
  score: number;
  boardId: string;
  createdAt: number;
}

interface FeedbackRow {
  initials: string | null;
  message: string;
  context: string | null;
  createdAt: number;
}

interface DailyBoardRow {
  boardId: string;
  scores: number;
  uniqueDevices: number;
  games: number;
  lastPlayed: number;
}

/**
 * Everything the admin dashboard needs in one round trip: per-game totals
 * (all-time and last 7 days, for "most popular game"), unique devices per
 * game as a rough player count, the newest scores and feedback across every
 * game, and any `daily-YYYY-MM-DD` board activity.
 */
async function getAdminOverview(env: Env): Promise<Response> {
  const weekSince = Date.now() - WEEK_MS;

  const games = await env.DB.prepare(
    `SELECT game_id AS gameId,
            COUNT(*) AS totalScores,
            SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS weekScores,
            COUNT(DISTINCT device_id) AS uniqueDevices
       FROM scores
      GROUP BY game_id
      ORDER BY totalScores DESC`,
  )
    .bind(weekSince)
    .all<GameStatsRow>();

  const recentScores = await env.DB.prepare(
    `SELECT game_id AS gameId, initials, score, board_id AS boardId, created_at AS createdAt
       FROM scores
      ORDER BY created_at DESC
      LIMIT 50`,
  ).all<RecentScoreRow>();

  const feedback = await env.DB.prepare(
    `SELECT initials, message, context, created_at AS createdAt
       FROM feedback
      ORDER BY created_at DESC
      LIMIT 30`,
  ).all<FeedbackRow>();

  const dailyBoards = await env.DB.prepare(
    `SELECT board_id AS boardId,
            COUNT(*) AS scores,
            COUNT(DISTINCT device_id) AS uniqueDevices,
            COUNT(DISTINCT game_id) AS games,
            MAX(created_at) AS lastPlayed
       FROM scores
      WHERE board_id LIKE 'daily-%'
      GROUP BY board_id
      ORDER BY boardId DESC
      LIMIT 60`,
  ).all<DailyBoardRow>();

  return json({
    games: games.results ?? [],
    recentScores: recentScores.results ?? [],
    feedback: feedback.results ?? [],
    dailyBoards: dailyBoards.results ?? [],
  });
}

// ----- Validation -----

function validate(body: unknown): ScoreSubmission | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "invalid_body" };
  const raw = body as Record<string, unknown>;

  const gameId = typeof raw.gameId === "string" ? raw.gameId.trim() : "";
  if (!/^[a-z0-9-]{1,32}$/.test(gameId)) return { error: "invalid_game" };

  // Absent means the main board, which is what every existing game sends.
  // The charset is deliberately narrow: board ids are concatenated into
  // nothing, but they are player-influenced input that ends up as a stored
  // key, and there is no reason to accept anything but the shape we issue.
  const boardId =
    typeof raw.boardId === "string" && raw.boardId.trim().length > 0
      ? raw.boardId.trim()
      : "global";
  if (!/^[a-z0-9-]{1,40}$/.test(boardId)) return { error: "invalid_board" };

  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.trim() : "";
  if (deviceId.length < 8 || deviceId.length > 64) {
    return { error: "invalid_device" };
  }

  const initials = (typeof raw.initials === "string" ? raw.initials : "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  if (initials.length === 0) return { error: "invalid_initials" };

  const score = toInt(raw.score);
  const wave = toInt(raw.wave);
  const durationMs = toInt(raw.durationMs);
  if (score === null || wave === null || durationMs === null) {
    return { error: "invalid_numbers" };
  }
  if (score < 0 || score > 100_000_000) return { error: "score_out_of_range" };
  if (wave < 1 || wave > 9999) return { error: "wave_out_of_range" };
  // Under three seconds nothing meaningful can have happened; over six hours is
  // a stuck tab rather than a run.
  if (durationMs < 3000 || durationMs > 6 * 60 * 60 * 1000) {
    return { error: "duration_out_of_range" };
  }

  const ceiling = Math.min(
    MAX_POINTS_PER_SECOND * (durationMs / 1000),
    MAX_POINTS_PER_WAVE * wave,
  ) + SCORE_GRACE;
  if (score > ceiling) return { error: "implausible_score" };

  return { gameId, initials, deviceId, score, wave, durationMs, boardId };
}

function toInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/** Constant-time compare so the admin token can't be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

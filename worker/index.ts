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
  /**
   * Per-IP limiter for every write endpoint (wrangler.jsonc "ratelimits").
   * Optional so the Worker still runs if the binding is ever removed.
   */
  WRITE_LIMITER?: RateLimit;
  /**
   * Optional, for the /admin capacity card's live usage numbers. A Cloudflare
   * API token with "Account Analytics: Read", and the account id. Without
   * them the card falls back to row counts from the database itself.
   */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}

/** Workers rate-limit binding, typed here so no types package bump is needed. */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
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

/** Game ids are the leaderboard keys; this is the shape every game uses. */
const GAME_ID_RE = /^[a-z0-9-]{1,32}$/;

/** Workers Free plan daily allowances, shown against usage on /admin. */
export const FREE_PLAN = {
  workerRequests: 100_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
} as const;

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

  // Every write goes through the per-IP limiter first. The per-device limits
  // below trust a device id the phone makes up, so on their own anyone could
  // dodge them by sending a new id each time. This one is keyed on the
  // connecting IP, costs no database reads or writes, and a whole family on
  // one wifi stays far below it.
  if (request.method === "POST" || request.method === "DELETE") {
    if (!(await withinIpLimit(request, env))) {
      console.warn("ip_rate_limited", pathname);
      return json({ error: "rate_limited" }, 429);
    }
  }

  if (pathname === "/api/plays" && request.method === "POST") {
    return postPlay(request, env);
  }
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
  // same person's twenty best runs.
  //
  // All-time boards read best_scores, which already holds one row per device,
  // through an index in board order -- so the cost is about `limit` rows
  // however much history exists. The weekly board has to look at this week's
  // runs, and its index keeps that to one game's last 7 days.
  const { results } =
    since === 0
      ? await env.DB.prepare(
          `SELECT initials, score, wave, duration_ms, created_at,
                  (device_id = ?4) AS is_you
             FROM best_scores
            WHERE board_id = ?1 AND game_id = ?2
            ORDER BY score DESC, created_at ASC
            LIMIT ?3`,
        )
          .bind(boardId, gameId, limit, deviceId)
          .all()
      : await env.DB.prepare(
          // SQLite's bare-column rule guarantees the other columns come from
          // the same row that produced MAX(score).
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
  if ("error" in submission) {
    await countRejection(env, submission.error);
    return json(submission, 400);
  }

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE device_id = ?1 AND created_at > ?2`,
  )
    .bind(submission.deviceId, Date.now() - RATE_LIMIT_WINDOW_MS)
    .first<{ n: number }>();

  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    await countRejection(env, "rate_limited");
    return json({ error: "rate_limited" }, 429);
  }

  const now = Date.now();
  // The run goes into history, and into best_scores if it beats this device's
  // best on this board. One batch, so both land or neither does.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO scores
         (board_id, game_id, initials, device_id, score, wave, duration_ms, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      submission.boardId,
      submission.gameId,
      submission.initials,
      submission.deviceId,
      submission.score,
      submission.wave,
      submission.durationMs,
      now,
    ),
    env.DB.prepare(
      // Every SET expression sees the OLD row, so the CASEs all compare
      // against the previous best, not a half-updated one.
      `INSERT INTO best_scores
         (board_id, game_id, device_id, initials, score, wave, duration_ms, created_at, runs)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)
       ON CONFLICT (board_id, game_id, device_id) DO UPDATE SET
         runs        = best_scores.runs + 1,
         initials    = excluded.initials,
         wave        = CASE WHEN excluded.score > best_scores.score THEN excluded.wave        ELSE best_scores.wave        END,
         duration_ms = CASE WHEN excluded.score > best_scores.score THEN excluded.duration_ms ELSE best_scores.duration_ms END,
         created_at  = CASE WHEN excluded.score > best_scores.score THEN excluded.created_at  ELSE best_scores.created_at  END,
         score       = CASE WHEN excluded.score > best_scores.score THEN excluded.score       ELSE best_scores.score       END`,
    ).bind(
      submission.boardId,
      submission.gameId,
      submission.deviceId,
      submission.initials,
      submission.score,
      submission.wave,
      submission.durationMs,
      now,
    ),
  ]);

  // Tell the client where it landed, so the game-over screen can say
  // "3rd on the board" instead of just "submitted". Ranked within the board it
  // was actually filed under -- being told you came 4th all-time when you were
  // playing today's challenge would be a lie, and a discouraging one.
  // Reads only the players above this score, via the board index.
  const rank = await env.DB.prepare(
    `SELECT COUNT(*) + 1 AS rank
       FROM best_scores
      WHERE board_id = ?1 AND game_id = ?2 AND score > ?3`,
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

  const row = await env.DB.prepare(
    `SELECT board_id, game_id, device_id FROM scores WHERE id = ?1`,
  )
    .bind(id)
    .first<{ board_id: string; game_id: string; device_id: string }>();
  if (!row) return json({ error: "not_found" }, 404);

  // Remove the run, then rebuild that one device's best on that board from
  // what's left (or drop it if nothing is left), so a deleted silly score
  // doesn't live on in best_scores.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM scores WHERE id = ?1`).bind(id),
    env.DB.prepare(
      `DELETE FROM best_scores WHERE board_id = ?1 AND game_id = ?2 AND device_id = ?3`,
    ).bind(row.board_id, row.game_id, row.device_id),
    env.DB.prepare(
      `INSERT INTO best_scores
         (board_id, game_id, device_id, initials, score, wave, duration_ms, created_at, runs)
       SELECT board_id, game_id, device_id, initials, MAX(score), wave, duration_ms, created_at, COUNT(*)
         FROM scores
        WHERE board_id = ?1 AND game_id = ?2 AND device_id = ?3
        GROUP BY board_id, game_id, device_id`,
    ).bind(row.board_id, row.game_id, row.device_id),
  ]);
  return json({ ok: true });
}

// ----- Plays, limits and counters -----

/** UTC calendar day, matching when Cloudflare's free allowances reset. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function withinIpLimit(request: Request, env: Env): Promise<boolean> {
  if (!env.WRITE_LIMITER) return true;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  try {
    const { success } = await env.WRITE_LIMITER.limit({ key: ip });
    return success;
  } catch (error) {
    // A limiter hiccup must never lock the family out of their own board.
    console.error("rate limiter failed", error);
    return true;
  }
}

/** Best-effort: a failed counter never turns a 400 into a 500. */
async function countRejection(env: Env, reason: string): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO rejections (day, reason, n) VALUES (?1, ?2, 1)
       ON CONFLICT (day, reason) DO UPDATE SET n = n + 1`,
    )
      .bind(utcDay(Date.now()), reason.slice(0, 40))
      .run();
  } catch (error) {
    console.error("countRejection failed", error);
  }
}

/**
 * A game was started. Rolled up to one row per device, game and UTC day, so a
 * start costs one row write and the table grows with active devices, not taps.
 */
async function postPlay(request: Request, env: Env): Promise<Response> {
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

  const gameId = typeof raw.gameId === "string" ? raw.gameId.trim() : "";
  if (!GAME_ID_RE.test(gameId)) return json({ error: "invalid_game" }, 400);

  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.trim() : "";
  if (deviceId.length < 8 || deviceId.length > 64) {
    return json({ error: "invalid_device" }, 400);
  }

  const installed = raw.installed === true ? 1 : 0;
  const version =
    typeof raw.version === "string" && /^[0-9A-Za-z.+-]{1,20}$/.test(raw.version)
      ? raw.version
      : null;

  await env.DB.prepare(
    `INSERT INTO play_days (day, game_id, device_id, plays, installed, version)
     VALUES (?1, ?2, ?3, 1, ?4, ?5)
     ON CONFLICT (day, game_id, device_id) DO UPDATE SET
       plays     = play_days.plays + 1,
       installed = MAX(play_days.installed, excluded.installed),
       version   = COALESCE(excluded.version, play_days.version)`,
  )
    .bind(utcDay(Date.now()), gameId, deviceId, installed, version)
    .run();

  return json({ ok: true });
}

// ----- Admin overview -----

interface GameStatsRow {
  gameId: string;
  plays7d: number;
  playsToday: number;
  activeDevices7d: number;
  runsAllTime: number;
  runs7d: number;
  devicesAllTime: number;
  playersAllTime: number;
}

/**
 * Everything /admin shows, in one round trip. Every query here is shaped to
 * read little: play_days and best_scores are one row per device, and the only
 * reads of the scores history are index ranges bounded by time or LIMIT.
 */
async function getAdminOverview(env: Env): Promise<Response> {
  const now = Date.now();
  const today = utcDay(now);
  const day7 = utcDay(now - 6 * 24 * 60 * 60 * 1000); // today + 6 days back
  const day30 = utcDay(now - 29 * 24 * 60 * 60 * 1000);
  const weekSince = now - WEEK_MS;

  const [
    playsByGame,
    runsByGame,
    runs7dByGame,
    totals,
    returning,
    installSplit,
    versions,
    playsByDay,
    rejections,
    recentScores,
    feedback,
    dailyBoards,
    tableSizes,
  ] = await env.DB.batch([
    env.DB.prepare(
      `SELECT game_id AS gameId,
              SUM(plays) AS plays7d,
              SUM(CASE WHEN day = ?2 THEN plays ELSE 0 END) AS playsToday,
              COUNT(DISTINCT device_id) AS activeDevices7d
         FROM play_days
        WHERE day >= ?1
        GROUP BY game_id`,
    ).bind(day7, today),
    env.DB.prepare(
      `SELECT game_id AS gameId,
              SUM(runs) AS runsAllTime,
              COUNT(*) AS devicesAllTime,
              COUNT(DISTINCT initials) AS playersAllTime
         FROM best_scores
        WHERE board_id = 'global'
        GROUP BY game_id`,
    ),
    env.DB.prepare(
      `SELECT game_id AS gameId, COUNT(*) AS runs7d
         FROM scores
        WHERE created_at >= ?1
        GROUP BY game_id`,
    ).bind(weekSince),
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(DISTINCT device_id) FROM play_days WHERE day = ?1) AS devicesToday,
         (SELECT COUNT(DISTINCT device_id) FROM play_days WHERE day >= ?2) AS devices7d,
         (SELECT COALESCE(SUM(plays), 0) FROM play_days WHERE day = ?1) AS playsToday,
         (SELECT COALESCE(SUM(plays), 0) FROM play_days WHERE day >= ?2) AS plays7d,
         (SELECT COUNT(DISTINCT initials) FROM best_scores) AS playersAllTime,
         (SELECT COUNT(DISTINCT device_id) FROM best_scores) AS devicesAllTime,
         (SELECT COUNT(*) FROM scores WHERE created_at >= ?3) AS runsToday`,
    ).bind(today, day7, Date.parse(today + "T00:00:00Z")),
    // Devices seen on 2+ different days in the last 30: the "they came back"
    // number, which matters more than any one busy day.
    env.DB.prepare(
      `SELECT COUNT(*) AS returning30d,
              (SELECT COUNT(DISTINCT device_id) FROM play_days WHERE day >= ?1) AS active30d
         FROM (SELECT device_id
                 FROM play_days
                WHERE day >= ?1
                GROUP BY device_id
               HAVING COUNT(DISTINCT day) >= 2)`,
    ).bind(day30),
    env.DB.prepare(
      `SELECT installed, COUNT(DISTINCT device_id) AS devices
         FROM play_days
        WHERE day >= ?1
        GROUP BY installed`,
    ).bind(day7),
    env.DB.prepare(
      `SELECT COALESCE(version, 'unknown') AS version, COUNT(DISTINCT device_id) AS devices
         FROM play_days
        WHERE day >= ?1
        GROUP BY version
        ORDER BY devices DESC`,
    ).bind(day7),
    env.DB.prepare(
      `SELECT day, SUM(plays) AS plays, COUNT(DISTINCT device_id) AS devices
         FROM play_days
        WHERE day >= ?1
        GROUP BY day
        ORDER BY day`,
    ).bind(day30),
    env.DB.prepare(
      `SELECT reason, SUM(n) AS n
         FROM rejections
        WHERE day >= ?1
        GROUP BY reason
        ORDER BY n DESC`,
    ).bind(day7),
    env.DB.prepare(
      `SELECT id, game_id AS gameId, initials, score, board_id AS boardId, created_at AS createdAt
         FROM scores
        ORDER BY created_at DESC
        LIMIT 50`,
    ),
    env.DB.prepare(
      `SELECT initials, message, context, created_at AS createdAt
         FROM feedback
        ORDER BY created_at DESC
        LIMIT 30`,
    ),
    // A range on the primary key's first column, so only daily rows are read.
    env.DB.prepare(
      `SELECT board_id AS boardId,
              SUM(runs) AS scores,
              COUNT(*) AS uniqueDevices,
              COUNT(DISTINCT game_id) AS games,
              MAX(created_at) AS lastPlayed
         FROM best_scores
        WHERE board_id >= 'daily-' AND board_id < 'daily.'
        GROUP BY board_id
        ORDER BY boardId DESC
        LIMIT 60`,
    ),
    // What each leaderboard read and each score submit costs grows with these.
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM scores) AS scoresRows,
         (SELECT COUNT(*) FROM best_scores) AS bestRows,
         (SELECT COUNT(*) FROM play_days) AS playDayRows,
         (SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM best_scores
                               WHERE board_id = 'global' GROUP BY game_id)) AS largestBoard`,
    ),
  ]);

  // Merge the per-game pieces. Games with plays but no leaderboard (Black
  // Disc) and games with scores from before play tracking both show up.
  const games = new Map<string, GameStatsRow>();
  const game = (id: string): GameStatsRow => {
    let row = games.get(id);
    if (!row) {
      row = {
        gameId: id,
        plays7d: 0,
        playsToday: 0,
        activeDevices7d: 0,
        runsAllTime: 0,
        runs7d: 0,
        devicesAllTime: 0,
        playersAllTime: 0,
      };
      games.set(id, row);
    }
    return row;
  };
  for (const r of rows<GameStatsRow>(playsByGame)) Object.assign(game(r.gameId), {
    plays7d: r.plays7d, playsToday: r.playsToday, activeDevices7d: r.activeDevices7d,
  });
  for (const r of rows<GameStatsRow>(runsByGame)) Object.assign(game(r.gameId), {
    runsAllTime: r.runsAllTime, devicesAllTime: r.devicesAllTime, playersAllTime: r.playersAllTime,
  });
  for (const r of rows<GameStatsRow>(runs7dByGame)) game(r.gameId).runs7d = r.runs7d;

  const usage = await getCloudflareUsage(env, today);

  return json({
    generatedAt: now,
    today,
    totals: rows(totals)[0] ?? {},
    retention: rows(returning)[0] ?? {},
    installSplit: rows(installSplit),
    versions: rows(versions),
    playsByDay: rows(playsByDay),
    games: [...games.values()].sort((a, b) => b.plays7d - a.plays7d || b.runsAllTime - a.runsAllTime),
    rejections: rows(rejections),
    recentScores: rows(recentScores),
    feedback: rows(feedback),
    dailyBoards: rows(dailyBoards),
    capacity: {
      limits: FREE_PLAN,
      tables: rows(tableSizes)[0] ?? {},
      usage,
    },
  });
}

function rows<T = Record<string, unknown>>(result: D1Result<unknown> | undefined): T[] {
  return (result?.results ?? []) as T[];
}

interface CloudflareUsage {
  source: "cloudflare" | "not_configured" | "error";
  day?: string;
  workerRequests?: number;
  workerErrors?: number;
  d1RowsRead?: number;
  d1RowsWritten?: number;
  message?: string;
}

/**
 * Today's real usage against the free plan, from Cloudflare's GraphQL
 * analytics. Account-wide on purpose: the free allowances are per account, so
 * other Workers and databases on the same login spend from the same pot.
 * Optional: needs CF_API_TOKEN (Account Analytics: Read) and CF_ACCOUNT_ID.
 */
async function getCloudflareUsage(env: Env, day: string): Promise<CloudflareUsage> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return { source: "not_configured" };
  }
  const query = `query Usage($account: String!, $day: Date!) {
    viewer {
      accounts(filter: { accountTag: $account }) {
        d1AnalyticsAdaptiveGroups(limit: 1000, filter: { date_geq: $day, date_leq: $day }) {
          sum { rowsRead rowsWritten }
        }
        workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $day, date_leq: $day }) {
          sum { requests errors }
        }
      }
    }
  }`;
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, day } }),
    });
    const data = (await response.json()) as {
      data?: {
        viewer?: {
          accounts?: Array<{
            d1AnalyticsAdaptiveGroups?: Array<{ sum: { rowsRead: number; rowsWritten: number } }>;
            workersInvocationsAdaptive?: Array<{ sum: { requests: number; errors: number } }>;
          }>;
        };
      };
      errors?: Array<{ message: string }> | null;
    };
    if (data.errors?.length) {
      return { source: "error", message: (data.errors[0]?.message ?? "unknown").slice(0, 200) };
    }
    const account = data.data?.viewer?.accounts?.[0];
    if (!account) return { source: "error", message: "account not found" };
    const sum = <K extends string>(list: Array<{ sum: Record<K, number> }> | undefined, key: K) =>
      (list ?? []).reduce((total, g) => total + (g.sum[key] ?? 0), 0);
    return {
      source: "cloudflare",
      day,
      d1RowsRead: sum(account.d1AnalyticsAdaptiveGroups, "rowsRead"),
      d1RowsWritten: sum(account.d1AnalyticsAdaptiveGroups, "rowsWritten"),
      workerRequests: sum(account.workersInvocationsAdaptive, "requests"),
      workerErrors: sum(account.workersInvocationsAdaptive, "errors"),
    };
  } catch (error) {
    return { source: "error", message: String(error).slice(0, 200) };
  }
}

// ----- Validation -----

function validate(body: unknown): ScoreSubmission | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "invalid_body" };
  const raw = body as Record<string, unknown>;

  const gameId = typeof raw.gameId === "string" ? raw.gameId.trim() : "";
  if (!GAME_ID_RE.test(gameId)) return { error: "invalid_game" };

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

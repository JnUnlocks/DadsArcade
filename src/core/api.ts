/**
 * Leaderboard client.
 *
 * Every submission path assumes the network might not be there. A score earned
 * on a plane or in a basement goes into a local queue and is uploaded the next
 * time a request succeeds, so the player never loses a run to connectivity.
 */

import {
  loadQueue,
  saveQueue,
  type Player,
  type QueuedScore,
} from "./storage";

export interface LeaderboardRow {
  initials: string;
  score: number;
  wave: number;
  duration_ms: number;
  created_at: number;
  /** 1 when this row is the calling device's own entry. */
  is_you?: number;
}

export type SubmitResult =
  | { status: "submitted"; rank: number | null }
  | { status: "queued" }
  | { status: "rejected"; reason: string };

/** Give up rather than hang the game-over screen on a dead network. */
const TIMEOUT_MS = 6000;

export async function fetchLeaderboard(
  gameId: string,
  period: "all" | "week" = "all",
  limit = 20,
  deviceId = "",
  boardId = "",
): Promise<LeaderboardRow[]> {
  const url =
    `/api/scores?game=${encodeURIComponent(gameId)}&period=${period}&limit=${limit}` +
    (deviceId ? `&device=${encodeURIComponent(deviceId)}` : "") +
    (boardId ? `&board=${encodeURIComponent(boardId)}` : "");
  const response = await request(url, { method: "GET" });
  if (!response?.ok) throw new Error("leaderboard_unavailable");
  const data = (await response.json()) as { scores?: LeaderboardRow[] };
  return data.scores ?? [];
}

export async function fetchMyScores(
  gameId: string,
  deviceId: string,
): Promise<LeaderboardRow[]> {
  const url = `/api/scores/me?game=${encodeURIComponent(gameId)}&device=${encodeURIComponent(deviceId)}`;
  const response = await request(url, { method: "GET" });
  if (!response?.ok) throw new Error("leaderboard_unavailable");
  const data = (await response.json()) as { scores?: LeaderboardRow[] };
  return data.scores ?? [];
}

export async function submitScore(
  entry: QueuedScore,
  player: Player,
): Promise<SubmitResult> {
  const result = await send(entry, player);
  if (result.status === "queued") {
    enqueue(entry);
  } else {
    // A successful round-trip means we're online -- good moment to drain
    // anything stranded from an earlier offline session.
    void flushQueue(player);
  }
  return result;
}

/** Try to upload everything sitting in the offline queue. */
export async function flushQueue(player: Player): Promise<number> {
  const queue = loadQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedScore[] = [];
  let uploaded = 0;

  for (const entry of queue) {
    const result = await send(entry, player);
    if (result.status === "submitted") {
      uploaded += 1;
    } else if (result.status === "queued") {
      // Still offline. Keep this one and stop -- no point hammering.
      remaining.push(entry);
    }
    // "rejected" means the server refused it on its merits; retrying forever
    // would just keep failing, so it's dropped.
  }

  saveQueue(remaining);
  return uploaded;
}

/**
 * Send a feedback note. Returns false on any failure so the UI can keep the
 * player's text in the box and let them retry -- silently swallowing someone's
 * typed-out bug report would be worse than telling them it didn't send.
 */
export async function submitFeedback(
  message: string,
  player: Player | null,
): Promise<boolean> {
  const response = await request("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      deviceId: player?.deviceId ?? "anonymous-device-00",
      initials: player?.initials ?? null,
      context: describeEnvironment(),
    }),
  });
  return response?.ok ?? false;
}

/** Enough detail to act on a report without interrogating the reporter. */
function describeEnvironment(): string {
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  return JSON.stringify({
    v: __APP_VERSION__,
    screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    installed,
    ua: navigator.userAgent.slice(0, 180),
  });
}

function enqueue(entry: QueuedScore): void {
  const queue = loadQueue();
  queue.push(entry);
  saveQueue(queue);
}

async function send(entry: QueuedScore, player: Player): Promise<SubmitResult> {
  const response = await request("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: entry.gameId,
      initials: player.initials,
      deviceId: player.deviceId,
      score: entry.score,
      wave: entry.wave,
      durationMs: entry.durationMs,
      // Omitted for ordinary runs, so the server falls back to 'global' and
      // every existing game keeps posting exactly what it always did.
      ...(entry.boardId ? { boardId: entry.boardId } : {}),
    }),
  });

  if (!response) return { status: "queued" }; // network failure or timeout

  if (response.ok) {
    const data = (await response.json()) as { rank?: number | null };
    return { status: "submitted", rank: data.rank ?? null };
  }

  // 429 is transient -- keep it for later. Other 4xx are permanent refusals.
  if (response.status === 429 || response.status >= 500) {
    return { status: "queued" };
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { status: "rejected", reason: data.error ?? `http_${response.status}` };
}

/** fetch with a timeout; resolves to null when the network is unavailable. */
async function request(
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

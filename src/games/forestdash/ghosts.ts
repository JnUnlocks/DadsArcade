/**
 * The family's saved races, and what this device remembers about its own.
 *
 * Racing "against" someone here isn't live: nobody has to be playing at the
 * same time. Each device's fastest run of a course is saved as its button
 * presses, and the next person to race that course gets a few of everyone
 * else's, replayed beside them.
 *
 * Nothing here may hold up a race. With no signal there are simply no other
 * racers, and the run is kept on this device to be sent after a later race.
 */

import type { InputLog } from "./rules.ts";

const GAME_ID = "forest-dash";
const KEY = "hyperdrive.forestdash";
/** A race starts 2.4 seconds after it's picked; other racers have to arrive by then. */
const TIMEOUT_MS = 2000;
/** How many of the family's runs join a race. */
export const RIVALS_PER_RACE = 3;
/** How many to ask for, so the closest few to your time can be picked from them. */
const FETCH_LIMIT = 12;

export interface Ghost {
  /** Blank for someone who hasn't entered initials yet. */
  initials: string;
  character: string;
  timeMs: number;
  log: InputLog;
}

/** One row of a course's fastest-times list. */
export interface TimeRow {
  initials: string;
  character: string;
  timeMs: number;
  isYou: boolean;
}

/**
 * Who the family's racers in your race are:
 *   "fastest" -- the quickest few on the course;
 *   "near"    -- the few whose best is closest to yours, faster or slower;
 *   anything else is a person's initials, and only their runs join.
 */
export type Opponents = string;

/** This device's fastest run of one course. */
interface Best {
  timeMs: number;
  /** The run itself: raced against as your own pacer, and sent to the family. */
  log?: InputLog;
  character?: string;
  /** True once the server has this run under your current initials. */
  sent?: boolean;
  /** How runs were kept before they were raced against: only until sent. */
  unsent?: { log: InputLog; character: string };
}

interface Saved {
  character: string;
  course: string;
  opponents: Opponents;
  /** Keyed by course key, so a changed course starts its bests again. */
  bests: Record<string, Best>;
}

const EMPTY: Saved = { character: "fox", course: "mossy", opponents: "fastest", bests: {} };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, bests: {} };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const bests: Record<string, Best> =
      typeof parsed.bests === "object" && parsed.bests ? parsed.bests : {};
    for (const best of Object.values(bests)) {
      if (best.unsent) {
        best.log = best.unsent.log;
        best.character = best.unsent.character;
        best.sent = false;
        delete best.unsent;
      }
    }
    return {
      character: typeof parsed.character === "string" ? parsed.character : EMPTY.character,
      course: typeof parsed.course === "string" ? parsed.course : EMPTY.course,
      opponents: typeof parsed.opponents === "string" ? parsed.opponents : EMPTY.opponents,
      bests,
    };
  } catch {
    return { ...EMPTY, bests: {} };
  }
}

function save(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage full or disabled: the choice just isn't remembered.
  }
}

export function loadChoices(): { character: string; course: string; opponents: Opponents } {
  const { character, course, opponents } = load();
  return { character, course, opponents };
}

export function saveChoices(character: string, course: string, opponents: Opponents): void {
  save({ ...load(), character, course, opponents });
}

/**
 * Forget bests on daily courses other than today's. They can never be raced
 * again, and one a day would otherwise pile up on the phone for ever.
 */
export function dropOldDailies(todayPrefix: string): void {
  const saved = load();
  let changed = false;
  for (const key of Object.keys(saved.bests)) {
    if (key.startsWith("daily-") && !key.startsWith(todayPrefix)) {
      delete saved.bests[key];
      changed = true;
    }
  }
  if (changed) save(saved);
}

/** This device's fastest time on a course, in milliseconds, or null. */
export function bestTime(key: string): number | null {
  return load().bests[key]?.timeMs ?? null;
}

/** This device's fastest run on a course, to race against, or null. */
export function bestRun(key: string): { timeMs: number; log: InputLog; character: string } | null {
  const best = load().bests[key];
  if (!best?.log) return null;
  return { timeMs: best.timeMs, log: best.log, character: best.character ?? "fox" };
}

/**
 * Remember a finished run if it's this device's fastest on the course.
 * Returns true when it is.
 */
export function recordRun(key: string, timeMs: number, log: InputLog, character: string): boolean {
  const saved = load();
  const best = saved.bests[key];
  if (best && best.timeMs <= timeMs) return false;
  saved.bests[key] = { timeMs, log, character, sent: false };
  save(saved);
  return true;
}

/** Send this device's fastest run of a course, if the server doesn't have it yet. */
export async function sendBest(key: string, deviceId: string, initials: string): Promise<void> {
  const best = load().bests[key];
  if (!best?.log || best.sent) return;
  const response = await request("/api/ghosts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: GAME_ID,
      course: key,
      deviceId,
      initials,
      character: best.character ?? "fox",
      timeMs: best.timeMs,
      log: best.log,
    }),
  });
  // Kept for next time on a dead network or a busy server. A flat refusal
  // won't change on a retry, so that's marked done along with a success.
  if (!response || response.status === 429 || response.status >= 500) return;
  const saved = load();
  const current = saved.bests[key];
  if (current && current.timeMs === best.timeMs) {
    current.sent = true;
    save(saved);
  }
}

/**
 * Send every saved run again, under new initials. Runs made before someone
 * entered their initials are on the server with no name; this gives them one.
 */
export async function resendAll(deviceId: string, initials: string): Promise<void> {
  const saved = load();
  for (const best of Object.values(saved.bests)) best.sent = false;
  save(saved);
  for (const key of Object.keys(saved.bests)) await sendBest(key, deviceId, initials);
}

/**
 * The family's runs of a course to race against, picked the way the player
 * asked. Empty when offline.
 */
export async function fetchGhosts(
  key: string,
  deviceId: string,
  opponents: Opponents,
  myBestMs: number | null,
): Promise<Ghost[]> {
  const person = opponents !== "fastest" && opponents !== "near" ? opponents : "";
  const response = await request(
    `/api/ghosts?game=${GAME_ID}&course=${encodeURIComponent(key)}` +
      `&device=${encodeURIComponent(deviceId)}&limit=${FETCH_LIMIT}` +
      (person ? `&initials=${encodeURIComponent(person)}` : ""),
    { method: "GET" },
  );
  if (!response?.ok) return [];
  try {
    const data = (await response.json()) as { ghosts?: unknown };
    if (!Array.isArray(data.ghosts)) return [];
    return pickRivals(data.ghosts.filter(isGhost), opponents, myBestMs);
  } catch {
    return [];
  }
}

/**
 * Choose who joins the race from a list sorted fastest first.
 *
 * "near" is what lets a slower racer be in somebody's race at all: the
 * fastest three are the same three for everyone, however many play.
 */
export function pickRivals<T extends { timeMs: number }>(
  sorted: readonly T[],
  opponents: Opponents,
  myBestMs: number | null,
): T[] {
  if (opponents !== "near" || myBestMs === null) return sorted.slice(0, RIVALS_PER_RACE);
  return [...sorted]
    .sort((a, b) => Math.abs(a.timeMs - myBestMs) - Math.abs(b.timeMs - myBestMs))
    .slice(0, RIVALS_PER_RACE)
    .sort((a, b) => a.timeMs - b.timeMs);
}

/** The initials of everyone else who has a saved run. Empty when offline. */
export async function fetchRacers(deviceId: string): Promise<string[]> {
  const response = await request(
    `/api/ghosts/racers?game=${GAME_ID}&device=${encodeURIComponent(deviceId)}`,
    { method: "GET" },
  );
  if (!response?.ok) return [];
  try {
    const data = (await response.json()) as { racers?: unknown };
    return Array.isArray(data.racers)
      ? data.racers.filter((r): r is string => typeof r === "string" && /^[A-Z0-9]{1,3}$/.test(r))
      : [];
  } catch {
    return [];
  }
}

/** A course's fastest times, or null when the list can't be reached. */
export async function fetchTimes(key: string, deviceId: string): Promise<TimeRow[] | null> {
  const response = await request(
    `/api/ghosts/times?game=${GAME_ID}&course=${encodeURIComponent(key)}` +
      `&device=${encodeURIComponent(deviceId)}`,
    { method: "GET" },
  );
  if (!response?.ok) return null;
  try {
    const data = (await response.json()) as { times?: unknown };
    if (!Array.isArray(data.times)) return null;
    return data.times.filter(isTime).map((row) => ({ ...row, isYou: Boolean(row.isYou) }));
  } catch {
    return null;
  }
}

function isGhost(value: unknown): value is Ghost {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.initials === "string" &&
    typeof g.character === "string" &&
    typeof g.timeMs === "number" &&
    Array.isArray(g.log) &&
    g.log.every((n) => Number.isInteger(n))
  );
}

function isTime(value: unknown): value is TimeRow {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.initials === "string" &&
    typeof t.character === "string" &&
    typeof t.timeMs === "number"
  );
}

async function request(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  }
  finally {
    clearTimeout(timer);
  }
}

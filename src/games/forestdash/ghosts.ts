/**
 * The family's saved races, and what this device remembers about its own.
 *
 * Racing "against" someone here isn't live: nobody has to be playing at the
 * same time. Each device's fastest run of a course is saved as its button
 * presses, and the next person to race that course gets the fastest few from
 * everyone else, replayed beside them.
 *
 * Nothing here may hold up a race. With no signal there are simply no other
 * racers, and the run is kept on this device to be sent after a later race.
 */

import type { InputLog } from "./rules.ts";

const GAME_ID = "forest-dash";
const KEY = "hyperdrive.forestdash";
/** A race starts 2.4 seconds after it's picked; other racers have to arrive by then. */
const TIMEOUT_MS = 2000;

export interface Ghost {
  /** Blank for someone who hasn't entered initials yet. */
  initials: string;
  character: string;
  timeMs: number;
  log: InputLog;
}

/** This device's fastest run of one course. */
interface Best {
  timeMs: number;
  /** The run itself, kept only until the server has it. */
  unsent?: { log: InputLog; character: string };
}

interface Saved {
  character: string;
  course: string;
  /** Keyed by course key, so a changed course starts its bests again. */
  bests: Record<string, Best>;
}

const EMPTY: Saved = { character: "fox", course: "mossy", bests: {} };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, bests: {} };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      character: typeof parsed.character === "string" ? parsed.character : EMPTY.character,
      course: typeof parsed.course === "string" ? parsed.course : EMPTY.course,
      bests: typeof parsed.bests === "object" && parsed.bests ? parsed.bests : {},
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

export function loadChoices(): { character: string; course: string } {
  const { character, course } = load();
  return { character, course };
}

export function saveChoices(character: string, course: string): void {
  save({ ...load(), character, course });
}

/** This device's fastest time on a course, in milliseconds, or null. */
export function bestTime(key: string): number | null {
  return load().bests[key]?.timeMs ?? null;
}

/**
 * Remember a finished run if it's this device's fastest on the course.
 * Returns true when it is.
 */
export function recordRun(key: string, timeMs: number, log: InputLog, character: string): boolean {
  const saved = load();
  const best = saved.bests[key];
  if (best && best.timeMs <= timeMs) return false;
  saved.bests[key] = { timeMs, unsent: { log, character } };
  save(saved);
  return true;
}

/** Send this device's fastest run of a course, if the server doesn't have it yet. */
export async function sendBest(key: string, deviceId: string, initials: string): Promise<void> {
  const best = load().bests[key];
  if (!best?.unsent) return;
  const response = await request("/api/ghosts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: GAME_ID,
      course: key,
      deviceId,
      initials,
      character: best.unsent.character,
      timeMs: best.timeMs,
      log: best.unsent.log,
    }),
  });
  // Kept for next time on a dead network or a busy server. A flat refusal
  // won't change on a retry, so that's dropped along with a success.
  if (!response || response.status === 429 || response.status >= 500) return;
  const saved = load();
  const current = saved.bests[key];
  if (current && current.timeMs === best.timeMs) {
    saved.bests[key] = { timeMs: current.timeMs };
    save(saved);
  }
}

/** The fastest few runs of a course from other devices. Empty when offline. */
export async function fetchGhosts(key: string, deviceId: string): Promise<Ghost[]> {
  const response = await request(
    `/api/ghosts?game=${GAME_ID}&course=${encodeURIComponent(key)}` +
      `&device=${encodeURIComponent(deviceId)}`,
    { method: "GET" },
  );
  if (!response?.ok) return [];
  try {
    const data = (await response.json()) as { ghosts?: unknown };
    if (!Array.isArray(data.ghosts)) return [];
    return data.ghosts.filter(isGhost);
  } catch {
    return [];
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

async function request(url: string, init: RequestInit): Promise<Response | null> {
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

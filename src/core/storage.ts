/**
 * Local persistence: who you are, how you like the game set up, your personal
 * bests, and scores that haven't reached the server yet.
 *
 * Everything degrades gracefully -- private browsing modes can throw on
 * localStorage access, and a thrown error here should never stop the game.
 */

const KEY_PLAYER = "hyperdrive.player";
const KEY_SETTINGS = "hyperdrive.settings";
const KEY_BESTS = "hyperdrive.bests";
const KEY_QUEUE = "hyperdrive.queue";

export interface Player {
  /** Three-character arcade initials, the way the machine asked for them. */
  initials: string;
  /** Stable anonymous id so "my scores" works without accounts. */
  deviceId: string;
}

export interface Settings {
  autofire: boolean;
  crt: boolean;
  muted: boolean;
  volume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  sensitivity: number;
  /** Set once the first-run instructions have been dismissed. */
  seenHowTo: boolean;
}

/** A score waiting to be uploaded (recorded while offline). */
export interface QueuedScore {
  gameId: string;
  score: number;
  wave: number;
  durationMs: number;
  playedAt: number;
  /**
   * Which board it belongs on. Absent means the game's main board.
   *
   * It has to ride along in the queue rather than being recomputed at upload
   * time: a daily-challenge run played offline on Saturday and uploaded on
   * Monday still belongs on Saturday's board.
   */
  boardId?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  autofire: true,
  crt: true,
  muted: false,
  volume: 0.7,
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  sensitivity: 1.15,
  seenHowTo: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled -- not worth interrupting play.
  }
}

export function loadSettings(): Settings {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY_SETTINGS);
  } catch {
    stored = null;
  }

  // On a genuinely fresh install, seed from the OS accessibility preferences.
  // Only here -- once the player has their own saved settings, their explicit
  // choice wins, otherwise toggling "reduce motion" off would silently snap
  // back on for anyone with the system preference enabled.
  if (!stored) {
    return {
      ...DEFAULT_SETTINGS,
      reducedMotion: prefers("(prefers-reduced-motion: reduce)"),
      highContrast: prefers("(prefers-contrast: more)"),
    };
  }

  return read<Settings>(KEY_SETTINGS, DEFAULT_SETTINGS);
}

function prefers(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function saveSettings(settings: Settings): void {
  write(KEY_SETTINGS, settings);
}

export function loadPlayer(): Player | null {
  try {
    const raw = localStorage.getItem(KEY_PLAYER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Player>;
    if (!parsed.initials || !parsed.deviceId) return null;
    return { initials: parsed.initials, deviceId: parsed.deviceId };
  } catch {
    return null;
  }
}

export function savePlayer(player: Player): void {
  write(KEY_PLAYER, player);
}

export function createDeviceId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Personal best score per game id. */
export function loadBests(): Record<string, number> {
  return read<Record<string, number>>(KEY_BESTS, {});
}

/** Records a score and reports whether it beat the previous personal best. */
export function recordBest(gameId: string, score: number): boolean {
  const bests = loadBests();
  const previous = bests[gameId] ?? 0;
  if (score <= previous) return false;
  bests[gameId] = score;
  write(KEY_BESTS, bests);
  return true;
}

export function loadQueue(): QueuedScore[] {
  try {
    const raw = localStorage.getItem(KEY_QUEUE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedScore[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedScore[]): void {
  // Cap it: if someone plays offline for a month we don't want an unbounded
  // blob, and only the best runs are worth uploading anyway.
  const trimmed = [...queue].sort((a, b) => b.score - a.score).slice(0, 50);
  write(KEY_QUEUE, trimmed);
}

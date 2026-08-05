/**
 * Keeps the screen awake during a run.
 *
 * Without this the phone dims and locks mid-wave when the player is steering
 * with small drags and never "touches" the screen in the way the OS counts.
 *
 * The browser silently drops the lock whenever the page is hidden, so we have
 * to re-acquire on visibilitychange rather than assuming ours survives.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
}

export class WakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.wanted) void this.acquire();
    });
  }

  async acquire(): Promise<void> {
    this.wanted = true;
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!api || document.hidden || this.sentinel) return;
    try {
      this.sentinel = await api.request("screen");
    } catch {
      // Denied, unsupported, or the tab lost focus mid-request. The game is
      // perfectly playable without it, so there is nothing to report.
      this.sentinel = null;
    }
  }

  release(): void {
    this.wanted = false;
    const current = this.sentinel;
    this.sentinel = null;
    if (current && !current.released) void current.release().catch(() => {});
  }
}

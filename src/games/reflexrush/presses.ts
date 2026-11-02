/**
 * Reflex Rush's one input: a press, with the moment it happened.
 *
 * The shell's input is read once a frame and calls any key a press, Escape
 * included. Both games here are about *when*: Flash Point measures it in
 * milliseconds, and Neon Skyline's block moves up to 5 units a frame at full
 * speed against a 4-unit PERFECT window. So presses are taken straight from
 * the browser's events, with the event's own timestamp, and only these count:
 *
 *   - a finger or click on the game itself (the canvas -- not a button, not
 *     the pause button, not a card laid over it),
 *   - Space or Enter, once per press: a held key's repeats don't count.
 *
 * While the game is paused nothing is recorded, and resuming throws away
 * anything left over, so a tap on the pause menu can never land in the game.
 */

export interface Press {
  /** performance.now() time of the event. */
  at: number;
  via: "pointer" | "key";
}

const KEYS = new Set(["Space", "Enter", "NumpadEnter"]);

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
  );
}

export class Presses {
  private queue: Press[] = [];
  private paused = false;
  private readonly offs: Array<() => void> = [];

  constructor() {
    const onPointer = (e: PointerEvent) => {
      if (this.paused || !e.isPrimary) return;
      if (!(e.target instanceof HTMLCanvasElement)) return;
      this.queue.push({ at: e.timeStamp, via: "pointer" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (!KEYS.has(e.code) || e.repeat || isTextEntry(e.target)) return;
      // Enter on a focused button presses that button; leave it to do so.
      if (e.code !== "Space" && e.target instanceof HTMLButtonElement) return;
      if (this.paused) return;
      e.preventDefault();
      this.queue.push({ at: e.timeStamp, via: "key" });
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    this.offs.push(
      () => window.removeEventListener("pointerdown", onPointer, true),
      () => window.removeEventListener("keydown", onKey),
    );
  }

  /** Everything pressed since the last call, oldest first. */
  take(): Press[] {
    const taken = this.queue;
    this.queue = [];
    return taken;
  }

  pause(): void {
    this.paused = true;
    this.queue = [];
  }

  resume(): void {
    this.paused = false;
    this.queue = [];
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.queue = [];
  }
}

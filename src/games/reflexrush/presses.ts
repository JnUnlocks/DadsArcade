/**
 * Reflex Rush's one input: a press, with the moment it happened.
 *
 * The shell's input is read once a frame and calls any key a press, Escape
 * included. Every game here is about *when* (and Zap Dash about *where*):
 * Flash Point measures milliseconds, and Neon Skyline's block moves up to 5
 * units a frame at full speed against a 4-unit PERFECT window. So presses are
 * taken straight from the browser's events, with the event's own timestamp,
 * and only these count:
 *
 *   - a finger or click on the game itself (the canvas -- not a button, not
 *     the pause button, not a card laid over it), with where it landed,
 *   - Space or Enter, and Zap Dash's grid keys, once per press: a held key's
 *     repeats don't count.
 *
 * While the game is paused nothing is recorded, and resuming throws away
 * anything left over, so a tap on the pause menu can never land in the game.
 */

export interface Press {
  /** performance.now() time of the event. */
  at: number;
  via: "pointer" | "key";
  /** The key's code, for a key press. */
  code?: string;
  /** Where a pointer press landed, in client pixels. */
  x?: number;
  y?: number;
  /**
   * How many other pointers were already down when this one landed. Overdrive
   * counts one finger at a time: a second finger drumming alongside the first
   * isn't a faster tap.
   */
  alongside?: number;
}

/** The keys that mean "now" in every game. */
export const ACTION_KEYS: ReadonlySet<string> = new Set(["Space", "Enter", "NumpadEnter"]);

/** Zap Dash's grid, as the keyboard sees it: QWE / ASD / ZXC, or the number pad. */
export const GRID_KEYS: Readonly<Record<string, number>> = {
  KeyQ: 0, KeyW: 1, KeyE: 2,
  KeyA: 3, KeyS: 4, KeyD: 5,
  KeyZ: 6, KeyX: 7, KeyC: 8,
  Numpad7: 0, Numpad8: 1, Numpad9: 2,
  Numpad4: 3, Numpad5: 4, Numpad6: 5,
  Numpad1: 6, Numpad2: 7, Numpad3: 8,
};

/** A tap on the game, or Space/Enter: what Skyline, Flash Point and Overdrive act on. */
export function isAction(p: Press): boolean {
  return p.via === "pointer" || (p.code !== undefined && ACTION_KEYS.has(p.code));
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
  );
}

export class Presses {
  private queue: Press[] = [];
  private paused = false;
  /** Pointers on the game right now. */
  private readonly down = new Set<number>();
  private readonly offs: Array<() => void> = [];

  constructor() {
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const alongside = this.down.size;
      this.down.add(e.pointerId);
      if (this.paused) return;
      this.queue.push({ at: e.timeStamp, via: "pointer", x: e.clientX, y: e.clientY, alongside });
    };
    const onUp = (e: PointerEvent) => {
      this.down.delete(e.pointerId);
    };
    const onKey = (e: KeyboardEvent) => {
      const known = ACTION_KEYS.has(e.code) || e.code in GRID_KEYS;
      if (!known || e.repeat || isTextEntry(e.target)) return;
      // Enter on a focused button presses that button; leave it to do so.
      if (e.code !== "Space" && e.target instanceof HTMLButtonElement) return;
      if (this.paused) return;
      e.preventDefault();
      this.queue.push({ at: e.timeStamp, via: "key", code: e.code });
    };
    const onBlur = () => this.down.clear();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    this.offs.push(
      () => window.removeEventListener("pointerdown", onDown, true),
      () => window.removeEventListener("pointerup", onUp, true),
      () => window.removeEventListener("pointercancel", onUp, true),
      () => window.removeEventListener("keydown", onKey),
      () => window.removeEventListener("blur", onBlur),
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
    this.down.clear();
  }
}

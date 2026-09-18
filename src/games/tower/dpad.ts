/**
 * An on-screen D-pad: one pad, four directions, read from where the thumb is.
 *
 * It's a single element rather than four buttons so a thumb can roll from
 * RIGHT to UP without lifting -- the move you make at the foot of every ladder.
 * Four separate buttons need a lift and a fresh press, and a press that lands
 * in the gap between two of them does nothing at all.
 *
 * Four-way, not eight: the tower has no diagonal moves, and a thumb that
 * leans slightly off-axis should still mean the direction it mostly points.
 */

/** Fraction of the pad's radius around the centre that means "no direction". */
const DEAD_ZONE = 0.2;

export type Direction = "up" | "down" | "left" | "right";

export class DPad {
  readonly element: HTMLElement;
  /** -1, 0 or 1 on each axis; at most one is non-zero. */
  x = 0;
  y = 0;

  private pointer: number | null = null;
  private readonly arrows = new Map<Direction, HTMLElement>();

  constructor() {
    const pad = document.createElement("div");
    pad.className = "dpad";
    pad.setAttribute("role", "group");
    pad.setAttribute("aria-label", "Move: left, right, climb up, climb down");

    for (const dir of ["up", "down", "left", "right"] as const) {
      const arrow = document.createElement("span");
      arrow.className = `dpad__arrow dpad__arrow--${dir}`;
      arrow.setAttribute("aria-hidden", "true");
      pad.append(arrow);
      this.arrows.set(dir, arrow);
    }
    const hub = document.createElement("span");
    hub.className = "dpad__hub";
    hub.setAttribute("aria-hidden", "true");
    pad.append(hub);

    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (this.pointer !== null) return;
      this.pointer = event.pointerId;
      // Capture keeps the thumb steering after it slides off the pad's edge.
      // It can throw for a pointer the browser no longer considers active;
      // the pad still works without it, just not past the edge.
      try {
        pad.setPointerCapture(event.pointerId);
      } catch {
        // Carry on uncaptured.
      }
      this.aim(event);
    });
    pad.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.pointer) this.aim(event);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId === this.pointer) this.reset();
    };
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", release);
    pad.addEventListener("lostpointercapture", release);
    // Uncaptured, a thumb that lifts off beyond the edge sends its pointerup
    // somewhere else, and JB would walk on by himself. Let go at the edge.
    pad.addEventListener("pointerleave", (event) => {
      if (event.pointerId === this.pointer && !pad.hasPointerCapture(event.pointerId)) {
        this.reset();
      }
    });
    // A long press would otherwise open the text-selection magnifier on iOS.
    pad.addEventListener("contextmenu", (event) => event.preventDefault());

    this.element = pad;
  }

  /** Let go of everything -- on pause, so resuming doesn't walk on its own. */
  reset(): void {
    this.pointer = null;
    this.set(0, 0);
  }

  private aim(event: PointerEvent): void {
    const rect = this.element.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = event.clientX - (rect.left + radius);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < radius * DEAD_ZONE) {
      this.set(0, 0);
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      this.set(Math.sign(dx), 0);
    } else {
      this.set(0, Math.sign(dy));
    }
  }

  private set(x: number, y: number): void {
    this.x = x;
    this.y = y;
    const lit: Direction | null =
      x < 0 ? "left" : x > 0 ? "right" : y < 0 ? "up" : y > 0 ? "down" : null;
    for (const [dir, arrow] of this.arrows) {
      arrow.classList.toggle("is-active", dir === lit);
    }
  }
}

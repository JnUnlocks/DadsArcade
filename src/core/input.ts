/**
 * Unified touch + mouse + keyboard input.
 *
 * Touch steering is *relative*, not absolute: when a finger lands we remember
 * where it was, and from then on we report how far it has moved since the last
 * frame. The game applies that as a delta to the ship.
 *
 * This matters a lot on a phone. Absolute steering (ship teleports to your
 * finger) means your thumb permanently covers the thing you're trying to watch,
 * and every touch yanks the ship across the screen. With relative steering you
 * can drag anywhere -- bottom corner, off to the side -- and the ship never
 * jumps.
 */

import type { View } from "./view";

export interface InputSnapshot {
  /** Ship movement requested by dragging, in virtual units, since last frame. */
  dragX: number;
  dragY: number;
  /** Keyboard/gamepad-style axes, -1..1. */
  axisX: number;
  axisY: number;
  /** True while the player wants to shoot (autofire folds into this). */
  firing: boolean;
  /** True on the frame a tap/click/key press began -- for menus and "tap to start". */
  justPressed: boolean;
  pointerDown: boolean;
  /**
   * Taps from fingers *other than* the one currently steering, since the last
   * frame. This is what makes "aim with one thumb, fire with the other" work:
   * the steering finger keeps its drag, and the second finger is a discrete
   * trigger rather than being thrown away.
   */
  secondaryTaps: number;
  /**
   * True on the frame a fire key went down. Edge-triggered, unlike `firing`,
   * which is a level and is always true when autofire is on.
   */
  firePressed: boolean;
}

/** True when the event came from somewhere the player is typing. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

const KEYS_LEFT = new Set(["ArrowLeft", "KeyA"]);
const KEYS_RIGHT = new Set(["ArrowRight", "KeyD"]);
const KEYS_UP = new Set(["ArrowUp", "KeyW"]);
const KEYS_DOWN = new Set(["ArrowDown", "KeyS"]);
const KEYS_FIRE = new Set(["Space", "KeyZ", "KeyJ"]);

export class Input {
  /** When false, the player must hold to shoot. */
  autofire = true;

  /** Multiplier on drag distance. >1 means the ship outruns your thumb. */
  sensitivity = 1.15;

  private dragX = 0;
  private dragY = 0;
  private justPressed = false;
  private pointerDown = false;
  private secondaryTaps = 0;
  private firePressed = false;
  private activePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private held = new Set<string>();
  private detachFns: Array<() => void> = [];

  constructor(
    private readonly target: HTMLElement,
    private readonly view: View,
  ) {
    this.attach();
  }

  /**
   * Read and clear the frame's accumulated input. Call exactly once per
   * simulation step.
   */
  consume(): InputSnapshot {
    const snapshot: InputSnapshot = {
      dragX: this.dragX,
      dragY: this.dragY,
      axisX: this.axis(KEYS_RIGHT, KEYS_LEFT),
      axisY: this.axis(KEYS_DOWN, KEYS_UP),
      // With autofire the gun just runs -- the player only steers, which is
      // both the better touch feel and the more accessible default. With it
      // off, dragging doubles as the trigger.
      firing: this.autofire || this.pointerDown || this.anyHeld(KEYS_FIRE),
      justPressed: this.justPressed,
      pointerDown: this.pointerDown,
      secondaryTaps: this.secondaryTaps,
      firePressed: this.firePressed,
    };
    this.dragX = 0;
    this.dragY = 0;
    this.justPressed = false;
    this.secondaryTaps = 0;
    this.firePressed = false;
    return snapshot;
  }

  /** Forget any in-flight drag. Called on pause so resuming doesn't lurch. */
  reset(): void {
    this.dragX = 0;
    this.dragY = 0;
    this.justPressed = false;
    this.pointerDown = false;
    this.secondaryTaps = 0;
    this.firePressed = false;
    this.activePointer = null;
    this.held.clear();
  }

  destroy(): void {
    for (const off of this.detachFns) off();
    this.detachFns = [];
  }

  private axis(positive: Set<string>, negative: Set<string>): number {
    return (this.anyHeld(positive) ? 1 : 0) - (this.anyHeld(negative) ? 1 : 0);
  }

  private anyHeld(codes: Set<string>): boolean {
    for (const code of codes) if (this.held.has(code)) return true;
    return false;
  }

  private attach(): void {
    const onPointerDown = (e: PointerEvent) => {
      if (this.activePointer !== null) {
        // A second finger while the first is steering. Report it as a discrete
        // tap instead of discarding it -- that's what lets an aim-and-shoot
        // game use "aim with one thumb, fire with the other". Games that don't
        // care simply never read secondaryTaps.
        this.secondaryTaps += 1;
        return;
      }
      this.activePointer = e.pointerId;
      this.pointerDown = true;
      this.justPressed = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.target.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointer) return;
      // Accumulate: several pointermove events can land in one frame, and on
      // some browsers a single event coalesces many samples.
      this.dragX +=
        this.view.toWorldDistance(e.clientX - this.lastX) * this.sensitivity;
      this.dragY +=
        this.view.toWorldDistance(e.clientY - this.lastY) * this.sensitivity;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointer) return;
      this.activePointer = null;
      this.pointerDown = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never steal keystrokes from a text field. The movement and fire keys
      // include W/A/S/D/Z/J/Space, so without this the initials box silently
      // eats most of the alphabet -- you type "JGB" and get "GB".
      if (isTextEntry(e.target)) return;
      if (e.repeat) return;
      this.held.add(e.code);
      this.justPressed = true;
      if (KEYS_FIRE.has(e.code)) this.firePressed = true;
      // Stop the page scrolling out from under the game.
      if (
        KEYS_FIRE.has(e.code) ||
        KEYS_LEFT.has(e.code) ||
        KEYS_RIGHT.has(e.code) ||
        KEYS_UP.has(e.code) ||
        KEYS_DOWN.has(e.code)
      ) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return;
      this.held.delete(e.code);
    };

    // Losing focus mid-drag would otherwise leave keys stuck down forever.
    const onBlur = () => this.reset();

    this.target.addEventListener("pointerdown", onPointerDown);
    this.target.addEventListener("pointermove", onPointerMove);
    this.target.addEventListener("pointerup", onPointerUp);
    this.target.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    this.detachFns.push(
      () => this.target.removeEventListener("pointerdown", onPointerDown),
      () => this.target.removeEventListener("pointermove", onPointerMove),
      () => this.target.removeEventListener("pointerup", onPointerUp),
      () => this.target.removeEventListener("pointercancel", onPointerUp),
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => window.removeEventListener("blur", onBlur),
    );
  }
}

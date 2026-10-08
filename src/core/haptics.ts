/**
 * A buzz in the hand.
 *
 * Two routes, because the two phone families disagree. Android and most other
 * browsers have navigator.vibrate, which takes a pattern of on/off
 * milliseconds. iPhones have never had it: the only haptic Safari will give a
 * web page is the tick it plays when a switch-style checkbox is toggled
 * (iOS 17.4 and later), so there a buzz is one to three of those ticks.
 *
 * Both are best-effort and silent when unavailable. A browser may also ignore
 * a buzz that doesn't follow a touch closely enough, which is its call to
 * make; nothing in a game should depend on one having happened.
 */

/** On/off milliseconds, starting with on -- the navigator.vibrate shape. */
export type BuzzPattern = number | readonly number[];

/** Ticks an iPhone plays for the longest pattern. More reads as a fault. */
const MAX_IOS_TICKS = 3;
const IOS_TICK_GAP_MS = 90;

let switchLabel: HTMLLabelElement | null = null;

export function buzz(pattern: BuzzPattern): void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;

  if (typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
    } catch {
      // Blocked by a permissions policy. Not worth interrupting play.
    }
    return;
  }

  if (!("ontouchstart" in window)) return;

  // One tick per "on" stretch of the pattern.
  const pulses = typeof pattern === "number" ? 1 : Math.ceil(pattern.length / 2);
  const ticks = Math.max(1, Math.min(MAX_IOS_TICKS, pulses));
  for (let i = 0; i < ticks; i += 1) {
    if (i === 0) switchTick();
    else window.setTimeout(switchTick, i * IOS_TICK_GAP_MS);
  }
}

/** Toggle a hidden switch, which is what makes an iPhone tick. */
function switchTick(): void {
  try {
    if (!switchLabel) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;

      switchLabel = document.createElement("label");
      switchLabel.setAttribute("aria-hidden", "true");
      switchLabel.style.display = "none";
      switchLabel.append(input);
      document.body.append(switchLabel);
    }
    switchLabel.click();
  } catch {
    // No switch control on this browser.
  }
}

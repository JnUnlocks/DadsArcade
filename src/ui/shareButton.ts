/**
 * The SHARE button every daily puzzle uses.
 *
 * It started life inside Plasma Sort. Letter Lock needed the same button, and
 * two copies of "what the label says after a tap" would have drifted apart the
 * first time one of them was fixed.
 *
 * The caller supplies the class names, so each game keeps its own colours and
 * sizes; this owns the icon, the label, and what happens on a tap.
 */

import { shareText } from "../core/share";

/** The box-and-arrow both phone platforms use for "share", drawn not loaded. */
const SHARE_ICON =
  '<svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg>';

/**
 * A SHARE button. The text is built at tap time and handed straight to the
 * share sheet -- nothing may be awaited first, or the browser stops treating
 * it as a tap and refuses. The label answers what happened, since on a phone
 * without a share sheet the result goes to the clipboard instead and the
 * player needs telling to paste it.
 */
export function shareButton(className: string, text: () => string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  const label = document.createElement("span");
  label.className = "share-label";
  const idle = "SHARE";
  label.textContent = idle;
  button.innerHTML = SHARE_ICON;
  button.append(label);
  button.setAttribute("aria-label", "Share today's result");

  let reset = 0;
  button.addEventListener("click", () => {
    void shareText(text()).then((outcome) => {
      const said =
        outcome === "copied" ? "COPIED -- PASTE IT" : outcome === "failed" ? "CAN'T SHARE HERE" : idle;
      label.textContent = said;
      window.clearTimeout(reset);
      if (said !== idle) reset = window.setTimeout(() => (label.textContent = idle), 2600);
    });
  });
  return button;
}

/**
 * The feedback note.
 *
 * Its own screen rather than a box at the bottom of Settings, for one reason:
 * the keyboard. On a phone it covers the bottom half of the screen without
 * resizing the page, so a note box at the end of a scrolling list ends up
 * underneath it with SEND nowhere in sight. Everything here is stacked from
 * the top instead, so the box, the status line and SEND all stay above the
 * keyboard on a small phone with nothing to scroll.
 */

import { submitFeedback } from "../core/api";
import type { Player } from "../core/storage";

/**
 * What's been typed but not sent. Kept across visits to the screen so backing
 * out by accident -- or to go and check what a setting was called -- doesn't
 * cost someone their note.
 */
let draft = "";

export function buildFeedbackScreen(
  player: Player | null,
  onBack: () => void,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--feedback";

  const title = document.createElement("h2");
  title.textContent = "SEND A NOTE";

  const form = document.createElement("div");
  form.className = "feedback-form";

  const box = document.createElement("textarea");
  box.className = "feedback-input";
  box.rows = 4;
  box.maxLength = 2000;
  box.placeholder = "Something broken, confusing, or an idea? Tell us.";
  box.setAttribute("aria-label", "Your note");
  box.value = draft;

  // Above SEND, not below it: tapping a button doesn't put the keyboard away
  // on iOS, so anything under SEND can be hidden when a send fails.
  const status = document.createElement("p");
  status.className = "feedback-status";
  status.setAttribute("role", "status");

  const send = document.createElement("button");
  send.className = "btn btn--primary";
  send.textContent = "SEND";
  send.disabled = draft.trim().length === 0;

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);

  box.addEventListener("input", () => {
    draft = box.value;
    send.disabled = draft.trim().length === 0;
  });

  send.addEventListener("click", async () => {
    const message = box.value.trim();
    if (message.length === 0) return;

    send.disabled = true;
    status.textContent = "Sending…";
    status.style.color = "";

    const ok = await submitFeedback(message, player);
    if (ok) {
      draft = "";
      title.textContent = "NOTE SENT";
      status.textContent = "Thank you.";
      status.style.color = "var(--accent)";
      box.remove();
      send.remove();
      // Nothing left to keep clear of a keyboard, so sit in the middle like
      // every other short screen.
      screen.classList.remove("screen--feedback");
      back.className = "btn btn--primary";
      back.textContent = "DONE";
    } else {
      // Keep their text so a retry costs nothing.
      send.disabled = false;
      status.textContent = "Couldn't send — check your connection and try again.";
      status.style.color = "var(--danger)";
    }
  });

  form.append(box, status, send, back);
  screen.append(title, form);
  return screen;
}

/**
 * Put the cursor in the note box. Call it once the screen is in the document,
 * and synchronously inside the tap that opened it -- iOS only raises the
 * keyboard for a focus that happens during a real gesture.
 */
export function focusFeedback(screen: HTMLElement): void {
  screen.querySelector<HTMLTextAreaElement>(".feedback-input")?.focus();
}

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

import { submitFeedback, type FeedbackAbout } from "../core/api";
import type { Player } from "../core/storage";

/** When a note is written from inside a game: which one, for the title and the note. */
export interface FeedbackGame {
  id: string;
  title: string;
  /** Where in the game the player is, if the game can say. */
  at?: string;
}

type Kind = "bug" | "idea" | "love";

const KINDS: ReadonlyArray<{ kind: Kind; label: string; prompt: string }> = [
  { kind: "bug", label: "SOMETHING'S WRONG", prompt: "What happened, and what did you expect to happen?" },
  { kind: "idea", label: "AN IDEA", prompt: "What would make it better?" },
  { kind: "love", label: "I LOVE IT", prompt: "What do you like about it?" },
];

/**
 * What's been typed but not sent. Kept across visits to the screen so backing
 * out by accident -- or to go and check what a setting was called -- doesn't
 * cost someone their note.
 */
let draft = "";

export function buildFeedbackScreen(
  player: Player | null,
  onBack: () => void,
  game: FeedbackGame | null = null,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--feedback";

  // From inside a game, the title says which: nobody has to explain where
  // they were, and nobody wonders whether the note will reach the right place.
  const title = document.createElement("h2");
  title.textContent = game ? "FEEDBACK" : "SEND A NOTE";
  const about = document.createElement("p");
  about.className = "feedback-about";
  if (game) {
    about.textContent = `About ${game.title}${game.at ? `, ${game.at}` : ""}. We'll know which game and version it was.`;
  }

  // What kind of note: optional, and only one at a time. It tells us how to
  // read the note, and it changes the question in the box to suit.
  let kind: Kind | null = null;
  const kinds = document.createElement("div");
  kinds.className = "feedback-kinds";
  kinds.setAttribute("role", "group");
  kinds.setAttribute("aria-label", "What kind of note is it? Optional.");

  const form = document.createElement("div");
  form.className = "feedback-form";

  const box = document.createElement("textarea");
  box.className = "feedback-input";
  box.rows = 4;
  box.maxLength = 2000;
  const defaultPrompt = game
    ? `Something broken, confusing, or an idea for ${game.title}? Tell us.`
    : "Something broken, confusing, or an idea? Tell us.";
  box.placeholder = defaultPrompt;
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

  for (const option of KINDS) {
    const chip = document.createElement("button");
    chip.className = "feedback-kind";
    chip.textContent = option.label;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      kind = kind === option.kind ? null : option.kind;
      for (const other of kinds.children) {
        const on = other === chip && kind !== null;
        other.classList.toggle("is-on", on);
        other.setAttribute("aria-pressed", String(on));
      }
      box.placeholder = kind ? option.prompt : defaultPrompt;
      // Straight back to typing; the keyboard stays up on a phone.
      box.focus();
    });
    kinds.append(chip);
  }

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

    const sent: FeedbackAbout = {};
    if (game) {
      sent.game = game.id;
      if (game.at) sent.at = game.at;
    }
    if (kind) sent.kind = kind;
    const ok = await submitFeedback(message, player, sent);
    if (ok) {
      draft = "";
      title.textContent = "NOTE SENT";
      status.textContent = "Thank you.";
      status.style.color = "var(--accent)";
      box.remove();
      send.remove();
      kinds.remove();
      about.remove();
      // Nothing left to keep clear of a keyboard, so sit in the middle like
      // every other short screen.
      screen.classList.remove("screen--feedback");
      back.className = "btn btn--primary";
      back.textContent = game ? "BACK TO THE GAME" : "DONE";
    } else {
      // Keep their text so a retry costs nothing.
      send.disabled = false;
      status.textContent = "Couldn't send — check your connection and try again.";
      status.style.color = "var(--danger)";
    }
  });

  if (game) back.textContent = "BACK TO THE GAME";
  form.append(kinds, box, status, send, back);
  screen.append(title);
  if (game) screen.append(about);
  screen.append(form);
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

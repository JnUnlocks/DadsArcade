/**
 * Settings and the first-run instructions.
 *
 * Built from real checkboxes and range inputs rather than styled divs so they
 * announce correctly to screen readers and respond to assistive tech.
 */

import { submitFeedback } from "../core/api";
import type { Player, Settings } from "../core/storage";

export function buildSettingsScreen(
  settings: Readonly<Settings>,
  player: Player | null,
  onChange: (patch: Partial<Settings>) => void,
  onBack: () => void,
  openFeedback = false,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--settings";

  const title = document.createElement("h2");
  title.textContent = "SETTINGS";
  screen.append(title);

  const list = document.createElement("div");
  list.className = "settings-list";

  list.append(
    toggle(
      "Auto-fire",
      "The gun fires on its own so you only steer.",
      settings.autofire,
      (v) => onChange({ autofire: v }),
    ),
    slider(
      "Steering speed",
      settings.sensitivity,
      0.6,
      2,
      0.05,
      (v) => onChange({ sensitivity: v }),
    ),
    toggle("Sound", "Arcade beeps and explosions.", !settings.muted, (v) =>
      onChange({ muted: !v }),
    ),
    slider("Volume", settings.volume, 0, 1, 0.05, (v) => onChange({ volume: v })),
    toggle(
      "CRT effect",
      "Scanlines and a soft vignette, like the cabinet glass.",
      settings.crt,
      (v) => onChange({ crt: v }),
    ),
    toggle(
      "Larger text",
      "Bigger menus, buttons and score.",
      settings.largeText,
      (v) => onChange({ largeText: v }),
    ),
    toggle(
      "High contrast",
      "Brighter, plainer colours for the score and ships.",
      settings.highContrast,
      (v) => onChange({ highContrast: v }),
    ),
    toggle(
      "Reduce motion",
      "No screen shake or impact freezes.",
      settings.reducedMotion,
      (v) => onChange({ reducedMotion: v }),
    ),
  );

  const feedback = buildFeedbackSection(player);
  list.append(feedback);
  screen.append(list);

  if (openFeedback) {
    // Arrived here from "SEND A NOTE" -- open the box and bring it into view
    // rather than dropping them at the top of a long settings list.
    feedback.querySelector<HTMLButtonElement>(".btn--inline")?.click();
    requestAnimationFrame(() => {
      feedback.scrollIntoView({ block: "center" });
    });
  }

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);
  screen.append(back);

  return screen;
}

/**
 * Feedback box. Collapsed to a single button until tapped, so it never
 * competes with the actual settings.
 */
function buildFeedbackSection(player: Player | null): HTMLElement {
  const section = document.createElement("div");
  section.className = "setting setting--feedback";

  const heading = document.createElement("span");
  heading.className = "setting-name";
  heading.textContent = "Feedback";

  const hint = document.createElement("span");
  hint.className = "setting-hint";
  hint.textContent = "Something broken, confusing, or an idea? Tell us.";

  const open = document.createElement("button");
  open.className = "btn btn--ghost btn--inline";
  open.textContent = "WRITE A NOTE";

  const form = document.createElement("div");
  form.className = "feedback-form";
  form.hidden = true;

  const box = document.createElement("textarea");
  box.className = "feedback-input";
  box.rows = 4;
  box.maxLength = 2000;
  box.placeholder = "What happened, or what would make it better?";
  box.setAttribute("aria-label", "Your feedback");

  const send = document.createElement("button");
  send.className = "btn btn--primary btn--inline";
  send.textContent = "SEND";
  send.disabled = true;

  const status = document.createElement("span");
  status.className = "setting-hint feedback-status";

  box.addEventListener("input", () => {
    send.disabled = box.value.trim().length === 0;
  });

  open.addEventListener("click", () => {
    form.hidden = false;
    open.hidden = true;
    box.focus();
  });

  send.addEventListener("click", async () => {
    const message = box.value.trim();
    if (message.length === 0) return;

    send.disabled = true;
    status.textContent = "Sending…";
    status.style.color = "";

    const ok = await submitFeedback(message, player);
    if (ok) {
      form.hidden = true;
      status.textContent = "Sent — thank you.";
      status.style.color = "var(--accent)";
      box.value = "";
    } else {
      // Keep their text so a retry costs nothing.
      send.disabled = false;
      status.textContent = "Couldn't send — check your connection and try again.";
      status.style.color = "var(--danger)";
    }
  });

  form.append(box, send);
  section.append(heading, hint, open, form, status);
  return section;
}

function toggle(
  label: string,
  hint: string,
  value: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "setting";

  const text = document.createElement("span");
  text.className = "setting-text";
  const name = document.createElement("span");
  name.className = "setting-name";
  name.textContent = label;
  const sub = document.createElement("span");
  sub.className = "setting-hint";
  sub.textContent = hint;
  text.append(name, sub);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "setting-toggle";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));

  row.append(text, input);
  return row;
}

function slider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "setting setting--slider";

  const name = document.createElement("span");
  name.className = "setting-name";
  name.textContent = label;

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.className = "setting-range";
  input.addEventListener("input", () => onChange(Number(input.value)));

  row.append(name, input);
  return row;
}

/** Shown once, before the very first run. */
export function buildHowToScreen(onStart: () => void): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen";

  const title = document.createElement("h2");
  title.textContent = "HOW TO PLAY";

  const list = document.createElement("div");
  list.className = "howto";
  for (const [icon, text] of [
    ["✋", "Drag anywhere on the screen to fly. Your finger doesn't have to be on the ship."],
    ["⦿", "The gun fires by itself. Just concentrate on not getting hit."],
    ["⏸", "Tap pause any time. The game also pauses itself if you get a call."],
    ["◈", "The gold cruisers can steal your ship. Shoot the one holding it and you get it back — with double guns."],
  ] as const) {
    const row = document.createElement("div");
    row.className = "howto-row";
    const glyph = document.createElement("span");
    glyph.className = "howto-icon";
    glyph.textContent = icon;
    glyph.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.textContent = text;
    row.append(glyph, copy);
    list.append(row);
  }

  const start = document.createElement("button");
  start.className = "btn btn--primary";
  start.textContent = "START";
  start.addEventListener("click", onStart);

  screen.append(title, list, start);
  return screen;
}

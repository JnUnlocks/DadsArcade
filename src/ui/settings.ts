/**
 * Settings and the first-run instructions.
 *
 * Built from real checkboxes and range inputs rather than styled divs so they
 * announce correctly to screen readers and respond to assistive tech.
 */

import type { Settings } from "../core/storage";

export function buildSettingsScreen(
  settings: Readonly<Settings>,
  onChange: (patch: Partial<Settings>) => void,
  onBack: () => void,
  onFeedback: () => void,
  onReleaseNotes?: () => void,
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
      "Music",
      "The tune in Brickfall. Separate from the sound effects.",
      settings.music,
      (v) => onChange({ music: v }),
    ),
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

  screen.append(list);

  // Outside the list, so the way to send a note is on screen the moment
  // Settings opens instead of below the last toggle. Side by side while both
  // labels fit; stacked on a narrow phone or with larger text.
  const actions = document.createElement("div");
  actions.className = "settings-actions";

  const feedback = document.createElement("button");
  feedback.className = "btn";
  feedback.textContent = "SEND A NOTE";
  feedback.addEventListener("click", onFeedback);

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);

  actions.append(feedback, back);
  screen.append(actions);

  if (onReleaseNotes) {
    const notes = document.createElement("button");
    notes.className = "btn btn--quiet";
    notes.textContent = `RELEASE NOTES · v${__APP_VERSION__}`;
    notes.addEventListener("click", onReleaseNotes);
    screen.append(notes);
  }

  const credit = document.createElement("p");
  credit.className = "credit";
  credit.textContent = `v${__APP_VERSION__} · Developer: JB Unlocks`;
  screen.append(credit);

  return screen;
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

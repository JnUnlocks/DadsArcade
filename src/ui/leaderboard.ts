/**
 * Leaderboard screen and the initials prompt.
 *
 * Kept as DOM rather than canvas so it scrolls, scales with the accessibility
 * text setting, and works with a screen reader.
 */

import { fetchLeaderboard, type LeaderboardRow } from "../core/api";
import { dailyKey } from "../core/rng";
import type { Player } from "../core/storage";

/**
 * Which slice of the board we're looking at.
 *
 * "today" is not a date filter like "week" is -- it's a different board
 * entirely. Everyone playing the daily challenge got the same seeded run, so
 * those scores are the only ones in the arcade that are strictly comparable,
 * and mixing them into the all-time list would throw away the one property
 * that makes them worth ranking.
 */
type Slice = "all" | "week" | "today";

export function buildLeaderboardScreen(
  gameId: string,
  player: Player | null,
  onBack: () => void,
  hasDailyChallenge = false,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--board";

  const title = document.createElement("h2");
  title.textContent = "HIGH SCORES";
  screen.append(title);

  const tabs = document.createElement("div");
  tabs.className = "tabs";
  const allTab = tabButton("ALL TIME", true);
  const weekTab = tabButton("THIS WEEK", false);
  // Only offered by games that actually file runs under a per-day board --
  // otherwise it would be a tab that is permanently empty.
  const todayTab = hasDailyChallenge ? tabButton("TODAY", false) : null;
  tabs.append(allTab, weekTab);
  if (todayTab) tabs.append(todayTab);
  screen.append(tabs);

  const body = document.createElement("div");
  body.className = "board";
  screen.append(body);

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);
  screen.append(back);

  let slice: Slice = "all";

  const load = async () => {
    body.replaceChildren(message("LOADING…"));
    const period = slice === "week" ? "week" : "all";
    const board = slice === "today" ? `daily-${dailyKey()}` : "";
    try {
      const rows = await fetchLeaderboard(
        gameId,
        period,
        20,
        player?.deviceId,
        board,
      );
      if (rows.length === 0) {
        body.replaceChildren(
          message(
            slice === "today"
              ? "Nobody has played today’s special yet. Go set the mark."
              : "No scores yet. Be the first one on the board.",
          ),
        );
        return;
      }
      body.replaceChildren(...rows.map((row, i) => buildRow(row, i)));
    } catch {
      body.replaceChildren(
        message("Can't reach the scoreboard. Your scores are saved and will upload later."),
      );
    }
  };

  const tabsBySlice: Array<[Slice, HTMLButtonElement | null]> = [
    ["all", allTab],
    ["week", weekTab],
    ["today", todayTab],
  ];

  for (const [name, tab] of tabsBySlice) {
    if (!tab) continue;
    tab.addEventListener("click", () => {
      slice = name;
      for (const [, other] of tabsBySlice) {
        other?.classList.toggle("is-active", other === tab);
      }
      void load();
    });
  }

  void load();
  return screen;
}

function buildRow(row: LeaderboardRow, index: number): HTMLElement {
  const line = document.createElement("div");
  line.className = "board-row";
  // Highlight the player's own entry. The server decides this by device, not
  // by initials -- two people can both pick "JGB" and only one of them is you.
  if (row.is_you) {
    line.classList.add("is-you");
  }

  const rank = document.createElement("span");
  rank.className = "board-rank";
  rank.textContent = String(index + 1).padStart(2, "0");

  const initials = document.createElement("span");
  initials.className = "board-initials";
  initials.textContent = row.initials;

  const score = document.createElement("span");
  score.className = "board-score";
  score.textContent = String(row.score).padStart(6, "0");

  const wave = document.createElement("span");
  wave.className = "board-wave";
  wave.textContent = `W${row.wave}`;

  line.append(rank, initials, score, wave);
  return line;
}

function tabButton(label: string, active: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = active ? "tab is-active" : "tab";
  button.textContent = label;
  return button;
}

function message(text: string): HTMLElement {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

/**
 * The arcade initials prompt. One input rather than three boxes -- three boxes
 * look authentic but fight every mobile keyboard.
 */
export function buildInitialsPrompt(
  onSubmit: (initials: string) => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "initials";

  const label = document.createElement("p");
  label.textContent = "ENTER YOUR INITIALS";

  const input = document.createElement("input");
  input.className = "initials-input";
  input.maxLength = 3;
  input.autocapitalize = "characters";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Your three-letter initials");
  input.placeholder = "AAA";

  const submit = document.createElement("button");
  submit.className = "btn btn--primary";
  submit.textContent = "SAVE SCORE";
  submit.disabled = true;

  let composing = false;

  const sanitize = () => {
    // Mid-composition (predictive text, accent keys) the value is transient --
    // rewriting it here cancels the composition and drops characters.
    if (composing) return;

    const cleaned = input.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);

    // Only write back when we actually changed something. An unconditional
    // assignment moves the caret to the end on every keystroke.
    if (cleaned !== input.value) {
      const atEnd = input.selectionStart === input.value.length;
      input.value = cleaned;
      if (!atEnd) {
        const pos = Math.min(input.selectionStart ?? cleaned.length, cleaned.length);
        input.setSelectionRange(pos, pos);
      }
    }
    submit.disabled = cleaned.length === 0;
  };

  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    sanitize();
  });
  input.addEventListener("input", sanitize);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && input.value.length > 0) submit.click();
  });
  submit.addEventListener("click", () => {
    if (input.value.length > 0) onSubmit(input.value);
  });

  wrap.append(label, input, submit);
  return wrap;
}

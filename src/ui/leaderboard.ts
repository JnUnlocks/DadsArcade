/**
 * Leaderboard screen and the initials prompt.
 *
 * Kept as DOM rather than canvas so it scrolls, scales with the accessibility
 * text setting, and works with a screen reader.
 */

import { fetchLeaderboard, type LeaderboardRow } from "../core/api";
import type { GameModule } from "../core/game";
import { dailyKey } from "../core/rng";
import type { Player } from "../core/storage";
import {
  gamesInView,
  progressText,
  shortTitleOf,
  sliceAfterFilterChange,
  todayAvailable,
  type GameFilter,
  type Slice,
} from "./boardFilter";

/** Rows shown per game in the all-games view, and on a single game's board. */
const PER_GAME_IN_OVERVIEW = 3;
const SINGLE_GAME_ROWS = 20;

/**
 * The high-score screen.
 *
 * It used to show exactly one game's board, and the menu's HIGH SCORES button
 * always opened the first game in the list -- so from the menu you could only
 * ever see Starfighter, and nothing on the screen said which game you were
 * looking at. Now there's a filter across the top: ALL GAMES, or any one game,
 * each in its cabinet colour.
 *
 * ALL GAMES is deliberately sections, not one ranked list. Scores from
 * different games aren't on the same scale -- a middling Brickfall run can
 * outscore a brilliant one elsewhere -- so ranking them against each other
 * would be a table of numbers that means nothing. Each game gets its own top
 * three under its own heading instead.
 */
export function buildLeaderboardScreen(
  games: readonly GameModule[],
  initialFilter: GameFilter,
  player: Player | null,
  onBack: () => void,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--board";

  const title = document.createElement("h2");
  title.textContent = "HIGH SCORES";
  screen.append(title);

  let filter: GameFilter =
    initialFilter !== null && games.some((g) => g.id === initialFilter)
      ? initialFilter
      : null;
  let slice: Slice = "all";

  // ----- Game filter -----
  const filters = document.createElement("div");
  filters.className = "board-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Show scores for");

  const filterButtons = new Map<GameFilter, HTMLButtonElement>();
  const addFilter = (key: GameFilter, label: string, accent: string) => {
    const chip = document.createElement("button");
    chip.className = "board-filter";
    chip.textContent = label;
    chip.style.setProperty("--chip-accent", accent);
    chip.addEventListener("click", () => select(key));
    filterButtons.set(key, chip);
    filters.append(chip);
  };
  addFilter(null, "ALL GAMES", "#46e0ff");
  for (const game of games) addFilter(game.id, shortTitleOf(game), game.accent);
  screen.append(filters);

  // ----- Period tabs -----
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  const tabBySlice: Record<Slice, HTMLButtonElement> = {
    all: tabButton("ALL TIME"),
    week: tabButton("THIS WEEK"),
    today: tabButton("TODAY"),
  };
  for (const [name, tab] of Object.entries(tabBySlice) as Array<[Slice, HTMLButtonElement]>) {
    tab.addEventListener("click", () => {
      slice = name;
      render();
    });
    tabs.append(tab);
  }
  screen.append(tabs);

  const body = document.createElement("div");
  body.className = "board";
  screen.append(body);

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);
  screen.append(back);

  function select(next: GameFilter): void {
    filter = next;
    slice = sliceAfterFilterChange(games, filter, slice);
    render();
  }

  /**
   * Every load bumps this, and a response only draws if it's still the latest.
   * Tapping through the filters faster than the network answers would
   * otherwise let a slow reply for the previous game land on top of the
   * current one -- the wrong game's scores under the right game's heading.
   */
  let requestId = 0;

  function render(): void {
    for (const [key, chip] of filterButtons) {
      const on = key === filter;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", String(on));
    }
    // Keep the chosen chip in view; the row scrolls sideways on a phone.
    filterButtons.get(filter)?.scrollIntoView({ block: "nearest", inline: "nearest" });

    // Only offer TODAY where a selected game actually has a daily board.
    tabBySlice.today.hidden = !todayAvailable(games, filter);
    for (const [name, tab] of Object.entries(tabBySlice) as Array<[Slice, HTMLButtonElement]>) {
      tab.classList.toggle("is-active", name === slice);
    }

    void load();
  }

  async function load(): Promise<void> {
    const mine = ++requestId;
    const period = slice === "week" ? "week" : "all";
    const board = slice === "today" ? `daily-${dailyKey()}` : "";
    const visible = gamesInView(games, filter, slice);

    body.replaceChildren(message("LOADING…"));

    const results = await Promise.allSettled(
      visible.map((game) =>
        fetchLeaderboard(
          game.id,
          period,
          filter === null ? PER_GAME_IN_OVERVIEW : SINGLE_GAME_ROWS,
          player?.deviceId,
          board,
        ),
      ),
    );
    if (mine !== requestId) return; // superseded by a newer selection

    if (results.length > 0 && results.every((r) => r.status === "rejected")) {
      body.replaceChildren(
        message("Can't reach the scoreboard. Your scores are saved and will upload later."),
      );
      return;
    }

    if (filter !== null) {
      const game = visible[0];
      const result = results[0];
      const rows = result?.status === "fulfilled" ? result.value : [];
      const parts: HTMLElement[] = [];
      if (game) parts.push(sectionHeader(game, null));
      if (rows.length > 0) parts.push(...rows.map((row, i) => buildRow(row, i, game)));
      else parts.push(message(emptyText(slice)));
      body.replaceChildren(...parts);
      return;
    }

    const sections: HTMLElement[] = [];
    visible.forEach((game, i) => {
      const result = results[i]!;
      const section = document.createElement("section");
      section.className = "board-section";
      section.append(sectionHeader(game, () => select(game.id)));

      if (result.status === "rejected") {
        section.append(message("Couldn't load this one."));
      } else if (result.value.length === 0) {
        section.append(message(slice === "today" ? "Nobody yet today." : "No scores yet."));
      } else {
        section.append(...result.value.map((row, n) => buildRow(row, n, game)));
      }
      sections.push(section);
    });
    body.replaceChildren(...sections);
  }

  render();
  return screen;
}

/**
 * The game's name in its cabinet colour, above its scores. In the all-games
 * view it also carries a SEE ALL link to that game's full board.
 */
function sectionHeader(game: GameModule, onSeeAll: (() => void) | null): HTMLElement {
  const head = document.createElement("div");
  head.className = "board-section-head";
  head.style.setProperty("--section-accent", game.accent);

  const name = document.createElement("span");
  name.className = "board-section-name";
  name.textContent = game.title;
  head.append(name);

  if (onSeeAll) {
    const more = document.createElement("button");
    more.className = "board-see-all";
    more.textContent = "SEE ALL ›";
    more.setAttribute("aria-label", `See all ${game.title} scores`);
    more.addEventListener("click", onSeeAll);
    head.append(more);
  }
  return head;
}

function emptyText(slice: Slice): string {
  return slice === "today"
    ? "Nobody has played today’s special yet. Go set the mark."
    : "No scores yet. Be the first one on the board.";
}

function buildRow(
  row: LeaderboardRow,
  index: number,
  game: GameModule | undefined,
): HTMLElement {
  const line = document.createElement("div");
  line.className = "board-row";
  // A stripe in the game's colour, so a row still says which game it's from
  // when it's the only thing in view.
  if (game) line.style.setProperty("--row-accent", game.accent);
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
  wave.textContent = progressText(game, row.wave);

  line.append(rank, initials, score, wave);
  return line;
}

function tabButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "tab";
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

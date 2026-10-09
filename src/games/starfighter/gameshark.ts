/**
 * The Game Shark: Starfighter's hidden cheat panel.
 *
 * There is an invisible button in the bottom-left corner of the pause screen.
 * Nothing on screen says so -- you have to be told, which is the point. It
 * opens a panel of codes that bend the rules the rest of the game is careful
 * to keep.
 *
 * Two things keep it from spoiling the arcade for everyone else:
 *   - A run that used any code is never ranked. The scoreboard is shared by
 *     the whole family, and a shielded run on it would be a lie.
 *   - The codes stay switched on between runs, like a cartridge left in the
 *     slot, but are gone when the arcade is reloaded. Nobody inherits a
 *     cheated game from whoever had the phone last week.
 */

import { toggle } from "../../ui/settings";
import "./gameshark.css";

export interface Codes {
  /** Fly two abreast, and get the wingman back with each new ship and wave. */
  dualFighters: boolean;
  /** Twice the shots in the air, twice as fast. */
  rapidFire: boolean;
  /** Nothing can hurt you, and no beam can take you. */
  shields: boolean;
}

/** Module-level on purpose: RESTART and PLAY AGAIN build a new game. */
export const codes: Codes = {
  dualFighters: false,
  rapidFire: false,
  shields: false,
};

export function anyCodeOn(): boolean {
  return codes.dualFighters || codes.rapidFire || codes.shields;
}

/** The most ships a code can stock you with -- as many as the HUD can show. */
export const MAX_SHARK_LIVES = 9;

/** What the panel needs from the run it is cheating in. */
export interface SharkTarget {
  /** A code was switched on or off; apply it to the run in progress. */
  codesChanged(): void;
  /** Hand over one more ship. False when the hangar is already full. */
  addShip(): boolean;
  lives(): number;
  /** True once this run has used a code and so won't be ranked. */
  used(): boolean;
}

/**
 * The hidden button and the panel it opens, for the pause screen. The root
 * covers the screen but only the two of them catch touches.
 */
export function buildGameShark(target: SharkTarget): HTMLElement {
  const root = document.createElement("div");
  root.className = "gameshark";

  const secret = document.createElement("button");
  secret.className = "gameshark-secret";
  // Kept out of the tab order and the accessibility tree: a secret that a
  // screen reader announces, or that Tab lands on with a focus ring, isn't one.
  secret.tabIndex = -1;
  secret.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "screen gameshark-panel";
  panel.hidden = true;

  const title = document.createElement("h2");
  title.textContent = "GAME SHARK";

  const status = document.createElement("p");
  status.className = "gameshark-status";

  const list = document.createElement("div");
  list.className = "settings-list";

  const ship = document.createElement("button");
  ship.className = "btn";

  const refresh = () => {
    const used = target.used();
    status.textContent = used
      ? "Codes used. This run stays off the high scores."
      : "Any code keeps this run off the high scores.";
    status.classList.toggle("gameshark-status--used", used);
    ship.textContent = `+1 SHIP · ${target.lives()} IN HANGAR`;
    ship.disabled = target.lives() >= MAX_SHARK_LIVES;
  };

  const code = (key: keyof Codes, label: string, hint: string) =>
    toggle(label, hint, codes[key], (on) => {
      codes[key] = on;
      target.codesChanged();
      refresh();
    });

  list.append(
    code(
      "dualFighters",
      "Dual fighters",
      "Fly two abreast. The wingman comes back with every new ship and every wave.",
    ),
    code("rapidFire", "Rapid fire", "Twice the shots in the air, twice as fast."),
    code("shields", "Shields", "Nothing can hurt you, and no beam can take you."),
  );

  ship.addEventListener("click", () => {
    target.addShip();
    refresh();
  });

  const done = document.createElement("button");
  done.className = "btn btn--ghost";
  done.textContent = "DONE";
  done.addEventListener("click", () => {
    panel.hidden = true;
  });

  secret.addEventListener("click", () => {
    refresh();
    panel.hidden = false;
  });

  panel.append(title, status, list, ship, done);
  root.append(secret, panel);
  return root;
}

/**
 * The story screen.
 *
 * This is the one piece of the app that isn't functional -- it's why the thing
 * exists. Reached from a quiet link on the main menu rather than buried in
 * settings, because the person it's written for should actually find it.
 *
 * The copy lives in STORY below. It's meant to be edited -- it's your voice,
 * not the app's.
 */

const STORY: ReadonlyArray<string> = [
  "This started as a conversation that kept coming back.",

  "Dad grew up on Galaga and Space Invaders. Real cabinets, a quarter on the glass to hold your place in line. He always said those games were made by people who knew exactly what they were doing — and that you couldn't just sit down and make one today.",

  "So we made one.",

  "Starfighter keeps the parts that made Galaga what it was: enemies that sweep in along curves instead of sliding across in rows, only two of your shots allowed on screen at once, and a cruiser that can steal your fighter — shoot it down and you fly two abreast for the rest of the wave.",

  "Everything here is drawn and synthesised from scratch. No borrowed art, no sound files. The ships are shapes, the explosions are noise and a filter, and the whole arcade is smaller than a single photo.",

  "Built for one player in particular.",
];

export function buildAboutScreen(
  onBack: () => void,
  onFeedback: () => void,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--about";

  const title = document.createElement("h2");
  title.textContent = "THE STORY";
  screen.append(title);

  const body = document.createElement("div");
  body.className = "story";
  for (const paragraph of STORY) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    body.append(p);
  }

  const sign = document.createElement("p");
  sign.className = "story-sign";
  sign.textContent = "— Hyperdrive Arcade";
  body.append(sign);

  screen.append(body);

  const feedback = document.createElement("button");
  feedback.className = "btn";
  feedback.textContent = "SEND A NOTE";
  feedback.addEventListener("click", onFeedback);

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);

  screen.append(feedback, back);
  return screen;
}

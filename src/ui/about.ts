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

  "Dad grew up on Galaga and Space Invaders. Real cabinets, a quarter on the glass to hold your place in line.",

  "So the idea was: how fast could we bring something like that back to life — and make the building of it as fun as the playing of it.",

  "Then it stopped being one person's game. Nathan wanted ducks, so the dog showed up and started laughing at us. Riley wanted the ocean, so there's a reef full of jellyfish to outswim — and then she wanted slime, so now there's a counter where you mix it, and prizes you have to squish out of it. Every time someone said \"could it also do…\", it turned out it could.",

  "The old rules are all still in here, because they were good rules. Only two shots on screen at once. Ducks that flush in an arc. Jellyfish that each hunt you differently instead of moving as one clump. A frog that can only move one hop at a time, and has to live with where that hop put it.",

  "Everything is drawn and synthesised from scratch. No borrowed art, no sound files. The ships are shapes, the explosions are noise and a filter, and the whole arcade is smaller than a single photo.",

  "Five machines now, and room on the floor for more. Built for one player in particular — and then, somehow, for all of us.",
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
  sign.textContent = "Made with love, your son";
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

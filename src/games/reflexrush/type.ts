/**
 * Thumb Storm -- the rules, and nothing else.
 *
 * Thirty seconds of typing, timed from the first letter. The passage is
 * lowercase words and spaces only: on a phone, capitals and punctuation mean
 * switching keyboards, and this is a test of thumbs, not of finding the
 * comma. Case is ignored anyway, in case a keyboard capitalises on its own.
 *
 * Letter by letter is the whole contest, so the text box's value is judged
 * change by change, whatever the keyboard says it did:
 *
 *   - one letter added, or letters deleted: fine, that's typing,
 *   - more than one letter at once (a swipe, a suggestion, a paste) or
 *     letters swapped for others (autocorrect): refused, and the box is put
 *     back the way it was.
 *
 * The score is net words a minute: characters that match the passage, less
 * the ones that don't, five characters to a word. Accuracy is every letter
 * typed, fixed later or not, against the ones that were right first time.
 *
 * Pure: the game supplies the text and the clock (typing.test.ts).
 */

export const TYPE_MS = 30_000;
/** Enough passage that nobody can reach the end in 30 seconds (280 WPM). */
export const PASSAGE_CHARS = 700;
/** Live speed isn't shown until there's enough of a sample to mean anything. */
export const LIVE_AFTER_MS = 2_000;

/**
 * The sentences, about the arcade and about nothing much. All lowercase, no
 * punctuation, every one about the same length so no draw is luckier.
 */
export const SENTENCES: readonly string[] = [
  "dad stacked the neon tower all the way past the clouds",
  "the reactor glowed orange as the whole city lit up",
  "wait for the yellow light and then tap as fast as you can",
  "every orb on the grid fades a little faster near the end",
  "the high score board is where family legends are made",
  "one more game is what everyone says before bedtime",
  "the arcade never closes and the snacks are always free",
  "a perfect block landed right on top of the last one",
  "grandma set a record that nobody has beaten since",
  "the brick bounced off the paddle and broke the top row",
  "a good player knows when to slow down and aim",
  "the prize machine dropped a tiny robot into the tray",
  "the word game lit up when the long word finally fit",
  "the fox ran through the forest faster than the wind",
  "three in a row means the next one is worth even more",
  "nobody believed the kids could beat the old high score",
  "the neon sign buzzed over the door all night long",
  "fast thumbs win races but careful thumbs win games",
  "she typed so fast that the screen could barely keep up",
  "the dog sat by the couch and watched the whole match",
  "pancakes on saturday taste better after a winning streak",
  "the garage was full of old boxes and one shiny bike",
  "we packed the car early and drove toward the lake",
  "a small green frog jumped from the dock into the water",
  "the coffee was hot and the morning was very quiet",
  "the team cheered when the final whistle finally blew",
  "my little brother hid the remote behind the plant again",
  "the grill smoked while everyone argued about the rules",
  "a bright kite climbed over the beach and kept on going",
  "the old clock in the hall chimed seven times tonight",
  "we found a quarter in the couch and called it treasure",
  "the movie was long but the popcorn lasted until the end",
  "rain tapped on the window while we built a pillow fort",
  "the best part of the trip was the stop for ice cream",
  "he fixed the squeaky door with a little bit of oil",
  "the moon was so bright we could see the whole yard",
  "practice every day and your thumbs will thank you",
  "the cat knocked a pen off the desk just to watch it fall",
  "a quick jump over the lazy log saved the whole level",
  "the lights flickered once and then the game began",
];

/** The passage for one round: sentences in a random order, none twice. */
export function passage(rand: () => number, minChars = PASSAGE_CHARS): string {
  const deck = [...SENTENCES];
  const out: string[] = [];
  let length = 0;
  while (length < minChars) {
    if (deck.length === 0) deck.push(...SENTENCES);
    const i = Math.floor(rand() * deck.length);
    const [next] = deck.splice(i, 1);
    out.push(next!);
    length += next!.length + 1;
  }
  return out.join(" ");
}

export interface Typing {
  target: string;
  /** What's in the box now, as judged. */
  typed: string;
  /** Every letter added, right or wrong, fixed later or not. */
  keystrokes: number;
  /** Letters that were right when they were typed. */
  rightFirst: number;
  /** When the first letter landed; the clock runs from here. */
  start: number | null;
  deadline: number | null;
}

/** What happened to a change to the box. */
export type Verdict =
  /** Counted. */
  | "ok"
  /** More than one letter at once: a swipe, a suggestion or a paste. */
  | "many"
  /** Letters swapped for others: autocorrect, or typing over a selection. */
  | "swap"
  /** Time's up: nothing more counts. */
  | "over";

export function newTyping(target: string): Typing {
  return { target, typed: "", keystrokes: 0, rightFirst: 0, start: null, deadline: null };
}

/** What a keyboard might put in that we read as plain typing. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ");
}

/** Judge the box's new value. Only an "ok" changes anything. */
export function change(t: Typing, value: string, at: number): Verdict {
  if (t.deadline !== null && at >= t.deadline) return "over";
  const next = normalise(value).slice(0, t.target.length);
  const old = t.typed;
  let k = 0;
  while (k < old.length && k < next.length && old[k] === next[k]) k += 1;
  const removed = old.length - k;
  const added = next.length - k;
  if (added > 1) return "many";
  if (added === 1 && removed > 0) return "swap";

  if (added === 1) {
    if (t.start === null) {
      t.start = at;
      t.deadline = at + TYPE_MS;
    }
    t.keystrokes += 1;
    if (next[k] === t.target[k]) t.rightFirst += 1;
  }
  t.typed = next;
  return "ok";
}

/** How many of the letters in the box match the passage. */
export function correctChars(t: Typing): number {
  let n = 0;
  for (let i = 0; i < t.typed.length; i += 1) if (t.typed[i] === t.target[i]) n += 1;
  return n;
}

export interface TypeResult {
  /** Net words a minute: the score. */
  wpm: number;
  /** Per cent of letters right first time. */
  accuracy: number;
  correct: number;
  wrong: number;
}

export function result(t: Typing): TypeResult {
  const correct = correctChars(t);
  const wrong = t.typed.length - correct;
  const minutes = TYPE_MS / 60_000;
  const wpm = Math.max(0, Math.round((correct - wrong) / 5 / minutes));
  const accuracy = t.keystrokes === 0 ? 0 : Math.round((100 * t.rightFirst) / t.keystrokes);
  return { wpm, accuracy, correct, wrong };
}

/** Net words a minute so far; null until there's enough to go on. */
export function liveWpm(t: Typing, now: number): number | null {
  if (t.start === null) return null;
  const ms = Math.min(now, t.deadline ?? now) - t.start;
  if (ms < LIVE_AFTER_MS) return null;
  const correct = correctChars(t);
  const wrong = t.typed.length - correct;
  return Math.max(0, Math.round((correct - wrong) / 5 / (ms / 60_000)));
}

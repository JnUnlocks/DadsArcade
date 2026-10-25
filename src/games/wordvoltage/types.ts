/**
 * Word Voltage's puzzle shapes.
 *
 * A puzzle is a wheel of letters and a crossword of words placed on integer
 * coordinates. Nothing here is drawn from a seed at run time: every puzzle is
 * made offline (scripts/word-voltage/generate.ts), checked by validate.ts,
 * and shipped in a versioned pack (public/word-voltage/). The game only reads
 * them, which is what keeps a puzzle the same on every phone and across
 * every future release.
 */

export type Difficulty = "family" | "challenge";

export type Orientation = "across" | "down";

/** One target word, where it sits on the board, and which way it runs. */
export interface Placement {
  readonly word: string;
  readonly row: number;
  readonly col: number;
  readonly dir: Orientation;
}

export interface Puzzle {
  /** Stable for ever: saves, stars and rewards are keyed on it. */
  readonly id: string;
  readonly difficulty: Difficulty;
  /**
   * The wheel, one letter per physical token, in the order the tokens sit
   * when the puzzle is first opened. Two Es are two tokens.
   */
  readonly letters: string;
  /** The words that fill the board. Finishing every one finishes the level. */
  readonly words: readonly Placement[];
  /**
   * Every other word the wheel spells that the game accepts, worked out from
   * the bundled lexicon when the pack was made. Never includes a target.
   */
  readonly bonus: readonly string[];
  /** Themed levels only: the level's name ("Noah's Ark"). */
  readonly title?: string;
  /** Themed levels only: which of its board words belong to the theme. */
  readonly theme?: readonly string[];
}

/** A circuit is twenty levels of one path, with its own colours. */
export interface Circuit {
  readonly id: string;
  readonly name: string;
  /** Two colours: the main neon and its partner. */
  readonly colors: readonly [string, string];
}

/** The whole shipped content: every puzzle, the two campaigns, the dailies. */
export interface Pack {
  /** Bumped only by a new pack file; old ids keep their meaning in every pack. */
  readonly version: string;
  readonly puzzles: Readonly<Record<string, Puzzle>>;
  readonly campaign: Readonly<Record<Difficulty, readonly string[]>>;
  /** Date (YYYY-MM-DD, New York calendar) to that day's puzzle per path. */
  readonly daily: Readonly<Record<string, Readonly<Record<Difficulty, string>>>>;
  readonly tutorial: string;
  /** Theme id (see rewards.ts THEMES) to its levels, in order. */
  readonly themes: Readonly<Record<string, readonly string[]>>;
}

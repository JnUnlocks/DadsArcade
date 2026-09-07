/**
 * Shared vocabulary for the slime counter.
 */

import type { Recipe, Rgb } from "./color";

/**
 * How the slime behaves and looks once it's mixed.
 *
 * These are the five textures a slime-shop video actually talks about, and
 * each one is visibly different at a glance -- that matters more than the
 * physics being accurate, because the player has to tell them apart on a
 * phone screen while a customer is waiting.
 */
export type Texture = "cloud" | "butter" | "clear" | "crunchy" | "fluffy";

export const TEXTURES: readonly Texture[] = [
  "cloud",
  "butter",
  "clear",
  "crunchy",
  "fluffy",
];

export const TEXTURE_LABELS: Record<Texture, string> = {
  cloud: "CLOUD",
  butter: "BUTTER",
  clear: "CLEAR",
  crunchy: "CRUNCHY",
  fluffy: "FLUFFY",
};

/** Per-texture handling, read by both the renderer and the wobble physics. */
export interface TextureFeel {
  /** How far the blob deforms when pulled. */
  stretch: number;
  /** Spring stiffness -- high is snappy, low is slow and heavy. */
  stiffness: number;
  /** Wobble damping. Low values ring for longer. */
  damping: number;
  /** Base opacity of the body fill. */
  alpha: number;
  /** Strength of the glossy highlight. */
  gloss: number;
}

export const TEXTURE_FEEL: Record<Texture, TextureFeel> = {
  // Matte and airy: deforms easily, settles fast, barely shines.
  cloud: { stretch: 1.15, stiffness: 42, damping: 7.5, alpha: 0.97, gloss: 0.18 },
  // Thick and heavy: resists the pull and oozes back slowly.
  butter: { stretch: 0.72, stiffness: 26, damping: 9.5, alpha: 1.0, gloss: 0.55 },
  // Glassy: see-through with a hard highlight.
  clear: { stretch: 1.0, stiffness: 38, damping: 6.0, alpha: 0.62, gloss: 0.85 },
  // Loaded with beads, so it moves stiffly.
  crunchy: { stretch: 0.85, stiffness: 46, damping: 8.5, alpha: 0.95, gloss: 0.35 },
  // The bounciest -- overshoots and rings.
  fluffy: { stretch: 1.35, stiffness: 55, damping: 4.2, alpha: 0.92, gloss: 0.25 },
};

/** Things stirred into the slime. */
export type MixIn = "glitter" | "beads" | "boba" | "star" | "heart" | "taco";

export const MIX_INS: readonly MixIn[] = [
  "glitter",
  "beads",
  "boba",
  "star",
  "heart",
  "taco",
];

export const MIX_IN_LABELS: Record<MixIn, string> = {
  glitter: "GLITTER",
  beads: "BEADS",
  boba: "BOBA",
  star: "STAR",
  heart: "HEART",
  taco: "TACO",
};

/** What the slime in the bowl currently is. */
export interface Slime {
  recipe: Recipe;
  texture: Texture;
  mixIns: Set<MixIn>;
}

/** One customer's request. */
export interface Order {
  colour: Rgb;
  colourLabel: string;
  texture: Texture;
  mixIns: readonly MixIn[];
  /** Which of the cast is at the counter. */
  customer: number;
  /**
   * The pours this order was generated from.
   *
   * Kept so the order is known to be mixable rather than merely hoped to be,
   * and so tests can assert that mixing the stated recipe reproduces the
   * stated colour exactly.
   */
  recipe: Recipe;
}

/** The breakdown shown after serving, and the numbers the score comes from. */
export interface Verdict {
  colourScore: number;
  /** Raw match as a percentage, for display. See the note in serve(). */
  colourPercent: number;
  textureMatched: boolean;
  mixInsCorrect: number;
  mixInsMissed: number;
  mixInsExtra: number;
  speedBonus: number;
  perfect: boolean;
  streakAfter: number;
  points: number;
}

/**
 * Which board a run belongs on.
 *
 * `lab` never scores at all -- it exists so the toy stays a toy. Keeping the
 * modes in one enum (rather than a `scored: boolean`) is what lets the daily
 * challenge share every line of shop logic and differ only in its seed.
 */
export type Mode = "lab" | "shop" | "daily";

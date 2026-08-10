/** Four-way movement. Reef characters only ever face one of these. */
export type Dir = "up" | "down" | "left" | "right";

export const DIR_VECTORS: Record<Dir, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/**
 * Each jellyfish hunts differently. Copying the arcade original's four
 * personalities is what makes a maze chase feel alive instead of like four
 * copies of the same pursuer -- one tails you, one cuts you off, one flanks,
 * and one loses its nerve up close.
 */
export type JellyKind = "tailer" | "ambusher" | "flanker" | "shy";

export type JellyMode =
  | "den" // waiting inside, bobbing
  | "leaving" // heading for the gate
  | "scatter" // retreating to its corner
  | "chase" // hunting
  | "frightened" // Riley ate a pearl
  | "eaten"; // drifting back to the den as a pair of eyes

export interface Jelly {
  kind: JellyKind;
  col: number;
  row: number;
  /** Progress from the current tile toward the next, 0..1. */
  offset: number;
  dir: Dir;
  mode: JellyMode;
  /** Seconds left in the den before this one launches. */
  denTimer: number;
  /** Wobble phase for the tentacle animation. */
  phase: number;
}

export interface Player {
  col: number;
  row: number;
  offset: number;
  dir: Dir;
  /** Where the player wants to go next; applied at the first legal tile. */
  wanted: Dir;
  /** Mouth animation phase. */
  phase: number;
}

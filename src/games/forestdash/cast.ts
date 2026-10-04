/**
 * The animals you can race as.
 *
 * They differ in looks only. Every one of them runs, jumps and glides exactly
 * alike, which is what lets a saved run made as the bunny be raced fairly by
 * someone playing the fox.
 */

export interface Character {
  /** Stable id: saved with a run, so never change one once live. */
  id: string;
  name: string;
  body: string;
  dark: string;
  belly: string;
  ears: "point" | "long" | "round";
  tail: "brush" | "ring" | "puff" | "stub";
  /** A dark band across the eyes. */
  mask?: boolean;
  /** Pale spots along the back. */
  spots?: boolean;
}

export const CAST: readonly Character[] = [
  {
    id: "fox",
    name: "FOX",
    body: "#ff8a2a",
    dark: "#c75c12",
    belly: "#fff8ee",
    ears: "point",
    tail: "brush",
  },
  {
    id: "bunny",
    name: "BUNNY",
    body: "#efe9f7",
    dark: "#b3a6c9",
    belly: "#ffffff",
    ears: "long",
    tail: "puff",
  },
  {
    id: "raccoon",
    name: "RACCOON",
    body: "#a9b3c6",
    dark: "#4a5266",
    belly: "#eef2f8",
    ears: "round",
    tail: "ring",
    mask: true,
  },
  {
    id: "fawn",
    name: "FAWN",
    body: "#d9a05c",
    dark: "#9a6a34",
    belly: "#fff3dc",
    ears: "point",
    tail: "stub",
    spots: true,
  },
];

/** The character with this id, or the fox for an id we don't know. */
export function characterById(id: string | null | undefined): Character {
  return CAST.find((c) => c.id === id) ?? CAST[0]!;
}

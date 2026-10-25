/**
 * Circuits, badges, bolts and wheel styles -- and the ledger that awards them.
 *
 * Every reward is a line in a ledger: "first:family:f-012", "circuit:family:0",
 * "daily:2026-10-21:challenge", "bonus:f-012:5". Bolts, badges and styles are
 * all counted from those lines rather than stored as running totals. That one
 * choice is what makes rewards impossible to double-issue: a second tap, a
 * replay, a reload or another tab can only write a line that is already
 * there, and a set has no room for it twice.
 *
 * Nothing here changes how the game plays. Hints stay free, every word is
 * accepted the same way, and every level is finishable with or without any of
 * it. It's a shelf to put things on.
 */

import type { Circuit, Difficulty } from "./types.ts";

export const LEVELS_PER_CIRCUIT = 20;

export const CIRCUITS: readonly Circuit[] = [
  { id: "starter", name: "Starter Circuit", colors: ["#19dfff", "#7748ff"] },
  { id: "neon", name: "Neon Alley", colors: ["#ff3bd4", "#19dfff"] },
  { id: "pixel", name: "Pixel Power", colors: ["#ffd52a", "#7748ff"] },
  { id: "turbo", name: "Turbo Terminal", colors: ["#3d8bff", "#ff8a2a"] },
  { id: "vault", name: "Voltage Vault", colors: ["#ffd52a", "#19dfff"] },
  // Challenge levels 101-200, added in pack v2 for players who'd finished
  // the first hundred.
  { id: "laser", name: "Laser Lanes", colors: ["#ff4f7b", "#19dfff"] },
  { id: "grid", name: "Hyper Grid", colors: ["#7cff4f", "#7748ff"] },
  { id: "thunder", name: "Thunder Core", colors: ["#ffb020", "#3d8bff"] },
  { id: "overdrive", name: "Overdrive", colors: ["#ff3bd4", "#ffd52a"] },
  { id: "max", name: "Max Voltage", colors: ["#f8fbff", "#19dfff"] },
  // Challenge levels 201-500, added in pack v3: seven letters to 300, then
  // eight-letter wheels.
  { id: "nights", name: "Neon Nights", colors: ["#7748ff", "#ff3bd4"] },
  { id: "breaker", name: "Circuit Breaker", colors: ["#19dfff", "#ff8a2a"] },
  { id: "storm", name: "Pixel Storm", colors: ["#3d8bff", "#ffd52a"] },
  { id: "lagoon", name: "Laser Lagoon", colors: ["#2de1c2", "#7748ff"] },
  { id: "shock", name: "Static Shock", colors: ["#ffd52a", "#ff4f7b"] },
  { id: "megawatt", name: "Megawatt", colors: ["#ff8a2a", "#7748ff"] },
  { id: "arc", name: "Arc Light", colors: ["#f8fbff", "#ff3bd4"] },
  { id: "surge", name: "Power Surge", colors: ["#7cff4f", "#19dfff"] },
  { id: "sky", name: "Sky Circuit", colors: ["#5cc8ff", "#ffd52a"] },
  { id: "vortex", name: "Volt Vortex", colors: ["#ff3bd4", "#2de1c2"] },
  { id: "ion", name: "Ion Drive", colors: ["#19dfff", "#7cff4f"] },
  { id: "gigawatt", name: "Gigawatt", colors: ["#ffb020", "#ff3bd4"] },
  { id: "peak", name: "Lightning Peak", colors: ["#f8fbff", "#7748ff"] },
  { id: "star", name: "Star Circuit", colors: ["#ffd52a", "#3d8bff"] },
  { id: "ultra", name: "Ultra Voltage", colors: ["#ff4f7b", "#ffd52a"] },
];

/** How many circuits each path has: the pack test holds the pack to this. */
export const PATH_CIRCUITS: Readonly<Record<Difficulty, number>> = { family: 5, challenge: 25 };

/** 0-based level index to 0-based circuit index. */
export function circuitOf(levelIndex: number): number {
  return Math.min(CIRCUITS.length - 1, Math.floor(levelIndex / LEVELS_PER_CIRCUIT));
}

export const PATH_NAMES: Readonly<Record<Difficulty, string>> = {
  family: "Family",
  challenge: "Challenge",
};

// ----- Ledger lines -----

export const firstLine = (difficulty: Difficulty, puzzleId: string) => `first:${difficulty}:${puzzleId}`;
export const circuitLine = (difficulty: Difficulty, circuit: number) => `circuit:${difficulty}:${circuit}`;
export const dailyLine = (date: string, difficulty: Difficulty) => `daily:${date}:${difficulty}`;
export const bonusLine = (identity: string, milestone: number) => `bonus:${identity}:${milestone}`;

/** Bonus words per bolt. */
export const BONUS_BLOCK = 5;

/** One bolt for each first finish, each daily finished, each five bonus words. */
export function boltsIn(ledger: Iterable<string>): number {
  let bolts = 0;
  for (const line of ledger) {
    if (line.startsWith("first:") || line.startsWith("daily:") || line.startsWith("bonus:")) bolts += 1;
  }
  return bolts;
}

// ----- Badges -----

export interface Badge {
  readonly id: string;
  readonly name: string;
  /** How it's earned, in a few words. */
  readonly says: string;
  /** The exact rule, against the ledger. */
  readonly earned: (ledger: ReadonlySet<string>) => boolean;
  readonly color: string;
}

const CIRCUIT_BADGE_NAMES = [
  "Circuit Starter",
  "Neon Navigator",
  "Pixel Pro",
  "Turbo Charger",
  "Voltage Legend",
  "Laser Ace",
  "Grid Runner",
  "Thunder Maker",
  "Overdrive Hero",
  "Max Voltage Master",
  "Night Owl",
  "Breaker Boss",
  "Storm Chaser",
  "Lagoon Glow",
  "Shock Wave",
  "Megawatt Maker",
  "Arc Artist",
  "Surge Star",
  "Sky Racer",
  "Vortex Rider",
  "Ion Ace",
  "Gigawatt Giant",
  "Peak Climber",
  "Star Wirer",
  "Ultra Legend",
];

export const BADGES: readonly Badge[] = [
  {
    id: "first-spark",
    name: "First Spark",
    says: "Finish your first level",
    earned: (ledger) => [...ledger].some((line) => line.startsWith("first:")),
    color: "#19dfff",
  },
  ...(["family", "challenge"] as const).flatMap((difficulty) =>
    CIRCUITS.slice(0, PATH_CIRCUITS[difficulty]).map(
      (circuit, index): Badge => ({
        id: `${difficulty}-${circuit.id}`,
        name: CIRCUIT_BADGE_NAMES[index]!,
        says: `Finish ${circuit.name} on ${PATH_NAMES[difficulty]}`,
        earned: (ledger) => ledger.has(circuitLine(difficulty, index)),
        color: circuit.colors[0],
      }),
    ),
  ),
];

// ----- Wheel styles -----

export interface Cosmetic {
  readonly id: string;
  readonly name: string;
  readonly says: string;
  /** Tile face, tile rim, and the trail drawn between letters. */
  readonly tile: string;
  readonly rim: string;
  readonly trail: string;
  readonly unlocked: (ledger: ReadonlySet<string>) => boolean;
}

const STYLE_COLORS: ReadonlyArray<{ tile: string; rim: string; trail: string }> = [
  { tile: "#19dfff", rim: "#7748ff", trail: "#ffd52a" },
  { tile: "#ff3bd4", rim: "#19dfff", trail: "#19dfff" },
  { tile: "#ffd52a", rim: "#ff3bd4", trail: "#7748ff" },
  { tile: "#3d8bff", rim: "#ff8a2a", trail: "#ff8a2a" },
  { tile: "#f8fbff", rim: "#ffd52a", trail: "#19dfff" },
  { tile: "#ff4f7b", rim: "#19dfff", trail: "#f8fbff" },
  { tile: "#7cff4f", rim: "#7748ff", trail: "#ff3bd4" },
  { tile: "#ffb020", rim: "#3d8bff", trail: "#ffd52a" },
  { tile: "#ff3bd4", rim: "#ffd52a", trail: "#ffd52a" },
  { tile: "#f8fbff", rim: "#19dfff", trail: "#ff3bd4" },
  { tile: "#7748ff", rim: "#ff3bd4", trail: "#19dfff" },
  { tile: "#19dfff", rim: "#ff8a2a", trail: "#ffd52a" },
  { tile: "#3d8bff", rim: "#ffd52a", trail: "#f8fbff" },
  { tile: "#2de1c2", rim: "#7748ff", trail: "#ff3bd4" },
  { tile: "#ffd52a", rim: "#ff4f7b", trail: "#19dfff" },
  { tile: "#ff8a2a", rim: "#7748ff", trail: "#19dfff" },
  { tile: "#f8fbff", rim: "#ff3bd4", trail: "#ffd52a" },
  { tile: "#7cff4f", rim: "#19dfff", trail: "#ff3bd4" },
  { tile: "#5cc8ff", rim: "#ffd52a", trail: "#ff8a2a" },
  { tile: "#ff3bd4", rim: "#2de1c2", trail: "#f8fbff" },
  { tile: "#19dfff", rim: "#7cff4f", trail: "#ff3bd4" },
  { tile: "#ffb020", rim: "#ff3bd4", trail: "#19dfff" },
  { tile: "#f8fbff", rim: "#7748ff", trail: "#ffd52a" },
  { tile: "#ffd52a", rim: "#3d8bff", trail: "#ff3bd4" },
  { tile: "#ff4f7b", rim: "#ffd52a", trail: "#19dfff" },
];

export const COSMETICS: readonly Cosmetic[] = [
  {
    id: "classic",
    name: "Classic Volt",
    says: "Ready from the start",
    tile: "#ffd52a",
    rim: "#7748ff",
    trail: "#19dfff",
    unlocked: () => true,
  },
  ...CIRCUITS.map(
    (circuit, index): Cosmetic => ({
      id: circuit.id,
      name: `${circuit.name} wheel`,
      says:
        index < PATH_CIRCUITS.family
          ? `Finish ${circuit.name} on either path`
          : `Finish ${circuit.name} on Challenge`,
      ...STYLE_COLORS[index]!,
      unlocked: (ledger) =>
        ledger.has(circuitLine("family", index)) || ledger.has(circuitLine("challenge", index)),
    }),
  ),
];

export function cosmeticById(id: string): Cosmetic {
  return COSMETICS.find((c) => c.id === id) ?? COSMETICS[0]!;
}

/** What a list of newly written ledger lines means, for the result card. */
export function describeNew(lines: readonly string[], before: ReadonlySet<string>): string[] {
  const after = new Set([...before, ...lines]);
  const out: string[] = [];
  const bolts = boltsIn(lines);
  if (bolts > 0) out.push(`+${bolts} ${bolts === 1 ? "bolt" : "bolts"}`);
  for (const badge of BADGES) {
    if (!badge.earned(before) && badge.earned(after)) out.push(`Badge: ${badge.name}`);
  }
  for (const style of COSMETICS) {
    if (!style.unlocked(before) && style.unlocked(after)) out.push(`New wheel: ${style.name}`);
  }
  return out;
}

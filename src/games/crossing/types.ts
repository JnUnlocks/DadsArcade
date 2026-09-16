/**
 * The board Highway Hop is played on.
 *
 * Thirteen rows, bottom to top: a safe kerb, five lanes of traffic, a grass
 * median to catch your breath, five lanes of river, and the burrows you're
 * trying to reach. That shape is the genre's, and it's the shape for a reason
 * -- the road punishes you for being somewhere at the wrong moment, and the
 * river punishes you for being nowhere at all. Halfway through, the rule
 * silently inverts: the things that killed you now carry you, and empty space
 * goes from safe to fatal. A game with only the road half is a dodging drill.
 */

export const COLS = 9;
export const ROWS = 13;

/** Row indices, counted from the top so row 0 is the goal. */
export const HOME_ROW = 0;
export const RIVER_ROWS = [1, 2, 3, 4, 5] as const;
export const MEDIAN_ROW = 6;
export const ROAD_ROWS = [7, 8, 9, 10, 11] as const;
export const START_ROW = 12;

/** Five burrows, evenly spaced across the nine columns. */
export const HOME_COLS = [0, 2, 4, 6, 8] as const;

export type LaneKind = "road" | "river" | "safe" | "home";

/** What rides in a lane. Road things hurt; river things carry. */
export type Occupant = "car" | "truck" | "log" | "turtle";

/**
 * A lane of moving things.
 *
 * Occupants aren't stored as a list and aren't spawned or despawned. A lane is
 * a repeating pattern -- one occupant every `period` cells -- scrolled by time,
 * so any occupant's position is a pure function of the clock. That makes the
 * traffic infinite for free, removes a whole class of spawn-timing bug, and
 * means a given level plays identically on any framerate.
 */
export interface Lane {
  kind: LaneKind;
  occupant: Occupant;
  /** +1 moves right, -1 moves left. */
  dir: 1 | -1;
  /** Cells per second. */
  speed: number;
  /** How wide one occupant is, in cells. */
  width: number;
  /** Cells between the start of one occupant and the start of the next. */
  period: number;
  /** Where the pattern sits at t=0, in cells. */
  phase: number;
  /** Art variation -- car colour, turtle group, and so on. */
  variant: number;
}

/**
 * The gap between occupants, in cells.
 *
 * This is the number that decides whether a road lane is crossable and whether
 * a river lane is survivable, so it gets a name rather than being written out
 * at each call site.
 */
export function laneGap(lane: Lane): number {
  return lane.period - lane.width;
}

/** Where every occupant in a lane sits at time `t`, in cells. */
export function occupantPositions(lane: Lane, t: number): number[] {
  const drift = lane.phase + lane.dir * lane.speed * t;
  const count = Math.ceil(COLS / lane.period) + 2;
  const positions: number[] = [];

  for (let i = 0; i < count; i += 1) {
    // Wrap into [-period, COLS] so an occupant is already partly on screen as
    // it enters rather than appearing at the edge.
    const span = count * lane.period;
    let x = (((i * lane.period + drift) % span) + span) % span;
    x -= lane.period;
    positions.push(x);
  }
  return positions;
}

/**
 * Where the frog's body actually is, in cells.
 *
 * `col` is a cell index and a cell spans [col, col+1], so the frog standing in
 * it is centred at col + 0.5 -- which is exactly where render.ts draws it.
 *
 * Both hit tests originally used `col` itself as the centre, putting every
 * collision half a cell to the left of the visible frog. A car with clear
 * daylight around it killed you; a car covering half your body drove through
 * you; a log you were 78% aboard drowned you; a log you were 3% aboard carried
 * you. It made every death in the game look arbitrary, and it is the sort of
 * thing that is invisible in a unit test unless the sample point happens to
 * straddle the error.
 */
export function frogCentre(col: number): number {
  return col + 0.5;
}

/** True when a frog standing at `col` overlaps any occupant at time `t`. */
export function overlapsOccupant(
  lane: Lane,
  t: number,
  col: number,
  frogWidth = 0.7,
): boolean {
  const centre = frogCentre(col);
  const half = frogWidth / 2;
  for (const x of occupantPositions(lane, t)) {
    if (centre + half > x && centre - half < x + lane.width) return true;
  }
  return false;
}

/**
 * How far a rider at `col` is carried, or null when there's nothing under it.
 *
 * Returns the occupant's own left edge so the caller can keep the frog's
 * offset within the log rather than snapping it to the middle -- being carried
 * off the end of a log is part of the game.
 */
export function platformUnder(
  lane: Lane,
  t: number,
  col: number,
): number | null {
  const centre = frogCentre(col);
  for (const x of occupantPositions(lane, t)) {
    // Forgiving by the same amount at both ends: landing a hair off either
    // end of a log should read as "just made it", not as a drowning. The
    // original slack was applied only to the right-hand edge, so the frog
    // could float half a cell past a log's end while drowning a quarter of a
    // cell short of its start.
    if (centre > x - PLATFORM_GRACE && centre < x + lane.width + PLATFORM_GRACE) {
      return x;
    }
  }
  return null;
}

/** How far past a platform's end still counts as standing on it, in cells. */
const PLATFORM_GRACE = 0.25;

export type Dir = "up" | "down" | "left" | "right";

export const DIR_VECTORS: Record<Dir, { col: number; row: number }> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

export function rowKind(row: number): LaneKind | "start" {
  if (row === HOME_ROW) return "home";
  if (row === MEDIAN_ROW) return "safe";
  if (row === START_ROW) return "start";
  return (RIVER_ROWS as readonly number[]).includes(row) ? "river" : "road";
}

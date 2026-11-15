/**
 * The numbers Circuit Climb is tuned with, in one place.
 *
 * Units: the arena is 360 across, and up is up -- y is height above where
 * JES's feet start, so the camera and the score both read it directly.
 */

export const ARENA_W = 360;

// ----- JES -----

export const GRAVITY = 1500;
/** Speed off an ordinary pad. Rises 128 units before it falls. */
export const BOUNCE = 620;
/** Speed off a boost pad. Rises 213 units. */
export const BOOST_BOUNCE = 800;
export const MAX_RUN = 235;
/** Units a second per second, with a side held. */
export const ACCEL = 1600;
/** And with neither held: let go and JES settles rather than sliding on. */
export const NEUTRAL_DECEL = 1100;
/** Fastest fall, so a long drop stays readable. Landings are swept, so speed can't skip a pad. */
export const MAX_FALL = 1300;
/** Half the width of the spring foot: what has to be over a pad to land on it. */
export const FOOT_HALF = 12;
/** Half the width of JES's body, for the walls. */
export const BODY_HALF = 17;
/** From the feet to the top of the antenna. */
export const BODY_HEIGHT = 46;

export const STEP = 1 / 120;

// ----- The camera -----

/** JES is followed up once above this share of the screen, from the bottom. */
export const FOLLOW_AT = 0.58;
/** How far below the bottom edge JES can be before the run is over. */
export const FALL_GRACE = 24;

// ----- Scoring -----

export const RELAY_BONUS = 50;
/** Every 10 units of height is a point. */
export const HEIGHT_PER_POINT = 10;

// ----- Districts -----

export interface Zone {
  readonly name: string;
  readonly from: number;
}

/** Where each district starts, in points of height (so 600 points is 6,000 units). */
export const ZONES: readonly Zone[] = [
  { name: "ROOFTOPS", from: 0 },
  { name: "ANTENNA DISTRICT", from: 600 },
  { name: "ORBITAL STATION", from: 1500 },
];

export function zoneAt(height: number): number {
  const points = height / HEIGHT_PER_POINT;
  let index = 0;
  ZONES.forEach((zone, i) => {
    if (points >= zone.from) index = i;
  });
  return index;
}

// ----- The two ways to play -----

export type Mode = "classic" | "junior";

export interface ModeTuning {
  /** Gap between one pad on the guaranteed route and the next, at the start and at the hardest. */
  readonly gapStart: readonly [number, number];
  readonly gapHardest: readonly [number, number];
  /** Width of a pad on the route, at the start and at the hardest. */
  readonly widthStart: number;
  readonly widthHardest: number;
  /**
   * Share of the furthest JES could move sideways that a route step may ask
   * for, measured from the worst start: the far edge of the pad below, still
   * moving flat out the wrong way.
   */
  readonly reachShare: number;
  /** Height over which the climb gets as hard as it gets. */
  readonly rampHeight: number;
}

export const MODES: Readonly<Record<Mode, ModeTuning>> = {
  classic: {
    gapStart: [55, 75],
    gapHardest: [76, 95],
    widthStart: 120,
    widthHardest: 76,
    reachShare: 0.85,
    rampHeight: 30000,
  },
  junior: {
    gapStart: [45, 58],
    gapHardest: [56, 72],
    widthStart: 150,
    widthHardest: 112,
    reachShare: 0.7,
    rampHeight: 40000,
  },
};

/**
 * The furthest JES can move sideways between leaving one pad and coming down
 * through a pad `rise` units higher, starting from standing still sideways.
 * Used to keep every step of the route reachable.
 */
export function sideReach(rise: number, bounce = BOUNCE): number {
  const disc = bounce * bounce - 2 * GRAVITY * rise;
  if (disc < 0) return 0;
  const t = (bounce + Math.sqrt(disc)) / GRAVITY;
  const toTop = MAX_RUN / ACCEL;
  if (t <= toTop) return 0.5 * ACCEL * t * t;
  return 0.5 * ACCEL * toTop * toTop + MAX_RUN * (t - toTop);
}

/**
 * The same, from the worst start: moving flat out the other way, so he has
 * to stop and turn before any of the distance counts.
 */
export function sideReachTurning(rise: number, bounce = BOUNCE): number {
  const disc = bounce * bounce - 2 * GRAVITY * rise;
  if (disc < 0) return 0;
  const t = (bounce + Math.sqrt(disc)) / GRAVITY;
  const stop = MAX_RUN / ACCEL;
  const backwards = 0.5 * MAX_RUN * stop;
  if (t <= stop) return 0;
  return Math.max(0, sideReachFromRest(t - stop) - backwards);
}

function sideReachFromRest(t: number): number {
  const toTop = MAX_RUN / ACCEL;
  if (t <= toTop) return 0.5 * ACCEL * t * t;
  return 0.5 * ACCEL * toTop * toTop + MAX_RUN * (t - toTop);
}

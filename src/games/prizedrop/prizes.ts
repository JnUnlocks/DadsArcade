/**
 * The prize ladder, and the numbers the cabinet is tuned with.
 *
 * Two of a prize make the next one up. Every prize is a round capsule with a
 * toy drawn inside it: the picture can be a duck or a robot, but the thing
 * that bounces is always a circle, which is what keeps the physics honest.
 */

export interface Prize {
  /** 1-10. Its place on the ladder, and what two of the one below make. */
  readonly tier: number;
  readonly id: string;
  readonly name: string;
  /** In tank units: the tank is 360 across. */
  readonly radius: number;
  readonly color: string;
  /** Points for MAKING this prize by a merge. Dropping one scores nothing. */
  readonly points: number;
}

export const PRIZES: readonly Prize[] = [
  { tier: 1, id: "marble", name: "Pocket Marble", radius: 12, color: "#45DDF4", points: 0 },
  { tier: 2, id: "bouncy-ball", name: "Bouncy Ball", radius: 16, color: "#F77CB8", points: 10 },
  { tier: 3, id: "star-ball", name: "Star Ball", radius: 21, color: "#B4E86C", points: 25 },
  { tier: 4, id: "duck", name: "Lucky Duck", radius: 27, color: "#FFD166", points: 50 },
  { tier: 5, id: "race-car", name: "Pocket Racer", radius: 34, color: "#FF706F", points: 100 },
  { tier: 6, id: "robot", name: "Beep Bot", radius: 43, color: "#5B9CFF", points: 200 },
  { tier: 7, id: "frog", name: "Hop Buddy", radius: 54, color: "#44DA92", points: 400 },
  { tier: 8, id: "slime", name: "Slime Star", radius: 67, color: "#BE86F7", points: 800 },
  { tier: 9, id: "arcade-bot", name: "Arcade Captain", radius: 82, color: "#FFA94D", points: 1600 },
  { tier: 10, id: "grand-prize", name: "Grand Prize Bot", radius: 99, color: "#45DDF4", points: 3200 },
];

/** The top of the ladder. Two of these sit side by side and do not merge. */
export const TOP_TIER = PRIZES.length;

export function prize(tier: number): Prize {
  const found = PRIZES[tier - 1];
  if (!found) throw new Error(`No prize at tier ${tier}`);
  return found;
}

// ----- The tank -----

export const TANK_W = 360;
export const TANK_H = 480;
/** A prize resting with its top above this line is what ends a run. */
export const DANGER_Y = 48;
/** Where a prize's centre is when it is let go. */
export const RELEASE_Y = 24;

// ----- The drop -----

/** Only the four smallest are ever handed out; the rest have to be made. */
export const SPAWN_WEIGHTS: readonly number[] = [0.4, 0.3, 0.2, 0.1];
/** Endless opens with two of these, so the first merge is there to be found. */
export const OPENING_TIER = 2;
export const OPENING_DROPS = 2;
/** Seconds between one drop and the next. */
export const DROP_COOLDOWN = 0.4;

// ----- Too full -----

/** A prize this new can't count against you: it is still falling in. */
export const NEWBORN_GRACE = 0.8;
/** Seconds a prize can stay over the line before the cabinet is full. */
export const OVERFLOW_LIMIT = 2;

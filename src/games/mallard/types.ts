export interface Duck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds until the next random course change -- gives flight a wander. */
  turnTimer: number;
  /** Wing-flap animation phase, radians. */
  flapPhase: number;
  alive: boolean;
  /** True for the brief tumble-and-fall animation after being hit. */
  falling: boolean;
  fallTimer: number;
  /** Seconds this duck has been flying. */
  age: number;
  /**
   * Set once the duck gives up on wandering and breaks for the sky. Until
   * then it bounces off the top of the screen rather than escaping, which is
   * what gives the player time to actually line up a shot.
   */
  escaping: boolean;
}

/**
 * The dog's full routine, following the NES original's beats rather than
 * leaving him parked in the grass: he walks the field, sniffs, leaps into the
 * brush to put the birds up, watches from cover while you shoot, then pops up
 * to either gloat or mock you.
 */
export type DogPose =
  | "walking"
  | "sniff"
  | "leap"
  | "watching" // in cover during the hunt -- only his head shows
  | "laugh"
  | "retrieve";

export type RoundPhase =
  | "intro" // the dog's walk-sniff-leap routine; ducks not up yet
  | "hunting" // ducks are up, shells are live
  | "success" // every duck downed -- retrieve animation playing
  | "fail"; // a duck got away -- laugh animation playing

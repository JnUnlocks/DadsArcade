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
  /** Seconds this duck has been flying -- forces an eventual escape. */
  age: number;
}

/**
 * The dog's four beats. Idle and the two round-outcome poses are the classic
 * NES Duck Hunt cast; flush -- bounding into the brush to kick the birds up --
 * is the original's opening beat too, not an invention.
 */
export type DogPose = "idle" | "flush" | "laugh" | "retrieve";

export type RoundPhase =
  | "banner" // "ROUND N" card, dog about to flush
  | "hunting" // ducks are up, shells are live
  | "success" // every duck downed -- retrieve animation playing
  | "fail"; // a duck got away -- laugh animation playing

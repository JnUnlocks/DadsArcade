import type { Path } from "./formation";

export type EnemyKind = "grunt" | "escort" | "cruiser";

export type EnemyState =
  | "waiting" // queued off-screen, waiting for its entry cue
  | "entering" // flying the entry path toward its formation slot
  | "formation" // parked in the grid, swaying with the group
  | "diving" // peeled off, swooping at the player
  | "returning" // looping back around to rejoin the formation
  | "beaming"; // cruiser hovering with its tractor beam deployed

export interface Enemy {
  kind: EnemyKind;
  row: number;
  col: number;
  x: number;
  y: number;
  angle: number;
  state: EnemyState;
  path: Path | null;
  /** Distance travelled along the current path, for constant-speed flight. */
  pathDistance: number;
  speed: number;
  hp: number;
  /** Seconds of white hit-flash remaining. */
  flash: number;
  fireCooldown: number;
  spawnDelay: number;
  /** Seconds the tractor beam has been deployed. */
  beamTimer: number;
  /** True if this cruiser is holding the player's captured fighter. */
  holdingCapture: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
}

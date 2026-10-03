import type { Path } from "./formation";

export type EnemyKind = "grunt" | "escort" | "cruiser" | "dreadnought";

export type EnemyState =
  | "waiting" // queued off-screen, waiting for its entry cue
  | "entering" // flying the entry path toward its formation slot
  | "formation" // parked in the grid, swaying with the group
  | "diving" // peeled off, swooping at the player
  | "returning" // looping back around to rejoin the formation
  | "beaming" // cruiser hovering with its tractor beam deployed
  | "bossEntry" // the dreadnought flying in at the start of a boss wave
  | "bossHover" // the dreadnought holding station, sweeping and firing
  | "flyby"; // bonus-stage pass: flies a set path and leaves, never attacks

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
  /** Starting hp, so the boss can draw a health bar as a fraction. */
  maxHp: number;
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

/**
 * JB's Tower Trouble -- the tower, and everything that moves on it.
 *
 * Owes its rules to the ramp-climbing genre: hazards roll down sloped girders,
 * drop off the open ends onto the girder below, sometimes take a ladder down
 * instead, and the player climbs, jumps and dodges to reach the top. Everything
 * else is this arcade's own: JB instead of a plumber, a scrap robot instead of
 * an ape, junk instead of barrels, a wrench instead of a hammer, and a good boy
 * waiting at the top instead of a damsel.
 *
 * This file is pure: geometry, junk physics and player physics, with no DOM
 * and no canvas, so the rules that can be quietly wrong are testable. The
 * world is a fixed 360 x 640 space; the game scales it to fit the phone, so
 * the physics behave identically on every screen.
 */

import type { Rng } from "../../core/rng.ts";

export const WORLD_W = 360;
export const WORLD_H = 640;

// ----- Girders -----

/**
 * One sloped girder. Its surface runs from (x1, y1) to (x2, y2).
 *
 * `open` is the end junk rolls toward and falls off. The girder slopes down
 * toward that end, which is what makes junk roll that way at all. The bottom
 * girder's open end leads into the scrap bin; the roof has no open end.
 */
export interface Girder {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  open: "left" | "right" | "bin" | "none";
}

/**
 * Bottom (index 0) to roof (index 6).
 *
 * The open ends alternate, so junk zig-zags down the tower. Each girder stops
 * short of the wall on its open side, leaving a gap junk falls through; the
 * next girder down reaches all the way under that gap, so falling junk always
 * has somewhere to land. level.test.ts holds both of those true.
 */
export const GIRDERS: readonly Girder[] = [
  { x1: 12, x2: 348, y1: 582, y2: 570, open: "bin" }, // 0: floor, drains left into the bin
  { x1: 12, x2: 316, y1: 486, y2: 500, open: "right" }, // 1
  { x1: 44, x2: 348, y1: 416, y2: 402, open: "left" }, // 2
  { x1: 12, x2: 316, y1: 318, y2: 332, open: "right" }, // 3
  { x1: 44, x2: 348, y1: 248, y2: 234, open: "left" }, // 4
  { x1: 12, x2: 316, y1: 150, y2: 164, open: "right" }, // 5: the robot's girder
  { x1: 250, x2: 348, y1: 92, y2: 92, open: "none" }, // 6: the roof, where the dog waits
];

export const ROOF = GIRDERS.length - 1;
export const TOP_GIRDER = ROOF - 1;

/** Surface height of a girder at `x`, clamped to its ends. */
export function girderY(level: number, x: number): number {
  const g = GIRDERS[level]!;
  const t = Math.max(0, Math.min(1, (x - g.x1) / (g.x2 - g.x1)));
  return g.y1 + (g.y2 - g.y1) * t;
}

/** Which way junk rolls on a girder: toward its open end. */
export function downhill(level: number): 1 | -1 {
  const open = GIRDERS[level]!.open;
  return open === "right" ? 1 : -1;
}

// ----- Ladders -----

/** A ladder from girder `bottom` up to girder `bottom + 1`, at `x`. */
export interface Ladder {
  x: number;
  bottom: number;
}

export const LADDERS: readonly Ladder[] = [
  { x: 262, bottom: 0 },
  { x: 80, bottom: 0 },
  { x: 150, bottom: 1 },
  { x: 290, bottom: 1 },
  { x: 70, bottom: 2 },
  { x: 220, bottom: 2 },
  { x: 180, bottom: 3 },
  { x: 290, bottom: 3 },
  { x: 118, bottom: 4 },
  { x: 240, bottom: 4 },
  // The last climb: up from the robot's girder to the roof and the dog.
  { x: 300, bottom: 5 },
];

export function ladderTop(ladder: Ladder): number {
  return ladder.bottom + 1;
}

export function ladderBottomY(ladder: Ladder): number {
  return girderY(ladder.bottom, ladder.x);
}

export function ladderTopY(ladder: Ladder): number {
  return girderY(ladder.bottom + 1, ladder.x);
}

// ----- The robot and the dog -----

/** The scrap robot stands on the top girder's closed end. Touching it hurts. */
export const ROBOT = { level: TOP_GIRDER, x1: 12, x2: 88, throwX: 84 } as const;

/** Where JB starts each stage, and where the dog sits. */
export const START = { level: 0, x: 312 } as const;
export const DOG = { level: ROOF, x: 322 } as const;

/** Wrenches placed on each stage. More stages, more help. */
export function wrenchSpots(stage: number): Array<{ level: number; x: number }> {
  const spots = [{ level: 2, x: 120 }];
  if (stage >= 2) spots.push({ level: 4, x: 262 });
  return spots;
}

// ----- Difficulty -----

/**
 * How a stage plays, by number.
 *
 * Every value saturates rather than growing forever. Past a certain throw rate
 * the tower stops being a dodging puzzle and becomes a wall of junk with no
 * gaps, which is luck rather than skill.
 */
export function difficulty(stage: number) {
  const n = Math.max(1, stage) - 1;
  return {
    /** Seconds between throws. */
    throwInterval: Math.max(1.15, 3.2 * Math.pow(0.88, n)),
    /** Junk rolling speed, world units per second. */
    junkSpeed: Math.min(96, 52 + n * 5),
    /** Chance junk takes a ladder down when it passes the top of one. */
    ladderChance: Math.min(0.42, 0.14 + n * 0.035),
    /** Starting bonus; drains while you climb but never ends the run. */
    bonus: Math.min(5000, 3000 + n * 250),
  };
}

// ----- Junk -----

export type JunkKind = "tire" | "spool" | "paint" | "toolbox";

export const JUNK_RADIUS = 8;

/** How each kind of junk differs from the stage's baseline. */
export const JUNK_TRAITS: Record<JunkKind, { speed: number; ladder: number }> = {
  tire: { speed: 1.25, ladder: 0.7 }, // fast, and mostly stays on the girder
  spool: { speed: 0.8, ladder: 1.0 }, // slow and heavy
  paint: { speed: 1.0, ladder: 1.7 }, // loves a ladder
  toolbox: { speed: 0.95, ladder: 1.0 },
};

export interface Junk {
  id: number;
  kind: JunkKind;
  x: number;
  y: number;
  level: number;
  mode: "roll" | "fall" | "ladder";
  dir: 1 | -1;
  vy: number;
  /** Rotation, for drawing. */
  spin: number;
  /** Ladders already decided on, so each ladder is only a coin-flip once. */
  decided: Set<number>;
  ladder: number;
  /** Set once JB has scored for jumping this piece. */
  jumped: boolean;
  gone: boolean;
}

const FALL_GRAVITY = 620;
const LADDER_DESCENT_SPEED = 72;

export function spawnJunk(id: number, kind: JunkKind): Junk {
  return {
    id,
    kind,
    x: ROBOT.throwX,
    y: girderY(TOP_GIRDER, ROBOT.throwX),
    level: TOP_GIRDER,
    mode: "roll",
    dir: downhill(TOP_GIRDER),
    vy: 0,
    spin: 0,
    decided: new Set(),
    ladder: -1,
    jumped: false,
    gone: false,
  };
}

/**
 * Advance one piece of junk.
 *
 * Ladder decisions are made when junk *crosses* a ladder's position during a
 * step, not when it happens to be within a pixel of it. At speed on a slow
 * frame, "within a pixel" is skipped entirely and the junk never takes a
 * ladder, which quietly changes the difficulty by device.
 */
export function stepJunk(j: Junk, dt: number, stage: number, rng: Rng): void {
  if (j.gone) return;
  const d = difficulty(stage);
  const traits = JUNK_TRAITS[j.kind];
  const speed = d.junkSpeed * traits.speed;

  if (j.mode === "roll") {
    const before = j.x;
    j.x += j.dir * speed * dt;
    j.spin += (j.dir * speed * dt) / JUNK_RADIUS;

    for (let i = 0; i < LADDERS.length; i += 1) {
      const ladder = LADDERS[i]!;
      if (ladderTop(ladder) !== j.level || j.decided.has(i)) continue;
      const crossed = (before - ladder.x) * (j.x - ladder.x) <= 0;
      if (!crossed) continue;
      j.decided.add(i);
      if (rng.next() < d.ladderChance * traits.ladder) {
        j.mode = "ladder";
        j.ladder = i;
        j.x = ladder.x;
        return;
      }
    }

    const g = GIRDERS[j.level]!;
    if ((j.dir > 0 && j.x > g.x2) || (j.dir < 0 && j.x < g.x1)) {
      if (j.level === 0) {
        j.gone = true; // into the scrap bin
        return;
      }
      j.mode = "fall";
      j.vy = 0;
      return;
    }
    j.y = girderY(j.level, j.x);
    return;
  }

  if (j.mode === "fall") {
    j.vy += FALL_GRAVITY * dt;
    j.y += j.vy * dt;
    j.x += j.dir * speed * 0.3 * dt;
    j.spin += j.dir * dt * 6;
    const below = j.level - 1;
    const g = GIRDERS[below]!;
    if (j.x >= g.x1 && j.x <= g.x2 && j.y >= girderY(below, j.x)) {
      j.level = below;
      j.y = girderY(below, j.x);
      j.mode = "roll";
      j.dir = downhill(below);
      j.decided.clear();
    } else if (j.y > WORLD_H + 40) {
      j.gone = true;
    }
    return;
  }

  // Down a ladder.
  const ladder = LADDERS[j.ladder]!;
  j.y += LADDER_DESCENT_SPEED * dt;
  if (j.y >= ladderBottomY(ladder)) {
    j.level = ladder.bottom;
    j.y = ladderBottomY(ladder);
    j.mode = "roll";
    j.dir = downhill(ladder.bottom);
    j.decided.clear();
  }
}

/** Junk's centre, which is what collisions are measured from. */
export function junkCentre(j: Junk): { x: number; y: number } {
  return { x: j.x, y: j.y - JUNK_RADIUS };
}

// ----- JB -----

export const PLAYER_W = 10;
export const PLAYER_H = 22;
export const WALK_SPEED = 62;
export const CLIMB_SPEED = 48;
export const JUMP_VELOCITY = -152;
export const GRAVITY = 520;

/** How close to a ladder's centre JB must be to grab it. */
export const LADDER_GRAB = 7;

export interface Player {
  x: number;
  y: number;
  level: number;
  mode: "walk" | "climb" | "jump";
  ladder: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  /** Seconds of wrench left. While holding it JB can smash junk but can't climb. */
  wrench: number;
}

export function newPlayer(): Player {
  return {
    x: START.x,
    y: girderY(START.level, START.x),
    level: START.level,
    mode: "walk",
    ladder: -1,
    vx: 0,
    vy: 0,
    facing: -1,
    wrench: 0,
  };
}

/** What the player is asking for this step: axes in -1..1, and a jump. */
export interface Intent {
  x: number;
  y: number;
  jump: boolean;
}

export type PlayerEvent = "jump" | "land" | "climbStart" | "roof" | "blockedByWrench";

function clampToGirder(level: number, x: number): number {
  const g = GIRDERS[level]!;
  return Math.max(g.x1 + PLAYER_W / 2, Math.min(g.x2 - PLAYER_W / 2, x));
}

/** A ladder JB could start climbing from where he stands, going up or down. */
export function ladderAt(p: Player, direction: "up" | "down"): number {
  for (let i = 0; i < LADDERS.length; i += 1) {
    const ladder = LADDERS[i]!;
    const here = direction === "up" ? ladder.bottom : ladderTop(ladder);
    if (here === p.level && Math.abs(p.x - ladder.x) <= LADDER_GRAB) return i;
  }
  return -1;
}

/**
 * Advance JB one step. Returns what happened, so the game can play sounds and
 * show hints without re-deriving it.
 *
 * JB can't walk off a girder's end. Falling off is a failure state the genre
 * uses, but a seven-year-old misjudging an edge on a phone and losing a heart
 * to it teaches nothing; the walls are the kind version of that rule.
 */
export function stepPlayer(p: Player, dt: number, intent: Intent): PlayerEvent[] {
  const events: PlayerEvent[] = [];

  if (p.mode === "walk") {
    if (intent.jump) {
      p.mode = "jump";
      p.vy = JUMP_VELOCITY;
      p.vx = Math.sign(intent.x) * WALK_SPEED;
      if (intent.x !== 0) p.facing = intent.x > 0 ? 1 : -1;
      events.push("jump");
      return events;
    }

    if (intent.y < -0.5 || intent.y > 0.5) {
      const direction = intent.y < 0 ? "up" : "down";
      const i = ladderAt(p, direction);
      if (i !== -1) {
        if (p.wrench > 0) {
          events.push("blockedByWrench");
        } else {
          const ladder = LADDERS[i]!;
          p.mode = "climb";
          p.ladder = i;
          p.x = ladder.x;
          events.push("climbStart");
          return events;
        }
      }
    }

    if (intent.x !== 0) {
      p.facing = intent.x > 0 ? 1 : -1;
      p.x = clampToGirder(p.level, p.x + Math.sign(intent.x) * WALK_SPEED * dt);
    }
    p.y = girderY(p.level, p.x);
    return events;
  }

  if (p.mode === "climb") {
    const ladder = LADDERS[p.ladder]!;
    const topY = ladderTopY(ladder);
    const bottomY = ladderBottomY(ladder);
    p.y = Math.max(topY, Math.min(bottomY, p.y + Math.sign(intent.y) * CLIMB_SPEED * dt));

    if (intent.y < 0 && p.y <= topY) {
      p.level = ladderTop(ladder);
      p.mode = "walk";
      p.y = topY;
      events.push("land");
      if (p.level === ROOF) events.push("roof");
    } else if (intent.y > 0 && p.y >= bottomY) {
      p.level = ladder.bottom;
      p.mode = "walk";
      p.y = bottomY;
      events.push("land");
    }
    return events;
  }

  // Jumping: committed. Direction is set at take-off, like the genre.
  p.vy += GRAVITY * dt;
  p.x = clampToGirder(p.level, p.x + p.vx * dt);
  p.y += p.vy * dt;
  const floor = girderY(p.level, p.x);
  if (p.vy > 0 && p.y >= floor) {
    p.y = floor;
    p.mode = "walk";
    p.vx = 0;
    p.vy = 0;
    events.push("land");
  }
  return events;
}

/**
 * Does this junk hit JB?
 *
 * The hitbox is smaller than the sprite on purpose. Being hit by the edge of a
 * tyre that visibly missed feels like a cheat; being missed by one that grazed
 * the brim of the cap feels like luck, and nobody complains about luck.
 */
export function junkHitsPlayer(j: Junk, p: Player): boolean {
  if (j.gone) return false;
  const c = junkCentre(j);
  const r = JUNK_RADIUS * 0.7;
  const left = p.x - PLAYER_W / 2 + 1;
  const right = p.x + PLAYER_W / 2 - 1;
  const top = p.y - PLAYER_H + 3;
  const bottom = p.y - 1;
  const nx = Math.max(left, Math.min(right, c.x));
  const ny = Math.max(top, Math.min(bottom, c.y));
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r;
}

/** JB is in the air, right above this junk, on the same girder: worth points. */
export function jumpedOver(j: Junk, p: Player): boolean {
  return (
    !j.gone &&
    !j.jumped &&
    p.mode === "jump" &&
    j.mode === "roll" &&
    j.level === p.level &&
    Math.abs(j.x - p.x) < PLAYER_W &&
    p.y < j.y - JUNK_RADIUS * 2
  );
}

/** Within swinging range of the wrench, on the same girder. */
export function wrenchReaches(j: Junk, p: Player): boolean {
  return (
    !j.gone &&
    p.wrench > 0 &&
    j.level === p.level &&
    j.mode !== "ladder" &&
    Math.abs(j.x - p.x) < 20 &&
    Math.abs(junkCentre(j).y - (p.y - PLAYER_H / 2)) < 18
  );
}

export function touchesRobot(p: Player): boolean {
  return p.level === ROBOT.level && p.x - PLAYER_W / 2 < ROBOT.x2 && p.mode !== "climb";
}

export function reachesDog(p: Player): boolean {
  return p.level === ROOF;
}

// ----- Scoring -----

export const POINTS = {
  jumpOver: 100,
  smash: 300,
  rescue: 1000,
} as const;

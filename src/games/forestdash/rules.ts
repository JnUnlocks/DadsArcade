/**
 * How a racer moves: running, jumping, gliding, bouncing, tripping, falling.
 *
 * Pure and DOM-free, so the same code moves the player, drives the computer
 * racer, and runs headless in the tests. Everything advances in the loop's
 * fixed 1/60s steps, which is what makes a recorded run replay exactly.
 *
 * The one control is a single button, pressed and held:
 *   - press on the ground (or a moment after leaving it) to jump;
 *   - keep holding once you start to fall and you glide.
 * Holding from the jump onwards just works, which is the point: a child who
 * presses and hangs on gets the longest leap there is.
 */

import { capAt, groundAt, type Track } from "./track.ts";

/** Top running speed, units per second. */
export const RUN_SPEED = 230;
/** How quickly you get back up to speed after a trip or a respawn. */
const ACCEL = 620;
const GRAVITY = 1500;
/** Gravity while gliding: floatier, so the glide reads as a glide. */
const GLIDE_GRAVITY = 520;
/** Fastest you can sink while gliding. */
const GLIDE_FALL = 75;
export const JUMP_SPEED = 560;
/** A mushroom cap throws you this fast, about twice a jump's height. */
export const BOUNCE_SPEED = 820;
/** Updrafts push up this hard on a glider, up to UPDRAFT_RISE. */
const UPDRAFT_ACCEL = 1300;
const UPDRAFT_RISE = 240;
/** Puddles hold you to this fraction of top speed. */
const PUDDLE_SPEED = 0.55;
/** A trip leaves you at this fraction of top speed. */
const TRIP_SPEED = 0.3;
/** After a trip you can't trip again for this long, or a log could eat a whole second. */
const TRIP_GRACE = 0.7;

/**
 * Forgiveness windows. A press slightly before landing still jumps when you
 * land, and a press slightly after running off an edge still jumps. Without
 * these, a jump that looked right on screen is refused by a frame or two, and
 * on a phone that feels like the game ignoring you.
 */
const JUMP_BUFFER = 0.12;
const COYOTE = 0.1;

/** Ledges up to this tall you just run up; anything taller is a wall. */
const STEP_UP = 6;

/** Fall this far below the floor and the forest puts you back. */
export const FALL_LIMIT = -260;
/** How long you're out of the race after a fall, before reappearing. */
export const RESPAWN_SECONDS = 0.8;
/** You reappear this far back from where you last stood, so you get a run-up. */
const RESPAWN_BACK = 130;

/** Half a racer's width, for hazards and acorns. */
export const RACER_HALF_W = 12;

export interface Controls {
  /** True on the step the button went down. */
  pressed: boolean;
  /** True while the button is down. */
  held: boolean;
}

export type Pose = "run" | "jump" | "glide" | "trip" | "gone";

export interface Racer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  gliding: boolean;
  /** Seconds since last standing on something, for coyote time. */
  airTime: number;
  /** Seconds left on a buffered jump press. */
  jumpBuffer: number;
  /** Seconds left of trip immunity. */
  tripTimer: number;
  /** Seconds left before reappearing after a fall; 0 while racing. */
  respawnTimer: number;
  /** Last place stood on solid ground, for respawning. */
  safeX: number;
  /** Seconds spent running, for the leg cycle. */
  stride: number;
}

export type RacerEvent = "jump" | "land" | "bounce" | "trip" | "fall" | "respawn";

export function createRacer(x: number): Racer {
  return {
    x,
    y: 0,
    vx: 0,
    vy: 0,
    grounded: true,
    gliding: false,
    airTime: 0,
    jumpBuffer: 0,
    tripTimer: 0,
    respawnTimer: 0,
    safeX: x,
    stride: 0,
  };
}

export function poseOf(r: Racer): Pose {
  if (r.respawnTimer > 0) return "gone";
  if (r.tripTimer > TRIP_GRACE - 0.25) return "trip";
  if (r.grounded) return "run";
  return r.gliding ? "glide" : "jump";
}

/** Advance one racer by one step. Returns what happened, for sounds and effects. */
export function stepRacer(
  r: Racer,
  track: Track,
  controls: Controls,
  dt: number,
): RacerEvent[] {
  const events: RacerEvent[] = [];

  if (r.respawnTimer > 0) {
    r.respawnTimer -= dt;
    if (r.respawnTimer <= 0) {
      respawn(r, track);
      events.push("respawn");
    }
    return events;
  }

  if (r.tripTimer > 0) r.tripTimer -= dt;
  r.jumpBuffer = controls.pressed ? JUMP_BUFFER : Math.max(0, r.jumpBuffer - dt);

  // Jump: from the ground, or within coyote time of leaving it.
  if (r.jumpBuffer > 0 && (r.grounded || r.airTime < COYOTE) && r.vy <= 0) {
    r.vy = JUMP_SPEED;
    r.grounded = false;
    r.airTime = COYOTE;
    r.jumpBuffer = 0;
    events.push("jump");
  }

  // Run speed: always trying to get back to the top, held back by puddles.
  const inPuddle =
    r.grounded && track.puddles.some((p) => r.x >= p.x0 && r.x < p.x1 && r.y <= p.top + 1);
  const target = RUN_SPEED * (inPuddle ? PUDDLE_SPEED : 1);
  if (r.vx < target) r.vx = Math.min(target, r.vx + ACCEL * dt);
  else r.vx = Math.max(target, r.vx - ACCEL * 2 * dt);

  // Vertical: gravity, or the glide's gentler version.
  // A glide starts at the top of a jump and lasts as long as you hold on --
  // including while an updraft carries you back up.
  r.gliding = !r.grounded && controls.held && (r.vy <= 0 || r.gliding);
  if (!r.grounded) {
    r.airTime += dt;
    r.vy -= (r.gliding ? GLIDE_GRAVITY : GRAVITY) * dt;
    if (r.gliding) {
      r.vy = Math.max(r.vy, -GLIDE_FALL);
      for (const u of track.updrafts) {
        if (r.x >= u.x0 && r.x < u.x1 && r.y < u.top) {
          r.vy = Math.min(UPDRAFT_RISE, r.vy + (UPDRAFT_ACCEL + GLIDE_GRAVITY) * dt);
        }
      }
    }
  } else {
    r.stride += dt * (r.vx / RUN_SPEED);
  }

  // Horizontal move, stopped by any ledge too tall to run up.
  let nx = r.x + r.vx * dt;
  for (const g of track.ground) {
    if (g.x0 > r.x && g.x0 <= nx && g.top > r.y + STEP_UP) {
      nx = g.x0 - 0.01;
      r.vx = 0;
      break;
    }
  }
  r.x = nx;

  // Vertical move, landing on ground or bouncing off a cap.
  const prevY = r.y;
  const ny = r.y + r.vy * dt;
  const g = groundAt(track, r.x);
  const cap = capAt(track, r.x);

  if (cap && r.vy <= 0 && prevY >= cap.top && ny <= cap.top) {
    r.y = cap.top;
    r.vy = BOUNCE_SPEED;
    r.grounded = false;
    r.gliding = false;
    r.airTime = COYOTE;
    events.push("bounce");
  } else if (g && r.vy <= 0 && ny <= g.top && prevY >= g.top - STEP_UP) {
    if (!r.grounded) events.push("land");
    r.y = g.top;
    r.vy = 0;
    r.grounded = true;
    r.gliding = false;
    r.airTime = 0;
    r.safeX = r.x;
  } else {
    r.y = ny;
    if (r.grounded && (!g || g.top < r.y - 0.5)) {
      // Ran off an edge.
      r.grounded = false;
    }
  }

  // Hazards: brush one with your feet below its top and you trip.
  if (r.tripTimer <= 0) {
    for (const h of track.hazards) {
      if (
        r.x + RACER_HALF_W > h.x &&
        r.x - RACER_HALF_W < h.x + h.w &&
        r.y < h.base + h.h - 2
      ) {
        r.vx = RUN_SPEED * TRIP_SPEED;
        if (r.grounded) {
          r.vy = 180;
          r.grounded = false;
        }
        r.tripTimer = TRIP_GRACE;
        events.push("trip");
        break;
      }
    }
  }

  if (r.y < FALL_LIMIT) {
    r.respawnTimer = RESPAWN_SECONDS;
    r.vx = 0;
    r.vy = 0;
    r.gliding = false;
    events.push("fall");
  }

  return events;
}

/** Put a fallen racer back on the ground it last stood on, with a run-up. */
function respawn(r: Racer, track: Track): void {
  const g = groundAt(track, r.safeX) ?? track.ground[0]!;
  r.x = Math.max(g.x0 + 8, r.safeX - RESPAWN_BACK);
  r.y = g.top;
  r.vx = 0;
  r.vy = 0;
  r.grounded = true;
  r.gliding = false;
  r.airTime = 0;
  r.jumpBuffer = 0;
  r.tripTimer = 0;
  r.respawnTimer = 0;
}

// ----- The computer racer -----

/**
 * What a sensible racer presses, looking only at what's just ahead.
 *
 * It jumps at the last moment before a pit (a jump from the very edge goes
 * furthest), a little earlier for a log or a ledge, and glides only while
 * there's a pit underneath and no mushroom cap coming up to drop onto:
 * gliding over solid ground, or over a cap, just floats you past the place
 * to land and into whatever comes next.
 * It reads the same track the player sees and plays by the same rules --
 * which also makes it the test that the course can be finished at all.
 */
export function botControls(r: Racer, track: Track): Controls {
  if (!r.grounded) {
    const below = groundAt(track, r.x + 30);
    const capAhead = track.caps.some(
      (c) => c.x - r.x > -20 && c.x - r.x < 260 && c.top < r.y,
    );
    return { pressed: false, held: !capAhead && (!below || below.top > r.y) };
  }

  const ahead = r.x + r.vx * 0.06 + 4;
  const g = groundAt(track, ahead);
  const pitAhead = !g || g.top < r.y - STEP_UP;
  const wallAhead = track.ground.some(
    (w) => w.x0 > r.x && w.x0 < r.x + 34 && w.top > r.y + STEP_UP,
  );
  const hazardAhead = track.hazards.some(
    (h) => h.x - r.x > 0 && h.x - r.x < 46 && h.base <= r.y + STEP_UP,
  );
  return { pressed: pitAhead || wallAhead || hazardAhead, held: false };
}

/** One recorded position, with what the racer was doing. */
export interface PathPoint {
  x: number;
  y: number;
  pose: Pose;
}

export interface RecordedRun {
  /** One point per simulation step, from the start gun. */
  points: PathPoint[];
  /** Seconds from the start gun to the finish line, or Infinity if it never got there. */
  finishTime: number;
}

/**
 * Race the computer racer around the whole course, once, and keep the path.
 *
 * The racer on screen is this recording played back, slowed to a pace. That
 * keeps it on exactly the same physics as the player -- it can't cut a
 * corner the player couldn't -- while a pace below 1 makes it beatable.
 */
export function recordBotRun(track: Track, step: number, maxSeconds = 180): RecordedRun {
  const r = createRacer(track.startX);
  const points: PathPoint[] = [{ x: r.x, y: r.y, pose: poseOf(r) }];
  let t = 0;
  while (t < maxSeconds) {
    stepRacer(r, track, botControls(r, track), step);
    t += step;
    points.push({ x: r.x, y: r.y, pose: poseOf(r) });
    if (r.x >= track.finishX) return { points, finishTime: t };
  }
  return { points, finishTime: Number.POSITIVE_INFINITY };
}

/**
 * Where a recorded racer is `seconds` after the start gun, played at `pace`
 * (1 = as recorded, 0.9 = ten percent slower). Past the end of the recording,
 * it keeps running at top speed beyond the finish.
 */
export function sampleRun(
  run: RecordedRun,
  step: number,
  seconds: number,
  pace: number,
): PathPoint {
  const f = Math.max(0, (seconds * pace) / step);
  const last = run.points.length - 1;
  if (f >= last) {
    const end = run.points[last]!;
    return { x: end.x + (f - last) * step * RUN_SPEED, y: end.y, pose: "run" };
  }
  const i = Math.floor(f);
  const a = run.points[i]!;
  const b = run.points[i + 1]!;
  const t = f - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pose: a.pose };
}

/** The recorded racer's finish time when played at `pace`. */
export function paceFinishTime(run: RecordedRun, pace: number): number {
  return run.finishTime / pace;
}

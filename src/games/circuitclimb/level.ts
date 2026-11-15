/**
 * The climb: pads generated ahead of JES from a seed.
 *
 * There is always a guaranteed route -- stationary pads that never break,
 * each within reach of the one below it -- and everything else is a side
 * path: boost pads, moving pads, brittle pads and spare relays. A side path
 * can be a shortcut or a bonus, but it is never the only way up.
 */

import { Rng } from "../../core/rng.ts";
import {
  ARENA_W,
  BOOST_BOUNCE,
  BOUNCE,
  FOOT_HALF,
  MODES,
  sideReachTurning,
  zoneAt,
  type Mode,
  type ModeTuning,
} from "./tuning.ts";

export type PadKind = "ground" | "standard" | "relay" | "boost" | "moving" | "brittle";

export interface Pad {
  readonly id: number;
  readonly kind: PadKind;
  /** Centre, at rest. A moving pad swings either side of it. */
  readonly baseX: number;
  /** The top surface: where feet land. */
  readonly y: number;
  readonly w: number;
  /** On the guaranteed route. */
  readonly route: boolean;
  /** Moving pads: how far either side, how fast (radians a second), and where in the swing it starts. */
  readonly swing: number;
  readonly speed: number;
  readonly phase: number;
  /** A relay that has been landed on. Its bonus is paid once. */
  powered: boolean;
  /** A brittle pad that has been used. */
  broken: boolean;
}

export interface Level {
  readonly mode: Mode;
  readonly tuning: ModeTuning;
  readonly rng: Rng;
  pads: Pad[];
  nextId: number;
  /** The top route pad so far, which the next one is placed from. */
  lastRoute: Pad;
  routeCount: number;
}

/** Route pads before the first relay. The brief: one within about five landings. */
const FIRST_RELAY_AT = 4;
/** Share of later route pads that are relays. */
const ROUTE_RELAY_SHARE = 0.08;
/** Keep pads this far off the walls. */
const WALL_MARGIN = 4;
/** The first few pads are as wide as they get, so the first jumps are kind. */
const FRIENDLY_PADS = 4;

export function padX(pad: Pad, time: number): number {
  if (pad.kind !== "moving") return pad.baseX;
  return pad.baseX + pad.swing * Math.sin(pad.phase + time * pad.speed);
}

export function createLevel(seed: number, mode: Mode): Level {
  const ground: Pad = makePad(0, "ground", ARENA_W / 2, 0, ARENA_W, true);
  const level: Level = {
    mode,
    tuning: MODES[mode],
    rng: new Rng(seed),
    pads: [ground],
    nextId: 1,
    lastRoute: ground,
    routeCount: 0,
  };
  return level;
}

function makePad(
  id: number,
  kind: PadKind,
  x: number,
  y: number,
  w: number,
  route: boolean,
  swing = 0,
  speed = 0,
  phase = 0,
): Pad {
  return { id, kind, baseX: x, y, w, route, swing, speed, phase, powered: false, broken: false };
}

/** How far into the climb's difficulty this height is, 0 to 1. */
export function difficulty(level: Level, y: number): number {
  return Math.min(1, Math.max(0, y / level.tuning.rampHeight));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Generate pads until the route reaches `top`. */
export function extendTo(level: Level, top: number): void {
  while (level.lastRoute.y < top) addStep(level);
}

/** Throw away pads far below the camera. */
export function cullBelow(level: Level, y: number): void {
  level.pads = level.pads.filter((pad) => pad.y >= y || pad === level.lastRoute);
}

/** The next pad on the route, and perhaps a side path beside it. */
function addStep(level: Level): void {
  const { rng, tuning } = level;
  const from = level.lastRoute;
  const d = difficulty(level, from.y);
  const friendly = level.routeCount < FRIENDLY_PADS;

  const gapLo = lerp(tuning.gapStart[0], tuning.gapHardest[0], d);
  const gapHi = lerp(tuning.gapStart[1], tuning.gapHardest[1], d);
  const gap = friendly ? tuning.gapStart[0] : rng.range(gapLo, gapHi);
  const y = from.y + gap;

  const widest = tuning.widthStart;
  const w = friendly
    ? widest
    : Math.max(tuning.widthHardest * 0.9, lerp(widest, tuning.widthHardest, d) + rng.range(-8, 8));

  // How far over this one may sit from the last, centre to centre. Measured
  // from the worst start -- JES on the far edge of the last pad, running the
  // wrong way -- and only a share of even that, because a thumb is late
  // sometimes. Any part of the foot over the new pad is a landing.
  const reach = Math.max(
    0,
    sideReachTurning(gap) * tuning.reachShare + w / 2 + FOOT_HALF - from.w / 2,
  );
  const shift = friendly ? rng.range(-50, 50) : rng.range(-reach, reach);
  const x = clampX(from.baseX + shift, w);

  level.routeCount += 1;
  const relay =
    level.routeCount === FIRST_RELAY_AT ||
    (level.routeCount > FIRST_RELAY_AT + 2 && rng.chance(ROUTE_RELAY_SHARE));
  const pad = makePad(level.nextId++, relay ? "relay" : "standard", x, y, w, true);
  level.pads.push(pad);
  level.lastRoute = pad;

  if (!friendly) addSidePath(level, from, pad, d);
}

function clampX(x: number, w: number): number {
  return Math.min(ARENA_W - w / 2 - WALL_MARGIN, Math.max(w / 2 + WALL_MARGIN, x));
}

/**
 * Perhaps a pad off the route, between `below` and `above`.
 *
 * It sits well clear of both route pads in height, so it never hides one, and
 * isn't stacked straight under the pad above, so it reads as a side path. Pads are only
 * solid from above, so it can't block the way up; and from anywhere it can
 * be, the route pad above is in reach, so landing on it is never a trap.
 */
function addSidePath(level: Level, below: Pad, above: Pad, d: number): void {
  const { rng } = level;
  const zone = zoneAt(above.y);
  if (!rng.chance(0.3 + 0.2 * d)) return;

  const kinds: PadKind[] =
    zone === 0 ? ["relay", "boost", "standard"] : ["relay", "boost", "moving", "brittle", "moving", "brittle"];
  const kind = rng.pick(kinds);
  const w = kind === "boost" ? 70 : kind === "moving" ? 66 : kind === "relay" ? 82 : 88;
  const y = below.y + (above.y - below.y) * rng.range(0.38, 0.62);
  const swing = kind === "moving" ? rng.range(24, 44) : 0;
  const bounce = kind === "boost" ? BOOST_BOUNCE : BOUNCE;
  const rise = above.y - y;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const x = rng.range(w / 2 + swing + WALL_MARGIN, ARENA_W - w / 2 - swing - WALL_MARGIN);
    // Not stacked straight under the next route pad: off to one side.
    if (Math.abs(x - above.baseX) < 40) continue;
    const worst = Math.abs(x - above.baseX) + swing + w / 2;
    if (worst > sideReachTurning(rise, bounce) * 0.8 + above.w / 2 + FOOT_HALF) continue;
    level.pads.push(
      makePad(
        level.nextId++,
        kind,
        x,
        y,
        w,
        false,
        swing,
        kind === "moving" ? rng.range(1.1, 1.8) : 0,
        rng.range(0, Math.PI * 2),
      ),
    );
    return;
  }
}

/** The route pads in order, for tests and the bot. */
export function routePads(level: Level): Pad[] {
  return level.pads.filter((pad) => pad.route).sort((a, b) => a.y - b.y);
}

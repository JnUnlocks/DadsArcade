/**
 * Neon Skyline -- the rules, and nothing else.
 *
 * A block slides back and forth over the tower. Tap and it stops where it is:
 * whatever hangs over the edge of the block below is cut off and falls, and
 * what's left is the next block's width. Miss the tower entirely and the run
 * is over. Land it within a few units of dead centre and it's PERFECT: it
 * snaps into line, nothing is cut, and three PERFECTs in a row win some width
 * back.
 *
 * Pure: no DOM, no canvas, no clock. The game hands it time and presses, so
 * every rule here can be tested on its own (skyline.test.ts).
 */

/** The playfield is this many units across, whatever the screen. */
export const FIELD_W = 360;
/** Every block's height, in the same units. */
export const BLOCK_H = 22;
export const START_W = 220;

/** Within this many units of the block below counts as PERFECT. */
export const PERFECT_TOLERANCE = 4;
/** Width won back by every third PERFECT in a row. */
export const BONUS_WIDTH = 12;
export const BONUS_EVERY = 3;

export const START_SPEED = 120;
export const MAX_SPEED = 300;
/** The speed goes up by this factor every SPEED_STEP placements. */
export const SPEED_GROWTH = 1.1;
export const SPEED_STEP = 5;

export const POINTS_PER_BLOCK = 10;
export const PERFECT_POINTS = 5;
/** The PERFECT bonus stops growing at this streak. */
export const PERFECT_STREAK_CAP = 5;

export interface Block {
  /** Left edge. */
  x: number;
  w: number;
}

export interface Mover extends Block {
  dir: 1 | -1;
}

export interface Skyline {
  /** Bottom first. The first is the foundation, which isn't a floor. */
  tower: Block[];
  mover: Mover;
  score: number;
  perfects: number;
  streak: number;
  bestStreak: number;
  over: boolean;
}

/** What one tap did, for the game to show and sound. */
export type Placement =
  | { kind: "miss"; fell: Block }
  | { kind: "cut"; placed: Block; cut: Block; points: number }
  | { kind: "perfect"; placed: Block; streak: number; points: number; bonus: boolean };

export function newSkyline(): Skyline {
  const foundation = { x: (FIELD_W - START_W) / 2, w: START_W };
  return {
    tower: [foundation],
    mover: moverFor(1, START_W),
    score: 0,
    perfects: 0,
    streak: 0,
    bestStreak: 0,
    over: false,
  };
}

/** Floors built: every block on the tower but the foundation. */
export function height(s: Skyline): number {
  return s.tower.length - 1;
}

/** How fast the block slides once `placed` blocks are down. */
export function speedFor(placed: number): number {
  return Math.min(MAX_SPEED, START_SPEED * Math.pow(SPEED_GROWTH, Math.floor(placed / SPEED_STEP)));
}

/** Blocks come in from alternate sides, so the rhythm changes every floor. */
function moverFor(floor: number, w: number): Mover {
  return floor % 2 === 1 ? { x: 0, w, dir: 1 } : { x: FIELD_W - w, w, dir: -1 };
}

/**
 * Where a block sliding at `speed` is after `t` seconds, bouncing off both
 * walls. Works for any `t`, including several crossings in one step on a
 * slow frame. A negative `t` runs it backwards.
 */
export function slide(m: Mover, speed: number, t: number): Mover {
  const span = FIELD_W - m.w;
  if (span <= 0) return { ...m, x: 0 };
  // Unfold the bounce: a block going right at x and one going left at x are
  // two points on a loop twice the span long. Move along the loop, fold back.
  const period = span * 2;
  const start = m.dir === 1 ? m.x : period - m.x;
  const pos = (((start + speed * t) % period) + period) % period;
  return pos <= span ? { x: pos, w: m.w, dir: 1 } : { x: period - pos, w: m.w, dir: -1 };
}

/** Move the sliding block on by `dt` seconds. */
export function step(s: Skyline, dt: number): void {
  if (s.over) return;
  s.mover = slide(s.mover, speedFor(height(s)), dt);
}

/**
 * Stop the block. `ago` is how many seconds before the latest step the tap
 * actually happened, so a tap lands where the block was at that moment, not
 * where the next frame happened to put it.
 */
export function place(s: Skyline, ago = 0): Placement | null {
  if (s.over) return null;
  const m = ago > 0 ? slide(s.mover, speedFor(height(s)), -ago) : s.mover;
  const below = s.tower[s.tower.length - 1]!;

  const left = Math.max(m.x, below.x);
  const right = Math.min(m.x + m.w, below.x + below.w);
  const overlap = right - left;

  if (overlap <= 0) {
    s.over = true;
    s.streak = 0;
    return { kind: "miss", fell: { x: m.x, w: m.w } };
  }

  if (Math.abs(m.x - below.x) <= PERFECT_TOLERANCE) {
    s.streak += 1;
    s.perfects += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    const points = POINTS_PER_BLOCK + PERFECT_POINTS * Math.min(s.streak, PERFECT_STREAK_CAP);
    let placed: Block = { x: below.x, w: below.w };
    const bonus = s.streak % BONUS_EVERY === 0 && placed.w < START_W;
    if (bonus) placed = widen(placed, BONUS_WIDTH);
    s.score += points;
    s.tower.push(placed);
    s.mover = moverFor(height(s) + 1, placed.w);
    return { kind: "perfect", placed, streak: s.streak, points, bonus };
  }

  s.streak = 0;
  const placed: Block = { x: left, w: overlap };
  const cut: Block = m.x < below.x ? { x: m.x, w: m.w - overlap } : { x: right, w: m.w - overlap };
  s.score += POINTS_PER_BLOCK;
  s.tower.push(placed);
  s.mover = moverFor(height(s) + 1, placed.w);
  return { kind: "cut", placed, cut, points: POINTS_PER_BLOCK };
}

/** Grow a block about its centre, never past the starting width or the field. */
export function widen(b: Block, by: number): Block {
  const w = Math.min(START_W, b.w + by);
  let x = b.x - (w - b.w) / 2;
  x = Math.max(0, Math.min(FIELD_W - w, x));
  return { x, w };
}

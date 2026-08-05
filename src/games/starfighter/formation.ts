/**
 * Flight paths and the formation grid.
 *
 * The defining feature of Galaga -- the thing that separates it from Space
 * Invaders' sliding block -- is that enemies *fly*. They sweep in along curves,
 * lock into a grid, then peel off individually to dive at you. All of that is
 * cubic beziers, so this module is mostly bezier plumbing.
 */

import type { Rng } from "../../core/rng";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Path {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  /** Approximate arc length, so we can fly it at constant speed. */
  length: number;
}

export const COLS = 8;
export const ROWS = 5;
const COL_SPACING = 34;
const ROW_SPACING = 31;

/** How far the whole formation drifts side to side, in virtual units. */
const SWAY_AMPLITUDE = 16;
const SWAY_SPEED = 0.55;

export function pointOnPath(path: Path, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * path.p0.x + b * path.p1.x + c * path.p2.x + d * path.p3.x,
    y: a * path.p0.y + b * path.p1.y + c * path.p2.y + d * path.p3.y,
  };
}

/** Tangent direction, used to point the ship along its flight. */
export function headingOnPath(path: Path, t: number): number {
  const ahead = pointOnPath(path, Math.min(1, t + 0.02));
  const behind = pointOnPath(path, Math.max(0, t - 0.02));
  return Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
}

export function makePath(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Path {
  const path: Path = { p0, p1, p2, p3, length: 0 };
  // Sampled arc length. 16 segments is plenty for curves this gentle and keeps
  // spawn cost negligible even when a whole wave is built at once.
  let length = 0;
  let previous = p0;
  for (let i = 1; i <= 16; i += 1) {
    const point = pointOnPath(path, i / 16);
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  path.length = Math.max(1, length);
  return path;
}

/** Where a formation slot sits right now, including the group's sway. */
export function slotPosition(
  row: number,
  col: number,
  viewWidth: number,
  topMargin: number,
  time: number,
): Vec2 {
  const originX = (viewWidth - (COLS - 1) * COL_SPACING) / 2;
  const sway = Math.sin(time * SWAY_SPEED) * SWAY_AMPLITUDE;
  return {
    x: originX + col * COL_SPACING + sway,
    y: topMargin + row * ROW_SPACING,
  };
}

/**
 * An entry flight: swing in from off-screen, loop, and arrive at the slot.
 * `variant` picks which side of the screen the squad enters from so successive
 * waves don't all look the same.
 */
export function makeEntryPath(
  target: Vec2,
  variant: number,
  viewWidth: number,
  viewHeight: number,
): Path {
  switch (variant % 4) {
    case 0: // sweep in from top-left, loop right
      return makePath(
        { x: -50, y: -40 },
        { x: viewWidth * 0.15, y: viewHeight * 0.45 },
        { x: viewWidth * 0.95, y: viewHeight * 0.28 },
        target,
      );
    case 1: // mirror of the above
      return makePath(
        { x: viewWidth + 50, y: -40 },
        { x: viewWidth * 0.85, y: viewHeight * 0.45 },
        { x: viewWidth * 0.05, y: viewHeight * 0.28 },
        target,
      );
    case 2: // climb up from below-left
      return makePath(
        { x: -40, y: viewHeight + 40 },
        { x: viewWidth * 0.3, y: viewHeight * 0.55 },
        { x: viewWidth * 0.1, y: -30 },
        target,
      );
    default: // climb up from below-right
      return makePath(
        { x: viewWidth + 40, y: viewHeight + 40 },
        { x: viewWidth * 0.7, y: viewHeight * 0.55 },
        { x: viewWidth * 0.9, y: -30 },
        target,
      );
  }
}

/**
 * A dive: peel out of formation, swoop past the player, and exit the bottom.
 * Curving toward the player's current x makes the dive feel aimed without
 * being a homing missile the player can't dodge.
 */
export function makeDivePath(
  from: Vec2,
  playerX: number,
  viewHeight: number,
  rng: Rng,
): Path {
  const swingOut = rng.range(-90, 90);
  return makePath(
    { x: from.x, y: from.y },
    { x: from.x + swingOut, y: from.y + viewHeight * 0.28 },
    { x: playerX + rng.range(-50, 50), y: viewHeight * 0.72 },
    { x: playerX + rng.range(-120, 120), y: viewHeight + 60 },
  );
}

/**
 * After exiting the bottom, a survivor re-enters from the top and flies back to
 * its slot -- the Galaga loop. Returned as a fresh path from off-screen.
 */
export function makeReturnPath(target: Vec2, viewWidth: number): Path {
  const entryX = target.x < viewWidth / 2 ? viewWidth * 0.25 : viewWidth * 0.75;
  return makePath(
    { x: entryX, y: -50 },
    { x: entryX, y: 60 },
    { x: target.x, y: -10 },
    target,
  );
}

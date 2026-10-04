/**
 * Forest Dash art: a mushroom forest at dusk, drawn at runtime like every
 * other machine here. No images.
 *
 * The world is in track units with y UP; the screen has y down. Everything
 * goes through a Camera, which owns the flip and the zoom, so nothing else in
 * this file has to think about it.
 *
 * Bright shapes on a dark background, on purpose. The things you have to
 * react to -- pits, logs, brambles, caps -- are the brightest and most
 * saturated things on screen; the trees behind are dim and slow-moving, so
 * your eye is never pulled off the path by scenery.
 */

import { CAST, type Character } from "./cast.ts";
import type { Pose } from "./rules.ts";
import type { Track } from "./track.ts";

export const PALETTE = {
  skyTop: "#120c2e",
  skyMid: "#1f1b4a",
  skyLow: "#1d4a52",
  moon: "#fff3c4",
  farTrunk: "#1a2244",
  nearTrunk: "#141a33",
  earth: "#3a2618",
  earthDark: "#24170f",
  moss: "#4fbf5a",
  mossLight: "#8be37a",
  pit: "#06040f",
  glow: "#7ff5e6",
  capRed: "#ff5a6e",
  capPink: "#ff9bb0",
  capSpot: "#fff1f4",
  stem: "#f0e2c8",
  stemShade: "#c9b48f",
  log: "#9a5b32",
  logLight: "#c98450",
  logRing: "#e8b98a",
  bramble: "#b04ad8",
  thorn: "#e9a4ff",
  puddle: "#3fa7e0",
  puddleLight: "#a8e4ff",
  spore: "#c6ff8a",
  acorn: "#d4892f",
  acornCap: "#6b4423",
  fox: "#ff8a2a",
  foxDark: "#c75c12",
  white: "#fff8ee",
  ink: "#20140c",
  squirrel: "#b0876a",
  squirrelDark: "#7a5640",
  finish: "#ffe14f",
  text: "#e8f0ff",
} as const;

/** World units to screen units. Below 1 so you can see further ahead. */
export const WORLD_SCALE = 0.9;

export class Camera {
  /** World x at the left edge of the screen. */
  x = 0;
  /** World y drawn at the floor line. Rises when a racer goes high. */
  y = 0;
  /** Screen y of the forest floor (world y = camera y). */
  floor = 0;

  sx(wx: number): number {
    return (wx - this.x) * WORLD_SCALE;
  }

  sy(wy: number): number {
    return this.floor - (wy - this.y) * WORLD_SCALE;
  }
}

/** Cheap, repeatable "random" for scenery, so it doesn't shimmer as it scrolls. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ----- Backdrop -----

export function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  time: number,
  reducedMotion: boolean,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Moon, barely moving: the furthest thing away.
  const moonX = w * 0.78 - (cam.x * 0.01) % 40;
  const moonY = h * 0.2;
  const halo = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 70);
  halo.addColorStop(0, "rgba(255,243,196,0.35)");
  halo.addColorStop(1, "rgba(255,243,196,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(moonX - 70, moonY - 70, 140, 140);
  ctx.fillStyle = PALETTE.moon;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
  ctx.fill();

  drawTrunks(ctx, cam, 0.25, 90, PALETTE.farTrunk, 18, 0, null);
  drawTrunks(ctx, cam, 0.5, 140, PALETTE.nearTrunk, 30, 1000, { time, reducedMotion });
  drawFireflies(ctx, w, h, cam, time, reducedMotion);
}

/**
 * A row of tree trunks scrolling at `speed` of the camera, spaced `gap` apart.
 * The near row carries glowing shelf fungus, which is where the forest's
 * glow comes from without putting anything bright down where the path is.
 */
function drawTrunks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  speed: number,
  gap: number,
  color: string,
  width: number,
  seed: number,
  shelves: { time: number; reducedMotion: boolean } | null,
): void {
  const offset = cam.x * speed * WORLD_SCALE;
  const first = Math.floor(offset / gap) - 1;
  const base = cam.sy(0) + 10;
  for (let i = first; i < first + 360 / gap + 3; i += 1) {
    const x = i * gap - offset + hash(i + seed) * gap * 0.6;
    const half = (width * (0.7 + hash(i * 3 + seed) * 0.6)) / 2;
    ctx.fillStyle = color;
    ctx.fillRect(x - half, 0, half * 2, base);
    // A root flare at the bottom, so they read as trees and not as bars.
    ctx.beginPath();
    ctx.moveTo(x - half, base - 20);
    ctx.quadraticCurveTo(x - half * 1.6, base - 4, x - half * 2.6, base);
    ctx.lineTo(x + half * 2.6, base);
    ctx.quadraticCurveTo(x + half * 1.6, base - 4, x + half, base - 20);
    ctx.fill();

    if (!shelves) continue;
    for (let k = 0; k < 2; k += 1) {
      if (hash(i * 7 + k) < 0.45) continue;
      const side = hash(i * 5 + k) < 0.5 ? -1 : 1;
      const fy = base - 60 - hash(i * 11 + k) * 220;
      const r = 6 + hash(i * 13 + k) * 5;
      const fx = x + side * half;
      const pulse = shelves.reducedMotion ? 0.7 : 0.55 + 0.3 * Math.sin(shelves.time * 2 + i + k);
      ctx.fillStyle = `rgba(127,245,230,${0.16 * pulse})`;
      ctx.beginPath();
      ctx.arc(fx, fy, r * 3, 0, Math.PI * 2);
      ctx.fill();
      // A shelf sticking out of the bark: a flat cap with a brighter rim.
      ctx.fillStyle = PALETTE.glow;
      ctx.beginPath();
      ctx.ellipse(fx + side * r * 0.4, fy, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d8fff8";
      ctx.fillRect(fx + side * r * 0.4 - r * 0.7, fy - 1, r * 1.4, 1.5);
    }
  }
}

function drawFireflies(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  time: number,
  reducedMotion: boolean,
): void {
  const t = reducedMotion ? 0 : time;
  for (let i = 0; i < 14; i += 1) {
    const x = (hash(i) * w * 1.5 - cam.x * 0.35 * WORLD_SCALE + Math.sin(t * 0.7 + i) * 12) % (w * 1.5);
    const fx = x < 0 ? x + w * 1.5 : x;
    const fy = h * (0.2 + hash(i * 3) * 0.45) + Math.cos(t * 0.9 + i * 2) * 10;
    const a = reducedMotion ? 0.6 : 0.35 + 0.35 * Math.sin(t * 3 + i * 1.7);
    ctx.fillStyle = `rgba(214,255,138,${a})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ----- The course -----

export function drawCourse(
  ctx: CanvasRenderingContext2D,
  track: Track,
  cam: Camera,
  w: number,
  h: number,
  time: number,
  taken: ReadonlySet<number>,
  reducedMotion: boolean,
): void {
  const left = cam.x - 80;
  const right = cam.x + w / WORLD_SCALE + 80;

  // The pits: everything below the forest floor is dark unless ground covers it.
  const pitTop = cam.sy(0) + 6;
  const pit = ctx.createLinearGradient(0, pitTop, 0, h);
  pit.addColorStop(0, "#0d0a1f");
  pit.addColorStop(1, PALETTE.pit);
  ctx.fillStyle = pit;
  ctx.fillRect(0, pitTop, w, h - pitTop);

  // Updrafts first, so racers and caps draw over them.
  for (const u of track.updrafts) {
    if (u.x1 < left || u.x0 > right) continue;
    drawUpdraft(ctx, cam, u.x0, u.x1, u.top, h, time, reducedMotion);
  }

  for (const c of track.caps) {
    if (c.x + c.w < left || c.x - c.w > right) continue;
    drawCap(ctx, cam, c.x, c.w, c.top, h, time, reducedMotion);
  }

  for (const g of track.ground) {
    if (g.x1 < left || g.x0 > right) continue;
    drawGround(ctx, cam, g.x0, g.x1, g.top, h);
  }

  for (const p of track.puddles) {
    if (p.x1 < left || p.x0 > right) continue;
    drawPuddle(ctx, cam, p.x0, p.x1, p.top, time, reducedMotion);
  }

  for (const hz of track.hazards) {
    if (hz.x + hz.w < left || hz.x > right) continue;
    if (hz.kind === "log") drawLog(ctx, cam, hz.x, hz.w, hz.h, hz.base);
    else drawBramble(ctx, cam, hz.x, hz.w, hz.h, hz.base);
  }

  for (let i = 0; i < track.acorns.length; i += 1) {
    const a = track.acorns[i]!;
    if (taken.has(i) || a.x < left || a.x > right) continue;
    const bob = reducedMotion ? 0 : Math.sin(time * 4 + i) * 2;
    drawAcorn(ctx, cam.sx(a.x), cam.sy(a.y) + bob, 1);
  }

  drawLine(ctx, cam, track.startX, false);
  drawLine(ctx, cam, track.finishX, true);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x0: number,
  x1: number,
  top: number,
  h: number,
): void {
  const sx0 = cam.sx(x0);
  const sx1 = cam.sx(x1);
  const sy = cam.sy(top);
  ctx.fillStyle = PALETTE.earth;
  ctx.fillRect(sx0, sy, sx1 - sx0, h - sy);
  // Darker bands of soil, so a tall ledge reads as a wall of earth.
  ctx.fillStyle = PALETTE.earthDark;
  for (let y = sy + 22; y < h; y += 26) ctx.fillRect(sx0, y, sx1 - sx0, 7);
  // The mossy top: the thing you land on, so it's the brightest edge here.
  ctx.fillStyle = PALETTE.moss;
  ctx.fillRect(sx0, sy - 3, sx1 - sx0, 8);
  ctx.fillStyle = PALETTE.mossLight;
  ctx.fillRect(sx0, sy - 3, sx1 - sx0, 2);
  // Rounded lips at each edge, so the edge of a pit is unmistakable.
  ctx.fillStyle = PALETTE.moss;
  ctx.beginPath();
  ctx.arc(sx0 + 2, sy + 1, 5, 0, Math.PI * 2);
  ctx.arc(sx1 - 2, sy + 1, 5, 0, Math.PI * 2);
  ctx.fill();
  // Grass tufts.
  ctx.strokeStyle = PALETTE.mossLight;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / 37) * 37; x < x1 - 8; x += 37) {
    if (hash(x) < 0.5) continue;
    const px = cam.sx(x);
    ctx.moveTo(px, sy - 2);
    ctx.lineTo(px - 2, sy - 7);
    ctx.moveTo(px + 2, sy - 2);
    ctx.lineTo(px + 3, sy - 8);
  }
  ctx.stroke();
}

function drawPuddle(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x0: number,
  x1: number,
  top: number,
  time: number,
  reducedMotion: boolean,
): void {
  const sx0 = cam.sx(x0);
  const sx1 = cam.sx(x1);
  const sy = cam.sy(top);
  ctx.fillStyle = PALETTE.puddle;
  ctx.beginPath();
  ctx.ellipse((sx0 + sx1) / 2, sy + 1, (sx1 - sx0) / 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const shimmer = reducedMotion ? 0 : Math.sin(time * 3) * 6;
  ctx.strokeStyle = PALETTE.puddleLight;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx0 + 14 + shimmer, sy);
  ctx.lineTo(sx0 + 30 + shimmer, sy);
  ctx.moveTo(sx1 - 40 - shimmer, sy + 2);
  ctx.lineTo(sx1 - 22 - shimmer, sy + 2);
  ctx.stroke();
}

function drawLog(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  w: number,
  hgt: number,
  base: number,
): void {
  const sx = cam.sx(x);
  const sw = w * WORLD_SCALE;
  const sh = hgt * WORLD_SCALE;
  const sy = cam.sy(base) - sh;
  ctx.fillStyle = PALETTE.log;
  roundRect(ctx, sx, sy, sw, sh, sh / 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.logLight;
  ctx.fillRect(sx + sh / 2, sy + 3, sw - sh, 3);
  // The cut end, facing you as you run at it.
  ctx.fillStyle = PALETTE.logRing;
  ctx.beginPath();
  ctx.ellipse(sx + sh / 2, sy + sh / 2, sh / 2.6, sh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.log;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(sx + sh / 2, sy + sh / 2, sh / 5, sh / 4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBramble(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  w: number,
  hgt: number,
  base: number,
): void {
  const sx = cam.sx(x);
  const sw = w * WORLD_SCALE;
  const sh = hgt * WORLD_SCALE;
  const sy = cam.sy(base);
  ctx.fillStyle = PALETTE.bramble;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  // A lumpy dome of thorny stems.
  for (let i = 0; i <= 4; i += 1) {
    const px = sx + (sw * i) / 4;
    const bump = i === 0 || i === 4 ? 0.3 : 0.8 + 0.2 * (i % 2);
    ctx.lineTo(px, sy - sh * bump);
  }
  ctx.lineTo(sx + sw, sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.thorn;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 7; i += 1) {
    const px = sx + 4 + ((sw - 8) * i) / 6;
    const py = sy - sh * (0.35 + 0.45 * hash(i + x));
    ctx.moveTo(px, py);
    ctx.lineTo(px + (i % 2 ? 4 : -4), py - 5);
  }
  ctx.stroke();
}

function drawCap(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  w: number,
  top: number,
  h: number,
  time: number,
  reducedMotion: boolean,
): void {
  const sx = cam.sx(x);
  const sy = cam.sy(top);
  const sw = w * WORLD_SCALE;
  const capH = 20 * WORLD_SCALE;
  // Stem, down into the pit and off the bottom of the screen.
  ctx.fillStyle = PALETTE.stem;
  ctx.fillRect(sx - 8, sy + 4, 16, h - sy);
  ctx.fillStyle = PALETTE.stemShade;
  ctx.fillRect(sx + 3, sy + 4, 5, h - sy);
  // Glow, so it reads as "bouncy and safe" from a distance.
  const pulse = reducedMotion ? 0.7 : 0.55 + 0.25 * Math.sin(time * 3 + x);
  const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, sw);
  halo.addColorStop(0, `rgba(255,155,176,${0.45 * pulse})`);
  halo.addColorStop(1, "rgba(255,155,176,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx - sw, sy - sw, sw * 2, sw * 2);
  // Cap.
  ctx.fillStyle = PALETTE.capRed;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 4, sw / 2, capH, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.capPink;
  ctx.fillRect(sx - sw / 2, sy + 2, sw, 4);
  ctx.fillStyle = PALETTE.capSpot;
  for (const [dx, dy, r] of [
    [-0.25, -0.45, 4],
    [0.12, -0.7, 3.5],
    [0.3, -0.3, 3],
  ] as const) {
    ctx.beginPath();
    ctx.arc(sx + dx * sw, sy + 4 + dy * capH, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawUpdraft(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x0: number,
  x1: number,
  top: number,
  h: number,
  time: number,
  reducedMotion: boolean,
): void {
  const sx0 = cam.sx(x0);
  const sx1 = cam.sx(x1);
  const syTop = cam.sy(top + 40);
  const g = ctx.createLinearGradient(0, syTop, 0, h);
  g.addColorStop(0, "rgba(198,255,138,0)");
  g.addColorStop(1, "rgba(198,255,138,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(sx0, syTop, sx1 - sx0, h - syTop);
  // Spores drifting upward: the "this lifts you" tell.
  const span = h - syTop;
  ctx.fillStyle = PALETTE.spore;
  for (let i = 0; i < 26; i += 1) {
    const px = sx0 + hash(i * 3 + x0) * (sx1 - sx0);
    const rise = reducedMotion ? hash(i * 7) * span : ((time * 70 + hash(i * 7) * span) % span);
    const py = h - rise;
    ctx.globalAlpha = 0.35 + 0.5 * (rise / span);
    ctx.beginPath();
    ctx.arc(px + Math.sin(time * 2 + i) * 3, py, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The start line is a strip of moss; the finish is a banner between two big mushrooms. */
function drawLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  finish: boolean,
): void {
  const sx = cam.sx(x);
  const sy = cam.sy(0);
  if (!finish) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(sx - 2, sy - 2, 4, 8);
    return;
  }
  const poleH = 120 * WORLD_SCALE;
  // Checkered strip on the ground.
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i % 2 ? PALETTE.ink : PALETTE.white;
    ctx.fillRect(sx - 4, sy - 3 + i * 3, 8, 3);
  }
  // Two glowing mushroom posts and a banner.
  for (const dx of [-26, 26]) {
    ctx.fillStyle = PALETTE.stem;
    ctx.fillRect(sx + dx - 3, sy - poleH, 6, poleH);
    ctx.fillStyle = PALETTE.glow;
    ctx.beginPath();
    ctx.ellipse(sx + dx, sy - poleH, 12, 9, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.finish;
  ctx.fillRect(sx - 26, sy - poleH + 6, 52, 16);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "700 10px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FINISH", sx, sy - poleH + 14);
}

export function drawAcorn(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = PALETTE.acorn;
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.acornCap;
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 6 * s, 3.5 * s, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 6 * s, y - 2.5 * s, 12 * s, 2 * s);
  ctx.fillRect(x - 0.8 * s, y - 8 * s, 1.6 * s, 3 * s);
}

// ----- Racers -----

/**
 * A racer, facing right, feet at the origin, about 40 world units nose to tail.
 *
 * Four poses, and each has a silhouette you can tell apart at a glance --
 * which is how you know the glide has kicked in without reading anything:
 * legs out flat and the tail straight back like a rudder.
 *
 * Every animal in the cast is this one body with its own colours, ears and
 * tail, so they all read the same way in every pose.
 */
export function drawRacer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: Pose,
  stride: number,
  who: Character,
  alpha = 1,
): void {
  if (pose === "gone") return;
  const s = WORLD_SCALE;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (pose === "trip") ctx.rotate(-0.45);
  if (pose === "glide") ctx.rotate(0.08);

  const swing = Math.sin(stride * Math.PI * 2 * 2.6);
  const legs = (frontX: number, backX: number) => {
    ctx.strokeStyle = who.dark;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (pose === "run") {
      ctx.moveTo(frontX, -12);
      ctx.lineTo(frontX + swing * 6, -1);
      ctx.moveTo(frontX - 4, -12);
      ctx.lineTo(frontX - 4 - swing * 6, -1);
      ctx.moveTo(backX, -12);
      ctx.lineTo(backX - swing * 6, -1);
      ctx.moveTo(backX + 4, -12);
      ctx.lineTo(backX + 4 + swing * 6, -1);
    } else if (pose === "glide") {
      ctx.moveTo(frontX, -13);
      ctx.lineTo(frontX + 11, -12);
      ctx.moveTo(backX, -13);
      ctx.lineTo(backX - 11, -12);
    } else {
      ctx.moveTo(frontX, -12);
      ctx.lineTo(frontX + 6, -6);
      ctx.moveTo(backX, -12);
      ctx.lineTo(backX - 6, -5);
    }
    ctx.stroke();
  };

  // Tail: straight out in a glide, bouncing behind in a run.
  const tailLift = pose === "glide" ? 0 : pose === "run" ? 4 + swing * 2 : 9;
  if (who.tail === "brush" || who.tail === "ring") {
    ctx.fillStyle = who.body;
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.quadraticCurveTo(-24, -18 - tailLift, -32, -22 - tailLift);
    ctx.quadraticCurveTo(-22, -8 - tailLift / 2, -10, -11);
    ctx.closePath();
    ctx.fill();
    if (who.tail === "ring") {
      ctx.strokeStyle = who.dark;
      ctx.lineWidth = 3;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(-17, -17 - tailLift * 0.35);
      ctx.lineTo(-16, -11 - tailLift * 0.3);
      ctx.moveTo(-24, -20 - tailLift * 0.7);
      ctx.lineTo(-23, -14 - tailLift * 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = who.tail === "ring" ? who.dark : who.belly;
    ctx.beginPath();
    ctx.arc(-30, -21 - tailLift, 3.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A puff or a stub: small, and it just bobs.
    ctx.fillStyle = who.belly;
    ctx.beginPath();
    ctx.arc(-14, -19 - tailLift / 3, who.tail === "puff" ? 5.5 : 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  legs(9, -7);

  // Body.
  ctx.fillStyle = who.body;
  ctx.beginPath();
  ctx.ellipse(0, -16, 14, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = who.belly;
  ctx.beginPath();
  ctx.ellipse(5, -12, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (who.spots) {
    for (const [sx, sy] of [
      [-7, -19],
      [-1, -21],
      [5, -19],
    ] as const) {
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ears go on before the head, so the head covers where they join.
  ctx.fillStyle = who.ears === "round" ? who.dark : who.body;
  ctx.beginPath();
  if (who.ears === "long") {
    ctx.ellipse(10, -36, 2.8, 9, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(16, -37, 2.8, 9, 0.06, 0, Math.PI * 2);
  } else if (who.ears === "round") {
    ctx.arc(9, -29, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(18, -29.5, 3.8, 0, Math.PI * 2);
  } else {
    ctx.moveTo(9, -27);
    ctx.lineTo(10, -36);
    ctx.lineTo(15, -29);
    ctx.moveTo(14, -29);
    ctx.lineTo(18, -37);
    ctx.lineTo(20, -27);
  }
  ctx.fill();

  // Head and snout.
  ctx.fillStyle = who.body;
  ctx.beginPath();
  ctx.arc(14, -23, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = who.belly;
  ctx.beginPath();
  ctx.moveTo(15, -22);
  ctx.lineTo(27, -21);
  ctx.lineTo(15, -17);
  ctx.closePath();
  ctx.fill();
  if (who.mask) {
    ctx.fillStyle = who.dark;
    ctx.beginPath();
    ctx.ellipse(16, -24.5, 5.4, 2.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(27, -21, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Eye: closed in a trip, open and bright otherwise.
  if (pose === "trip") {
    ctx.strokeStyle = who.mask ? who.belly : PALETTE.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(14, -25);
    ctx.lineTo(18, -24);
    ctx.stroke();
  } else {
    ctx.fillStyle = who.mask ? who.belly : PALETTE.ink;
    ctx.beginPath();
    ctx.arc(16.5, -24.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Pip the squirrel, the computer racer. Grey-brown, with a tail bigger than he is. */
export function drawSquirrel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: Pose,
  time: number,
): void {
  if (pose === "gone") return;
  const s = WORLD_SCALE;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = 0.9;

  const hop = pose === "run" ? Math.abs(Math.sin(time * 14)) * 3 : 0;
  ctx.translate(0, -hop);

  // Tail: a big curl up over the back.
  ctx.fillStyle = PALETTE.squirrelDark;
  ctx.beginPath();
  ctx.ellipse(-12, -26, 9, 15, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.squirrel;
  ctx.beginPath();
  ctx.ellipse(-11, -27, 6, 11, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Body and head.
  ctx.fillStyle = PALETTE.squirrel;
  ctx.beginPath();
  ctx.ellipse(0, -11, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(8, -20, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, -24);
  ctx.lineTo(6, -31);
  ctx.lineTo(9, -25);
  ctx.fill();
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.ellipse(3, -8, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(10, -21, 1.4, 0, Math.PI * 2);
  ctx.arc(14, -19, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Feet.
  ctx.fillStyle = PALETTE.squirrelDark;
  ctx.fillRect(-5, -3, 6, 3);
  ctx.fillRect(3, -3, 6, 3);

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** A small name tag over a racer's head. */
export function drawTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  ctx.font = "700 9px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(6,4,15,0.55)";
  const w = ctx.measureText(text).width + 8;
  roundRect(ctx, x - w / 2, y - 13, w, 13, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - 2);
}

// ----- Race HUD -----

/**
 * The strip under the arcade HUD: the race clock, and a bar showing where
 * both racers are on the course, so you always know how far ahead or behind
 * you are even when the other racer is off screen.
 */
export function drawRaceBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  clock: string,
  you: { at: number; color: string },
  others: ReadonlyArray<{ at: number; color: string }>,
): void {
  ctx.font = "700 15px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(clock, w / 2, y);

  const x0 = 24;
  const x1 = w - 24;
  const by = y + 24;
  ctx.fillStyle = "rgba(232,240,255,0.18)";
  roundRect(ctx, x0, by, x1 - x0, 5, 2.5);
  ctx.fill();
  ctx.fillStyle = PALETTE.finish;
  ctx.fillRect(x1 - 2, by - 3, 4, 11);
  const dot = (t: number, color: string, r: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + Math.max(0, Math.min(1, t)) * (x1 - x0), by + 2.5, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const o of others) dot(o.at, o.color, 4.5);
  // You go on last and biggest, with a rim, so your dot is never lost in theirs.
  dot(you.at, PALETTE.ink, 7);
  dot(you.at, you.color, 5.5);
}

export function drawBanner(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  text: string,
  size: number,
): void {
  ctx.font = `800 ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(6,4,15,0.7)";
  ctx.strokeText(text, w / 2, y);
  ctx.fillStyle = PALETTE.finish;
  ctx.fillText(text, w / 2, y);
}

// ----- Cabinet art -----

/** The menu icon: a glowing red mushroom with the fox leaping over it. */
export function drawForestDashIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.scale(size / 100, size / 100);
  // No backdrop: every other cabinet's art sits straight on its tile.
  ctx.fillStyle = PALETTE.moss;
  ctx.beginPath();
  ctx.ellipse(50, 84, 40, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mushroom.
  ctx.fillStyle = PALETTE.stem;
  ctx.fillRect(40, 60, 14, 24);
  ctx.fillStyle = PALETTE.capRed;
  ctx.beginPath();
  ctx.ellipse(47, 62, 26, 18, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = PALETTE.capSpot;
  for (const [x, y, r] of [
    [36, 54, 4],
    [52, 49, 3.5],
    [60, 57, 3],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // The fox, mid-glide over the cap.
  ctx.save();
  ctx.scale(size / 100, size / 100);
  ctx.translate(50, 36);
  ctx.scale(1.25 / WORLD_SCALE, 1.25 / WORLD_SCALE);
  drawRacer(ctx, 0, 0, "glide", 0, CAST[0]!);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

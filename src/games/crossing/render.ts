/**
 * Highway Hop's art. Vector paths at runtime, like everything else here.
 *
 * The board is a top-down strip of road and river, which is a readability
 * problem before it's an art problem: on a phone, at a glance, the player has
 * to know instantly whether a row will kill them by being occupied (road) or
 * by being empty (river). So the two halves never share a colour. Tarmac is
 * grey and its traffic is bright; water is blue and its platforms are warm
 * brown and green. You can tell which half you're in from the corner of your
 * eye, which is the only way the mid-board rule inversion is fair.
 */

import type { Lane, Occupant } from "./types";

export const PALETTE = {
  road: "#20242e",
  roadLine: "rgba(255,255,255,0.22)",
  water: "#12395e",
  waterGlint: "rgba(120, 200, 255, 0.16)",
  grass: "#1f4a2c",
  grassLight: "#2a6039",
  kerb: "#2c3140",
  home: "#123a24",
  homeOpen: "#3ddc97",
  frog: "#7ddc4f",
  frogDark: "#4c9b2c",
} as const;

const CAR_COLOURS = ["#ff5f5f", "#ffd84d", "#54e0ff", "#ff8fc6", "#c58cff", "#ff9d3c"];

/** One row of the board, painted before anything moving on it. */
export function drawRowBackground(
  ctx: CanvasRenderingContext2D,
  kind: "road" | "river" | "safe" | "home" | "start",
  x: number,
  y: number,
  w: number,
  h: number,
  row: number,
  time: number,
  reducedMotion: boolean,
): void {
  switch (kind) {
    case "road": {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(x, y, w, h);
      // Dashes on the boundary between lanes, not through the middle of one --
      // a line down the centre of a lane reads as somewhere you could stand.
      ctx.fillStyle = PALETTE.roadLine;
      for (let dx = 0; dx < w; dx += 22) {
        ctx.fillRect(x + dx, y + h - 1, 12, 1.5);
      }
      break;
    }
    case "river": {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(x, y, w, h);
      // Slow horizontal glints so the water reads as moving even where there
      // is no log on screen to give it away.
      ctx.fillStyle = PALETTE.waterGlint;
      const drift = reducedMotion ? 0 : (time * 14 + row * 37) % (w + 60);
      for (let i = -1; i < 3; i += 1) {
        ctx.fillRect(x + ((drift + i * 120) % (w + 60)) - 30, y + h * 0.35, 26, 1.5);
        ctx.fillRect(x + ((drift + i * 120 + 60) % (w + 60)) - 30, y + h * 0.7, 16, 1.5);
      }
      break;
    }
    case "safe":
    case "start": {
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PALETTE.grassLight;
      for (let dx = 4; dx < w; dx += 13) {
        ctx.fillRect(x + dx, y + h * 0.55, 2, 3);
        ctx.fillRect(x + dx + 5, y + h * 0.3, 2, 4);
      }
      break;
    }
    case "home": {
      ctx.fillStyle = PALETTE.home;
      ctx.fillRect(x, y, w, h);
      break;
    }
  }
}

/** A burrow at the top of the board -- the thing you're crossing to reach. */
export function drawBurrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  filled: boolean,
  time: number,
  reducedMotion: boolean,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  if (filled) {
    // A frog already home: same silhouette as the player's, so "that's me,
    // safe" needs no explaining.
    drawFrog(ctx, 0, 0, size * 0.62, "up", 0, false);
  } else {
    const pulse = reducedMotion ? 0 : Math.sin(time * 2.4 + cx) * 0.06;
    ctx.fillStyle = PALETTE.homeOpen;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * (0.52 + pulse), size * (0.42 + pulse), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.homeOpen;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.44, size * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The frog.
 *
 * `hop` is 0..1 through a jump and is used to squash and stretch: flattened as
 * it launches, stretched at the top, flattened again on landing. That alone is
 * most of what makes a stepped move feel like a hop rather than a teleport.
 */
export function drawFrog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  facing: "up" | "down" | "left" | "right",
  hop: number,
  dizzy: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);

  const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[facing];
  ctx.rotate(angle);

  // Squash at the ends of the hop, stretch through the middle.
  const arc = Math.sin(hop * Math.PI);
  const stretch = 1 + arc * 0.22;
  const squash = 1 - arc * 0.12;
  ctx.scale(squash, stretch);

  const s = size / 2;

  // Back legs, splayed wider mid-hop.
  ctx.fillStyle = PALETTE.frogDark;
  const legOut = 0.62 + arc * 0.3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * legOut, s * 0.42, s * 0.3, s * 0.46, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Front feet.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.5, -s * 0.52, s * 0.2, s * 0.3, side * -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body.
  ctx.fillStyle = PALETTE.frog;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.72, s * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes on top of the head, the way a frog's actually sit.
  for (const side of [-1, 1]) {
    ctx.fillStyle = PALETTE.frog;
    ctx.beginPath();
    ctx.arc(side * s * 0.36, -s * 0.62, s * 0.26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0d1b0a";
    if (dizzy) {
      // X eyes: bumped, not gruesome. Nothing in this arcade dies.
      ctx.strokeStyle = "#0d1b0a";
      ctx.lineWidth = Math.max(1, s * 0.09);
      const e = s * 0.13;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.36 - e, -s * 0.62 - e);
      ctx.lineTo(side * s * 0.36 + e, -s * 0.62 + e);
      ctx.moveTo(side * s * 0.36 + e, -s * 0.62 - e);
      ctx.lineTo(side * s * 0.36 - e, -s * 0.62 + e);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(side * s * 0.36, -s * 0.66, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/** Whatever is riding in a lane -- a vehicle to dodge or a platform to ride. */
export function drawOccupant(
  ctx: CanvasRenderingContext2D,
  lane: Lane,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  switch (lane.occupant) {
    case "car":
      drawCar(ctx, x, y, w, h, lane.variant, lane.dir);
      break;
    case "truck":
      drawTruck(ctx, x, y, w, h, lane.dir);
      break;
    case "log":
      drawLog(ctx, x, y, w, h);
      break;
    case "turtle":
      drawTurtles(ctx, x, y, w, h);
      break;
  }
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: number,
  dir: 1 | -1,
): void {
  const pad = h * 0.16;
  const body = CAR_COLOURS[variant % CAR_COLOURS.length]!;

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x, y + pad, w, h - pad * 2, Math.min(6, h * 0.22));
  ctx.fill();

  // Windscreen at the leading end, so which way it's going is readable when
  // the thing is only a few pixels wide.
  ctx.fillStyle = "rgba(10,18,30,0.65)";
  const glassW = w * 0.3;
  ctx.beginPath();
  ctx.roundRect(
    dir > 0 ? x + w - glassW - w * 0.1 : x + w * 0.1,
    y + pad + h * 0.12,
    glassW,
    h - pad * 2 - h * 0.24,
    2,
  );
  ctx.fill();

  // Headlights, likewise on the leading edge.
  ctx.fillStyle = "rgba(255,246,190,0.9)";
  const lx = dir > 0 ? x + w - 2.5 : x + 0.5;
  ctx.fillRect(lx, y + pad + 1.5, 2, 2);
  ctx.fillRect(lx, y + h - pad - 3.5, 2, 2);
}

function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: 1 | -1,
): void {
  const pad = h * 0.12;
  const cabW = w * 0.28;
  const cabX = dir > 0 ? x + w - cabW : x;

  // Trailer.
  ctx.fillStyle = "#cfd6e4";
  ctx.beginPath();
  ctx.roundRect(dir > 0 ? x : x + cabW, y + pad, w - cabW, h - pad * 2, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,26,38,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cab.
  ctx.fillStyle = "#e0553c";
  ctx.beginPath();
  ctx.roundRect(cabX, y + pad * 0.6, cabW, h - pad * 1.2, 3);
  ctx.fill();
}

function drawLog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pad = h * 0.18;
  ctx.fillStyle = "#6b4526";
  ctx.beginPath();
  ctx.roundRect(x, y + pad, w, h - pad * 2, (h - pad * 2) / 2);
  ctx.fill();

  // Grain, so a long log doesn't read as a flat brown bar.
  ctx.strokeStyle = "rgba(40,24,12,0.5)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const gx = x + (w * i) / 4;
    ctx.beginPath();
    ctx.moveTo(gx, y + pad + 2);
    ctx.lineTo(gx, y + h - pad - 2);
    ctx.stroke();
  }

  // End rings.
  ctx.fillStyle = "#8a5c33";
  ctx.beginPath();
  ctx.ellipse(x + 2, y + h / 2, 2, (h - pad * 2) / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTurtles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  // Drawn as a row of shells rather than one long platform, so it's visibly a
  // different kind of thing from a log even at a glance.
  const count = Math.max(1, Math.round(w / (h * 0.9)));
  const each = w / count;

  for (let i = 0; i < count; i += 1) {
    const cx = x + each * (i + 0.5);
    const cy = y + h / 2;
    const r = Math.min(each, h) * 0.38;

    ctx.fillStyle = "#3f8f5a";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2c6b42";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Head, pointing the way the lane travels.
    ctx.fillStyle = "#3f8f5a";
    ctx.beginPath();
    ctx.arc(cx, cy - r * 1.15, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cabinet marquee art for the arcade menu. */
export function drawCrossingIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  const scale = size / 32;
  ctx.save();
  ctx.scale(scale, scale);

  // A strip of road with a frog mid-hop across it.
  ctx.fillStyle = PALETTE.road;
  ctx.fillRect(0, 8, 32, 16);
  ctx.fillStyle = PALETTE.roadLine;
  for (let x = 1; x < 32; x += 8) ctx.fillRect(x, 15.5, 5, 1.2);

  ctx.fillStyle = "#ff5f5f";
  ctx.beginPath();
  ctx.roundRect(2, 9.5, 9, 5, 2);
  ctx.fill();

  ctx.fillStyle = "#54e0ff";
  ctx.beginPath();
  ctx.roundRect(21, 17.5, 9, 5, 2);
  ctx.fill();

  drawFrog(ctx, 16, 16, 13, "up", 0.5, false);

  ctx.restore();
}

/** The "lives remaining" pip: a little frog rather than the default ship. */
export function drawFrogLifeIcon(
  ctx: CanvasRenderingContext2D,
  highContrast: boolean,
): void {
  if (highContrast) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  drawFrog(ctx, 0, 0, 11, "up", 0, false);
}

export function occupantLabel(occupant: Occupant): string {
  return occupant;
}

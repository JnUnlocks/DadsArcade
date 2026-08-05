/**
 * All drawing for Nathan's Mallard Challenge.
 *
 * Vector art, same technique as Starfighter -- no image assets. The dog is a
 * deliberate blend: the classic NES Duck Hunt beats (idle, flush, mocking
 * laugh, proud retrieve) drawn with this family's actual dog's markings --
 * tan/gold coat, cream muzzle and chest, upright pointed ears (not the
 * original's floppy ones), and a collar with a little blue tag.
 */

import type { DogPose } from "./types";

export const PALETTE = {
  sky: "#bfe3f2",
  skyHorizon: "#e8f3d8",
  hill: "#5a8a4a",
  grass: "#6fae52",
  grassDark: "#4d8a3c",
  brush: "#3d6e30",
  duckHead: "#2f5233",
  duckBody: "#6b4a35",
  duckBodyLight: "#8a6448",
  duckRing: "#f4efe4",
  duckBill: "#d99a2b",
  dogTan: "#c99a56",
  dogTanDark: "#b5843e",
  dogCream: "#f3e3c4",
  dogNose: "#2a2015",
  collar: "#5a3a24",
  collarTag: "#4aa8e0",
  crosshair: "#ff4d4d",
  shell: "#e0a53c",
  shellDark: "#8a5a1c",
} as const;

// ---------- Background ----------

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grassTop: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, grassTop);
  sky.addColorStop(0, PALETTE.sky);
  sky.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, grassTop);

  // Soft distant tree line so the horizon isn't a hard edge.
  ctx.fillStyle = PALETTE.hill;
  ctx.beginPath();
  ctx.moveTo(0, grassTop);
  for (let x = 0; x <= w; x += 30) {
    ctx.lineTo(x, grassTop - 10 - Math.sin(x * 0.05) * 6);
  }
  ctx.lineTo(w, grassTop);
  ctx.closePath();
  ctx.fill();

  const grass = ctx.createLinearGradient(0, grassTop, 0, h);
  grass.addColorStop(0, PALETTE.grass);
  grass.addColorStop(1, PALETTE.grassDark);
  ctx.fillStyle = grass;
  ctx.fillRect(0, grassTop, w, h - grassTop);

  // A blade texture, cheap and just enough to read as grass, not a flat block.
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let x = 4; x < w; x += 9) {
    const y = grassTop + ((x * 37) % 14);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 7);
    ctx.stroke();
  }
}

/** The brush clump the dog stands in front of and flushes ducks from. */
export function drawBrush(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = PALETTE.brush;
  for (const [dx, r] of [
    [-26, 16],
    [-8, 22],
    [12, 18],
    [28, 14],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(dx, 0, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Duck ----------

export function drawDuck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  flapPhase: number,
  falling: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (falling) ctx.rotate(Math.PI * 0.18 * Math.sign(vx || 1));
  // Face the direction of travel.
  const facingLeft = vx < 0;
  ctx.scale(facingLeft ? -1 : 1, 1);

  // Body.
  ctx.fillStyle = PALETTE.duckBody;
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.duckBodyLight;
  ctx.beginPath();
  ctx.ellipse(-2, 5, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck ring + head (the mallard identifier).
  ctx.fillStyle = PALETTE.duckRing;
  ctx.beginPath();
  ctx.ellipse(7, -2, 3, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.duckHead;
  ctx.beginPath();
  ctx.ellipse(9, -6, 6, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.duckBill;
  ctx.beginPath();
  ctx.ellipse(15, -5, 3.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings, flapping.
  const flap = Math.sin(flapPhase);
  ctx.fillStyle = PALETTE.duckBodyLight;
  ctx.save();
  ctx.translate(-2, 0);
  ctx.rotate(flap * 0.9 - 0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ---------- The dog ----------

/**
 * Shared body -- the tan coat, cream chest, and collar every pose starts
 * from. Individual poses transform/add to this rather than redrawing it.
 */
/**
 * Everything is outlined. Flat tan fills on flat green grass blur into a
 * single lump at small sizes -- the dark keyline is what actually makes the
 * dog readable in motion.
 */
const OUTLINE = "#4a3620";

function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 1.3): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawDogBody(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.ellipse(0, 5, 15, 9, 0, 0, Math.PI * 2);
  outlined(ctx, PALETTE.dogTan);
  // Cream chest/belly patch, the light marking the reference photo has.
  ctx.beginPath();
  ctx.ellipse(-2, 9, 8.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.dogCream;
  ctx.fill();
}

interface HeadOptions {
  /** Where the head sits relative to the body origin. */
  x?: number;
  y?: number;
  /** Head tilt, radians. Negative throws it back -- the laugh. */
  rotate?: number;
  earTilt?: number;
  /** 0 = closed, 1 = wide open. */
  mouthOpen?: number;
}

function drawDogHead(ctx: CanvasRenderingContext2D, opts: HeadOptions = {}): void {
  const {
    x = 10,
    y = -7,
    rotate = 0,
    earTilt = 0.08,
    mouthOpen = 0,
  } = opts;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);

  // Ears first so they tuck behind the skull.
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * 3.5, -5);
    ctx.rotate(side * earTilt);
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(side * 3.4, -9.5);
    ctx.lineTo(side * -2, -1);
    ctx.closePath();
    outlined(ctx, PALETTE.dogTanDark, 1.1);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2);
  outlined(ctx, PALETTE.dogTan);

  // Cream muzzle.
  ctx.beginPath();
  ctx.ellipse(5, 2.5, 5, 3.8, 0, 0, Math.PI * 2);
  outlined(ctx, PALETTE.dogCream, 1);

  if (mouthOpen > 0) {
    // Wide open, dark, with a tongue -- has to read at a glance.
    ctx.beginPath();
    ctx.ellipse(5.5, 5, 3.4, 1.6 + mouthOpen * 3.4, 0, 0, Math.PI * 2);
    outlined(ctx, "#3a1d18", 1);
    ctx.beginPath();
    ctx.ellipse(5.5, 6.5 + mouthOpen, 2, 1.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#e2757f";
    ctx.fill();
  } else {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2.5, 5);
    ctx.quadraticCurveTo(5, 6.6, 7.5, 5);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.ellipse(9.4, 1, 1.6, 1.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.dogNose;
  ctx.fill();

  // Eye -- a happy closed crescent when laughing, open otherwise.
  ctx.strokeStyle = PALETTE.dogNose;
  ctx.lineWidth = 1.2;
  if (mouthOpen > 0.4) {
    ctx.beginPath();
    ctx.arc(1.5, -1.5, 2, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(1.5, -1.5, 1.2, 1.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.dogNose;
    ctx.fill();
  }

  ctx.restore();
}

function drawCollar(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = PALETTE.collar;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(4, 2, 8, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = PALETTE.collarTag;
  ctx.beginPath();
  ctx.ellipse(2, 9, 1.6, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Four legs, animated by a walk-cycle phase. `lift` of 0 plants them.
 * They run well below the body ellipse (which spans to y=14) so they're
 * actually visible rather than buried behind it.
 */
function drawDogLegs(ctx: CanvasRenderingContext2D, phase: number, lift: number): void {
  const legs: Array<[number, number]> = [
    [-8, 0],
    [-3, Math.PI],
    [7, Math.PI * 0.6],
    [11, Math.PI * 1.6],
  ];
  for (const [lx, offset] of legs) {
    const swing = Math.sin(phase + offset) * lift;
    const footX = lx + swing * 3.5;
    const footY = 21 - Math.abs(swing) * 2.5;
    ctx.strokeStyle = PALETTE.dogTanDark;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lx, 9);
    ctx.lineTo(footX, footY);
    ctx.stroke();
    // Cream paw, matching the reference dog's light feet.
    ctx.beginPath();
    ctx.ellipse(footX, footY, 2.4, 1.8, 0, 0, Math.PI * 2);
    outlined(ctx, PALETTE.dogCream, 0.9);
  }
}

/**
 * A filled plume rather than a stroked line. As a line it read as a stray
 * stick poking out of the dog at an odd angle.
 */
function drawTail(
  ctx: CanvasRenderingContext2D,
  wag: number,
  raised: number,
): void {
  ctx.save();
  ctx.translate(-13, 3);
  ctx.rotate(-0.45 - raised * 0.05 + wag * 0.03);
  ctx.beginPath();
  ctx.moveTo(1, 4);
  ctx.quadraticCurveTo(-7, 0, -12, -9);
  ctx.quadraticCurveTo(-3, -3, 1, -3);
  ctx.closePath();
  outlined(ctx, PALETTE.dogTanDark, 1.1);
  ctx.restore();
}

/** A tuft of cover, drawn in front of the dog so he reads as hidden in it. */
export function drawGrassTuft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = PALETTE.brush;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.grassDark;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = -4; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 6, 2);
    ctx.lineTo(i * 6 + (i % 2 ? 3 : -3), -10 - (i % 3) * 3);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawDog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: DogPose,
  t: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  switch (pose) {
    case "walking": {
      const phase = t * 11;
      ctx.translate(0, Math.sin(phase * 2) * 0.8);
      drawDogLegs(ctx, phase, 1);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx);
      drawTail(ctx, Math.sin(phase) * 4, 0);
      break;
    }

    case "sniff": {
      // Nose to the ground, tail up and rigid -- the classic point.
      ctx.translate(0, 2);
      drawDogLegs(ctx, 0, 0);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, { x: 12, y: 0, rotate: 0.5, earTilt: 0.3 });
      drawTail(ctx, 0, 8);
      break;
    }

    case "leap": {
      // Springing into the brush. Body tilts up, legs tuck.
      ctx.rotate(-0.3);
      ctx.scale(1.05, 0.95);
      drawDogLegs(ctx, Math.PI / 2, 0.4);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, { earTilt: 0.35, mouthOpen: 0.45 });
      drawTail(ctx, 0, 6);
      break;
    }

    case "watching": {
      // In cover -- only the head and ears clear the grass, turning slightly
      // as if tracking the birds. Keeps him present without competing with
      // the ducks for attention.
      drawDogHead(ctx, {
        x: 0,
        y: -3,
        rotate: Math.sin(t * 1.4) * 0.14,
        earTilt: 0.05,
      });
      break;
    }

    case "laugh": {
      // The signature beat. The head is placed explicitly rather than by
      // rotating the whole body frame -- rotating swung it out of position
      // and the whole pose read as an indistinct lump.
      const shake = Math.sin(t * 20) * 1.6;
      ctx.translate(shake, 0);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, {
        x: 9,
        y: -13,
        rotate: -0.42,
        earTilt: -0.2,
        mouthOpen: 1,
      });
      // A paw thrown up -- the "pointing and laughing" read.
      ctx.beginPath();
      ctx.ellipse(17, -6, 3.4, 4.6, 0.7, 0, Math.PI * 2);
      outlined(ctx, PALETTE.dogTan, 1.1);
      // Little motion arcs, so the shake reads even in a still frame.
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.4;
      for (const r of [15, 19] as const) {
        ctx.beginPath();
        ctx.arc(9, -14, r, Math.PI * 1.15, Math.PI * 1.45);
        ctx.stroke();
      }
      drawTail(ctx, Math.sin(t * 16) * 5, 2);
      break;
    }

    case "retrieve": {
      const bob = Math.abs(Math.sin(t * 6)) * 1.5;
      ctx.translate(0, -bob);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, { y: -9, rotate: -0.12 });
      // The duck, held proudly.
      ctx.save();
      ctx.translate(19, -3);
      ctx.scale(0.6, 0.6);
      ctx.rotate(0.35);
      drawDuck(ctx, 0, 0, 1, 0, false);
      ctx.restore();
      drawTail(ctx, Math.sin(t * 14) * 5, 3);
      break;
    }
  }

  ctx.restore();
}

// ---------- HUD-adjacent bits owned by the game itself ----------

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  recoil: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  const r = 10 + recoil * 6;
  ctx.strokeStyle = PALETTE.crosshair;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r - 6, 0);
  ctx.lineTo(-r + 3, 0);
  ctx.moveTo(r - 3, 0);
  ctx.lineTo(r + 6, 0);
  ctx.moveTo(0, -r - 6);
  ctx.lineTo(0, -r + 3);
  ctx.moveTo(0, r - 3);
  ctx.lineTo(0, r + 6);
  ctx.stroke();
  ctx.restore();
}

export function drawScorePopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff6d8";
  ctx.font = '700 11px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A shotgun shell -- this game's "lives remaining" pip in the shared HUD. */
export function drawShellIcon(
  ctx: CanvasRenderingContext2D,
  highContrast: boolean,
): void {
  ctx.fillStyle = highContrast ? "#ffffff" : PALETTE.shell;
  ctx.beginPath();
  ctx.roundRect(-3, -6, 6, 9, 1.5);
  ctx.fill();
  ctx.fillStyle = highContrast ? "#cccccc" : PALETTE.shellDark;
  ctx.beginPath();
  ctx.roundRect(-3, 1, 6, 3.5, 1);
  ctx.fill();
}

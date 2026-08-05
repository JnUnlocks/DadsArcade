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
function drawDogBody(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PALETTE.dogTanDark;
  ctx.beginPath();
  ctx.ellipse(0, 6, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.dogTan;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cream chest/belly patch, the light marking the reference photo has.
  ctx.fillStyle = PALETTE.dogCream;
  ctx.beginPath();
  ctx.ellipse(-2, 8, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawDogHead(
  ctx: CanvasRenderingContext2D,
  earTilt: number,
  mouthOpen: number,
): void {
  ctx.save();
  ctx.translate(9, -6);

  ctx.fillStyle = PALETTE.dogTan;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Upright, pointed ears -- the defining departure from the floppy-eared
  // original, matching this dog specifically.
  ctx.fillStyle = PALETTE.dogTanDark;
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * 4, -6);
    ctx.rotate(side * earTilt);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * 3.2, -9);
    ctx.lineTo(side * -1.5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Cream muzzle.
  ctx.fillStyle = PALETTE.dogCream;
  ctx.beginPath();
  ctx.ellipse(4.5, 2, 4.5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.dogNose;
  ctx.beginPath();
  ctx.ellipse(8.3, 1, 1.4, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth -- closed line normally, open arc for the laugh.
  if (mouthOpen > 0) {
    ctx.beginPath();
    ctx.ellipse(4.5, 4.5, 2.6, 1.2 + mouthOpen * 2.2, 0, 0, Math.PI);
    ctx.fill();
  } else {
    ctx.strokeStyle = PALETTE.dogNose;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(2, 4.2);
    ctx.quadraticCurveTo(4.5, 5.6, 7, 4.2);
    ctx.stroke();
  }

  // Eye.
  ctx.fillStyle = PALETTE.dogNose;
  ctx.beginPath();
  ctx.ellipse(1, -1, 1, mouthOpen > 0 ? 0.4 : 1, 0, 0, Math.PI * 2);
  ctx.fill();

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

export function drawDog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: DogPose,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  switch (pose) {
    case "idle": {
      const bob = Math.sin(t * 2) * 0.6;
      ctx.translate(0, bob);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, 0.08, 0);
      // Tail, wagging.
      ctx.strokeStyle = PALETTE.dogTanDark;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-13, 4);
      ctx.quadraticCurveTo(-20, -2 + Math.sin(t * 8) * 4, -22, -8);
      ctx.stroke();
      break;
    }

    case "flush": {
      // Low, lunging toward the brush.
      ctx.translate(0, 3);
      ctx.rotate(-0.12);
      ctx.scale(1.1, 0.85);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, 0.25, 0);
      ctx.strokeStyle = PALETTE.dogTanDark;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-13, 4);
      ctx.lineTo(-19, -6);
      ctx.stroke();
      break;
    }

    case "laugh": {
      // The signature beat: head back, mouth wide, mocking.
      const rise = Math.min(1, t * 3);
      ctx.translate(0, -6 * rise);
      drawDogBody(ctx);
      drawCollar(ctx);
      ctx.save();
      ctx.rotate(-0.35 * rise);
      drawDogHead(ctx, -0.15, 0.9);
      ctx.restore();
      // A paw up near the mouth -- the "pointing and laughing" read.
      ctx.fillStyle = PALETTE.dogTan;
      ctx.beginPath();
      ctx.ellipse(14, -4 - 4 * rise, 3, 4, 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "retrieve": {
      const bob = Math.abs(Math.sin(t * 6)) * 1.5;
      ctx.translate(0, -bob);
      drawDogBody(ctx);
      drawCollar(ctx);
      drawDogHead(ctx, 0.1, 0);
      // The duck, held proudly.
      ctx.save();
      ctx.translate(15, 0);
      ctx.scale(0.55, 0.55);
      ctx.rotate(0.3);
      drawDuck(ctx, 0, 0, 1, 0, false);
      ctx.restore();
      ctx.strokeStyle = PALETTE.dogTanDark;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-13, 4);
      ctx.quadraticCurveTo(-20, -2 + Math.sin(t * 14) * 5, -22, -8);
      ctx.stroke();
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

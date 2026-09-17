/**
 * JB's Tower Trouble art, drawn at runtime like every other machine here.
 *
 * Based on the concept mockup: a night-time construction tower of red riveted
 * girders and yellow ladders, city lights and mountains behind, JB in his cap
 * and flannel, a crowned scrap robot throwing junk, and a golden good boy
 * waiting at the top.
 *
 * Everything that never moves -- sky, skyline, back wall, signs, ladders,
 * girders -- is painted once into an offscreen canvas and copied each frame.
 * Riveted girders with cross-bracing are hundreds of path operations, and
 * redrawing them sixty times a second is the kind of cost a mid-range phone
 * notices.
 */

import { Rng } from "../../core/rng.ts";
import {
  DOG,
  GIRDERS,
  girderY,
  JUNK_RADIUS,
  LADDERS,
  ladderBottomY,
  ladderTopY,
  ROBOT,
  WORLD_H,
  WORLD_W,
  type Junk,
  type Player,
} from "./level.ts";

export const PALETTE = {
  skyTop: "#0d0b26",
  skyMid: "#2a1d4f",
  skyGlow: "#b8493a",
  mountain: "#1b1a3e",
  city: "#101329",
  window: "#ffcf6e",
  wall: "#131c36",
  pipe: "#1c2b52",
  pipeLight: "#2a4079",
  girder: "#c43d2b",
  girderLight: "#ff6b47",
  girderDark: "#6e1f16",
  rivet: "#f3c4a0",
  ladder: "#f2c230",
  ladderDark: "#a97d17",
  sign: "#15223b",
  signEdge: "#46638f",
  signText: "#cfe0ff",
  lamp: "#ffd27a",
} as const;

// ----- The static scene -----

let sceneCache: HTMLCanvasElement | null = null;

/** Sky, skyline, tower wall, signs, ladders and girders, painted once. */
export function drawScene(ctx: CanvasRenderingContext2D): void {
  if (!sceneCache) sceneCache = paintScene();
  ctx.drawImage(sceneCache, 0, 0, WORLD_W, WORLD_H);
}

function paintScene(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const resolution = 2;
  canvas.width = WORLD_W * resolution;
  canvas.height = WORLD_H * resolution;
  const c = canvas.getContext("2d");
  if (!c) return canvas;
  c.scale(resolution, resolution);

  paintSky(c);
  paintTowerWall(c);
  paintSigns(c);
  paintLamps(c);
  paintBin(c);
  paintJeep(c);
  for (const ladder of LADDERS) paintLadder(c, ladder.x, ladderTopY(ladder), ladderBottomY(ladder));
  for (let i = 0; i < GIRDERS.length; i += 1) paintGirder(c, i);
  return canvas;
}

function paintSky(c: CanvasRenderingContext2D): void {
  const sky = c.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.55, PALETTE.skyMid);
  sky.addColorStop(1, PALETTE.skyGlow);
  c.fillStyle = sky;
  c.fillRect(0, 0, WORLD_W, WORLD_H);

  // A few stars, fixed by a seed so they don't reshuffle between builds.
  const rng = new Rng(7);
  c.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 40; i += 1) {
    c.fillRect(rng.range(0, WORLD_W), rng.range(0, 260), 1, 1);
  }

  // Mountains behind the city.
  c.fillStyle = PALETTE.mountain;
  c.beginPath();
  c.moveTo(0, 470);
  const peaks = [[40, 400], [90, 440], [150, 380], [210, 430], [270, 390], [330, 445], [360, 420]];
  for (const [x, y] of peaks) c.lineTo(x!, y!);
  c.lineTo(WORLD_W, WORLD_H);
  c.lineTo(0, WORLD_H);
  c.closePath();
  c.fill();

  // Snow caps.
  c.fillStyle = "rgba(210,225,255,0.35)";
  for (const [x, y] of [[150, 380], [270, 390], [40, 400]]) {
    c.beginPath();
    c.moveTo(x! - 9, y! + 10);
    c.lineTo(x!, y!);
    c.lineTo(x! + 9, y! + 10);
    c.closePath();
    c.fill();
  }

  // City skyline with lit windows.
  const city = new Rng(21);
  let x = 0;
  while (x < WORLD_W) {
    const w = city.range(16, 34);
    const h = city.range(40, 130);
    c.fillStyle = PALETTE.city;
    c.fillRect(x, WORLD_H - h, w, h);
    c.fillStyle = PALETTE.window;
    for (let wy = WORLD_H - h + 6; wy < WORLD_H - 6; wy += 7) {
      for (let wx = x + 3; wx < x + w - 3; wx += 6) {
        if (city.chance(0.3)) {
          c.globalAlpha = city.range(0.35, 0.9);
          c.fillRect(wx, wy, 2, 3);
        }
      }
    }
    c.globalAlpha = 1;
    x += w + city.range(1, 5);
  }

  // A tower crane on the right horizon.
  c.strokeStyle = "rgba(10,10,25,0.9)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(338, WORLD_H);
  c.lineTo(338, 470);
  c.moveTo(300, 474);
  c.lineTo(360, 474);
  c.moveTo(304, 474);
  c.lineTo(304, 500);
  c.stroke();
}

function paintTowerWall(c: CanvasRenderingContext2D): void {
  // The tower's dark back wall, framed between its outer columns.
  c.fillStyle = PALETTE.wall;
  c.globalAlpha = 0.86;
  c.fillRect(6, 70, WORLD_W - 12, 530);
  c.globalAlpha = 1;

  // Vertical pipes for depth.
  for (const px of [34, 104, 176, 236, 318]) {
    c.fillStyle = PALETTE.pipe;
    c.fillRect(px, 72, 9, 526);
    c.fillStyle = PALETTE.pipeLight;
    c.fillRect(px + 1, 72, 2, 526);
  }

  // Outer columns, the tower's frame.
  for (const col of [2, WORLD_W - 10]) {
    c.fillStyle = PALETTE.girderDark;
    c.fillRect(col, 60, 8, 540);
    c.fillStyle = PALETTE.girder;
    c.fillRect(col + 1, 60, 3, 540);
  }
}

/** A sign on the back wall: dark panel, lit edge, short lines of text. */
function sign(c: CanvasRenderingContext2D, x: number, y: number, w: number, lines: string[]): void {
  const h = 8 + lines.length * 9;
  c.fillStyle = PALETTE.sign;
  c.fillRect(x, y, w, h);
  c.strokeStyle = PALETTE.signEdge;
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.fillStyle = PALETTE.signText;
  c.font = "700 7px ui-monospace, Menlo, Consolas, monospace";
  c.textAlign = "center";
  c.textBaseline = "top";
  lines.forEach((line, i) => c.fillText(line, x + w / 2, y + 5 + i * 9));
}

function paintSigns(c: CanvasRenderingContext2D): void {
  // Placed in the open space between girders, clear of every ladder.
  sign(c, 196, 432, 62, ["WORK HARDER", "PLAY HIGHER"]);
  sign(c, 36, 262, 72, ["LADDERS LEAD", "TO BETTER", "PLACES"]);
  sign(c, 120, 516, 100, ["SMALL FIXES", "BIG ADVENTURES"]);

  // The arcade's own neon, in place of the mockup's old name.
  c.save();
  c.textAlign = "left";
  c.textBaseline = "top";
  c.shadowColor = "#ff5fae";
  c.shadowBlur = 8;
  c.fillStyle = "#ff8fc6";
  c.font = "700 9px ui-monospace, Menlo, Consolas, monospace";
  c.fillText("DAD'S ARCADE", 14, 16);
  c.restore();

  c.save();
  c.textAlign = "left";
  c.textBaseline = "top";
  c.shadowColor = "#ff6a3d";
  c.shadowBlur = 10;
  c.fillStyle = "#ffb35c";
  c.font = "900 17px ui-monospace, Menlo, Consolas, monospace";
  c.fillText("JB'S", 14, 28);
  c.fillStyle = "#e8f0ff";
  c.shadowColor = "#46e0ff";
  c.font = "900 13px ui-monospace, Menlo, Consolas, monospace";
  c.fillText("TOWER TROUBLE", 14, 46);
  c.restore();
}

function paintLamps(c: CanvasRenderingContext2D): void {
  // Hanging work lights under each girder, each with a soft pool of light.
  const spots: Array<[number, number]> = [
    [120, 170], [250, 180], [70, 262], [300, 256], [140, 340], [260, 350],
    [100, 425], [300, 420], [60, 508], [220, 512],
  ];
  for (const [x, y] of spots) {
    const glow = c.createRadialGradient(x, y + 4, 1, x, y + 4, 30);
    glow.addColorStop(0, "rgba(255,210,122,0.35)");
    glow.addColorStop(1, "rgba(255,210,122,0)");
    c.fillStyle = glow;
    c.fillRect(x - 30, y - 26, 60, 60);
    c.strokeStyle = "rgba(40,40,60,0.9)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y - 8);
    c.lineTo(x, y);
    c.stroke();
    c.fillStyle = PALETTE.lamp;
    c.beginPath();
    c.arc(x, y + 2, 2.5, 0, Math.PI * 2);
    c.fill();
  }
}

function paintBin(c: CanvasRenderingContext2D): void {
  // The scrap bin junk rolls into at the bottom-left.
  const x = 0;
  const y = 584;
  c.fillStyle = "#3b4a5c";
  c.fillRect(x, y, 30, 40);
  c.fillStyle = "#56697f";
  c.fillRect(x, y, 30, 4);
  c.fillRect(x, y + 18, 30, 2);
  c.fillStyle = "#cfe0ff";
  c.font = "700 6px ui-monospace, Menlo, Consolas, monospace";
  c.textAlign = "center";
  c.textBaseline = "top";
  c.fillText("SCRAP", x + 15, y + 26);
}

function paintJeep(c: CanvasRenderingContext2D): void {
  // JB's overland rig, parked below the tower.
  const x = 250;
  const y = 610;
  c.fillStyle = "#3f4a33";
  c.fillRect(x, y - 16, 70, 16);
  c.fillRect(x + 10, y - 28, 42, 13);
  c.fillStyle = "#1c2230";
  c.fillRect(x + 14, y - 25, 16, 8);
  c.fillRect(x + 33, y - 25, 16, 8);
  c.fillStyle = "#6b5a3a";
  c.fillRect(x + 8, y - 33, 46, 5); // roof rack
  c.fillStyle = "#0e0f14";
  for (const wx of [x + 14, x + 56]) {
    c.beginPath();
    c.arc(wx, y, 8, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#ffd27a";
  c.fillRect(x + 66, y - 12, 4, 4);
}

function paintLadder(c: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
  const half = 5;
  c.fillStyle = PALETTE.ladderDark;
  c.fillRect(x - half - 1, top, 2, bottom - top);
  c.fillRect(x + half - 1, top, 2, bottom - top);
  c.fillStyle = PALETTE.ladder;
  c.fillRect(x - half, top, 1, bottom - top);
  c.fillRect(x + half, top, 1, bottom - top);
  for (let y = top + 4; y < bottom - 1; y += 6) {
    c.fillRect(x - half, y, half * 2, 2);
  }
}

function paintGirder(c: CanvasRenderingContext2D, level: number): void {
  const g = GIRDERS[level]!;
  const depth = 9;

  // The beam: a sloped parallelogram, lit along its top edge.
  c.beginPath();
  c.moveTo(g.x1, g.y1);
  c.lineTo(g.x2, g.y2);
  c.lineTo(g.x2, g.y2 + depth);
  c.lineTo(g.x1, g.y1 + depth);
  c.closePath();
  c.fillStyle = PALETTE.girder;
  c.fill();

  c.strokeStyle = PALETTE.girderLight;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(g.x1, g.y1 + 0.75);
  c.lineTo(g.x2, g.y2 + 0.75);
  c.stroke();

  c.strokeStyle = PALETTE.girderDark;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(g.x1, g.y1 + depth - 0.5);
  c.lineTo(g.x2, g.y2 + depth - 0.5);
  c.stroke();

  // Cross-bracing along the web, like the mockup's riveted steel.
  c.strokeStyle = "rgba(110,31,22,0.9)";
  c.lineWidth = 1;
  const panel = 16;
  for (let x = g.x1; x + panel <= g.x2; x += panel) {
    const yA = girderY(level, x);
    const yB = girderY(level, x + panel);
    c.beginPath();
    c.moveTo(x, yA + 2.5);
    c.lineTo(x + panel, yB + depth - 2);
    c.moveTo(x, yA + depth - 2);
    c.lineTo(x + panel, yB + 2.5);
    c.stroke();
  }

  // Rivets.
  c.fillStyle = PALETTE.rivet;
  for (let x = g.x1 + 4; x < g.x2 - 2; x += 16) {
    const y = girderY(level, x);
    c.fillRect(x - 0.5, y + 2, 1.5, 1.5);
    c.fillRect(x - 0.5, y + depth - 3, 1.5, 1.5);
  }
}

// ----- JB -----

export interface PlayerLook {
  time: number;
  hurt: boolean;
  /** Blinks while invulnerable after a hit. */
  hidden: boolean;
  swinging: boolean;
}

/**
 * JB: white JB cap with a navy brim, brown beard, red flannel, blue jeans,
 * work boots, and a pack on his back. Drawn about 24 units tall with his feet
 * at (p.x, p.y).
 */
export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, look: PlayerLook): void {
  if (look.hidden) return;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  const f = p.facing;

  const walking = p.mode === "walk" && look.time % 1 !== 0;
  const stride = p.mode === "walk" ? Math.sin(look.time * 14) : 0;
  const climbing = p.mode === "climb";

  // Boots and legs.
  const legA = climbing ? Math.sin(look.time * 10) * 2 : stride * 2.5;
  const tuck = p.mode === "jump" ? 3 : 0;
  ctx.fillStyle = "#3563b8"; // jeans
  ctx.fillRect(-4 + legA * 0.3, -10 + tuck, 3, 7 - tuck);
  ctx.fillRect(1 - legA * 0.3, -10 + tuck, 3, 7 - tuck);
  ctx.fillStyle = "#7a4a26"; // boots
  ctx.fillRect(-5 + legA * 0.3, -3, 4, 3);
  ctx.fillRect(1 - legA * 0.3, -3, 4, 3);

  // Pack, behind him.
  if (!climbing) {
    ctx.fillStyle = "#6b5a3a";
    ctx.fillRect(-f * 7, -18, 4, 8);
  }

  // Flannel shirt with plaid lines.
  ctx.fillStyle = "#c8302e";
  ctx.fillRect(-5, -18, 10, 8);
  ctx.fillStyle = "#7a1b1b";
  ctx.fillRect(-5, -15, 10, 1);
  ctx.fillRect(-2, -18, 1, 8);
  ctx.fillRect(2, -18, 1, 8);

  // Arms: up the rungs when climbing, swinging a wrench when armed.
  ctx.fillStyle = "#c8302e";
  if (climbing) {
    const reach = Math.sin(look.time * 10) * 2;
    ctx.fillRect(-7, -24 + reach, 2, 7);
    ctx.fillRect(5, -24 - reach, 2, 7);
  } else {
    ctx.fillRect(f * 5, -17, 2, 6);
  }

  // Head: skin, beard on the lower half.
  ctx.fillStyle = "#e8b48a";
  ctx.fillRect(-4, -24, 8, 6);
  ctx.fillStyle = "#6b3f22";
  ctx.fillRect(-4, -21, 8, 3);
  if (!climbing) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(f * 1.5 - 0.5, -23, 1, 1);
  }

  // Cap: white crown with JB on it, navy brim facing the way he walks.
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(-4, -27, 8, 3);
  ctx.fillStyle = "#1f2f5c";
  if (climbing) ctx.fillRect(-5, -25, 10, 1);
  else ctx.fillRect(f > 0 ? 1 : -7, -25, 6, 1.5);
  if (!climbing) {
    ctx.fillStyle = "#d3302e";
    ctx.font = "700 3px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("JB", 0, -26.8);
  }

  if (look.swinging) drawWrench(ctx, f * 8, -16, f * (Math.sin(look.time * 18) * 0.9 + 0.3), 0.8);

  if (look.hurt) {
    // Dizzy stars: bumped, not hurt. Nothing in this arcade dies.
    ctx.fillStyle = "#ffd84d";
    for (let i = 0; i < 3; i += 1) {
      const a = look.time * 6 + (i * Math.PI * 2) / 3;
      ctx.fillRect(Math.cos(a) * 6 - 1, -30 + Math.sin(a) * 2, 2, 2);
    }
  }

  void walking;
  ctx.restore();
}

// ----- The robot -----

export type RobotPose = "idle" | "windup" | "throw";

/**
 * The Scrap King: a grey and yellow scrap robot with red eyes, a gold crown and
 * "SCRAP HAPPENS" on its chest plate. Stands on the top girder's closed end.
 */
export function drawRobot(
  ctx: CanvasRenderingContext2D,
  pose: RobotPose,
  holding: Junk["kind"] | null,
  time: number,
): void {
  const cx = (ROBOT.x1 + ROBOT.x2) / 2;
  const feet = girderY(ROBOT.level, cx);
  const bob = pose === "idle" ? Math.sin(time * 3) * 1 : 0;

  ctx.save();
  ctx.translate(cx, feet + bob);

  // Legs.
  ctx.fillStyle = "#4b5263";
  ctx.fillRect(-16, -14, 10, 14);
  ctx.fillRect(6, -14, 10, 14);
  ctx.fillStyle = "#d9a32f";
  ctx.fillRect(-17, -4, 12, 4);
  ctx.fillRect(5, -4, 12, 4);

  // Body.
  ctx.fillStyle = "#8a93a6";
  ctx.beginPath();
  ctx.roundRect(-24, -48, 48, 36, 6);
  ctx.fill();
  ctx.fillStyle = "#d9a32f";
  ctx.fillRect(-24, -48, 48, 5);
  ctx.fillRect(-24, -17, 48, 5);

  // Chest plate.
  ctx.fillStyle = "#5f6778";
  ctx.fillRect(-15, -39, 30, 16);
  ctx.fillStyle = "#e8eef8";
  ctx.font = "700 5px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("SCRAP", 0, -37);
  ctx.fillText("HAPPENS", 0, -30);

  // Head.
  ctx.fillStyle = "#8a93a6";
  ctx.fillRect(-11, -62, 22, 14);
  ctx.fillStyle = "#4b5263";
  ctx.fillRect(-11, -52, 22, 4);
  ctx.fillStyle = "#ff3b3b";
  ctx.shadowColor = "#ff3b3b";
  ctx.shadowBlur = 6;
  ctx.fillRect(-7, -58, 4, 3);
  ctx.fillRect(3, -58, 4, 3);
  ctx.shadowBlur = 0;

  // Crown.
  ctx.fillStyle = "#ffd84d";
  ctx.beginPath();
  ctx.moveTo(-8, -62);
  ctx.lineTo(-8, -69);
  ctx.lineTo(-4, -65);
  ctx.lineTo(0, -71);
  ctx.lineTo(4, -65);
  ctx.lineTo(8, -69);
  ctx.lineTo(8, -62);
  ctx.closePath();
  ctx.fill();

  // Arms: raised with junk overhead on the wind-up, swung out on the throw.
  ctx.fillStyle = "#4b5263";
  if (pose === "windup") {
    ctx.fillRect(-30, -74, 8, 30);
    ctx.fillRect(22, -74, 8, 30);
    if (holding) drawJunkShape(ctx, holding, 0, -80, 0);
  } else if (pose === "throw") {
    ctx.fillRect(-30, -44, 8, 20);
    ctx.save();
    ctx.translate(24, -44);
    ctx.rotate(-0.9);
    ctx.fillRect(0, -4, 22, 8);
    ctx.restore();
  } else {
    ctx.fillRect(-30, -46, 8, 24);
    ctx.fillRect(22, -46, 8, 24);
    // Idle: resting a red toolbox on one fist, as in the mockup.
    drawJunkShape(ctx, "toolbox", -28, -20, 0);
  }

  ctx.restore();
}

/** The "MORE JUNK FOR YOU!" shout. */
export function drawSpeech(ctx: CanvasRenderingContext2D, text: string, alpha: number): void {
  if (alpha <= 0) return;
  const x = ROBOT.x2 + 6;
  const y = 84;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "700 7px ui-monospace, Menlo, Consolas, monospace";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = "#0b0f1d";
  ctx.strokeStyle = "#ff4d4d";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, 16);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 15);
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 16);
  ctx.lineTo(x + 2, y + 22);
  ctx.lineTo(x + 12, y + 16);
  ctx.fill();
  ctx.fillStyle = "#ff6b6b";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y + 8.5);
  ctx.restore();
}

// ----- The good boy -----

/**
 * A golden dog sitting on the roof beside a red toolbox with a paw print.
 * Glows and wags hard once rescued.
 */
export function drawDog(ctx: CanvasRenderingContext2D, time: number, rescued: boolean): void {
  const x = DOG.x;
  const y = girderY(DOG.level, DOG.x);
  const wag = Math.sin(time * (rescued ? 22 : 7)) * (rescued ? 5 : 2.5);

  ctx.save();
  ctx.translate(x, y);

  if (rescued) {
    const glow = ctx.createRadialGradient(0, -12, 2, 0, -12, 34);
    glow.addColorStop(0, "rgba(255,216,77,0.55)");
    glow.addColorStop(1, "rgba(255,216,77,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-34, -46, 68, 68);
  }

  // Tail.
  ctx.strokeStyle = "#d9a24a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(6, -6);
  ctx.quadraticCurveTo(14, -10, 12 + wag * 0.4, -16 - Math.abs(wag) * 0.3);
  ctx.stroke();

  // Body, sitting.
  ctx.fillStyle = "#d9a24a";
  ctx.beginPath();
  ctx.ellipse(2, -7, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c77a";
  ctx.beginPath();
  ctx.ellipse(-2, -6, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head.
  ctx.fillStyle = "#d9a24a";
  ctx.beginPath();
  ctx.ellipse(-4, -17, 6, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9a6a2a";
  ctx.beginPath();
  ctx.ellipse(-1, -17, 2.5, 4.5, 0.3, 0, Math.PI * 2); // ear
  ctx.fill();
  ctx.fillStyle = "#f2c77a";
  ctx.beginPath();
  ctx.ellipse(-8, -15, 3, 2.5, 0, 0, Math.PI * 2); // muzzle
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-11, -16, 2, 2); // nose
  ctx.fillRect(-6, -19, 1.5, 1.5); // eye
  if (rescued) {
    ctx.fillStyle = "#ff6b8a";
    ctx.fillRect(-9, -13, 2, 3); // tongue out
  }

  ctx.restore();

  // The paw-print toolbox beside him.
  ctx.save();
  ctx.translate(x - 26, y);
  drawJunkShape(ctx, "toolbox", 0, -5, 0);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, -5, 1.4, 0, Math.PI * 2);
  ctx.arc(-2, -7.4, 0.8, 0, Math.PI * 2);
  ctx.arc(2, -7.4, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ----- Junk and the wrench -----

export function drawJunk(ctx: CanvasRenderingContext2D, j: Junk): void {
  drawJunkShape(ctx, j.kind, j.x, j.y - JUNK_RADIUS, j.spin);
}

function drawJunkShape(
  ctx: CanvasRenderingContext2D,
  kind: Junk["kind"],
  x: number,
  y: number,
  spin: number,
): void {
  const r = JUNK_RADIUS;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(kind === "paint" ? spin * 0.5 : spin);

  switch (kind) {
    case "tire": {
      ctx.fillStyle = "#16161b";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a3a46";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 2.5), Math.sin(a) * (r - 2.5));
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = "#8a8a96";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "spool": {
      ctx.fillStyle = "#c89a5a";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#26262d";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#44444f";
      ctx.lineWidth = 0.8;
      for (let k = 2; k < 6; k += 1.3) {
        ctx.beginPath();
        ctx.arc(0, 0, k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#8a6a3a";
      ctx.fillRect(-1.5, -1.5, 3, 3);
      break;
    }
    case "paint": {
      ctx.fillStyle = "#c9ced8";
      ctx.fillRect(-r * 0.7, -r, r * 1.4, r * 2);
      ctx.fillStyle = "#9aa1ae";
      ctx.fillRect(-r * 0.7, -r, r * 1.4, 2);
      ctx.fillStyle = "#d32f2f";
      ctx.fillRect(-r * 0.7, -2.5, r * 1.4, 5);
      ctx.fillRect(-2, 2.5, 2, 4); // drip
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 3px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PAINT", 0, 0);
      break;
    }
    case "toolbox": {
      ctx.fillStyle = "#d7342e";
      ctx.fillRect(-r, -r * 0.55, r * 2, r * 1.2);
      ctx.fillStyle = "#8f1f1b";
      ctx.fillRect(-r, -r * 0.55, r * 2, 2);
      ctx.strokeStyle = "#2a2a30";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, -r * 0.55);
      ctx.lineTo(-3, -r * 0.95);
      ctx.lineTo(3, -r * 0.95);
      ctx.lineTo(3, -r * 0.55);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** A steel wrench. `glow` > 0 when it's a pickup waiting to be grabbed. */
export function drawWrench(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale = 1,
  glow = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  if (glow > 0) {
    ctx.shadowColor = "#46e0ff";
    ctx.shadowBlur = 10 * glow;
  }
  ctx.fillStyle = "#cfd6e4";
  ctx.fillRect(-1.5, -2, 3, 14);
  ctx.beginPath();
  ctx.arc(0, -4, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(10,14,28,1)";
  ctx.fillRect(-1.5, -9, 3, 5);
  ctx.restore();
}

/** Hearts for the lives row, as in the mockup's HUD. */
export function drawHeartIcon(ctx: CanvasRenderingContext2D, highContrast: boolean): void {
  ctx.fillStyle = highContrast ? "#ffffff" : "#ff4d5e";
  ctx.beginPath();
  ctx.moveTo(0, 4.5);
  ctx.bezierCurveTo(-7, -1, -3.5, -6.5, 0, -2.5);
  ctx.bezierCurveTo(3.5, -6.5, 7, -1, 0, 4.5);
  ctx.closePath();
  ctx.fill();
}

/** Cabinet marquee art: JB on a ladder between two red girders, a tyre above. */
export function drawTowerIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);

  ctx.fillStyle = PALETTE.ladder;
  ctx.fillRect(12, 10, 1, 16);
  ctx.fillRect(19, 10, 1, 16);
  for (let y = 12; y < 26; y += 4) ctx.fillRect(12, y, 8, 1);

  ctx.fillStyle = PALETTE.girder;
  ctx.beginPath();
  ctx.moveTo(2, 7);
  ctx.lineTo(30, 10);
  ctx.lineTo(30, 13);
  ctx.lineTo(2, 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, 28);
  ctx.lineTo(30, 25);
  ctx.lineTo(30, 28);
  ctx.lineTo(2, 31);
  ctx.closePath();
  ctx.fill();

  const jb: Player = {
    x: 16, y: 24, level: 0, mode: "climb", ladder: 0, vx: 0, vy: 0, facing: 1, wrench: 0,
  };
  ctx.save();
  ctx.translate(16, 24);
  ctx.scale(0.7, 0.7);
  ctx.translate(-16, -24);
  drawPlayer(ctx, jb, { time: 0.4, hurt: false, hidden: false, swinging: false });
  ctx.restore();

  drawJunkShape(ctx, "tire", 24, 5, 0.6);
  ctx.restore();
}

/**
 * How Circuit Climb looks: JES COIL, the pads, and the city behind them.
 *
 * Pads are drawn in code so their tops are exactly where the physics thinks
 * they are. Each kind has its own shape as well as its own colour -- a relay
 * hangs a socket under the slab, a boost carries chevrons, a moving pad runs
 * on a rail, a brittle one is cracked -- so they can be told apart without
 * colour. The scenery is kept dim and has no flat ledges, so nothing behind
 * the pads looks like something to land on.
 */

import type { Pad } from "./level.ts";
import { ARENA_W } from "./tuning.ts";

export const FONT = "ui-monospace, Menlo, Consolas, monospace";

const CYAN = "#46e0ff";
const AMBER = "#ffb53d";
const VIOLET = "#a66bff";
const ORANGE = "#ff8a2a";

/** Slab thickness under the landing surface. */
const SLAB = 9;

// ----- JES COIL -----

export interface JesPose {
  /** Screen position of the feet. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0..1, how squashed after a landing (1 = just landed). */
  squash: number;
  /** -1, 0 or 1: which way he's being steered, for where he looks. */
  look: number;
  /** Seconds of happy eyes left after powering a relay. */
  joy: number;
}

/** JES, drawn from the feet up. About 46 units tall. */
export function drawJes(ctx: CanvasRenderingContext2D, pose: JesPose, highContrast = false): void {
  const { x, y, vx, vy, squash, look } = pose;
  // Stretched rising fast, squashed just after a landing.
  const stretch = Math.max(-0.12, Math.min(0.12, vy / 5000)) - squash * 0.22;
  const springH = Math.max(5, 12 * (1 + stretch * 2.2));
  const lean = Math.max(-0.2, Math.min(0.2, vx / 1200));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);

  // The foot.
  ctx.fillStyle = "#8a3d10";
  roundBox(ctx, -9, -4, 18, 5, 2.5);
  ctx.fill();
  ctx.fillStyle = "#c2561a";
  roundBox(ctx, -8, -5, 16, 3, 1.5);
  ctx.fill();

  // The spring.
  ctx.strokeStyle = "#c9d3e6";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  const turns = 4;
  for (let i = 0; i <= turns * 2; i += 1) {
    const sy = -5 - (springH * i) / (turns * 2);
    const sx = i % 2 === 0 ? -6 : 6;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // The body: an orange ball, squashed or stretched.
  const bodyY = -5 - springH - 14;
  ctx.save();
  ctx.translate(0, bodyY);
  ctx.scale(1 - stretch * 0.6, 1 + stretch);
  const shell = ctx.createRadialGradient(-5, -6, 2, 0, 0, 17);
  shell.addColorStop(0, "#ffc27a");
  shell.addColorStop(0.5, ORANGE);
  shell.addColorStop(1, "#b44e0f");
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = highContrast ? "#ffffff" : "#7a3008";
  ctx.lineWidth = highContrast ? 2 : 1.2;
  ctx.stroke();

  // A panel seam and a rivet.
  ctx.strokeStyle = "rgba(122,48,8,0.6)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(0, 2, 15, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = "#7a3008";
  ctx.beginPath();
  ctx.arc(10, 8, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // The ear: a cyan ring on the side he's not looking.
  const ear = look === 0 ? -1 : -look;
  ctx.fillStyle = "#cfd6e4";
  ctx.beginPath();
  ctx.arc(ear * 14, 1, 4.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(ear * 14, 1, 3, 0, Math.PI * 2);
  ctx.stroke();

  // The visor and the LED eyes, looking where he's going.
  const lookX = look * 3;
  ctx.fillStyle = "#0b1022";
  roundBox(ctx, -10 + lookX, -7, 20, 12, 5);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#7ff6ff";
  if (pose.joy > 0) {
    ctx.strokeStyle = "#7ff6ff";
    ctx.lineWidth = 1.8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(lookX + side * 4.2, 0.5, 2.6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else {
    for (const side of [-1, 1]) {
      roundBox(ctx, lookX + side * 4.2 - 1.7, -4, 3.4, 7, 1.7);
      ctx.fill();
    }
  }
  ctx.restore();

  // Shine.
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(-7, -10, 4, 2.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The antenna, which lags a little behind the body.
  const tip = bodyY - 16 * (1 + stretch) - 9;
  const sway = -vx / 90;
  ctx.strokeStyle = "#5b6378";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(1, bodyY - 15 * (1 + stretch));
  ctx.lineTo(1 + sway, tip);
  ctx.stroke();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(1 + sway, tip, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** The cyan streak he leaves rising off a pad. `points` are screen positions, oldest first. */
export function drawTrail(ctx: CanvasRenderingContext2D, points: ReadonlyArray<{ x: number; y: number }>): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const k = i / points.length;
    ctx.strokeStyle = `rgba(70,224,255,${0.5 * k})`;
    ctx.lineWidth = 1 + 4 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ----- Pads -----

/** Draw a pad whose landing surface is at screen (x, y). */
export function drawPad(
  ctx: CanvasRenderingContext2D,
  pad: Pad,
  x: number,
  y: number,
  clock: number,
  calm: boolean,
): void {
  const w = pad.w;
  const left = x - w / 2;

  if (pad.kind === "ground") {
    drawRooftop(ctx, y);
    return;
  }

  if (pad.kind === "moving") {
    // The rail it runs on, end to end.
    ctx.save();
    ctx.strokeStyle = "rgba(124,236,255,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.baseX - pad.swing - w / 2, y + SLAB / 2);
    ctx.lineTo(pad.baseX + pad.swing + w / 2, y + SLAB / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(124,236,255,0.5)";
    for (const end of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(pad.baseX + end * (pad.swing + w / 2), y + SLAB / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const edge =
    pad.kind === "boost" ? VIOLET : pad.kind === "relay" && pad.powered ? AMBER : pad.kind === "brittle" ? "#ff9a6b" : CYAN;

  // Underglow.
  ctx.save();
  const glow = ctx.createLinearGradient(0, y + SLAB, 0, y + SLAB + 12);
  glow.addColorStop(0, pad.kind === "boost" ? "rgba(166,107,255,0.35)" : "rgba(255,181,61,0.3)");
  glow.addColorStop(1, "rgba(255,181,61,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(left + 8, y + SLAB, w - 16, 12);
  ctx.restore();

  // The slab.
  const body = ctx.createLinearGradient(0, y, 0, y + SLAB);
  body.addColorStop(0, pad.kind === "boost" ? "#3b2470" : "#2c3160");
  body.addColorStop(1, pad.kind === "boost" ? "#22154a" : "#191c3c");
  ctx.fillStyle = body;
  ctx.beginPath();
  roundBox(ctx, left, y, w, SLAB, 3);
  ctx.fill();

  if (pad.kind === "brittle") {
    // Cracks, and a broken outline.
    ctx.save();
    ctx.strokeStyle = "rgba(255,154,107,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const crack = (cx: number) => {
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + 4, y + 4);
      ctx.lineTo(cx - 2, y + SLAB);
    };
    crack(left + w * 0.3);
    crack(left + w * 0.62);
    ctx.stroke();
    ctx.setLineDash([7, 4]);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 2, y);
    ctx.lineTo(left + w - 2, y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Circuit traces on the face.
  ctx.save();
  ctx.strokeStyle = "rgba(70,224,255,0.4)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(left + 8, y + 5);
  ctx.lineTo(left + w * 0.3, y + 5);
  ctx.lineTo(left + w * 0.34, y + 3);
  ctx.lineTo(left + w * 0.5, y + 3);
  ctx.moveTo(left + w * 0.6, y + 6);
  ctx.lineTo(left + w - 10, y + 6);
  ctx.stroke();
  ctx.restore();

  // The landing edge: a bright line along the top.
  ctx.save();
  ctx.shadowColor = edge;
  ctx.shadowBlur = calm ? 4 : 8;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(left + 2, y + 0.5);
  ctx.lineTo(left + w - 2, y + 0.5);
  ctx.stroke();
  ctx.restore();

  if (pad.kind === "boost") {
    // Chevrons, pointing up.
    const lift = calm ? 0 : (clock * 14) % 6;
    ctx.save();
    ctx.strokeStyle = "#d9b8ff";
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < 2; i += 1) {
      const cy = y - 6 - i * 7 - lift;
      ctx.globalAlpha = 1 - i * 0.35;
      ctx.beginPath();
      ctx.moveTo(x - 9, cy + 4);
      ctx.lineTo(x, cy - 3);
      ctx.lineTo(x + 9, cy + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (pad.kind === "moving") {
    ctx.fillStyle = "rgba(124,236,255,0.8)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * (w / 2 - 6), y + 4.5);
      ctx.lineTo(x + side * (w / 2 - 11), y + 1.8);
      ctx.lineTo(x + side * (w / 2 - 11), y + 7.2);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (pad.kind === "relay") {
    // A socket hanging under the slab. Dark until he lands on it.
    const cy = y + SLAB + 7;
    ctx.save();
    ctx.fillStyle = "#3a3f63";
    ctx.fillRect(x - 2, y + SLAB - 1, 4, 4);
    ctx.fillStyle = "#23274a";
    ctx.beginPath();
    ctx.arc(x, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    if (pad.powered) {
      ctx.shadowColor = AMBER;
      ctx.shadowBlur = calm ? 6 : 10 + 4 * Math.sin(clock * 5);
    }
    ctx.strokeStyle = pad.powered ? AMBER : "#5b6382";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, cy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    // A bolt in the middle.
    ctx.fillStyle = pad.powered ? "#ffe2a3" : "#5b6382";
    ctx.beginPath();
    ctx.moveTo(x + 1, cy - 4);
    ctx.lineTo(x - 2.5, cy + 0.5);
    ctx.lineTo(x, cy + 0.5);
    ctx.lineTo(x - 1, cy + 4);
    ctx.lineTo(x + 2.5, cy - 0.5);
    ctx.lineTo(x, cy - 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Where the climb starts: a rooftop, edge to edge. */
function drawRooftop(ctx: CanvasRenderingContext2D, y: number): void {
  const roof = ctx.createLinearGradient(0, y, 0, y + 60);
  roof.addColorStop(0, "#2c2f5c");
  roof.addColorStop(1, "#141633");
  ctx.fillStyle = roof;
  ctx.fillRect(0, y, ARENA_W, 400);
  // Hazard stripes along the edge, and the edge itself.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y + 4, ARENA_W, 7);
  ctx.clip();
  for (let x = -20; x < ARENA_W + 20; x += 16) {
    ctx.fillStyle = "#ffb53d";
    ctx.beginPath();
    ctx.moveTo(x, y + 11);
    ctx.lineTo(x + 8, y + 4);
    ctx.lineTo(x + 14, y + 4);
    ctx.lineTo(x + 6, y + 11);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, y + 0.5);
  ctx.lineTo(ARENA_W, y + 0.5);
  ctx.stroke();
  ctx.restore();
  // Rooftop clutter below the edge: a vent and a lit door.
  ctx.fillStyle = "#1e2147";
  ctx.fillRect(30, y + 22, 54, 26);
  ctx.fillStyle = "rgba(255,181,61,0.8)";
  ctx.fillRect(268, y + 20, 22, 30);
}

/** A pad breaking: two halves falling away. `t` is seconds since. */
export function drawBreak(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number): void {
  const drop = 260 * t * t;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t * 1.6);
  ctx.fillStyle = "#3a2b3d";
  ctx.strokeStyle = "#ff9a6b";
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * (w / 4 + 30 * t), y + drop);
    ctx.rotate(side * t * 2.2);
    ctx.beginPath();
    roundBox(ctx, -w / 4, 0, w / 2, SLAB, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ----- The city -----

interface Sky {
  top: string;
  bottom: string;
}

const SKIES: readonly Sky[] = [
  { top: "#1b1450", bottom: "#3a2160" },
  { top: "#120f3a", bottom: "#2b1a55" },
  { top: "#03040e", bottom: "#0b1030" },
];

/** A stable pseudo-random number from an integer, for scenery that doesn't move when you look again. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * The scenery for a camera at `cameraY` (world height at the bottom of the
 * screen). `zoneMix` is a smooth 0..2 across the three districts.
 */
export function drawScenery(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cameraY: number,
  zoneMix: number,
  clock: number,
  calm: boolean,
): void {
  const zone = Math.min(1, Math.floor(zoneMix));
  const t = Math.min(1, zoneMix - zone);
  const a = SKIES[zone]!;
  const b = SKIES[Math.min(2, zone + 1)]!;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, mix(a.top, b.top, t));
  sky.addColorStop(1, mix(a.bottom, b.bottom, t));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const space = Math.max(0, zoneMix - 1);
  if (space > 0) drawStars(ctx, w, h, cameraY, space, clock, calm);

  const city = Math.max(0, 1 - Math.max(0, zoneMix - 1.4) * 1.8);
  if (city > 0) drawSkyline(ctx, w, h, cameraY, city, zoneMix, clock, calm);
  if (zoneMix > 1.3) drawStation(ctx, w, h, cameraY, Math.min(1, (zoneMix - 1.3) * 1.5), clock, calm);

  drawPillars(ctx, w, h, cameraY, zoneMix);
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cameraY: number,
  amount: number,
  clock: number,
  calm: boolean,
): void {
  const drift = cameraY * 0.05;
  ctx.save();
  for (let i = 0; i < 70; i += 1) {
    const x = hash(i * 3) * w;
    const y = (hash(i * 3 + 1) * h * 1.5 + drift) % h;
    const twinkle = calm ? 1 : 0.6 + 0.4 * Math.sin(clock * 2 + i);
    ctx.globalAlpha = amount * twinkle * (0.3 + 0.7 * hash(i * 3 + 2));
    ctx.fillStyle = "#dfe8ff";
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.restore();
}

/** Far towers, lit windows, and in the antenna district masts and dishes. Slow parallax. */
function drawSkyline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cameraY: number,
  amount: number,
  zoneMix: number,
  clock: number,
  calm: boolean,
): void {
  const scroll = cameraY * 0.12;
  const band = 260;
  const first = Math.floor(scroll / band) - 1;
  ctx.save();
  ctx.globalAlpha = amount * 0.85;
  for (let row = first; row < first + Math.ceil(h / band) + 3; row += 1) {
    const baseY = h - (row * band - scroll);
    for (let i = 0; i < 4; i += 1) {
      const seed = row * 17 + i;
      const tw = 30 + hash(seed) * 40;
      const x = (i / 4) * w + hash(seed + 5) * 40 - 10;
      const tall = 120 + hash(seed + 9) * 160;
      ctx.fillStyle = zoneMix < 1 ? "rgba(34,26,82,0.9)" : "rgba(28,22,70,0.9)";
      ctx.fillRect(x, baseY - tall, tw, tall + band);
      // Windows.
      for (let wy = baseY - tall + 8; wy < baseY + band - 8; wy += 12) {
        for (let wx = x + 5; wx < x + tw - 6; wx += 9) {
          const lit = hash(Math.floor(wx * 7 + wy * 13 + seed));
          if (lit < 0.62) continue;
          ctx.fillStyle = lit > 0.9 ? "rgba(255,90,200,0.55)" : lit > 0.8 ? "rgba(70,224,255,0.45)" : "rgba(255,181,61,0.3)";
          ctx.fillRect(wx, wy, 4, 5);
        }
      }
      // The antenna district puts masts on the roofs.
      if (zoneMix > 0.5 && hash(seed + 21) > 0.4) {
        ctx.strokeStyle = "rgba(90,80,150,0.9)";
        ctx.lineWidth = 2;
        const mx = x + tw / 2;
        ctx.beginPath();
        ctx.moveTo(mx, baseY - tall);
        ctx.lineTo(mx, baseY - tall - 40);
        ctx.stroke();
        const blink = calm || Math.sin(clock * 3 + seed) > 0;
        ctx.fillStyle = blink ? "rgba(255,70,90,0.9)" : "rgba(255,70,90,0.25)";
        ctx.beginPath();
        ctx.arc(mx, baseY - tall - 41, 2.2, 0, Math.PI * 2);
        ctx.fill();
        if (hash(seed + 33) > 0.5) {
          ctx.strokeStyle = "rgba(166,107,255,0.6)";
          ctx.beginPath();
          ctx.arc(mx + 10, baseY - tall - 18, 10, Math.PI * 0.1, Math.PI * 0.9);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

/** The orbital station, far off, with Earth below it. */
function drawStation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cameraY: number,
  amount: number,
  clock: number,
  calm: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = amount;
  // Earth's edge along the bottom.
  const earth = ctx.createRadialGradient(w / 2, h + 520, 400, w / 2, h + 520, 600);
  earth.addColorStop(0, "#1f6fd0");
  earth.addColorStop(0.92, "#3fa0ff");
  earth.addColorStop(1, "rgba(120,200,255,0)");
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(w / 2, h + 520, 600, 0, Math.PI * 2);
  ctx.fill();

  // The station's ring, slowly turning, drifting with the climb.
  const cy = h * 0.35 + ((cameraY * 0.03) % 80);
  const turn = calm ? 0 : clock * 0.2;
  ctx.translate(w * 0.68, cy);
  ctx.strokeStyle = "rgba(160,170,200,0.55)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 20, -0.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,181,61,0.6)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const a = turn + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 62 * Math.cos(-0.25), Math.sin(a) * 20, 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(150,160,190,0.7)";
  ctx.fillRect(-5, -36, 10, 72);
  ctx.restore();
}

/** Girders up both sides, a little faster than the far city. */
function drawPillars(ctx: CanvasRenderingContext2D, w: number, h: number, cameraY: number, zoneMix: number): void {
  const scroll = cameraY * 0.45;
  const panel = 90;
  ctx.save();
  const tint = zoneMix > 1.5 ? "rgba(70,78,110,0.55)" : "rgba(44,36,96,0.75)";
  for (const side of [0, 1]) {
    const x = side === 0 ? 0 : w - 14;
    ctx.fillStyle = tint;
    ctx.fillRect(x, 0, 14, h);
    const first = Math.floor(scroll / panel) - 1;
    for (let i = first; i < first + Math.ceil(h / panel) + 2; i += 1) {
      const y = h - (i * panel - scroll);
      ctx.fillStyle = hash(i * 2 + side) > 0.5 ? "rgba(255,181,61,0.55)" : "rgba(70,224,255,0.4)";
      ctx.fillRect(x + 4, y - 30, 6, 20);
      ctx.strokeStyle = "rgba(20,16,50,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14, y - panel / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * The block of the city a relay powers, behind the far wall from it: dark
 * windows until JES lands on the relay, then lit, glowing amber.
 */
export function drawDistrict(
  ctx: CanvasRenderingContext2D,
  pad: Pad,
  x: number,
  y: number,
  litFor: number,
  calm: boolean,
): void {
  const onLeft = x > ARENA_W / 2;
  const bx = onLeft ? 16 : ARENA_W - 16 - 62;
  const top = y - 70;
  const lit = pad.powered ? Math.min(1, litFor * 2.5) : 0;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "rgba(30,24,74,0.9)";
  ctx.fillRect(bx, top, 62, 110);
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const n = hash(pad.id * 31 + r * 4 + c);
      const on = lit > 0 && n < 0.85;
      ctx.fillStyle = on ? `rgba(255,190,80,${0.35 + 0.55 * lit})` : "rgba(70,70,120,0.35)";
      ctx.fillRect(bx + 7 + c * 14, top + 8 + r * 14, 7, 8);
    }
  }
  if (lit > 0 && !calm) {
    const glow = ctx.createRadialGradient(bx + 31, top + 55, 5, bx + 31, top + 55, 80);
    glow.addColorStop(0, `rgba(255,181,61,${0.22 * lit})`);
    glow.addColorStop(1, "rgba(255,181,61,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.fillRect(bx - 50, top - 30, 162, 170);
  }
  ctx.restore();
}

// ----- The cabinet tile -----

export function drawCircuitClimbIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 64;
  ctx.save();
  ctx.scale(s, s);
  const sky = ctx.createLinearGradient(0, 0, 0, 64);
  sky.addColorStop(0, "#1b1450");
  sky.addColorStop(1, "#3a2160");
  ctx.fillStyle = sky;
  ctx.beginPath();
  roundBox(ctx, 2, 2, 60, 60, 10);
  ctx.fill();
  // The trail, curving up from the pad.
  ctx.strokeStyle = "rgba(70,224,255,0.75)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 50);
  ctx.quadraticCurveTo(18, 22, 30, 30);
  ctx.stroke();
  ctx.fillStyle = "#7ff6ff";
  for (const [x, y] of [[13, 40], [17, 33], [22, 29]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // A pad.
  const pad = { id: 0, kind: "standard", baseX: 40, y: 0, w: 38, route: true, swing: 0, speed: 0, phase: 0, powered: false, broken: false } as Pad;
  drawPad(ctx, pad, 42, 52, 0, true);
  // JES, mid-bounce.
  ctx.save();
  ctx.translate(38, 44);
  ctx.scale(0.72, 0.72);
  drawJes(ctx, { x: 0, y: 0, vx: 120, vy: 300, squash: 0, look: 1, joy: 0 });
  ctx.restore();
  ctx.restore();
}

function roundBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

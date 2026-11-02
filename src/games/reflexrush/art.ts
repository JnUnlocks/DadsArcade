/**
 * Reflex Rush's look: a midnight-navy arcade city, cyan and hot pink light,
 * warm yellow for the things to read. Glow is decoration; every shape that
 * matters has a hard edge and enough contrast to read without it.
 */

import { Rng } from "../../core/rng.ts";

export const RR = {
  navy: "#0a0b24",
  navyLight: "#1a1747",
  violet: "#5b3fd1",
  cyan: "#2ee6ff",
  cyanDark: "#0b8fb3",
  pink: "#ff4fb8",
  pinkDark: "#a82476",
  yellow: "#ffd84d",
  ink: "#eef3ff",
  dim: "#8ea3c8",
} as const;

export const FONT = "ui-monospace, Menlo, Consolas, monospace";

interface Tower {
  x: number;
  w: number;
  h: number;
  lit: Array<[number, number]>;
  antenna: boolean;
}

/** Two rows of buildings, made once with a fixed seed so they never shuffle. */
const SKYLINE: { far: Tower[]; near: Tower[] } = (() => {
  const rng = new Rng(20261102);
  const row = (minH: number, maxH: number, minW: number, maxW: number): Tower[] => {
    const out: Tower[] = [];
    for (let x = -10; x < 380; ) {
      const w = rng.range(minW, maxW);
      const h = rng.range(minH, maxH);
      const lit: Array<[number, number]> = [];
      for (let wy = 8; wy < h - 6; wy += 9) {
        for (let wx = 4; wx < w - 4; wx += 7) {
          if (rng.chance(0.28)) lit.push([wx, wy]);
        }
      }
      out.push({ x, w, h, lit, antenna: rng.chance(0.25) });
      x += w + rng.range(2, 8);
    }
    return out;
  };
  return { far: row(60, 150, 22, 44), near: row(40, 110, 26, 52) };
})();

/**
 * The backdrop. `rise` lifts the city as the camera climbs, at a fraction of
 * the camera's speed, so the tower seems to rise past it.
 */
export function drawCity(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  rise: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#05061a");
  sky.addColorStop(0.6, RR.navyLight);
  sky.addColorStop(1, "#33165a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // A few stars, fixed.
  ctx.fillStyle = "rgba(238,243,255,0.5)";
  for (let i = 0; i < 26; i += 1) {
    const sx = (i * 137.5) % w;
    const sy = ((i * 61.3) % (h * 0.45)) + rise * 0.05;
    ctx.fillRect(sx, sy % h, 1.2, 1.2);
  }

  const drawRow = (towers: Tower[], base: number, body: string, lights: string[]) => {
    for (const t of towers) {
      ctx.fillStyle = body;
      ctx.fillRect(t.x, base - t.h, t.w, t.h);
      if (t.antenna) ctx.fillRect(t.x + t.w / 2 - 0.5, base - t.h - 12, 1, 12);
      for (let i = 0; i < t.lit.length; i += 1) {
        const [wx, wy] = t.lit[i]!;
        ctx.fillStyle = lights[i % lights.length]!;
        ctx.fillRect(t.x + wx, base - t.h + wy, 3, 4);
      }
    }
  };
  drawRow(SKYLINE.far, groundY + rise * 0.15, "#151338", ["#3a3f8f", "#5b3fd1", "#2a6f9a"]);
  drawRow(SKYLINE.near, groundY + rise * 0.3 + 6, "#0e0d2a", [
    "rgba(46,230,255,0.75)",
    "rgba(255,79,184,0.7)",
    "rgba(255,216,77,0.6)",
  ]);
}

/**
 * One luminous block: a front face with a lit top edge and a darker base,
 * the 2.5D the concept art asks for without the cost of real perspective.
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: "cyan" | "pink",
  glow = 0,
): void {
  if (w <= 0) return;
  const face = color === "cyan" ? RR.cyan : RR.pink;
  const dark = color === "cyan" ? RR.cyanDark : RR.pinkDark;
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = face;
    ctx.shadowBlur = 12 * glow;
  }
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, face);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = "rgba(5,6,26,0.35)";
  ctx.fillRect(x, y + h - 3, w, 3);
}

/** Cabinet art: a neon stack with the next block sliding in, and a GO beacon. */
export function drawReflexIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);

  // The stack, narrowing as it climbs.
  const rows: Array<[number, number, "cyan" | "pink"]> = [
    [4, 22, "cyan"],
    [6, 18, "pink"],
    [7, 15, "cyan"],
    [8, 13, "pink"],
  ];
  rows.forEach(([x, w, c], i) => drawBlock(ctx, x, 27 - i * 4.5, w, 4, c));

  // The block sliding in, with speed lines behind it.
  ctx.strokeStyle = "rgba(46,230,255,0.8)";
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  for (const [dy, len] of [[0.8, 4], [2.2, 6], [3.4, 3]] as const) {
    ctx.beginPath();
    ctx.moveTo(1, 9 + dy);
    ctx.lineTo(1 + len, 9 + dy);
    ctx.stroke();
  }
  drawBlock(ctx, 6, 9, 13, 4, "cyan");

  // The GO beacon, top right.
  ctx.strokeStyle = RR.cyan;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(25.5, 7.5, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = RR.yellow;
  ctx.beginPath();
  ctx.arc(25.5, 7.5, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RR.navy;
  ctx.font = `900 3.6px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GO", 25.5, 7.8);

  ctx.restore();
}

/** Centred text with a dark outline, readable over anything. */
export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 900,
): void {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = "rgba(5,6,26,0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

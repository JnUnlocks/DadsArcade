/**
 * All drawing for Starfighter.
 *
 * Every ship is vector art built from canvas paths -- no sprite sheets. That
 * keeps the install tiny, scales perfectly to any screen density, and lets the
 * theme be genuinely original rather than borrowed pixels.
 */

import { Rng } from "../../core/rng";
import type { EnemyKind } from "./types";

export const PALETTE = {
  player: "#7dfcff",
  playerCore: "#ffffff",
  playerBullet: "#b9fbff",
  grunt: "#ff5470",
  escort: "#c46bff",
  cruiser: "#ffc14d",
  enemyBullet: "#ff9f6b",
  tractor: "#ffe08a",
} as const;

const ENEMY_COLOR: Record<EnemyKind, string> = {
  grunt: PALETTE.grunt,
  escort: PALETTE.escort,
  cruiser: PALETTE.cruiser,
};

// ---------- Starfield ----------

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

/** Three parallax layers of drifting stars. Cheap, and it sells "space". */
export class Starfield {
  private stars: Star[] = [];

  constructor(
    private width: number,
    private height: number,
    count = 90,
  ) {
    const rng = new Rng(0x5eed);
    for (let i = 0; i < count; i += 1) {
      const layer = i % 3;
      this.stars.push({
        x: rng.range(0, width),
        y: rng.range(0, height),
        speed: 12 + layer * 22,
        size: layer === 2 ? 1.6 : layer === 1 ? 1.2 : 0.8,
        alpha: 0.25 + layer * 0.25,
      });
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  update(dt: number, speedMultiplier = 1): void {
    for (const star of this.stars) {
      star.y += star.speed * speedMultiplier * dt;
      if (star.y > this.height) {
        star.y -= this.height;
        star.x = Math.random() * this.width;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = "#cfe6ff";
      ctx.fillRect(star.x, star.y, star.size, star.size * 2.2);
    }
    ctx.restore();
  }
}

// ---------- Particles ----------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export class Particles {
  private items: Particle[] = [];

  burst(x: number, y: number, color: string, count = 14, power = 90): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = power * (0.35 + Math.random() * 0.8);
      const life = 0.3 + Math.random() * 0.45;
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: 1.5 + Math.random() * 2.2,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const p = this.items[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-and-pop: order doesn't matter and it avoids O(n) splices.
        this.items[i] = this.items[this.items.length - 1]!;
        this.items.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.items) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  clear(): void {
    this.items.length = 0;
  }
}

// ---------- Ships ----------

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  thrust: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  // Engine flare, flickering with thrust.
  const flare = 6 + thrust * 5 + Math.random() * 3;
  const gradient = ctx.createLinearGradient(0, 6, 0, 6 + flare);
  gradient.addColorStop(0, "rgba(125,252,255,0.9)");
  gradient.addColorStop(1, "rgba(125,252,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-2.5, 6, 5, flare);

  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.moveTo(0, -12); // nose
  ctx.lineTo(3.5, -2);
  ctx.lineTo(11, 6); // right wing
  ctx.lineTo(4, 5);
  ctx.lineTo(3, 9);
  ctx.lineTo(-3, 9);
  ctx.lineTo(-4, 5);
  ctx.lineTo(-11, 6); // left wing
  ctx.lineTo(-3.5, -2);
  ctx.closePath();
  ctx.fill();

  // Cockpit highlight.
  ctx.fillStyle = PALETTE.playerCore;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(2, 0);
  ctx.lineTo(-2, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  x: number,
  y: number,
  angle: number,
  flash: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  // Ships point "down the path"; art is drawn nose-up, hence the quarter turn.
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = flash ? "#ffffff" : ENEMY_COLOR[kind];

  switch (kind) {
    case "grunt":
      // Central pod with two flat side panels.
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-10, -6, 3, 12);
      ctx.fillRect(7, -6, 3, 12);
      break;

    case "escort":
      // Swept-forward wings, meaner silhouette.
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(11, 4);
      ctx.lineTo(4, 2);
      ctx.lineTo(0, 9);
      ctx.lineTo(-4, 2);
      ctx.lineTo(-11, 4);
      ctx.closePath();
      ctx.fill();
      break;

    case "cruiser":
      // Bigger, blockier -- the one that carries the tractor emitter.
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(8, -4);
      ctx.lineTo(13, 8);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 11);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-13, 8);
      ctx.lineTo(-8, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? "#ffffff" : "#fff2c9";
      ctx.fillRect(-2.5, -6, 5, 6);
      break;
  }

  ctx.restore();
}

export function drawPlayerBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.fillStyle = PALETTE.playerBullet;
  ctx.shadowColor = PALETTE.playerBullet;
  ctx.shadowBlur = 8;
  ctx.fillRect(x - 1.5, y - 7, 3, 12);
  ctx.restore();
}

export function drawEnemyBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.fillStyle = PALETTE.enemyBullet;
  ctx.shadowColor = PALETTE.enemyBullet;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The capture beam: a tapering cone with a travelling scan band.
 *
 * Drawn additively ("lighter"). A normal alpha fill of warm yellow over a near
 * black background just muddies to brown -- additive blending is what makes it
 * read as light being emitted rather than a painted shape.
 */
export function drawTractorBeam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  progress: number,
): void {
  const topHalf = 5;
  const bottomHalf = 26;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const cone = (halfTop: number, halfBottom: number, stops: [string, string]) => {
    const gradient = ctx.createLinearGradient(x, y, x, y + length);
    gradient.addColorStop(0, stops[0]);
    gradient.addColorStop(1, stops[1]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - halfTop, y);
    ctx.lineTo(x + halfTop, y);
    ctx.lineTo(x + halfBottom, y + length);
    ctx.lineTo(x - halfBottom, y + length);
    ctx.closePath();
    ctx.fill();
  };

  // Outer glow, then a white-hot core. The core is what makes it read as
  // light -- gold alone just adds up to brown against a black sky.
  const pulse = 0.85 + Math.sin(progress * 9) * 0.15;
  cone(topHalf, bottomHalf, [
    `rgba(255, 200, 110, ${0.5 * pulse})`,
    "rgba(255, 140, 40, 0)",
  ]);
  cone(topHalf * 0.55, bottomHalf * 0.5, [
    `rgba(255, 252, 235, ${0.85 * pulse})`,
    "rgba(255, 210, 130, 0)",
  ]);

  // A pulse sweeping down the beam, fading as it widens.
  const t = (progress * 0.9) % 1;
  const halfWidth = topHalf + (bottomHalf - topHalf) * t;
  ctx.globalAlpha = 0.8 * (1 - t);
  ctx.fillStyle = PALETTE.tractor;
  ctx.fillRect(x - halfWidth, y + t * length, halfWidth * 2, 2.5);

  ctx.restore();
}

/** Floating "+200" score popups. */
export function drawScorePopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffe08a";
  ctx.font = '700 11px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.restore();
}

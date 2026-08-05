/**
 * Generic particle burst effect.
 *
 * Originally lived inside Starfighter's renderer; promoted to core because
 * it's fully game-agnostic (position/velocity/life/color/size, nothing
 * space-specific) and a second game needed the same feather/spark-burst
 * effect. One shared implementation beats two copies drifting apart.
 */

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

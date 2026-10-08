/**
 * The brick blast: everything that happens on screen when rows go.
 *
 * Before this a cleared row blinked white twice and the stack jumped down. It
 * was correct and it felt like nothing, and the clear is the one moment in the
 * game that is a reward. So each brick now breaks into pieces of its own
 * colour, the points it earned float up from where it happened, and a big
 * clear gets its name shouted across the well.
 *
 * All of it is decoration. Nothing here is read by the rules, so an effect
 * that is cut short, or skipped with Reduce motion on, changes no score.
 */

const FONT = "ui-monospace, Menlo, Consolas, monospace";

/** Downward pull on a shard, in virtual units a second squared. */
const GRAVITY = 620;

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  size: number;
  colour: string;
  life: number;
  maxLife: number;
}

interface Sweep {
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  colour: string;
  life: number;
  maxLife: number;
}

interface Streak {
  x: number;
  top: number;
  bottom: number;
  w: number;
  colour: string;
  life: number;
  maxLife: number;
}

interface Flash {
  x: number;
  y: number;
  size: number;
  life: number;
  maxLife: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  colour: string;
  size: number;
  life: number;
  maxLife: number;
}

interface Callout {
  x: number;
  y: number;
  text: string;
  sub: string;
  colour: string;
  size: number;
  life: number;
  maxLife: number;
}

/** Overshoots a little past 1 and settles: the "pop" in a pop-up. */
function popIn(t: number): number {
  const c = 1.9;
  const u = Math.min(1, t) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function age<T extends { life: number }>(items: T[], dt: number): void {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!;
    item.life -= dt;
    if (item.life <= 0) {
      // Swap-and-pop: order doesn't matter and it avoids O(n) splices.
      items[i] = items[items.length - 1]!;
      items.pop();
    }
  }
}

export class BlastFx {
  /** Reduce motion: fewer, slower pieces and no bounce on the lettering. */
  calm = false;

  private shards: Shard[] = [];
  private sweeps: Sweep[] = [];
  private rings: Ring[] = [];
  private streaks: Streak[] = [];
  private flashes: Flash[] = [];
  private popups: Popup[] = [];
  private callout: Callout | null = null;

  /** One brick, at the top-left of its cell, breaking apart. */
  shatter(x: number, y: number, size: number, colour: string): void {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const count = this.calm ? 2 : 5;
    const power = this.calm ? 0.4 : 1;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = size * (3 + Math.random() * 7) * power;
      const life = 0.45 + Math.random() * 0.4;
      this.shards.push({
        x: cx + Math.cos(angle) * size * 0.2,
        y: cy + Math.sin(angle) * size * 0.2,
        vx: Math.cos(angle) * speed,
        // Thrown up more than down, so the pieces arc instead of just dropping.
        vy: Math.sin(angle) * speed - size * 5 * power,
        spin: (Math.random() * 2 - 1) * 14 * power,
        angle: Math.random() * Math.PI,
        size: size * (0.2 + Math.random() * 0.22),
        // One piece in five is white-hot.
        colour: i === 0 ? "#ffffff" : colour,
        life,
        maxLife: life,
      });
    }
    this.flash(x, y, size);
  }

  /** A bar of light across a row as it goes. */
  sweep(x: number, y: number, w: number, h: number): void {
    this.sweeps.push({ x, y, w, h, life: 0.3, maxLife: 0.3 });
  }

  /** A shockwave, for the clears that deserve one. */
  ring(x: number, y: number, radius: number, colour: string): void {
    if (this.calm) return;
    this.rings.push({ x, y, radius, colour, life: 0.5, maxLife: 0.5 });
  }

  /** The trail behind a dropped piece, one per column it fell through. */
  streak(x: number, top: number, bottom: number, w: number, colour: string): void {
    if (bottom - top < 1) return;
    this.streaks.push({ x, top, bottom, w, colour, life: 0.22, maxLife: 0.22 });
  }

  /** A blink of white on a cell: a piece setting, or a brick going. */
  flash(x: number, y: number, size: number): void {
    this.flashes.push({ x, y, size, life: 0.14, maxLife: 0.14 });
  }

  /** Points, floating up from where they were earned. */
  popup(x: number, y: number, text: string, colour: string, size: number): void {
    this.popups.push({ x, y, text, colour, size, life: 1.1, maxLife: 1.1 });
  }

  /** The name of a big clear, across the well. One at a time. */
  shout(x: number, y: number, text: string, sub: string, colour: string, size: number): void {
    this.callout = { x, y, text, sub, colour, size, life: 1.25, maxLife: 1.25 };
  }

  /** A shower from a line, for levelling up. */
  confetti(x: number, y: number, w: number, colours: readonly string[]): void {
    const count = this.calm ? 10 : 34;
    for (let i = 0; i < count; i += 1) {
      const life = 0.8 + Math.random() * 0.6;
      this.shards.push({
        x: x + Math.random() * w,
        y,
        vx: (Math.random() * 2 - 1) * 60,
        vy: -40 - Math.random() * 140,
        spin: (Math.random() * 2 - 1) * 10,
        angle: Math.random() * Math.PI,
        size: 3 + Math.random() * 3,
        colour: colours[i % colours.length]!,
        life,
        maxLife: life,
      });
    }
  }

  update(dt: number): void {
    age(this.shards, dt);
    for (const s of this.shards) {
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.angle += s.spin * dt;
    }
    age(this.sweeps, dt);
    age(this.rings, dt);
    age(this.streaks, dt);
    age(this.flashes, dt);
    age(this.popups, dt);
    if (this.callout) {
      this.callout.life -= dt;
      if (this.callout.life <= 0) this.callout = null;
    }
  }

  /** Drawn under the falling piece: light on the well and the stack. */
  renderUnder(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    for (const s of this.streaks) {
      const k = s.life / s.maxLife;
      const fade = ctx.createLinearGradient(0, s.top, 0, s.bottom);
      fade.addColorStop(0, "rgba(255,255,255,0)");
      fade.addColorStop(1, s.colour);
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = fade;
      ctx.fillRect(s.x, s.top, s.w, s.bottom - s.top);
    }

    for (const f of this.flashes) {
      ctx.globalAlpha = 0.85 * (f.life / f.maxLife);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(f.x + 1, f.y + 1, f.size - 2, f.size - 2);
    }

    ctx.restore();
  }

  /** Drawn over everything in the well. */
  renderOver(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    for (const s of this.sweeps) {
      const k = s.life / s.maxLife;
      // Thins toward its middle as it fades, like a bar of light closing.
      const h = s.h * k;
      ctx.globalAlpha = 0.8 * k;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(s.x, s.y + (s.h - h) / 2, s.w, h);
    }

    for (const r of this.rings) {
      const k = r.life / r.maxLife;
      ctx.globalAlpha = k;
      ctx.strokeStyle = r.colour;
      ctx.lineWidth = 1 + 5 * k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (1 - k * k), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const s of this.shards) {
      ctx.globalAlpha = Math.min(1, (s.life / s.maxLife) * 1.6);
      ctx.fillStyle = s.colour;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size);
      ctx.rotate(-s.angle);
      ctx.translate(-s.x, -s.y);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    for (const p of this.popups) {
      const t = 1 - p.life / p.maxLife;
      const scale = this.calm ? 1 : popIn(t * 5);
      ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 3);
      ctx.font = `700 ${p.size * scale}px ${FONT}`;
      const y = p.y - t * p.size * 2.4;
      // Outlined so it reads over a busy stack of any colour.
      ctx.lineWidth = Math.max(2, p.size * 0.22);
      ctx.strokeStyle = "rgba(5,7,15,0.9)";
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.colour;
      ctx.fillText(p.text, p.x, y);
    }

    const c = this.callout;
    if (c) {
      const t = 1 - c.life / c.maxLife;
      const scale = this.calm ? 1 : popIn(t * 6);
      ctx.globalAlpha = Math.min(1, (c.life / c.maxLife) * 3.5);
      ctx.font = `700 ${c.size * scale}px ${FONT}`;
      ctx.lineWidth = Math.max(3, c.size * 0.24);
      ctx.strokeStyle = "rgba(5,7,15,0.92)";
      ctx.strokeText(c.text, c.x, c.y);
      ctx.fillStyle = c.colour;
      ctx.fillText(c.text, c.x, c.y);

      if (c.sub) {
        const subSize = c.size * 0.52;
        ctx.font = `700 ${subSize * scale}px ${FONT}`;
        ctx.lineWidth = Math.max(2, subSize * 0.24);
        ctx.strokeText(c.sub, c.x, c.y + c.size * 0.95);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(c.sub, c.x, c.y + c.size * 0.95);
      }
    }

    ctx.restore();
  }
}

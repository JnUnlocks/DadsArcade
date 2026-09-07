/**
 * All the slime-shop art, drawn as vector paths at runtime like the rest of
 * the arcade -- no images anywhere.
 *
 * Two art problems worth explaining, because both drove real decisions:
 *
 * 1. The shop has to live inside a neon CRT cabinet. A pastel toy aesthetic
 *    dropped onto a #05070f background with scanlines over it looks washed out
 *    and slightly broken. So rather than fight the shell, the shop is a
 *    *late-night neon slime counter*: dark room, glowing signage, and candy
 *    colours that pop against it. Bright saturated slime on near-black is the
 *    one place those colours look their best, and the scanline pass then reads
 *    as intentional.
 *
 * 2. The blob is the entire point of the genre. A static circle filled with
 *    the mixed colour would technically show the answer and feel like nothing.
 *    So it's a ring of spring-loaded points: it breathes at rest, deforms when
 *    dragged, and rings on release with a period set by the texture. That
 *    wobble is the difference between "a colour picker" and "slime".
 */

import { shift, toCss, type Rgb } from "./color";
import {
  TEXTURE_FEEL,
  type MixIn,
  type Texture,
} from "./types";

/** Number of points around the blob's rim. */
const RIM_POINTS = 28;

export const SHOP_PALETTE = {
  wall: "#120b1f",
  wallGlow: "#2a1247",
  counter: "#1d1030",
  counterEdge: "#ff5fae",
  neon: "#ff5fae",
  neonCool: "#54e0ff",
  ticket: "#f6f0ff",
  ticketInk: "#2a1a3d",
  dim: "rgba(198,178,224,0.75)",
} as const;

/**
 * A blob of slime with spring-loaded edges.
 *
 * Each rim point owns a radial offset and a velocity, pulled back toward rest
 * by a spring whose stiffness and damping come from the texture. That single
 * mechanism covers everything: the idle breathing, the squash when you drag,
 * and the overshoot ring when you let go -- and it means "fluffy jiggles more
 * than butter" falls out of the constants instead of needing its own code.
 */
export class SlimeBlob {
  private readonly offsets = new Float32Array(RIM_POINTS);
  private readonly velocities = new Float32Array(RIM_POINTS);
  private phase = Math.random() * Math.PI * 2;

  /** Current pull applied by the player's finger, in virtual units. */
  private pullX = 0;
  private pullY = 0;

  /** Reset to a calm sphere -- used when the bowl is emptied. */
  reset(): void {
    this.offsets.fill(0);
    this.velocities.fill(0);
    this.pullX = 0;
    this.pullY = 0;
  }

  /**
   * Drag the slime. Deltas are relative (the arcade's input never reports an
   * absolute position), which suits this perfectly: dragging anywhere on the
   * screen stretches the blob, so a thumb never has to cover the thing it's
   * squishing.
   */
  pull(dx: number, dy: number, texture: Texture): void {
    const feel = TEXTURE_FEEL[texture];
    this.pullX = clamp(this.pullX + dx * feel.stretch, -34, 34);
    this.pullY = clamp(this.pullY + dy * feel.stretch, -34, 34);

    // Push the rim outward on the side being pulled toward.
    const angle = Math.atan2(this.pullY, this.pullX);
    const strength = Math.hypot(dx, dy) * feel.stretch;
    for (let i = 0; i < RIM_POINTS; i += 1) {
      const a = (i / RIM_POINTS) * Math.PI * 2;
      // cos of the angular difference: full effect on the pulled side,
      // inverted on the far side so the blob necks rather than inflating.
      const facing = Math.cos(a - angle);
      this.velocities[i]! += facing * strength * 2.4;
    }
  }

  /** Let go. The rim springs back and rings for a moment. */
  release(): void {
    this.pullX = 0;
    this.pullY = 0;
  }

  /** Squash from the inside -- a stir, a poured bottle, a served order. */
  splash(strength: number): void {
    for (let i = 0; i < RIM_POINTS; i += 1) {
      this.velocities[i]! += (Math.random() * 2 - 1) * strength;
    }
  }

  update(dt: number, texture: Texture): void {
    const feel = TEXTURE_FEEL[texture];
    this.phase += dt * 1.7;

    // Clamp the step: a backgrounded tab can hand us a huge dt, and an
    // explicit spring integrated over 400ms goes unstable and turns the blob
    // inside out.
    const step = Math.min(dt, 1 / 30);

    for (let i = 0; i < RIM_POINTS; i += 1) {
      const offset = this.offsets[i]!;
      const velocity = this.velocities[i]!;
      const accel = -feel.stiffness * offset - feel.damping * velocity;
      const nextVelocity = velocity + accel * step;
      this.offsets[i] = clamp(offset + nextVelocity * step, -18, 18);
      this.velocities[i] = nextVelocity;
    }

    // Ease the pull back to nothing so a held finger doesn't stretch forever.
    this.pullX *= 1 - Math.min(1, step * 3);
    this.pullY *= 1 - Math.min(1, step * 3);
  }

  /**
   * Draw the blob. `seed` keeps glitter and beads pinned in place between
   * frames -- re-randomising them every frame reads as television static
   * rather than as sparkle.
   */
  render(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    colour: Rgb,
    texture: Texture,
    mixIns: ReadonlySet<MixIn>,
    seed: number,
    reducedMotion: boolean,
    /**
     * Overall opacity, multiplied into every layer. A caller cannot simply set
     * ctx.globalAlpha before calling: canvas alpha is absolute, so the first
     * assignment in here would discard it.
     */
    alphaScale = 1,
  ): void {
    const feel = TEXTURE_FEEL[texture];
    const breathe = reducedMotion ? 0 : Math.sin(this.phase) * 1.4;

    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < RIM_POINTS; i += 1) {
      const a = (i / RIM_POINTS) * Math.PI * 2;
      // A second, slower sine at a different frequency keeps the idle wobble
      // from looking like a pulsing circle.
      const idle = reducedMotion
        ? 0
        : breathe + Math.sin(this.phase * 0.7 + i * 0.9) * 1.1;
      const r = radius + this.offsets[i]! + idle;
      points.push({
        x: cx + Math.cos(a) * r + this.pullX * 0.35,
        y: cy + Math.sin(a) * r * 0.92 + this.pullY * 0.35,
      });
    }

    ctx.save();

    // Cloud slime gets a soft halo so it reads as matte and airy.
    if (texture === "cloud") {
      ctx.globalAlpha = 0.22 * alphaScale;
      ctx.fillStyle = toCss(shift(colour, 0.25));
      traceBlob(ctx, points, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = feel.alpha * alphaScale;
    ctx.fillStyle = toCss(colour);
    traceBlob(ctx, points, 0);
    ctx.fill();

    // Rim: darker at the bottom, so the blob reads as a volume with weight
    // rather than a flat sticker.
    ctx.globalAlpha = feel.alpha * 0.9 * alphaScale;
    ctx.strokeStyle = toCss(shift(colour, -0.32), 0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.drawGloss(ctx, cx, cy, radius, colour, feel.gloss * alphaScale);
    this.drawMixIns(ctx, cx, cy, radius, colour, mixIns, seed, reducedMotion);

    ctx.restore();
  }

  private drawGloss(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    colour: Rgb,
    strength: number,
  ): void {
    if (strength <= 0) return;
    ctx.save();
    ctx.globalAlpha = strength * 0.75;
    ctx.fillStyle = toCss(shift(colour, 0.75));
    ctx.beginPath();
    ctx.ellipse(
      cx - radius * 0.3,
      cy - radius * 0.42,
      radius * 0.3,
      radius * 0.17,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // A second, tighter catchlight. One highlight looks like a smudge; two
    // at different sizes is what makes a surface look wet.
    ctx.globalAlpha = strength;
    ctx.beginPath();
    ctx.ellipse(
      cx - radius * 0.44,
      cy - radius * 0.3,
      radius * 0.1,
      radius * 0.06,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  private drawMixIns(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    colour: Rgb,
    mixIns: ReadonlySet<MixIn>,
    seed: number,
    reducedMotion: boolean,
  ): void {
    if (mixIns.size === 0) return;

    // Deterministic scatter: same seed, same layout every frame.
    const rand = makeScatter(seed);
    const inside = (i: number, spread = 0.72) => {
      const a = rand(i * 2) * Math.PI * 2;
      const d = Math.sqrt(rand(i * 2 + 1)) * radius * spread;
      return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.9 };
    };

    ctx.save();

    if (mixIns.has("beads")) {
      ctx.fillStyle = toCss(shift(colour, 0.6), 0.9);
      for (let i = 0; i < 26; i += 1) {
        const p = inside(i + 40);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (mixIns.has("boba")) {
      ctx.fillStyle = "rgba(38,20,14,0.88)";
      for (let i = 0; i < 9; i += 1) {
        const p = inside(i + 90, 0.62);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (mixIns.has("glitter")) {
      // Twinkle by phase, not by re-randomising, so each fleck has its own
      // steady rhythm instead of the whole field flickering at once.
      for (let i = 0; i < 30; i += 1) {
        const p = inside(i + 140, 0.8);
        const twinkle = reducedMotion
          ? 0.75
          : 0.35 + 0.65 * Math.abs(Math.sin(this.phase * 2.2 + i));
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = i % 3 === 0 ? "#fff6b0" : "#ffffff";
        const s = 1.1 + rand(i + 300) * 1.3;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // Charms sit on top and are drawn bigger -- they're the bit a kid picks
    // the slime *for*, so they need to be legible at phone size.
    let charmIndex = 0;
    for (const charm of ["star", "heart", "taco"] as const) {
      if (!mixIns.has(charm)) continue;
      for (let i = 0; i < 3; i += 1) {
        const p = inside(charmIndex * 17 + i + 200, 0.58);
        const bob = reducedMotion
          ? 0
          : Math.sin(this.phase * 1.3 + charmIndex + i) * 1.5;
        ctx.save();
        ctx.translate(p.x, p.y + bob);
        ctx.rotate(rand(charmIndex * 31 + i) * 0.9 - 0.45);
        if (charm === "star") drawStar(ctx, 5.2);
        else if (charm === "heart") drawHeart(ctx, 5.2);
        else drawTaco(ctx, 6);
        ctx.restore();
      }
      charmIndex += 1;
    }

    ctx.restore();
  }
}

/**
 * Trace a closed loop through the rim points.
 *
 * Curves through the *midpoints* between successive points, with each point
 * as a control handle. Joining the points directly with lines shows every
 * facet; this gives a continuous blobby edge with no seam at the wrap-around.
 */
function traceBlob(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  grow: number,
): void {
  const n = points.length;

  // Hoisted: the centroid is the same for every point, and pt() is called
  // ~2n times per frame. Recomputing it inside made the halo O(n^2).
  let cx = 0;
  let cy = 0;
  if (grow !== 0) {
    for (const q of points) {
      cx += q.x;
      cy += q.y;
    }
    cx /= n;
    cy /= n;
  }

  const pt = (i: number) => {
    const p = points[((i % n) + n) % n]!;
    if (grow === 0) return p;
    // Expanding for the halo: push each point out along its own normal.
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * grow, y: p.y + (dy / len) * grow };
  };

  const first = pt(0);
  const last = pt(n - 1);
  ctx.beginPath();
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i += 1) {
    const current = pt(i);
    const next = pt(i + 1);
    ctx.quadraticCurveTo(
      current.x,
      current.y,
      (current.x + next.x) / 2,
      (current.y + next.y) / 2,
    );
  }
  ctx.closePath();
}

/** Cheap deterministic hash -> 0..1. Keeps scatter stable across frames. */
function makeScatter(seed: number): (i: number) => number {
  return (i: number) => {
    let t = (seed * 374761393 + i * 668265263) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
}

// ----- Charms -----

/**
 * Charms carry a dark outline because they have to stay legible on *any*
 * slime colour. Without it, pink hearts disappear into a pink slime and the
 * player is docked points for a mix-in they can see they added.
 */
function outlineCharm(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(30,14,40,0.75)";
  ctx.lineWidth = 1.1;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = "#ffd84d";
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  outlineCharm(ctx);
}

function drawHeart(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = "#ff5f8d";
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.15, -r * 0.55, -r * 1.2, 0, -r * 0.42);
  ctx.bezierCurveTo(r * 0.55, -r * 1.2, r * 1.4, -r * 0.15, 0, r * 0.85);
  ctx.closePath();
  ctx.fill();
  outlineCharm(ctx);
}

/**
 * The taco charm. Riley asked for tacos, so there are tacos -- and a charm is
 * the one place a joke can live without affecting how anything scores.
 */
function drawTaco(ctx: CanvasRenderingContext2D, r: number): void {
  // Shell.
  ctx.fillStyle = "#f2b736";
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // Filling peeking over the top edge.
  ctx.fillStyle = "#8fd14f";
  ctx.fillRect(-r * 0.78, -r * 0.16, r * 1.56, r * 0.2);
  ctx.fillStyle = "#e2574c";
  ctx.fillRect(-r * 0.6, -r * 0.3, r * 1.2, r * 0.18);
  // Shell rim, which also separates it from the filling.
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  outlineCharm(ctx);
}

// ----- The shop -----

/**
 * Neon-lit back wall and counter. Drawn once per frame, behind everything.
 *
 * `spotY` is where the slime is about to be drawn. Lighting the wall behind it
 * rather than lighting the whole room does two jobs at once: it makes the
 * slime look lit from in front instead of pasted on, and it puts the brightest
 * thing on screen exactly where the player should be looking.
 */
export function drawShop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  counterY: number,
  spotY: number,
  time: number,
  reducedMotion: boolean,
): void {
  ctx.save();

  ctx.fillStyle = SHOP_PALETTE.wall;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, spotY, 10, w / 2, spotY, w * 0.85);
  glow.addColorStop(0, SHOP_PALETTE.wallGlow);
  glow.addColorStop(1, SHOP_PALETTE.wall);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Counter.
  ctx.fillStyle = SHOP_PALETTE.counter;
  ctx.fillRect(0, counterY, w, h - counterY);

  const pulse = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time * 2.2);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = SHOP_PALETTE.counterEdge;
  ctx.fillRect(0, counterY - 2, w, 2);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/**
 * The cast.
 *
 * Chunky, flat, big-headed and original -- the look the genre trades in, drawn
 * from scratch so there's no trademarked character anywhere near it. Each
 * customer is a palette index plus a couple of shape switches, which is enough
 * for them to read as different people without needing a sprite each.
 */
const CUSTOMER_COLOURS: ReadonlyArray<{ skin: string; hair: string; top: string }> = [
  { skin: "#f7c9a3", hair: "#3b2a4d", top: "#ff8fc6" },
  { skin: "#8d5a3b", hair: "#1d1526", top: "#6ee7c8" },
  { skin: "#f2d7bb", hair: "#d94f3d", top: "#7cb8ff" },
  { skin: "#c98c5e", hair: "#f5c542", top: "#c58cff" },
  { skin: "#fbe0c8", hair: "#5b8ef7", top: "#ffd166" },
  { skin: "#6f4630", hair: "#e8e3ff", top: "#ff6b6b" },
];

export type Mood = "waiting" | "happy" | "delighted" | "unsure";

export function drawCustomer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number,
  mood: Mood,
  time: number,
  reducedMotion: boolean,
  scale = 1,
): void {
  const skin = CUSTOMER_COLOURS[index % CUSTOMER_COLOURS.length]!;
  const bounce = reducedMotion
    ? 0
    : Math.sin(time * (mood === "delighted" ? 7 : 2.4)) *
      (mood === "delighted" ? 2.4 : 0.9);

  ctx.save();
  ctx.translate(x, y + bounce);
  ctx.scale(scale, scale);

  // Body.
  ctx.fillStyle = skin.top;
  ctx.beginPath();
  ctx.roundRect(-14, 2, 28, 26, 9);
  ctx.fill();

  // Head.
  ctx.fillStyle = skin.skin;
  ctx.beginPath();
  ctx.roundRect(-13, -24, 26, 27, 11);
  ctx.fill();

  // Hair, as a cap over the top of the head. Two silhouettes across the cast
  // so they don't all read as the same person in different colours.
  ctx.fillStyle = skin.hair;
  ctx.beginPath();
  if (index % 2 === 0) {
    ctx.roundRect(-14, -27, 28, 15, 8);
  } else {
    ctx.roundRect(-15, -27, 30, 21, 9);
  }
  ctx.fill();
  // Re-cut the face below the fringe.
  ctx.fillStyle = skin.skin;
  ctx.beginPath();
  ctx.roundRect(-11, -16, 22, 18, 8);
  ctx.fill();

  drawFace(ctx, mood, time, reducedMotion);
  ctx.restore();
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  mood: Mood,
  time: number,
  reducedMotion: boolean,
): void {
  ctx.fillStyle = "#2a1a3d";

  // A slow blink. Tiny detail, but a face with permanently open eyes looks
  // dead in a way people notice without being able to say why.
  const blink = !reducedMotion && Math.sin(time * 0.9) > 0.97;

  if (mood === "delighted") {
    // Happy closed arcs.
    ctx.strokeStyle = "#2a1a3d";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-5, -12, 3, Math.PI, 0);
    ctx.arc(5, -12, 3, Math.PI, 0);
    ctx.stroke();
  } else if (blink) {
    ctx.fillRect(-7, -12, 4, 1.4);
    ctx.fillRect(3, -12, 4, 1.4);
  } else {
    ctx.beginPath();
    ctx.arc(-5, -11, 2.3, 0, Math.PI * 2);
    ctx.arc(5, -11, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#2a1a3d";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (mood) {
    case "delighted":
      ctx.arc(0, -5, 5, 0.15, Math.PI - 0.15);
      break;
    case "happy":
      ctx.arc(0, -6, 4, 0.25, Math.PI - 0.25);
      break;
    case "unsure":
      // A flat, slightly wavy line -- "hmm" rather than "you failed".
      ctx.moveTo(-4, -4);
      ctx.lineTo(0, -5);
      ctx.lineTo(4, -4);
      break;
    default:
      ctx.moveTo(-3.5, -4.5);
      ctx.lineTo(3.5, -4.5);
  }
  ctx.stroke();
}

/** The order ticket the customer is holding. */
export function drawTicket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  colour: Rgb,
  colourLabel: string,
  textureLabel: string,
  mixInLabels: readonly string[],
  largeText: boolean,
): void {
  const scale = largeText ? 1.18 : 1;
  const lines = 2 + (mixInLabels.length > 0 ? 1 : 0);
  const h = (26 + lines * 12) * scale;

  ctx.save();
  ctx.translate(x, y);

  // Paper.
  ctx.fillStyle = SHOP_PALETTE.ticket;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 5);
  ctx.fill();

  // Torn top edge, so it reads as a till receipt.
  ctx.fillStyle = SHOP_PALETTE.wall;
  for (let i = 0; i < w; i += 6) {
    ctx.beginPath();
    ctx.arc(i + 3, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  const pad = 7;
  let cursor = 9 * scale;

  ctx.fillStyle = SHOP_PALETTE.ticketInk;
  ctx.font = `700 ${8 * scale}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ORDER", pad, cursor);
  cursor += 12 * scale;

  // Swatch first: the colour itself is the instruction, and the name is the
  // caption. That ordering is deliberate -- it works before you can read.
  const swatch = 11 * scale;
  ctx.fillStyle = toCss(colour);
  ctx.beginPath();
  ctx.roundRect(pad, cursor - 1, swatch, swatch, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(42,26,61,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = SHOP_PALETTE.ticketInk;
  ctx.font = `700 ${9 * scale}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(colourLabel.toUpperCase(), pad + swatch + 5, cursor + 1);
  cursor += 14 * scale;

  ctx.font = `${8 * scale}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillStyle = "rgba(42,26,61,0.8)";
  ctx.fillText(textureLabel, pad, cursor);
  cursor += 11 * scale;

  if (mixInLabels.length > 0) {
    ctx.fillText(`+ ${mixInLabels.join("  + ")}`, pad, cursor);
  }

  ctx.restore();
}

/** Cabinet marquee art for the arcade menu. */
export function drawShopIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const scale = size / 32;
  ctx.save();
  ctx.scale(scale, scale);

  // A jar with a fat blob of slime in it.
  ctx.fillStyle = "#3ddc97";
  ctx.beginPath();
  ctx.ellipse(16, 20, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // A drip over the rim, which is what makes it read as slime and not a ball.
  ctx.beginPath();
  ctx.moveTo(9, 20);
  ctx.quadraticCurveTo(7, 26, 10, 27);
  ctx.quadraticCurveTo(12, 25, 11, 20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(12, 17, 3, 1.6, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(22, 12);
  drawStar(ctx, 4);
  ctx.restore();

  ctx.save();
  ctx.translate(9, 11);
  drawTaco(ctx, 4.5);
  ctx.restore();

  ctx.restore();
}

/**
 * The "lives" pip. There are no lives in a slime shop, so the shell's pip row
 * is reskinned as jars still to fill -- the contract explicitly allows a game
 * to redefine this one piece of chrome, and orders-remaining is the honest
 * equivalent here.
 */
export function drawJarIcon(
  ctx: CanvasRenderingContext2D,
  highContrast: boolean,
): void {
  ctx.fillStyle = highContrast ? "#ffffff" : "#3ddc97";
  ctx.beginPath();
  ctx.roundRect(-4, -4, 8, 9, 2);
  ctx.fill();
  ctx.fillStyle = highContrast ? "#ffffff" : "rgba(255,255,255,0.6)";
  ctx.fillRect(-5, -6, 10, 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ----- Prizes in the slime -----

/**
 * Something still buried, seen through the slime.
 *
 * Drawn as a soft lump that sharpens as it works loose, rather than popping
 * into existence at the end. Seeing a vague shape you can't identify yet is
 * what makes the next stretch worth doing -- an invisible prize gives you
 * nothing to aim at, and a fully visible one removes the reason to dig.
 */
export function drawBuriedPrize(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  emoji: string,
  progress: number,
  slimeColour: Rgb,
  time: number,
  reducedMotion: boolean,
): void {
  const t = Math.max(0, Math.min(1, progress));
  const bob = reducedMotion ? 0 : Math.sin(time * 2 + x) * 1.2;

  ctx.save();
  ctx.translate(x, y + bob);

  // The lump pressing up through the surface.
  ctx.globalAlpha = 0.35 + t * 0.35;
  ctx.fillStyle = toCss(shift(slimeColour, 0.4));
  ctx.beginPath();
  ctx.ellipse(0, 0, 9 + t * 3, 7 + t * 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // The prize itself, fading up from a silhouette.
  ctx.globalAlpha = 0.18 + t * 0.82;
  ctx.font = `${13 + t * 5}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 0, 0);

  ctx.restore();
}

/** A prize that has just broken the surface, on its way to the tray. */
export function drawPoppedPrize(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  emoji: string,
  age: number,
  accent: string,
): void {
  // Scale overshoots then settles -- the pop is the payoff, so it gets the
  // most exaggerated easing in the game.
  const t = Math.min(1, age / 0.45);
  const scale = t < 0.5 ? 1 + t * 1.6 : 1.8 - (t - 0.5) * 1.0;
  const rise = t * 26;

  ctx.save();
  ctx.translate(x, y - rise);
  ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.7) / 0.3);

  // A burst ring behind it, sized off the same curve.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha *= 1 - t;
  ctx.beginPath();
  ctx.arc(0, 0, 10 + t * 26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.7) / 0.3);
  ctx.font = `${20 * scale}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

/** How much digging is left, as a ring under the slime. */
export function drawDigMeter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  found: number,
  total: number,
): void {
  const gap = 13;
  const startX = cx - ((total - 1) * gap) / 2;

  ctx.save();
  for (let i = 0; i < total; i += 1) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, cy, 4, 0, Math.PI * 2);
    if (i < found) {
      ctx.fillStyle = SHOP_PALETTE.neon;
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(198,178,224,0.5)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  ctx.restore();
}

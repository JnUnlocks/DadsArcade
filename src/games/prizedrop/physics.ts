/**
 * Circles in a tank.
 *
 * Everything here is a circle, a wall or the floor, which is what lets it be
 * written by hand and still stack properly. It knows nothing about the screen
 * or the score: it moves prizes, keeps them out of each other and reports
 * which pairs merged.
 *
 * The method is position-based. Each step moves every prize where its
 * velocity says, then pushes overlapping pairs apart several times over, then
 * works out what velocity that amounts to. Pushing positions rather than
 * trading impulses is what makes a pile sit still: there is no energy left
 * over to make it simmer.
 *
 * Positive y is down. The tank has two walls and a floor and no lid.
 */

import { prize, TANK_H, TANK_W, TOP_TIER } from "./prizes.ts";

/** The step the physics is tuned for. The arcade's loop runs two per tick. */
export const PHYSICS_STEP = 1 / 120;

const GRAVITY = 1000;
/**
 * Nothing moves faster than this. At 1/120s it is 10 units a step, under the
 * 12-unit radius of the smallest prize, so one prize can't pass through
 * another between two steps.
 */
const MAX_SPEED = 1200;
const ITERATIONS = 8;
/** Pairs this close are kept for the solver, so a push can't create a miss. */
const BROAD_MARGIN = 4;

const RESTITUTION = 0.12;
/** A landing slower than this doesn't bounce at all, so piles come to rest. */
const BOUNCE_MIN_SPEED = 90;
const FRICTION = 0.45;
/** Share of speed and spin lost per second to the air. */
const LINEAR_DAMPING = 0.25;
const SPIN_DAMPING = 1.6;

/**
 * A merged prize starts small and swells to its size at this speed.
 *
 * It appears where two smaller ones were, and at full size it would overlap
 * whatever was resting on them. Appearing at once would throw those
 * neighbours across the tank; growing into them nudges them aside at about
 * this speed.
 */
const GROW_SPEED = 200;
const BORN_SCALE = 0.5;
/** Two matching prizes this close are touching. */
const TOUCH_SLOP = 0.75;

export interface Body {
  readonly id: number;
  readonly tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Its size now, which is under `fullR` while a merged prize is swelling. */
  r: number;
  readonly fullR: number;
  /** One over its mass. Mass goes with area, so a big prize shoves a small one. */
  readonly w: number;
  angle: number;
  spin: number;
  /** Seconds since it was dropped or made. */
  age: number;
}

export interface World {
  bodies: Body[];
  nextId: number;
}

export interface MergeEvent {
  /** The prize that was made. */
  readonly tier: number;
  readonly x: number;
  readonly y: number;
  readonly parents: readonly [number, number];
  readonly child: number;
}

export interface StepReport {
  merges: MergeEvent[];
  /** The hardest knock of the step, in units a second, and the prize in it. */
  impact: number;
  impactTier: number;
}

export function createWorld(): World {
  return { bodies: [], nextId: 1 };
}

/** Put a prize in the tank at full size, at rest. */
export function addBody(world: World, tier: number, x: number, y: number): Body {
  const body = makeBody(world, tier, x, y, 1);
  world.bodies.push(body);
  return body;
}

function makeBody(world: World, tier: number, x: number, y: number, scale: number): Body {
  const fullR = prize(tier).radius;
  const id = world.nextId;
  world.nextId += 1;
  return {
    id,
    tier,
    x,
    y,
    vx: 0,
    vy: 0,
    r: fullR * scale,
    fullR,
    // Normalised to the smallest prize, to keep the numbers near one.
    w: (12 * 12) / (fullR * fullR),
    angle: 0,
    spin: 0,
    age: 0,
  };
}

interface Contact {
  a: Body;
  /** Null for a wall or the floor. */
  b: Body | null;
  /** From a towards b, or into the wall. */
  nx: number;
  ny: number;
  /** How hard they were closing before the solver stepped in. */
  closing: number;
  /** How far the solver moved them apart, all iterations together. */
  pushed: number;
}

/** Advance the tank by one PHYSICS_STEP. */
export function stepWorld(world: World, dt = PHYSICS_STEP): StepReport {
  const bodies = world.bodies;
  const report: StepReport = { merges: [], impact: 0, impactTier: 0 };

  // Where each prize was, to turn the solver's pushes back into a velocity.
  const startX: number[] = [];
  const startY: number[] = [];
  const drag = Math.max(0, 1 - LINEAR_DAMPING * dt);
  const spinDrag = Math.max(0, 1 - SPIN_DAMPING * dt);

  for (let i = 0; i < bodies.length; i += 1) {
    const b = bodies[i]!;
    b.age += dt;
    if (b.r < b.fullR) b.r = Math.min(b.fullR, b.r + GROW_SPEED * dt);

    b.vy += GRAVITY * dt;
    b.vx *= drag;
    b.vy *= drag;
    b.spin *= spinDrag;
    limitSpeed(b);

    startX.push(b.x);
    startY.push(b.y);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;
  }

  // Every pair near enough to matter this step, found once.
  const contacts: Contact[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j]!;
      const reach = a.r + b.r + BROAD_MARGIN;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy < reach * reach) {
        contacts.push({ a, b, nx: 0, ny: 0, closing: 0, pushed: 0 });
      }
    }
  }
  const pairCount = contacts.length;
  // Three more each for the walls and the floor.
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i]!;
    contacts.push({ a, b: null, nx: -1, ny: 0, closing: 0, pushed: 0 });
    contacts.push({ a, b: null, nx: 1, ny: 0, closing: 0, pushed: 0 });
    contacts.push({ a, b: null, nx: 0, ny: 1, closing: 0, pushed: 0 });
  }

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    for (let c = 0; c < pairCount; c += 1) {
      const contact = contacts[c]!;
      const a = contact.a;
      const b = contact.b!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const reach = a.r + b.r;
      const distSq = dx * dx + dy * dy;
      if (distSq >= reach * reach) continue;

      let dist = Math.sqrt(distSq);
      if (dist < 1e-6) {
        // Two centres in the same place have no direction between them. The
        // newer prize goes up: always the same answer, and never a divide by
        // zero.
        dx = 0;
        dy = -1;
        dist = 1;
        if (a.id > b.id) dy = 1;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = reach - Math.sqrt(distSq);
      const total = a.w + b.w;

      if (contact.pushed === 0) {
        contact.closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      }
      contact.nx = nx;
      contact.ny = ny;
      contact.pushed += overlap;

      const moveA = (overlap * a.w) / total;
      const moveB = (overlap * b.w) / total;
      a.x -= nx * moveA;
      a.y -= ny * moveA;
      b.x += nx * moveB;
      b.y += ny * moveB;
    }

    for (let c = pairCount; c < contacts.length; c += 1) {
      const contact = contacts[c]!;
      const a = contact.a;
      let overlap = 0;
      if (contact.ny === 1) overlap = a.y + a.r - TANK_H;
      else if (contact.nx === -1) overlap = a.r - a.x;
      else overlap = a.x + a.r - TANK_W;
      if (overlap <= 0) continue;

      if (contact.pushed === 0) contact.closing = -(a.vx * contact.nx + a.vy * contact.ny);
      contact.pushed += overlap;
      a.x -= contact.nx * overlap;
      a.y -= contact.ny * overlap;
    }
  }

  for (let i = 0; i < bodies.length; i += 1) {
    const b = bodies[i]!;
    b.vx = (b.x - startX[i]!) / dt;
    b.vy = (b.y - startY[i]!) / dt;
  }

  // The solver leaves every contact dead: no bounce, no grip. Put a little
  // of each back.
  for (const contact of contacts) {
    if (contact.pushed <= 0) continue;
    const a = contact.a;
    const b = contact.b;
    const nx = contact.nx;
    const ny = contact.ny;
    const tx = -ny;
    const ty = nx;
    const wb = b ? b.w : 0;
    const total = a.w + wb;

    const bvx = b ? b.vx : 0;
    const bvy = b ? b.vy : 0;

    if (contact.closing < -BOUNCE_MIN_SPEED) {
      const speed = -contact.closing;
      if (speed > report.impact) {
        report.impact = speed;
        report.impactTier = b ? Math.max(a.tier, b.tier) : a.tier;
      }
      const now = (bvx - a.vx) * nx + (bvy - a.vy) * ny;
      const want = RESTITUTION * speed;
      if (want > now) {
        const j = (want - now) / total;
        a.vx -= nx * j * a.w;
        a.vy -= ny * j * a.w;
        if (b) {
          b.vx += nx * j * b.w;
          b.vy += ny * j * b.w;
        }
      }
    }

    // Grip, which is also what makes a prize roll and not just slide. How
    // much there is depends on how hard the two are pressed together.
    const slide =
      (bvx - a.vx) * tx + (bvy - a.vy) * ty - a.spin * a.r - (b ? b.spin * b.r : 0);
    const press = contact.pushed / (total * dt);
    const limit = FRICTION * press;
    let jt = -slide / (3 * total);
    if (jt > limit) jt = limit;
    else if (jt < -limit) jt = -limit;

    a.vx -= tx * jt * a.w;
    a.vy -= ty * jt * a.w;
    a.spin -= (2 * jt * a.w) / a.r;
    if (b) {
      b.vx += tx * jt * b.w;
      b.vy += ty * jt * b.w;
      b.spin -= (2 * jt * b.w) / b.r;
    }
  }

  for (const b of bodies) limitSpeed(b);

  mergePairs(world, report);
  return report;
}

function limitSpeed(b: Body): void {
  const speedSq = b.vx * b.vx + b.vy * b.vy;
  if (speedSq > MAX_SPEED * MAX_SPEED) {
    const scale = MAX_SPEED / Math.sqrt(speedSq);
    b.vx *= scale;
    b.vy *= scale;
  }
}

/**
 * Turn every touching pair of matching prizes into the next prize up.
 *
 * Pairs are taken in the order the prizes are held, which is oldest first and
 * the same on every run. Both halves of a pair are spoken for the moment it
 * is chosen, so with three in a row the first two merge and the third waits.
 * The new prize can't merge again until the next step: a chain is one merge a
 * step, never a loop inside this one.
 */
function mergePairs(world: World, report: StepReport): void {
  const bodies = world.bodies;
  const taken = new Set<number>();
  const born: Body[] = [];

  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i]!;
    if (a.tier >= TOP_TIER || taken.has(a.id)) continue;
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j]!;
      if (b.tier !== a.tier || taken.has(b.id)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const reach = a.r + b.r + TOUCH_SLOP;
      if (dx * dx + dy * dy > reach * reach) continue;

      taken.add(a.id);
      taken.add(b.id);

      // They weigh the same, so halfway between is the centre of mass.
      const child = makeBody(world, a.tier + 1, (a.x + b.x) / 2, (a.y + b.y) / 2, BORN_SCALE);
      child.vx = (a.vx + b.vx) / 2;
      child.vy = (a.vy + b.vy) / 2;
      child.angle = a.angle;
      child.spin = (a.spin + b.spin) / 2;
      child.x = Math.min(TANK_W - child.r, Math.max(child.r, child.x));
      child.y = Math.min(TANK_H - child.r, child.y);
      born.push(child);

      report.merges.push({
        tier: child.tier,
        x: child.x,
        y: child.y,
        parents: [a.id, b.id],
        child: child.id,
      });
      break;
    }
  }

  if (taken.size === 0) return;
  world.bodies = bodies.filter((b) => !taken.has(b.id));
  world.bodies.push(...born);
}

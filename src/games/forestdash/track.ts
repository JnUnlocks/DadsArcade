/**
 * The forest course: ground, gaps, hazards and the things that throw you up.
 *
 * World units, x to the right and y UP from the forest floor (y = 0). That's
 * the opposite of the canvas, but jumping maths reads far more naturally with
 * up as positive, and render.ts flips it once.
 *
 * This is the first playable's single hand-built track. The daily track in the
 * plan is the same pieces stitched together from a seed, which is why the
 * course is assembled by a builder of named pieces rather than a list of
 * coordinates: a piece that's fair here is fair wherever the seed puts it.
 */

/** A run of solid ground. Between two of these is a pit. */
export interface Ground {
  x0: number;
  x1: number;
  /** Height of the top surface. */
  top: number;
}

/** Something on the ground that trips you if you run into it. */
export interface Hazard {
  kind: "log" | "bramble";
  x: number;
  w: number;
  h: number;
  /** Height of the ground it sits on. */
  base: number;
}

/** A stretch of ground that slows you down while you run through it. */
export interface Puddle {
  x0: number;
  x1: number;
  top: number;
}

/** A big mushroom: land on its cap and it throws you high into the air. */
export interface Cap {
  x: number;
  w: number;
  top: number;
  /** Where its stem stands, for drawing. */
  base: number;
}

/** A column of glowing spores that lifts you while you glide through it. */
export interface Updraft {
  x0: number;
  x1: number;
  /** Height above which it stops pushing. */
  top: number;
}

/** Something to collect. Worth points, never required. */
export interface Acorn {
  x: number;
  y: number;
}

export interface Track {
  ground: Ground[];
  hazards: Hazard[];
  puddles: Puddle[];
  caps: Cap[];
  updrafts: Updraft[];
  acorns: Acorn[];
  startX: number;
  finishX: number;
  /** Where the world ends. Ground runs past the finish so nobody falls off. */
  endX: number;
}

/** A cap's bounce surface is this much narrower than it's drawn, so a toe on the rim doesn't count. */
export const CAP_INSET = 6;

class TrackBuilder {
  x = 0;
  top = 0;
  readonly track: Track = {
    ground: [],
    hazards: [],
    puddles: [],
    caps: [],
    updrafts: [],
    acorns: [],
    startX: 0,
    finishX: 0,
    endX: 0,
  };

  /** Solid ground at the current height. Joins onto ground just before it. */
  flat(length: number): this {
    const last = this.track.ground[this.track.ground.length - 1];
    if (last && last.x1 === this.x && last.top === this.top) {
      last.x1 += length;
    } else {
      this.track.ground.push({ x0: this.x, x1: this.x + length, top: this.top });
    }
    this.x += length;
    return this;
  }

  /** A pit. The ground on the far side is at `top`. */
  gap(length: number, top = this.top): this {
    this.x += length;
    this.top = top;
    return this;
  }

  /** A sharp change of ground height with no pit -- a ledge to jump up, or a drop. */
  step(top: number): this {
    this.top = top;
    return this;
  }

  log(): this {
    this.track.hazards.push({ kind: "log", x: this.x, w: 34, h: 24, base: this.top });
    return this.flat(34);
  }

  bramble(): this {
    this.track.hazards.push({ kind: "bramble", x: this.x, w: 44, h: 30, base: this.top });
    return this.flat(44);
  }

  puddle(length: number): this {
    this.track.puddles.push({ x0: this.x, x1: this.x + length, top: this.top });
    return this.flat(length);
  }

  /** A pit with bouncy mushrooms standing in it: each is [units in, cap height]. */
  capGap(length: number, caps: ReadonlyArray<readonly [number, number]>, top = this.top): this {
    for (const [at, capTop] of caps) {
      this.track.caps.push({ x: this.x + at, w: 72, top: capTop, base: -200 });
    }
    return this.gap(length, top);
  }

  /** A pit too wide to glide across, with an updraft in the middle of it. */
  updraftGap(length: number, from: number, to: number, lift: number, top = this.top): this {
    this.track.updrafts.push({ x0: this.x + from, x1: this.x + to, top: lift });
    return this.gap(length, top);
  }

  /** A row of acorns `height` above the ground, starting `at` units back from here. */
  acorns(count: number, height: number, spacing = 34, at = 0): this {
    for (let i = 0; i < count; i += 1) {
      this.track.acorns.push({ x: this.x + at + i * spacing, y: this.top + height });
    }
    return this;
  }

  /** An arc of acorns over a gap that starts here, tracing a jump. */
  arc(count: number, length: number, peak: number): this {
    for (let i = 0; i < count; i += 1) {
      const t = (i + 1) / (count + 1);
      this.track.acorns.push({
        x: this.x + t * length,
        y: this.top + 30 + peak * 4 * t * (1 - t),
      });
    }
    return this;
  }

  start(): this {
    this.track.startX = this.x;
    return this;
  }

  finish(): this {
    this.track.finishX = this.x;
    return this;
  }

  build(): Track {
    this.track.endX = this.x;
    return this.track;
  }
}

/**
 * The first playable's course: about forty seconds for a clean run.
 *
 * It's laid out as a lesson. Every new thing first appears on its own with
 * room either side, and only later gets combined with something else:
 * jump a log, jump a gap, jump UP a ledge, glide a wide gap, bounce on a cap,
 * ride an updraft. A run-up at the start means the race is never decided by
 * the countdown.
 */
export function buildTrack(): Track {
  const b = new TrackBuilder();
  b.flat(140).start().flat(420);

  // The Mossy Floor: one idea at a time.
  b.acorns(4, 20).flat(160).log().flat(320);
  b.arc(3, 110, 50).gap(110).flat(320);
  b.acorns(4, 20).puddle(150).flat(260);
  b.step(40).flat(300);
  b.arc(3, 120, 40).gap(120, 0).flat(260);
  b.bramble().flat(300);
  b.log().flat(170).log().flat(300);

  // The Glowcap Grove: things that throw you about.
  b.capGap(380, [[150, 30]]).flat(320);
  b.acorns(3, 20).gap(140).flat(300);
  b.arc(5, 300, 60).gap(300).flat(320);
  b.updraftGap(560, 120, 400, 260).flat(320);
  b.step(50).flat(220).step(100).flat(300);
  b.gap(150, 0).flat(260);

  // The Old Root Tangle: everything at once, and the finish.
  b.bramble().flat(200).puddle(140).flat(220);
  b.capGap(650, [[150, 40], [400, 70]]).flat(380);
  b.log().flat(220);
  b.arc(3, 130, 50).gap(130).flat(260);
  b.acorns(5, 20).flat(240).finish().flat(600);
  return b.build();
}

/**
 * Glowcap Grove: the bouncy one. More mushrooms and more spores than the
 * Mossy Floor, and fewer things to trip over.
 */
function buildGlowcapGrove(): Track {
  const b = new TrackBuilder();
  b.flat(140).start().flat(420);

  b.acorns(4, 20).flat(220);
  b.capGap(380, [[150, 30]]).flat(320);
  b.arc(3, 120, 50).gap(120).flat(280);
  b.log().flat(300);
  b.capGap(650, [[150, 40], [400, 70]]).flat(380);
  b.acorns(4, 20).puddle(140).flat(280);
  // Hold on through an updraft and you come down a long way past it, so
  // each one is followed by plenty of ground before the next pit.
  b.updraftGap(560, 120, 400, 260).flat(340);
  b.log().flat(300).acorns(4, 20).flat(320);
  b.arc(3, 130, 50).gap(130).flat(280);
  b.capGap(380, [[150, 30]]).flat(320);
  b.bramble().flat(300);
  b.arc(5, 300, 60).gap(300).flat(340);
  b.updraftGap(560, 120, 400, 260).flat(340);
  b.bramble().flat(300).log().flat(320);
  b.arc(3, 120, 50).gap(120).flat(260);
  b.acorns(5, 20).flat(240).finish().flat(600);
  return b.build();
}

/**
 * The Old Root Tangle: the trippy one. Logs, brambles, puddles and ledges
 * close together, so it's about jumping on the beat rather than gliding.
 */
function buildRootTangle(): Track {
  const b = new TrackBuilder();
  b.flat(140).start().flat(420);

  b.log().flat(260).log().flat(300);
  b.acorns(4, 20).puddle(150).flat(240);
  b.bramble().flat(280);
  b.step(40).flat(280).step(80).flat(300);
  b.arc(3, 120, 40).gap(120, 0).flat(280);
  b.log().flat(200).bramble().flat(300);
  b.arc(3, 140, 50).gap(140).flat(260);
  b.puddle(140).flat(220).log().flat(300);
  b.step(50).flat(260);
  b.arc(3, 130, 40).gap(130, 0).flat(280);
  b.bramble().flat(220).log().flat(220).log().flat(300);
  b.capGap(380, [[150, 30]]).flat(320);
  b.acorns(4, 20).puddle(140).flat(240);
  b.log().flat(240).bramble().flat(280);
  b.arc(3, 130, 50).gap(130).flat(260);
  b.acorns(5, 20).flat(240).finish().flat(600);
  return b.build();
}

/**
 * Moonlit Ridge: the high one, and the hardest. Climb the ledges, then glide
 * back down across the widest gaps in the forest.
 */
function buildMoonlitRidge(): Track {
  const b = new TrackBuilder();
  b.flat(140).start().flat(420);

  b.acorns(4, 20).flat(200);
  b.step(50).flat(240).step(100).flat(300);
  b.arc(5, 300, 60).gap(300, 0).flat(340);
  b.log().flat(280);
  b.updraftGap(560, 120, 400, 260).flat(340);
  b.step(40).flat(240).step(90).flat(260);
  b.arc(3, 140, 40).gap(140, 40).flat(280);
  b.arc(5, 300, 60).gap(300, 0).flat(340);
  b.bramble().flat(280);
  b.capGap(650, [[150, 40], [400, 70]]).flat(380);
  b.acorns(4, 20).puddle(140).flat(260);
  b.step(50).flat(260);
  b.arc(5, 300, 60).gap(300, 0).flat(340);
  b.updraftGap(560, 120, 400, 260).flat(340);
  b.log().flat(300).puddle(140).flat(260);
  b.arc(3, 130, 50).gap(130).flat(260);
  b.acorns(5, 20).flat(240).finish().flat(600);
  return b.build();
}

/** One of the courses on the title card. */
export interface Course {
  /** Stable id: part of the key the family's runs are filed under. */
  id: string;
  name: string;
  blurb: string;
  build(): Track;
}

export const COURSES: readonly Course[] = [
  {
    id: "mossy",
    name: "MOSSY FLOOR",
    blurb: "The first course. One new thing at a time.",
    build: buildTrack,
  },
  {
    id: "glowcap",
    name: "GLOWCAP GROVE",
    blurb: "Bouncy. Lots of mushrooms and glowing spores.",
    build: buildGlowcapGrove,
  },
  {
    id: "tangle",
    name: "ROOT TANGLE",
    blurb: "Logs, brambles and ledges, close together.",
    build: buildRootTangle,
  },
  {
    id: "ridge",
    name: "MOONLIT RIDGE",
    blurb: "The hard one. Climb up, then glide the widest gaps.",
    build: buildMoonlitRidge,
  },
];

/**
 * A key for one exact layout of one course, e.g. "mossy-1-k3f9x2".
 *
 * A saved run is only a list of button presses, so it's only worth anything
 * on the layout and the rules it was made on. The key carries a fingerprint
 * of both: move a log and the old runs are simply never asked for again,
 * instead of being replayed into a pit that wasn't there when they were set.
 */
export function courseKey(courseId: string, track: Track, rulesVersion: number): string {
  const { ground, hazards, puddles, caps, updrafts, startX, finishX } = track;
  const text = JSON.stringify([ground, hazards, puddles, caps, updrafts, startX, finishX]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return `${courseId}-${rulesVersion}-${(h >>> 0).toString(36)}`;
}

/** The ground directly under `x`, or null over a pit. */
export function groundAt(track: Track, x: number): Ground | null {
  for (const g of track.ground) {
    if (x >= g.x0 && x < g.x1) return g;
  }
  return null;
}

/** The cap whose bounce surface covers `x`, or null. */
export function capAt(track: Track, x: number): Cap | null {
  for (const c of track.caps) {
    if (Math.abs(x - c.x) <= c.w / 2 - CAP_INSET) return c;
  }
  return null;
}

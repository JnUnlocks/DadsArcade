/**
 * Paint mixing for the slime counter.
 *
 * The whole game hangs on this file. A slime shop is a creative toy, and
 * creative toys don't have scores -- so the scoreable skill here is *colour
 * matching*, and that only works if mixing behaves the way a seven-year-old
 * expects paint to behave. In RGB, blue + yellow is grey. On a paint palette
 * it's green. Getting that wrong wouldn't be a rendering nit; it would make
 * the core verb of the game feel broken.
 *
 * So bottles mix in RYB (red/yellow/blue) space and we convert to RGB only at
 * the moment of drawing, via the standard Gosset-Chen cube interpolation.
 * Blue + yellow really is green.
 *
 * Two further departures from naive averaging, both for the same reason:
 *
 *   - Colour pours normalise by the *largest* pour, not by their sum. Summing
 *     means one red plus one yellow lands halfway to white and you get a muddy
 *     peach; dividing by the max keeps it fully saturated and gives you actual
 *     orange. "Equal parts red and yellow makes orange" has to be true.
 *
 *   - White and black are handled separately from the three colour bottles,
 *     because in the RYB cube white is the *origin* and black is the far
 *     corner. Treating them as a fourth and fifth axis would mean adding white
 *     pulls toward whatever corner it shares with the rest. Instead they lerp
 *     the mixed colour toward those two corners, which is what tinting and
 *     shading actually do.
 */

/** The five bottles on the shelf. */
export type Bottle = "red" | "yellow" | "blue" | "white" | "black";

export const BOTTLES: readonly Bottle[] = [
  "red",
  "yellow",
  "blue",
  "white",
  "black",
];

/** How many pours of each bottle are in the bowl. */
export type Recipe = Record<Bottle, number>;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function emptyRecipe(): Recipe {
  return { red: 0, yellow: 0, blue: 0, white: 0, black: 0 };
}

export function totalPours(recipe: Recipe): number {
  return recipe.red + recipe.yellow + recipe.blue + recipe.white + recipe.black;
}

/**
 * The eight corners of the RYB cube, expressed in RGB.
 *
 * These are the Gosset-Chen values rather than anything derived: the whole
 * point is that they're what a painter would call these mixes, not what a
 * monitor would.
 */
const CUBE: readonly Rgb[] = [
  { r: 1.0, g: 1.0, b: 1.0 }, // 000 white
  { r: 0.163, g: 0.373, b: 0.6 }, // 001 blue
  { r: 1.0, g: 1.0, b: 0.0 }, // 010 yellow
  { r: 0.0, g: 0.66, b: 0.2 }, // 011 green
  { r: 1.0, g: 0.0, b: 0.0 }, // 100 red
  { r: 0.5, g: 0.0, b: 0.5 }, // 101 purple
  { r: 1.0, g: 0.5, b: 0.0 }, // 110 orange
  { r: 0.2, g: 0.094, b: 0.0 }, // 111 black
];

/** Trilinear interpolation across the RYB cube. Inputs are each 0..1. */
export function rybToRgb(r: number, y: number, b: number): Rgb {
  const rr = clamp01(r);
  const yy = clamp01(y);
  const bb = clamp01(b);

  let outR = 0;
  let outG = 0;
  let outB = 0;

  for (let i = 0; i < 8; i += 1) {
    const corner = CUBE[i]!;
    // Bit 2 = red axis, bit 1 = yellow axis, bit 0 = blue axis.
    const wr = i & 0b100 ? rr : 1 - rr;
    const wy = i & 0b010 ? yy : 1 - yy;
    const wb = i & 0b001 ? bb : 1 - bb;
    const weight = wr * wy * wb;
    outR += corner.r * weight;
    outG += corner.g * weight;
    outB += corner.b * weight;
  }

  return { r: outR, g: outG, b: outB };
}

/**
 * Turn a bowl of pours into the colour it actually looks like.
 *
 * An empty bowl is white -- the same as an empty mixing bowl in a kitchen,
 * and it means the bowl reads as "nothing in here yet" rather than black.
 */
export function mixRecipe(recipe: Recipe): Rgb {
  const colour = recipe.red + recipe.yellow + recipe.blue;

  if (colour === 0 && recipe.white === 0 && recipe.black === 0) {
    return { r: 1, g: 1, b: 1 };
  }

  // Normalise by the strongest pour so equal parts stay saturated.
  const peak = Math.max(recipe.red, recipe.yellow, recipe.blue);
  const base =
    peak === 0
      ? { r: 0, y: 0, b: 0 } // white/black only: start from the white corner
      : {
          r: recipe.red / peak,
          y: recipe.yellow / peak,
          b: recipe.blue / peak,
        };

  // Tint toward white, then shade toward black. Both are ratios against how
  // much is already in the bowl, so one drop of white in a big batch barely
  // shows -- which is exactly how it works with real slime.
  const tint =
    colour + recipe.white === 0 ? 0 : recipe.white / (colour + recipe.white);
  const shade =
    colour + recipe.white + recipe.black === 0
      ? 0
      : recipe.black / (colour + recipe.white + recipe.black);

  const mixed = rybToRgb(
    base.r * (1 - tint),
    base.y * (1 - tint),
    base.b * (1 - tint),
  );
  const dark = CUBE[7]!;

  return {
    r: lerp(mixed.r, dark.r, shade),
    g: lerp(mixed.g, dark.g, shade),
    b: lerp(mixed.b, dark.b, shade),
  };
}

/**
 * How close two colours look, 0..1, where 1 is a perfect match.
 *
 * Uses the "redmean" weighting rather than plain RGB distance. Flat Euclidean
 * distance says a blue that's slightly off is as wrong as a green that's
 * slightly off, but the eye is far pickier about greens. Scoring on raw
 * distance would hand out suspiciously easy points in the blues.
 */
export function colourMatch(a: Rgb, b: Rgb): number {
  const rMean = ((a.r + b.r) / 2) * 255;
  const dr = (a.r - b.r) * 255;
  const dg = (a.g - b.g) * 255;
  const db = (a.b - b.b) * 255;

  const distance = Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db,
  );

  // ~765 is the worst case this weighting can produce.
  return clamp01(1 - distance / 765);
}

export function toCss(colour: Rgb, alpha = 1): string {
  const r = Math.round(clamp01(colour.r) * 255);
  const g = Math.round(clamp01(colour.g) * 255);
  const b = Math.round(clamp01(colour.b) * 255);
  return alpha >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Lighten (positive) or darken (negative) for highlights and rim shading. */
export function shift(colour: Rgb, amount: number): Rgb {
  const target = amount >= 0 ? 1 : 0;
  const t = Math.min(1, Math.abs(amount));
  return {
    r: lerp(colour.r, target, t),
    g: lerp(colour.g, target, t),
    b: lerp(colour.b, target, t),
  };
}

/**
 * Names for the order ticket.
 *
 * A ticket reading "make me #7FE0B2" is a colour-picker exercise. A ticket
 * reading "one Mermaid Tail, please" is a game. The name is picked by nearest
 * neighbour among these, so every mixable colour gets called something, and
 * the swatch is always drawn next to it -- the name is flavour, never the only
 * information, which also keeps the order readable for a player who can't yet
 * read the word.
 */
const NAMED: ReadonlyArray<{ name: string; rgb: Rgb }> = [
  // Reds and pinks
  { name: "Fire Truck", rgb: { r: 1.0, g: 0.0, b: 0.0 } },
  { name: "Strawberry", rgb: { r: 0.93, g: 0.19, b: 0.29 } },
  { name: "Coral", rgb: { r: 1.0, g: 0.45, b: 0.4 } },
  { name: "Bubblegum", rgb: { r: 1.0, g: 0.62, b: 0.78 } },
  { name: "Cotton Candy", rgb: { r: 0.96, g: 0.78, b: 0.94 } },
  { name: "Dusty Rose", rgb: { r: 0.76, g: 0.53, b: 0.55 } },
  // Oranges and yellows
  { name: "Taco Orange", rgb: { r: 1.0, g: 0.5, b: 0.0 } },
  { name: "Peach Fuzz", rgb: { r: 1.0, g: 0.8, b: 0.62 } },
  { name: "Mustard", rgb: { r: 0.85, g: 0.7, b: 0.15 } },
  { name: "Lemon Drop", rgb: { r: 1.0, g: 1.0, b: 0.0 } },
  { name: "Banana Cream", rgb: { r: 1.0, g: 0.95, b: 0.7 } },
  // Greens
  { name: "Apple Sour", rgb: { r: 0.64, g: 0.85, b: 0.27 } },
  { name: "Olive", rgb: { r: 0.5, g: 0.5, b: 0.16 } },
  { name: "Slime Green", rgb: { r: 0.0, g: 0.66, b: 0.2 } },
  { name: "Forest", rgb: { r: 0.12, g: 0.35, b: 0.18 } },
  { name: "Mermaid Tail", rgb: { r: 0.25, g: 0.78, b: 0.62 } },
  { name: "Mint Cloud", rgb: { r: 0.72, g: 0.93, b: 0.82 } },
  // Blues
  { name: "Aqua", rgb: { r: 0.2, g: 0.75, b: 0.85 } },
  { name: "Blue Raspberry", rgb: { r: 0.163, g: 0.373, b: 0.6 } },
  { name: "Sky Fluff", rgb: { r: 0.68, g: 0.84, b: 0.95 } },
  // Purples
  { name: "Grape Soda", rgb: { r: 0.5, g: 0.0, b: 0.5 } },
  { name: "Plum", rgb: { r: 0.55, g: 0.35, b: 0.62 } },
  { name: "Lavender", rgb: { r: 0.78, g: 0.7, b: 0.92 } },
  // Browns and neutrals
  { name: "Root Beer", rgb: { r: 0.42, g: 0.24, b: 0.12 } },
  { name: "Midnight Goo", rgb: { r: 0.2, g: 0.094, b: 0.0 } },
  { name: "Charcoal", rgb: { r: 0.25, g: 0.25, b: 0.28 } },
  { name: "Storm Grey", rgb: { r: 0.55, g: 0.55, b: 0.58 } },
  { name: "Vanilla", rgb: { r: 1.0, g: 1.0, b: 1.0 } },
];

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(c: Rgb): Hsl {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6 : 0)) / 6;
  else if (max === c.g) h = ((c.b - c.r) / d + 2) / 6;
  else h = ((c.r - c.g) / d + 4) / 6;
  return { h, s, l };
}

/**
 * Distance used for *naming* -- deliberately not the same metric as scoring.
 *
 * Reusing colourMatch here produced a memorable bug: a bright lime slime got
 * called "Storm Grey". The scoring metric answers "how close is this to the
 * target", and under it every unrelated colour scores a samey 0.65-0.75, so
 * picking a name became a near-tie that a mid-grey wins by sitting in the
 * middle of RGB space and being vaguely equidistant from everything.
 *
 * Naming is a different question -- "which of these words describes it" -- and
 * that hinges on hue and saturation far more than on raw channel distance. So
 * this works in HSL, weights hue only in proportion to how colourful both
 * sides actually are (hue is meaningless for a grey), and penalises
 * saturation mismatch heavily, which is what stops the neutrals acting as a
 * catch-all for every colour the list doesn't cover exactly.
 */
function nameDistance(a: Rgb, b: Rgb): number {
  const A = rgbToHsl(a);
  const B = rgbToHsl(b);

  let dh = Math.abs(A.h - B.h);
  if (dh > 0.5) dh = 1 - dh; // hue is a circle

  const chroma = Math.min(A.s, B.s);
  return dh * 2.6 * chroma + Math.abs(A.s - B.s) * 1.6 + Math.abs(A.l - B.l) * 1.1;
}

export function colourName(colour: Rgb): string {
  let best = NAMED[0]!;
  let bestDistance = Infinity;
  for (const entry of NAMED) {
    const distance = nameDistance(colour, entry.rgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.name;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

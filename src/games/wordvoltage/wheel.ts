/**
 * The letter wheel's rules and geometry, with no DOM.
 *
 * Tokens are physical: a wheel of L E T T E R has six, two of them showing E
 * and two T, and each can be in a word once. A path is a list of token
 * indexes into the puzzle's letters, never a string, which is what stops a
 * finger lingering on one E from spelling TEE.
 *
 * Swipe, tap and keyboard all build paths through these same functions, so
 * the three can't disagree about what a word is.
 */

export type Path = readonly number[];

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The path's letters, as the pill above the wheel shows them. */
export function pathWord(path: Path, letters: string): string {
  return path.map((token) => letters[token] ?? "").join("");
}

/**
 * The finger has reached a token. Going back onto the one before the last
 * takes the last letter off; any other token already in the word is passed
 * over rather than used twice.
 */
export function enterToken(path: Path, token: number): Path {
  if (path.length === 0) return [token];
  if (path[path.length - 1] === token) return path;
  if (path.length >= 2 && path[path.length - 2] === token) return path.slice(0, -1);
  if (path.includes(token)) return path;
  return [...path, token];
}

/** Tap mode: a tap on the last letter takes it off, on a new one adds it. */
export function tapToken(path: Path, token: number): Path {
  if (path[path.length - 1] === token) return path.slice(0, -1);
  if (path.includes(token)) return path;
  return [...path, token];
}

/**
 * A typed letter: the first token showing it that isn't in the word yet,
 * going round the wheel in the order the player sees it. Null if every token
 * with that letter is already used (or there's none).
 */
export function tokenForLetter(
  letter: string,
  letters: string,
  order: readonly number[],
  path: Path,
): number | null {
  const want = letter.toUpperCase();
  for (const token of order) {
    if (letters[token] === want && !path.includes(token)) return token;
  }
  return null;
}

/** Where each position on the wheel sits, around a circle, the first at the top. */
export function wheelPositions(count: number, cx: number, cy: number, radius: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return points;
}

/**
 * How close a finger has to come to a token's centre to pick it. Generous,
 * but always under half the gap to the neighbouring token, so the circles
 * never overlap and a finger is never over two at once.
 */
export function hitRadius(count: number, radius: number, tokenRadius: number): number {
  const neighbour = 2 * radius * Math.sin(Math.PI / Math.max(count, 2));
  return Math.min(tokenRadius * 1.25, neighbour * 0.47);
}

/** Which token, if any, a point is over. */
export function tokenAt(point: Point, centers: readonly Point[], hit: number): number | null {
  for (let i = 0; i < centers.length; i += 1) {
    const c = centers[i]!;
    const dx = point.x - c.x;
    const dy = point.y - c.y;
    if (dx * dx + dy * dy <= hit * hit) return i;
  }
  return null;
}

/**
 * Every token a finger crossed moving from `from` to `to`, in the order it
 * crossed them. Pointer events arrive every few milliseconds, and a fast
 * swipe can jump clean over a token between two of them; sampling the
 * segment in steps smaller than a hit circle catches it.
 */
export function tokensAlong(
  from: Point,
  to: Point,
  centers: readonly Point[],
  hit: number,
): number[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / (hit / 3)));
  const crossed: number[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const token = tokenAt({ x: from.x + dx * t, y: from.y + dy * t }, centers, hit);
    if (token !== null && crossed[crossed.length - 1] !== token) crossed.push(token);
  }
  return crossed;
}

/**
 * Shuffle the wheel: the same tokens in new seats. Never hands back the
 * order it was given when there's any other order to give.
 */
export function shuffleOrder(order: readonly number[], random: () => number): number[] {
  if (order.length < 2) return [...order];
  for (let tries = 0; tries < 8; tries += 1) {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
    if (next.some((token, i) => token !== order[i])) return next;
  }
  // Every try came back the same (only possible with a broken random):
  // rotate by one, which always moves every token.
  return [...order.slice(1), order[0]!];
}

/** A saved order is only trusted if it's every token exactly once. */
export function validOrder(order: unknown, count: number): order is number[] {
  if (!Array.isArray(order) || order.length !== count) return false;
  const seen = new Set<number>();
  for (const token of order) {
    if (!Number.isInteger(token) || token < 0 || token >= count || seen.has(token)) return false;
    seen.add(token);
  }
  return true;
}

export function initialOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

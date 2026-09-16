/**
 * The seven pieces, and how they turn.
 *
 * A note on why this game looks the way it does, since it's the one genre
 * where "mechanics aren't copyrightable" has a real asterisk. In Tetris
 * Holding v. Xio Interactive (2012) the court agreed that the *rules* of a
 * falling-block game are free to use, and then found against the clone anyway
 * because it had copied the protectable *expression* -- the distinctive piece
 * colours and the overall look. So:
 *
 *   - The shapes themselves are the seven tetrominoes, which are simply the
 *     complete set of four-cell polyominoes. That's a mathematical fact, not
 *     someone's creative choice, and every game in the genre has all seven.
 *   - The colours below are deliberately NOT the canonical ones. They're drawn
 *     from this arcade's own neon palette so the board reads as ours.
 *   - The name is ours, the art is drawn at runtime, and the music is an
 *     original arrangement of a public-domain folk melody.
 */

export type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export const PIECE_KINDS: readonly PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

/**
 * Each piece as its four rotations, written out rather than computed.
 *
 * Rotating a matrix in code is tidier but gets the O piece and the I piece
 * subtly wrong -- they need to spin about a point that isn't the centre of
 * their bounding box, and a generic transpose-and-flip drifts them sideways.
 * Written out, what you read is what appears on the board.
 *
 * Coordinates are [col, row] offsets from the piece's origin.
 */
type Cells = ReadonlyArray<readonly [number, number]>;

const SHAPES: Record<PieceKind, readonly Cells[]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

/**
 * Piece colours.
 *
 * Deliberately not the canonical set -- see the note at the top of the file.
 * These come from the arcade's existing accents so a Brickfall board looks
 * like it belongs next to the other five cabinets rather than like a
 * reproduction of someone else's.
 */
export const PIECE_COLOURS: Record<PieceKind, string> = {
  I: "#46e0ff", // arcade cyan
  O: "#ffc14d", // arcade warm
  T: "#ff5fae", // slime-shop pink
  S: "#7ddc4f", // highway-hop green
  Z: "#ff4d6d", // arcade danger
  J: "#8e7bff", // deep violet
  L: "#3ddc97", // mint
};

export function cellsFor(kind: PieceKind, rotation: number): Cells {
  const rotations = SHAPES[kind];
  return rotations[((rotation % 4) + 4) % 4]!;
}

/**
 * Wall kicks: where else to try when a rotation is blocked.
 *
 * Offsets are tried in order and the first that fits wins. Without these, a
 * piece against a wall or resting on the stack simply refuses to turn, which
 * reads as the controls being broken rather than as the board being tight.
 * The upward nudges are what let a piece rotate out of a well it has just
 * landed in.
 */
const KICKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
];

export function kickOffsets(): ReadonlyArray<readonly [number, number]> {
  return KICKS;
}

/**
 * A shuffled bag of all seven pieces.
 *
 * Drawing each piece uniformly at random means long droughts -- going twenty
 * pieces without an I is perfectly possible and feels like the game has it in
 * for you. Dealing from a shuffled bag of all seven guarantees you never wait
 * more than twelve pieces for any particular one, which is the difference
 * between "this is hard" and "this is unfair".
 */
export function refillBag(shuffle: <T>(items: T[]) => T[]): PieceKind[] {
  return shuffle([...PIECE_KINDS]);
}

/** Width of a piece's bounding box at a given rotation, for centring. */
export function pieceWidth(kind: PieceKind, rotation: number): number {
  const cells = cellsFor(kind, rotation);
  let min = Infinity;
  let max = -Infinity;
  for (const [col] of cells) {
    if (col < min) min = col;
    if (col > max) max = col;
  }
  return max - min + 1;
}

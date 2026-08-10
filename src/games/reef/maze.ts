/**
 * The reef maze.
 *
 * Tile-based, the way the arcade original was: everything (movement, turning,
 * the jellyfish targeting) works in tile coordinates, and pixels only appear
 * at draw time. Trying to do maze chase logic in free pixel space is how you
 * end up with characters clipping corners and turns that don't register.
 *
 * Legend:
 *   #  coral wall
 *   .  bubble (the ordinary pellet)
 *   o  glowing pearl (the power pellet)
 *   -  the gate on the jellyfish den -- passable by jellyfish, not by Riley
 *   ' ' open water with nothing in it (den interior, tunnel mouths)
 */

export const COLS = 19;
export const ROWS = 21;

const LAYOUT: readonly string[] = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "####.#.......#.####",
  "####.#.##-##.#.####",
  ".......#   #.......",
  "####.#.#####.#.####",
  // Riley's start tile (col 9) is deliberately blank -- spawning on top of a
  // bubble means a free point on launch and nothing there on a respawn.
  "####.#... ...#.####",
  "####.###.#.###.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....#.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "###################",
];

export type Tile = "wall" | "gate" | "open";

/** Where Riley starts, and where she returns after being bumped. */
export const START_TILE = { col: 9, row: 11 } as const;
/** The den mouth -- jellyfish aim here to leave, and to get back in. */
export const DEN_TILE = { col: 9, row: 9 } as const;
/** Tile immediately above the gate; jellyfish must reach this to be out. */
export const DEN_EXIT_TILE = { col: 9, row: 7 } as const;

/** The tunnel row, where walking off one side reappears on the other. */
export const TUNNEL_ROW = 9;

/**
 * Each jellyfish retreats to its own corner during scatter phases. Giving
 * them different corners is what stops the four of them moving as a clump.
 */
export const SCATTER_CORNERS = [
  { col: COLS - 2, row: 1 },
  { col: 1, row: 1 },
  { col: COLS - 2, row: ROWS - 2 },
  { col: 1, row: ROWS - 2 },
] as const;

export class Maze {
  /** Static geometry -- never mutated once built. */
  private readonly tiles: Tile[][];
  /** What's left to collect. Mutated as Riley eats. */
  private readonly items: Array<Array<"bubble" | "pearl" | null>>;

  private _remaining = 0;

  constructor() {
    this.tiles = [];
    this.items = [];

    for (let row = 0; row < ROWS; row += 1) {
      const line = LAYOUT[row] ?? "";
      const tileRow: Tile[] = [];
      const itemRow: Array<"bubble" | "pearl" | null> = [];
      for (let col = 0; col < COLS; col += 1) {
        const ch = line[col] ?? "#";
        tileRow.push(ch === "#" ? "wall" : ch === "-" ? "gate" : "open");
        if (ch === ".") {
          itemRow.push("bubble");
          this._remaining += 1;
        } else if (ch === "o") {
          itemRow.push("pearl");
          this._remaining += 1;
        } else {
          itemRow.push(null);
        }
      }
      this.tiles.push(tileRow);
      this.items.push(itemRow);
    }
  }

  get remaining(): number {
    return this._remaining;
  }

  tileAt(col: number, row: number): Tile {
    if (row < 0 || row >= ROWS) return "wall";
    return this.tiles[row]?.[this.wrapCol(col)] ?? "wall";
  }

  itemAt(col: number, row: number): "bubble" | "pearl" | null {
    if (row < 0 || row >= ROWS) return null;
    return this.items[row]?.[this.wrapCol(col)] ?? null;
  }

  /** Removes and returns whatever was on that tile. */
  take(col: number, row: number): "bubble" | "pearl" | null {
    const c = this.wrapCol(col);
    const item = this.items[row]?.[c] ?? null;
    if (item) {
      this.items[row]![c] = null;
      this._remaining -= 1;
    }
    return item;
  }

  /** Riley may swim anywhere except walls and the den gate. */
  isOpenForPlayer(col: number, row: number): boolean {
    return this.tileAt(col, row) === "open";
  }

  /** Jellyfish may also pass through the gate, so they can get in and out. */
  isOpenForGhost(col: number, row: number): boolean {
    const tile = this.tileAt(col, row);
    return tile === "open" || tile === "gate";
  }

  /** Horizontal wrap-around for the tunnel row. */
  wrapCol(col: number): number {
    return ((col % COLS) + COLS) % COLS;
  }

  forEachItem(
    visit: (col: number, row: number, item: "bubble" | "pearl") => void,
  ): void {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const item = this.items[row]?.[col];
        if (item) visit(col, row, item);
      }
    }
  }

  /**
   * Sanity check on the layout, used by the tests. A maze with an unreachable
   * bubble is unwinnable, and you'd only find out by playing a whole level and
   * having it never end -- exactly the kind of bug worth catching statically.
   */
  static validate(): {
    ok: boolean;
    problems: string[];
    pellets: number;
    reachable: number;
  } {
    const problems: string[] = [];

    if (LAYOUT.length !== ROWS) {
      problems.push(`expected ${ROWS} rows, found ${LAYOUT.length}`);
    }
    LAYOUT.forEach((line, i) => {
      if (line.length !== COLS) {
        problems.push(`row ${i} is ${line.length} wide, expected ${COLS}`);
      }
    });

    const maze = new Maze();
    if (!maze.isOpenForPlayer(START_TILE.col, START_TILE.row)) {
      problems.push("start tile is not open water");
    }

    // Flood fill from the start using the player's own movement rules.
    const seen = new Set<string>();
    const queue: Array<{ col: number; row: number }> = [
      { col: START_TILE.col, row: START_TILE.row },
    ];
    seen.add(`${START_TILE.col},${START_TILE.row}`);
    while (queue.length > 0) {
      const { col, row } = queue.pop()!;
      const neighbours = [
        { col: maze.wrapCol(col + 1), row },
        { col: maze.wrapCol(col - 1), row },
        { col, row: row + 1 },
        { col, row: row - 1 },
      ];
      for (const next of neighbours) {
        const key = `${next.col},${next.row}`;
        if (seen.has(key)) continue;
        if (!maze.isOpenForPlayer(next.col, next.row)) continue;
        seen.add(key);
        queue.push(next);
      }
    }

    let pellets = 0;
    let reachable = 0;
    maze.forEachItem((col, row) => {
      pellets += 1;
      if (seen.has(`${col},${row}`)) reachable += 1;
      else problems.push(`pellet at ${col},${row} is unreachable`);
    });

    // The den must be sealed apart from its gate, or the jellyfish leak out
    // sideways and never use the front door.
    const denNeighbours = [
      { col: DEN_TILE.col - 2, row: DEN_TILE.row },
      { col: DEN_TILE.col + 2, row: DEN_TILE.row },
      { col: DEN_TILE.col, row: DEN_TILE.row + 1 },
    ];
    for (const n of denNeighbours) {
      if (maze.tileAt(n.col, n.row) !== "wall") {
        problems.push(`den is open at ${n.col},${n.row}`);
      }
    }
    if (maze.tileAt(DEN_TILE.col, DEN_TILE.row - 1) !== "gate") {
      problems.push("no gate above the den");
    }

    return { ok: problems.length === 0, problems, pellets, reachable };
  }
}

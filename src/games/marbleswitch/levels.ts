/**
 * Marble Switch's ten launch levels.
 *
 * Boards are 360 units across and 520 down, launcher at the top and cups
 * along the bottom. Each is checked by levels.test.ts: a sound track, a
 * matching cup for every marble, a Junior plan that clears it in exactly
 * the flips the third star asks for, and a Classic run that clears it with
 * every flip given a fair window on a phone.
 *
 * Stars: one for a clear, two for clearing in `stars[mode][0]` flips or
 * fewer, three for `stars[mode][1]` or fewer. The three-star number is the
 * fewest flips the level can be done in, so all three are always reachable.
 */

import type { EdgeDef, NodeDef, Symbol } from "./graph.ts";
import type { Mode } from "./sim.ts";

export interface LevelDef {
  readonly number: number;
  readonly name: string;
  readonly teaches: string;
  readonly nodes: readonly NodeDef[];
  readonly edges: readonly EdgeDef[];
  /** Marbles in the order they're dropped. */
  readonly queue: readonly Symbol[];
  /** Classic: seconds after DROP each marble is let go. */
  readonly releases: readonly number[];
  /** Junior's hint, in words. */
  readonly hint: string;
  /** Flips for two stars, then for three, per mode. */
  readonly stars: Readonly<Record<Mode, readonly [number, number]>>;
}

const launcher = (y = 40): NodeDef => ({ id: "L", kind: "launcher", x: 180, y });
const sw = (id: string, x: number, y: number, start: "left" | "right"): NodeDef => ({ id, kind: "switch", x, y, start });
const cup = (id: string, x: number, symbol: Symbol): NodeDef => ({ id, kind: "cup", x, y: 470, symbol });
const join = (id: string, x: number, y: number): NodeDef => ({ id, kind: "junction", x, y });

export const LEVELS: readonly LevelDef[] = [
  {
    number: 1,
    name: "First Flip",
    teaches: "One switch, one marble, two cups.",
    nodes: [launcher(), sw("A", 180, 200, "right"), cup("c1", 100, "circle"), cup("c2", 260, "triangle")],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "c1", branch: "left", via: [[100, 300]] },
      { id: "e3", from: "A", to: "c2", branch: "right", via: [[260, 300]] },
    ],
    queue: ["circle"],
    releases: [0],
    hint: "Tap the switch so its arrow points to the circle cup, then DROP.",
    stars: { junior: [2, 1], classic: [2, 1] },
  },
  {
    number: 2,
    name: "Follow the Shape",
    teaches: "Two symbols through one fork.",
    nodes: [launcher(), sw("A", 180, 200, "left"), cup("c1", 100, "circle"), cup("c2", 260, "triangle")],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "c1", branch: "left", via: [[100, 300]] },
      { id: "e3", from: "A", to: "c2", branch: "right", via: [[260, 300]] },
    ],
    queue: ["triangle", "circle"],
    releases: [0, 3.6],
    hint: "Each marble needs the switch pointing at its own shape. Flip it between marbles.",
    stars: { junior: [3, 2], classic: [3, 2] },
  },
  {
    number: 3,
    name: "Double Turn",
    teaches: "Two switches in series.",
    nodes: [
      launcher(),
      sw("A", 180, 150, "right"),
      sw("B", 110, 280, "right"),
      cup("c1", 50, "circle"),
      cup("c2", 170, "triangle"),
      cup("c3", 295, "triangle"),
    ],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "B", branch: "left", via: [[110, 220]] },
      { id: "e3", from: "A", to: "c3", branch: "right", via: [[295, 260]] },
      { id: "e4", from: "B", to: "c1", branch: "left", via: [[50, 370]] },
      { id: "e5", from: "B", to: "c2", branch: "right", via: [[170, 370]] },
    ],
    queue: ["circle", "triangle"],
    releases: [0, 4],
    hint: "Follow the circle's path down: both switches it passes must point its way.",
    stars: { junior: [4, 3], classic: [4, 3] },
  },
  {
    number: 4,
    name: "Three Cups",
    teaches: "Circle, triangle and diamond on a three-destination board.",
    nodes: [
      launcher(),
      sw("A", 180, 150, "left"),
      sw("B", 240, 290, "left"),
      cup("c1", 60, "circle"),
      cup("c2", 180, "triangle"),
      cup("c3", 300, "diamond"),
    ],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "c1", branch: "left", via: [[60, 260]] },
      { id: "e3", from: "A", to: "B", branch: "right", via: [[240, 220]] },
      { id: "e4", from: "B", to: "c2", branch: "left", via: [[180, 380]] },
      { id: "e5", from: "B", to: "c3", branch: "right", via: [[300, 380]] },
    ],
    queue: ["diamond", "circle", "triangle"],
    releases: [0, 3.4, 6.8],
    hint: "The circle only needs the top switch. Triangle and diamond need both.",
    stars: { junior: [7, 5], classic: [7, 5] },
  },
  {
    number: 5,
    name: "Long Way Round",
    teaches: "A longer branch changes when a marble reaches a downstream switch.",
    nodes: [launcher(), sw("A", 180, 120, "left"), sw("B", 180, 330, "left"), cup("c1", 100, "circle"), cup("c2", 260, "triangle")],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "B", branch: "left", via: [[60, 170], [60, 280], [180, 290]] },
      { id: "e3", from: "A", to: "B", branch: "right", via: [[250, 200], [180, 260]] },
      { id: "e4", from: "B", to: "c1", branch: "left", via: [[100, 400]] },
      { id: "e5", from: "B", to: "c2", branch: "right", via: [[260, 400]] },
    ],
    queue: ["circle", "triangle"],
    releases: [0, 1.8],
    hint: "Both top rails meet at the bottom switch. Only the bottom switch decides the cup.",
    stars: { junior: [2, 1], classic: [2, 1] },
  },
  {
    number: 6,
    name: "Crossed Tracks",
    teaches: "A raised rail crosses another without joining it.",
    nodes: [launcher(), sw("A", 180, 150, "right"), cup("c1", 80, "circle"), cup("c2", 280, "triangle")],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "c2", branch: "left", via: [[110, 230], [110, 290], [280, 390]], bridge: true },
      { id: "e3", from: "A", to: "c1", branch: "right", via: [[250, 230], [250, 290], [80, 390]] },
    ],
    queue: ["triangle", "circle", "triangle"],
    releases: [0, 3.8, 7.6],
    hint: "Follow the rails, not the arrow: the left rail goes over the bridge to the right-hand cup.",
    stars: { junior: [4, 3], classic: [4, 3] },
  },
  {
    number: 7,
    name: "Back to Back",
    teaches: "Two different marbles use the same switch, one after the other.",
    nodes: [
      launcher(),
      sw("A", 180, 150, "left"),
      sw("B", 250, 290, "left"),
      cup("c1", 70, "circle"),
      cup("c2", 190, "diamond"),
      cup("c3", 305, "triangle"),
    ],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "c1", branch: "left", via: [[70, 260]] },
      { id: "e3", from: "A", to: "B", branch: "right", via: [[250, 220]] },
      { id: "e4", from: "B", to: "c2", branch: "left", via: [[190, 380]] },
      { id: "e5", from: "B", to: "c3", branch: "right", via: [[305, 380]] },
    ],
    queue: ["circle", "triangle", "circle", "diamond"],
    releases: [0, 3.2, 6.4, 9.6],
    hint: "Set the top switch for each marble just after the one before has gone past it.",
    stars: { junior: [7, 5], classic: [7, 5] },
  },
  {
    number: 8,
    name: "Merge Point",
    teaches: "Two paths join before another decision.",
    nodes: [
      launcher(),
      sw("A", 180, 120, "left"),
      sw("B", 260, 220, "left"),
      join("J", 130, 300),
      sw("C", 130, 360, "left"),
      cup("c1", 60, "circle"),
      cup("c2", 190, "triangle"),
      cup("c3", 310, "diamond"),
    ],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "J", branch: "left", via: [[70, 180], [70, 250]] },
      { id: "e3", from: "A", to: "B", branch: "right", via: [[260, 170]] },
      { id: "e4", from: "B", to: "J", branch: "left", via: [[190, 270]] },
      { id: "e5", from: "B", to: "c3", branch: "right", via: [[310, 320]] },
      { id: "e6", from: "J", to: "C" },
      { id: "e7", from: "C", to: "c1", branch: "left", via: [[60, 420]] },
      { id: "e8", from: "C", to: "c2", branch: "right", via: [[190, 420]] },
    ],
    queue: ["triangle", "diamond", "circle"],
    releases: [0, 3.4, 6.8],
    hint: "Two rails join above the lowest switch. Whichever way a marble came, that switch picks its cup.",
    stars: { junior: [7, 5], classic: [7, 5] },
  },
  {
    number: 9,
    name: "Switchback",
    teaches: "Three switches, one optional shortcut, and staggered arrivals.",
    nodes: [
      launcher(),
      sw("A", 180, 110, "right"),
      sw("B", 90, 230, "left"),
      sw("C", 230, 340, "left"),
      cup("c1", 50, "circle"),
      cup("c2", 180, "triangle"),
      cup("c3", 300, "diamond"),
    ],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "B", branch: "left", via: [[90, 170]] },
      { id: "e3", from: "A", to: "C", branch: "right", via: [[275, 190], [275, 280]] },
      { id: "e4", from: "B", to: "c1", branch: "left", via: [[50, 330]] },
      { id: "e5", from: "B", to: "C", branch: "right", via: [[150, 300]] },
      { id: "e6", from: "C", to: "c2", branch: "left", via: [[180, 410]] },
      { id: "e7", from: "C", to: "c3", branch: "right", via: [[300, 410]] },
    ],
    queue: ["diamond", "triangle", "circle", "diamond"],
    releases: [0, 2.8, 5.6, 8.4],
    hint: "The right-hand rail is a shortcut to the bottom switch. Only the circle has to go left twice.",
    stars: { junior: [7, 5], classic: [7, 5] },
  },
  {
    number: 10,
    name: "The Marble Machine",
    teaches: "Everything together: series, a merge, and a long queue.",
    nodes: [
      launcher(),
      sw("A", 180, 110, "left"),
      sw("B", 100, 200, "left"),
      sw("C", 260, 200, "right"),
      join("J", 190, 320),
      sw("D", 190, 370, "left"),
      cup("c1", 45, "circle"),
      cup("c2", 130, "triangle"),
      cup("c3", 250, "circle"),
      cup("c4", 315, "diamond"),
    ],
    edges: [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "B", branch: "left", via: [[100, 150]] },
      { id: "e3", from: "A", to: "C", branch: "right", via: [[260, 150]] },
      { id: "e4", from: "B", to: "c1", branch: "left", via: [[45, 300]] },
      { id: "e5", from: "B", to: "J", branch: "right", via: [[140, 260]] },
      { id: "e6", from: "C", to: "J", branch: "left", via: [[230, 270]] },
      { id: "e7", from: "C", to: "c4", branch: "right", via: [[315, 320]] },
      { id: "e8", from: "J", to: "D" },
      { id: "e9", from: "D", to: "c2", branch: "left", via: [[130, 420]] },
      { id: "e10", from: "D", to: "c3", branch: "right", via: [[250, 420]] },
    ],
    queue: ["circle", "triangle", "diamond", "circle", "triangle"],
    releases: [0, 2.9, 5.8, 8.7, 11.6],
    hint: "There are two circle cups. Pick the one that saves you a flip.",
    stars: { junior: [7, 5], classic: [7, 5] },
  },
];

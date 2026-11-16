/**
 * Marble Switch's boards: the track as a graph, and the shape of each rail.
 *
 * A board is a directed graph with no loops. A launcher feeds one rail; a
 * switch sends what arrives down its left or right rail; a junction joins
 * rails into one; a cup is the end of the line. The Workshop adds four more:
 *
 *   - a flipper: a switch that flips itself each time a marble passes;
 *   - a turntable: three exits, turning one notch per marble (or per tap);
 *   - a gear pair: switches sharing a `link`, so one tap flips them all;
 *   - a trip light and a gate: the gate holds marbles until a marble has
 *     rolled over the trip light it is wired to.
 *
 * Every rail is a run of points with its corners rounded off, measured once
 * so a marble can be placed anywhere along it by distance, and so knows how
 * long the trip takes. No drawing and no DOM here.
 */

export type Symbol = "circle" | "triangle" | "diamond";
export type Exit = "left" | "middle" | "right";
/** A switch's two sides. Kept as its own name for the boards that only have switches. */
export type Branch = Exit;
export type NodeKind = "launcher" | "switch" | "junction" | "cup" | "turntable" | "trip" | "gate";

export interface NodeDef {
  readonly id: string;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  /** A switch's or turntable's setting at the start of an attempt. */
  readonly start?: Exit;
  /** A switch that flips itself each time a marble goes through: a flipper. */
  readonly auto?: boolean;
  /** Switches with the same link are geared together: one tap flips them all. */
  readonly link?: string;
  /** A gate's trip light: the gate opens once a marble has rolled over it. */
  readonly key?: string;
  /** A cup's symbol. */
  readonly symbol?: Symbol;
}

export interface EdgeDef {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Which way out of a switch or turntable this rail is. */
  readonly branch?: Exit;
  /** Corners the rail turns at between its two ends. */
  readonly via?: ReadonlyArray<readonly [number, number]>;
  /** Drawn as an overpass: it crosses another rail without meeting it. */
  readonly bridge?: boolean;
}

/** A point along a rail, and how far along it is. */
interface Sample {
  x: number;
  y: number;
  d: number;
}

export interface Edge extends EdgeDef {
  readonly length: number;
  readonly samples: readonly Sample[];
}

export interface Board {
  readonly nodes: ReadonlyMap<string, NodeDef>;
  readonly edges: ReadonlyMap<string, Edge>;
  /** Rails leaving each node: one, a switch's two, or a turntable's three. */
  readonly out: ReadonlyMap<string, readonly Edge[]>;
  readonly launcher: NodeDef;
  /** Everything a player can tap -- switches and turntables -- top to bottom, for naming. */
  readonly controls: readonly NodeDef[];
  /** Switches only (flippers and geared ones included). */
  readonly switches: readonly NodeDef[];
  readonly cups: readonly NodeDef[];
}

/** The ways out of a switch, and of a turntable, in the order a turntable turns. */
export const SWITCH_EXITS: readonly Exit[] = ["left", "right"];
export const TURNTABLE_EXITS: readonly Exit[] = ["left", "middle", "right"];

export function isControl(node: NodeDef): boolean {
  return node.kind === "switch" || node.kind === "turntable";
}

/** How round a rail's corners are. */
const CORNER = 26;
/** Distance between the points a rail is measured at. */
const STEP = 2;

export function buildBoard(nodes: readonly NodeDef[], edges: readonly EdgeDef[]): Board {
  const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));
  const edgeMap = new Map<string, Edge>();
  const out = new Map<string, Edge[]>();
  for (const def of edges) {
    const a = nodeMap.get(def.from);
    const b = nodeMap.get(def.to);
    if (!a || !b) throw new Error(`Rail ${def.id} doesn't join two pieces`);
    const corners: Array<[number, number]> = [
      [a.x, a.y],
      ...(def.via ?? []).map((p) => [p[0], p[1]] as [number, number]),
      [b.x, b.y],
    ];
    const samples = sampleRail(corners);
    const edge: Edge = { ...def, samples, length: samples[samples.length - 1]!.d };
    edgeMap.set(def.id, edge);
    const list = out.get(def.from) ?? [];
    list.push(edge);
    out.set(def.from, list);
  }
  const launcher = nodes.find((n) => n.kind === "launcher");
  if (!launcher) throw new Error("A board needs a launcher");
  const byPlace = (p: NodeDef, q: NodeDef) => p.y - q.y || p.x - q.x;
  const controls = nodes.filter(isControl).sort(byPlace);
  const switches = nodes.filter((n) => n.kind === "switch").sort(byPlace);
  const cups = nodes.filter((n) => n.kind === "cup").sort((p, q) => p.x - q.x);
  return { nodes: nodeMap, edges: edgeMap, out, launcher, controls, switches, cups };
}

/** The rail leaving a switch or turntable by one exit. */
export function branchEdge(board: Board, nodeId: string, exit: Exit): Edge {
  const edge = board.out.get(nodeId)?.find((e) => e.branch === exit);
  if (!edge) throw new Error(`${nodeId} has no ${exit} rail`);
  return edge;
}

/** The one rail leaving a launcher, junction, trip light or gate. */
export function onlyEdge(board: Board, nodeId: string): Edge {
  const edge = board.out.get(nodeId)?.[0];
  if (!edge) throw new Error(`${nodeId} leads nowhere`);
  return edge;
}

/** The switches geared to this one, itself included. */
export function gearedWith(board: Board, nodeId: string): NodeDef[] {
  const node = board.nodes.get(nodeId);
  if (!node?.link) return node ? [node] : [];
  return board.switches.filter((s) => s.link === node.link);
}

/** Where along a rail a distance is. */
export function pointAt(edge: Edge, distance: number): { x: number; y: number } {
  const d = Math.max(0, Math.min(edge.length, distance));
  const s = edge.samples;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.d <= d) lo = mid;
    else hi = mid;
  }
  const a = s[lo]!;
  const b = s[hi]!;
  const t = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * A rail through its corners, rounded, as points every STEP units with the
 * distance travelled to each.
 */
function sampleRail(corners: ReadonlyArray<[number, number]>): Sample[] {
  const path: Array<[number, number]> = [];
  const push = (x: number, y: number) => path.push([x, y]);
  push(corners[0]![0], corners[0]![1]);
  for (let i = 1; i < corners.length - 1; i += 1) {
    const [px, py] = corners[i - 1]!;
    const [cx, cy] = corners[i]!;
    const [nx, ny] = corners[i + 1]!;
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(CORNER, inLen / 2, outLen / 2);
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    push(ax, ay);
    for (let k = 1; k <= 8; k += 1) {
      const t = k / 8;
      const u = 1 - t;
      push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
    }
  }
  const last = corners[corners.length - 1]!;
  push(last[0], last[1]);

  const samples: Sample[] = [{ x: path[0]![0], y: path[0]![1], d: 0 }];
  let travelled = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const pieces = Math.max(1, Math.ceil(len / STEP));
    for (let k = 1; k <= pieces; k += 1) {
      const t = k / pieces;
      samples.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, d: travelled + len * t });
    }
    travelled += len;
  }
  return samples;
}

// ----- Checking a board -----

/**
 * Everything wrong with a board, as sentences; empty when it's sound. Every
 * rail joins two pieces that exist; each piece has the right ways out;
 * nothing loops back; every piece can be reached from the launcher; gears
 * come in groups; and every gate is wired to a trip light.
 */
export function boardProblems(nodes: readonly NodeDef[], edges: readonly EdgeDef[]): string[] {
  const problems: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, EdgeDef[]>();
  const into = new Map<string, number>();
  for (const e of edges) {
    if (!byId.has(e.from)) problems.push(`rail ${e.id} starts at missing ${e.from}`);
    if (!byId.has(e.to)) problems.push(`rail ${e.id} ends at missing ${e.to}`);
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    into.set(e.to, (into.get(e.to) ?? 0) + 1);
  }
  const launchers = nodes.filter((n) => n.kind === "launcher");
  if (launchers.length !== 1) problems.push(`${launchers.length} launchers`);
  for (const n of nodes) {
    const leaving = out.get(n.id) ?? [];
    const sides = leaving.map((e) => e.branch).sort().join(",");
    if (n.kind === "switch") {
      if (sides !== "left,right") problems.push(`switch ${n.id} needs one left and one right rail`);
      if (n.start !== "left" && n.start !== "right") problems.push(`switch ${n.id} has no starting side`);
    } else if (n.kind === "turntable") {
      if (sides !== "left,middle,right") problems.push(`turntable ${n.id} needs left, middle and right rails`);
      if (!n.start) problems.push(`turntable ${n.id} has no starting exit`);
    } else if (n.kind === "cup") {
      if (leaving.length) problems.push(`cup ${n.id} has a rail leaving it`);
      if (!n.symbol) problems.push(`cup ${n.id} has no symbol`);
    } else if (leaving.length !== 1) {
      problems.push(`${n.kind} ${n.id} needs exactly one rail out`);
    }
    if (n.kind === "gate" && byId.get(n.key ?? "")?.kind !== "trip") problems.push(`gate ${n.id} isn't wired to a trip light`);
    if (n.link && n.kind !== "switch") problems.push(`${n.id} has gears but isn't a switch`);
    if (n.link && nodes.filter((m) => m.link === n.link).length < 2) problems.push(`gear ${n.link} has only one switch`);
    if (n.kind === "launcher" && (into.get(n.id) ?? 0) > 0) problems.push("a rail runs into the launcher");
    if (n.kind !== "launcher" && !(into.get(n.id) ?? 0)) problems.push(`${n.id} can't be reached`);
  }
  // No loops: a depth-first walk that never meets its own trail.
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return false;
    if (state.get(id) === 2) return true;
    state.set(id, 1);
    for (const e of out.get(id) ?? []) if (!visit(e.to)) return false;
    state.set(id, 2);
    return true;
  };
  for (const l of launchers) if (!visit(l.id)) problems.push("the track loops");
  for (const n of nodes) if (!state.has(n.id) && launchers.length) problems.push(`${n.id} is cut off from the launcher`);
  return problems;
}

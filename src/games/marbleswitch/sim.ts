/**
 * One attempt at a Marble Switch board: switches, marbles, and the clock.
 *
 * A marble rolls along its rail at a steady speed, so the moment it reaches
 * the end is known the instant it sets off. Time only moves forward through
 * `advance`, which takes the next arrival or release in time order, so a
 * frame that covers several events handles each at its own moment. At the
 * very same instant a tap comes first (it happened when it was tapped, and
 * an arrival exactly at the end of a frame is left for the next frame), and
 * two marbles arriving together go in the order they were launched.
 *
 * A marble reads a switch as it crosses the switch's point. Once it is on
 * the rail beyond, flipping only changes things for the next one. Pieces
 * that move by themselves -- a flipper, a turntable -- move as the marble
 * crosses, after it has been sent on its way. A trip light comes on as a
 * marble rolls over it, and from that instant its gate lets marbles through,
 * including any that were waiting there.
 *
 * Everything that happens is written to `events`, which the screen reads for
 * sounds and lights. Pure: no drawing, no DOM, no wall clock.
 */

import {
  branchEdge,
  gearedWith,
  isControl,
  onlyEdge,
  pointAt,
  SWITCH_EXITS,
  TURNTABLE_EXITS,
  type Board,
  type Edge,
  type Exit,
  type Symbol,
} from "./graph.ts";

/** Units a second a marble rolls. */
export const SPEED = 115;
/** Seconds a wrong cup (or a stuck marble) is shown before the attempt is over. */
export const MISS_BEAT = 0.9;

export type Mode = "junior" | "classic";

export interface Marble {
  /** Its place in the queue, which is also its launch order. */
  readonly index: number;
  readonly symbol: Symbol;
  /** Null before it's released. */
  edge: Edge | null;
  enteredAt: number;
  /** A gate it is waiting at, if one is holding it. */
  heldAt: string | null;
  /** The cup it ended in, once it has. */
  cup: string | null;
  landedAt: number;
}

export type Phase = "setup" | "rolling" | "missed" | "cleared";

/** What happened, and where: the screen turns these into sound and light. */
export interface SimEvent {
  readonly kind: "drop" | "cross" | "kick" | "turn" | "trip" | "open" | "hold" | "catch" | "miss" | "stuck" | "tap";
  readonly node: string;
  readonly marble: number;
  readonly at: number;
}

export interface Attempt {
  readonly board: Board;
  readonly mode: Mode;
  readonly marbles: Marble[];
  /** Seconds after DROP each marble is let go, for Classic. */
  readonly releases: readonly number[];
  /** The setting of every switch and turntable. */
  switches: Map<string, Exit>;
  /** Trip lights that have been rolled over. */
  lights: Set<string>;
  time: number;
  /** When DROP was pressed in Classic; null before. */
  droppedAt: number | null;
  /** Junior: how many marbles have been dropped. */
  dropped: number;
  flips: number;
  phase: Phase;
  /** What went wrong: a wrong cup, or a marble left stuck behind a gate (cup null). */
  miss: { marble: number; cup: string | null; gate: string | null; at: number } | null;
  events: SimEvent[];
}

export interface AttemptSetup {
  board: Board;
  mode: Mode;
  queue: readonly Symbol[];
  /** Classic release times after DROP, one per marble. */
  releases: readonly number[];
}

export function startAttempt(setup: AttemptSetup): Attempt {
  const switches = new Map<string, Exit>();
  for (const node of setup.board.controls) switches.set(node.id, node.start ?? "left");
  return {
    board: setup.board,
    mode: setup.mode,
    marbles: setup.queue.map((symbol, index) => ({
      index,
      symbol,
      edge: null,
      enteredAt: 0,
      heldAt: null,
      cup: null,
      landedAt: 0,
    })),
    releases: setup.releases,
    switches,
    lights: new Set(),
    time: 0,
    droppedAt: null,
    dropped: 0,
    flips: 0,
    phase: "setup",
    miss: null,
    events: [],
  };
}

/** A copy that can be played forward without touching this one: the solver's. */
export function cloneAttempt(a: Attempt): Attempt {
  return {
    ...a,
    marbles: a.marbles.map((m) => ({ ...m })),
    switches: new Map(a.switches),
    lights: new Set(a.lights),
    miss: a.miss ? { ...a.miss } : null,
    events: [],
  };
}

/** A marble on the board and moving: not waiting to drop, not held, not in a cup. */
export function isRolling(m: Marble): boolean {
  return m.edge !== null && m.cup === null && m.heldAt === null;
}

/** When a rolling marble reaches the end of its rail. */
export function arrivalTime(m: Marble): number {
  return m.enteredAt + (m.edge ? m.edge.length / SPEED : 0);
}

/**
 * Whether the controls can be used right now. Classic: until the attempt is
 * over. Junior: only while nothing is rolling, so each marble is planned
 * before it goes. A marble held at a gate isn't rolling.
 */
export function canFlip(a: Attempt): boolean {
  if (a.phase === "missed" || a.phase === "cleared") return false;
  if (a.mode === "junior") return !a.marbles.some(isRolling);
  return true;
}

/** The next setting along: a switch's other side, a turntable's next notch. */
export function nextExit(kind: "switch" | "turntable", exit: Exit): Exit {
  const ring = kind === "turntable" ? TURNTABLE_EXITS : SWITCH_EXITS;
  return ring[(ring.indexOf(exit) + 1) % ring.length]!;
}

/** Move a control on one step, and anything geared to it. Not counted as a tap. */
function turnOver(a: Attempt, nodeId: string): void {
  const node = a.board.nodes.get(nodeId)!;
  if (node.kind === "turntable") {
    a.switches.set(nodeId, nextExit("turntable", a.switches.get(nodeId)!));
    return;
  }
  for (const s of gearedWith(a.board, nodeId)) a.switches.set(s.id, nextExit("switch", a.switches.get(s.id)!));
}

/** Tap a switch or turntable, now. Returns false if it can't be used at the moment. */
export function flip(a: Attempt, nodeId: string): boolean {
  const node = a.board.nodes.get(nodeId);
  if (!node || !isControl(node) || !canFlip(a)) return false;
  turnOver(a, nodeId);
  a.flips += 1;
  a.events.push({ kind: "tap", node: nodeId, marble: -1, at: a.time });
  return true;
}

/** Whether DROP does anything right now. */
export function canDrop(a: Attempt): boolean {
  if (a.phase === "missed" || a.phase === "cleared") return false;
  if (a.mode === "classic") return a.droppedAt === null;
  return a.dropped < a.marbles.length && !a.marbles.some(isRolling);
}

export function drop(a: Attempt): boolean {
  if (!canDrop(a)) return false;
  if (a.mode === "classic") {
    a.droppedAt = a.time;
  } else {
    release(a, a.marbles[a.dropped]!, a.time);
    a.dropped += 1;
  }
  a.phase = "rolling";
  // A release at this very instant happens now, not a frame later.
  advance(a, 0);
  return true;
}

function release(a: Attempt, m: Marble, at: number): void {
  m.edge = onlyEdge(a.board, a.board.launcher.id);
  m.enteredAt = at;
  a.events.push({ kind: "drop", node: a.board.launcher.id, marble: m.index, at });
}

export interface NextEvent {
  at: number;
  marble: Marble;
  kind: "release" | "arrive";
}

/** The next thing that will happen, at any time, or null if nothing will. */
export function peekEvent(a: Attempt): NextEvent | null {
  if (a.phase !== "rolling") return null;
  let best: NextEvent | null = null;
  for (const m of a.marbles) {
    let at: number | null = null;
    let kind: "release" | "arrive" = "arrive";
    if (isRolling(m)) at = arrivalTime(m);
    else if (m.edge === null && a.mode === "classic" && a.droppedAt !== null) {
      at = a.droppedAt + (a.releases[m.index] ?? 0);
      kind = "release";
    }
    if (at === null) continue;
    // Earliest first; at a tie, the marble launched first.
    if (!best || at < best.at - 1e-9 || (Math.abs(at - best.at) <= 1e-9 && m.index < best.marble.index)) {
      best = { at, marble: m, kind };
    }
  }
  return best;
}

/** Run the attempt forward by `dt` seconds, an event at a time. */
export function advance(a: Attempt, dt: number): void {
  if (a.phase !== "rolling") {
    a.time += dt;
    return;
  }
  const until = a.time + dt;
  for (let guard = 0; guard < 1000; guard += 1) {
    const event = peekEvent(a);
    // An arrival exactly at the end of this stretch of time is left for the
    // next: a tap made now, at that same instant, has to land first.
    if (!event || (event.kind === "arrive" ? event.at >= until : event.at > until)) break;
    a.time = Math.max(a.time, event.at);
    if (event.kind === "release") release(a, event.marble, event.at);
    else arrive(a, event.marble, event.at);
    if (a.phase !== "rolling") return;
  }
  a.time = until;
  checkStuck(a);
}

function arrive(a: Attempt, m: Marble, at: number): void {
  const node = a.board.nodes.get(m.edge!.to)!;
  const send = (edge: Edge) => {
    m.edge = edge;
    m.enteredAt = at;
  };
  switch (node.kind) {
    case "cup": {
      m.cup = node.id;
      m.landedAt = at;
      if (node.symbol !== m.symbol) {
        a.phase = "missed";
        a.miss = { marble: m.index, cup: node.id, gate: null, at };
        a.events.push({ kind: "miss", node: node.id, marble: m.index, at });
        return;
      }
      a.events.push({ kind: "catch", node: node.id, marble: m.index, at });
      if (a.marbles.every((x) => x.cup !== null)) a.phase = "cleared";
      return;
    }
    case "switch":
    case "turntable": {
      send(branchEdge(a.board, node.id, a.switches.get(node.id)!));
      a.events.push({ kind: "cross", node: node.id, marble: m.index, at });
      // Pieces that move by themselves move once the marble is on its way.
      if (node.kind === "turntable") {
        turnOver(a, node.id);
        a.events.push({ kind: "turn", node: node.id, marble: m.index, at });
      } else if (node.auto) {
        turnOver(a, node.id);
        a.events.push({ kind: "kick", node: node.id, marble: m.index, at });
      }
      return;
    }
    case "trip": {
      send(onlyEdge(a.board, node.id));
      if (!a.lights.has(node.id)) {
        a.lights.add(node.id);
        a.events.push({ kind: "trip", node: node.id, marble: m.index, at });
        // Its gates open, and whatever was waiting there rolls on, in launch order.
        for (const gate of a.board.nodes.values()) {
          if (gate.kind !== "gate" || gate.key !== node.id) continue;
          a.events.push({ kind: "open", node: gate.id, marble: m.index, at });
          for (const held of a.marbles) {
            if (held.heldAt !== gate.id) continue;
            held.heldAt = null;
            held.edge = onlyEdge(a.board, gate.id);
            held.enteredAt = at;
          }
        }
      }
      return;
    }
    case "gate": {
      if (a.lights.has(node.key!)) {
        send(onlyEdge(a.board, node.id));
      } else {
        m.heldAt = node.id;
        m.enteredAt = at;
        a.events.push({ kind: "hold", node: node.id, marble: m.index, at });
      }
      return;
    }
    default:
      send(onlyEdge(a.board, node.id));
  }
}

/**
 * Nothing rolling, nothing left to drop, and a marble still waiting at a
 * gate: it will wait for ever, so the attempt is over.
 */
function checkStuck(a: Attempt): void {
  if (a.phase !== "rolling" || a.marbles.some(isRolling)) return;
  const allOut = a.mode === "classic" ? a.marbles.every((m) => m.edge !== null) : a.dropped >= a.marbles.length;
  if (!allOut) return;
  const held = a.marbles.find((m) => m.heldAt !== null);
  if (!held) return;
  a.phase = "missed";
  a.miss = { marble: held.index, cup: null, gate: held.heldAt, at: a.time };
  a.events.push({ kind: "stuck", node: held.heldAt!, marble: held.index, at: a.time });
}

/** Where a marble is on the board, for drawing. */
export function marblePosition(a: Attempt, m: Marble): { x: number; y: number } | null {
  if (!m.edge) return null;
  if (m.cup) {
    const cup = a.board.nodes.get(m.cup)!;
    return { x: cup.x, y: cup.y };
  }
  if (m.heldAt) {
    // Resting against the gate, just short of it.
    return pointAt(m.edge, m.edge.length - 14);
  }
  return pointAt(m.edge, (a.time - m.enteredAt) * SPEED);
}

/**
 * The rails the next marble would take with everything as it is now, and
 * where it would end up: Junior's planning line. Stops at a closed gate.
 */
export function predictedRoute(a: Attempt): { edges: Edge[]; cup: string | null } {
  const edges: Edge[] = [];
  let edge = onlyEdge(a.board, a.board.launcher.id);
  for (let guard = 0; guard < 64; guard += 1) {
    edges.push(edge);
    const node = a.board.nodes.get(edge.to)!;
    if (node.kind === "cup") return { edges, cup: node.id };
    if (node.kind === "gate" && !a.lights.has(node.key!)) return { edges, cup: null };
    edge = isControl(node) ? branchEdge(a.board, node.id, a.switches.get(node.id)!) : onlyEdge(a.board, node.id);
  }
  throw new Error("The track loops");
}

/** The next marble that will be dropped, if any is left. */
export function nextInQueue(a: Attempt): Marble | null {
  if (a.mode === "classic") return a.marbles.find((m) => m.edge === null) ?? null;
  return a.marbles[a.dropped] ?? null;
}

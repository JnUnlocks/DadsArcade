/**
 * One attempt at a Marble Switch board: switches, marbles, and the clock.
 *
 * A marble rolls along its rail at a steady speed, so the moment it reaches
 * the end is known the instant it sets off. Time only moves forward through
 * `advance`, which takes the next arrival or release in time order, so a
 * frame that covers several events handles each at its own moment. At the
 * very same instant a flip comes first (it happened when it was tapped, and
 * the tap was before the arrival was computed), and two marbles arriving
 * together go in the order they were launched.
 *
 * A marble reads a switch as it crosses the switch's point. Once it is on
 * the rail beyond, flipping only changes things for the next one.
 *
 * Pure: no drawing, no DOM, no wall clock.
 */

import { branchEdge, onlyEdge, pointAt, type Board, type Branch, type Edge, type Symbol } from "./graph.ts";

/** Units a second a marble rolls. */
export const SPEED = 115;
/** Seconds a wrong cup is shown before the attempt is over. */
export const MISS_BEAT = 0.9;

export type Mode = "junior" | "classic";

export interface Marble {
  /** Its place in the queue, which is also its launch order. */
  readonly index: number;
  readonly symbol: Symbol;
  /** Null before it's released. */
  edge: Edge | null;
  enteredAt: number;
  /** The cup it ended in, once it has. */
  cup: string | null;
  landedAt: number;
}

export type Phase = "setup" | "rolling" | "missed" | "cleared";

export interface Attempt {
  readonly board: Board;
  readonly mode: Mode;
  readonly marbles: Marble[];
  /** Seconds after DROP each marble is let go, for Classic. */
  readonly releases: readonly number[];
  switches: Map<string, Branch>;
  time: number;
  /** When DROP was pressed in Classic; null before. */
  droppedAt: number | null;
  /** Junior: how many marbles have been dropped. */
  dropped: number;
  flips: number;
  phase: Phase;
  /** The marble that went wrong, and where. */
  miss: { marble: number; cup: string; at: number } | null;
}

export interface AttemptSetup {
  board: Board;
  mode: Mode;
  queue: readonly Symbol[];
  /** Classic release times after DROP, one per marble. */
  releases: readonly number[];
}

export function startAttempt(setup: AttemptSetup): Attempt {
  const switches = new Map<string, Branch>();
  for (const s of setup.board.switches) switches.set(s.id, s.start ?? "left");
  return {
    board: setup.board,
    mode: setup.mode,
    marbles: setup.queue.map((symbol, index) => ({ index, symbol, edge: null, enteredAt: 0, cup: null, landedAt: 0 })),
    releases: setup.releases,
    switches,
    time: 0,
    droppedAt: null,
    dropped: 0,
    flips: 0,
    phase: "setup",
    miss: null,
  };
}

/** A marble on the board and not yet in a cup. */
export function isRolling(m: Marble): boolean {
  return m.edge !== null && m.cup === null;
}

/** When a rolling marble reaches the end of its rail. */
export function arrivalTime(m: Marble): number {
  return m.enteredAt + (m.edge ? m.edge.length / SPEED : 0);
}

/**
 * Whether the switches can be flipped right now. Classic: until the attempt
 * is over. Junior: only while nothing is rolling, so each marble is planned
 * before it goes.
 */
export function canFlip(a: Attempt): boolean {
  if (a.phase === "missed" || a.phase === "cleared") return false;
  if (a.mode === "junior") return !a.marbles.some(isRolling);
  return true;
}

/** Flip a switch, now. Returns false if it can't be flipped at the moment. */
export function flip(a: Attempt, switchId: string): boolean {
  if (!canFlip(a)) return false;
  const current = a.switches.get(switchId);
  if (!current) return false;
  a.switches.set(switchId, current === "left" ? "right" : "left");
  a.flips += 1;
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
}

/** The next thing that happens, at or before `until`, or null. */
function nextEvent(a: Attempt, until: number): { at: number; marble: Marble; kind: "release" | "arrive" } | null {
  let best: { at: number; marble: Marble; kind: "release" | "arrive" } | null = null;
  const consider = (at: number, marble: Marble, kind: "release" | "arrive") => {
    // An arrival exactly at the end of this stretch of time is left for the
    // next: a tap made now, at that same instant, has to land first.
    if (kind === "arrive" ? at >= until : at > until) return;
    // Earliest first; at a tie, the marble launched first.
    if (!best || at < best.at - 1e-9 || (Math.abs(at - best.at) <= 1e-9 && marble.index < best.marble.index)) {
      best = { at, marble, kind };
    }
  };
  for (const m of a.marbles) {
    if (isRolling(m)) consider(arrivalTime(m), m, "arrive");
    else if (m.edge === null && a.mode === "classic" && a.droppedAt !== null) {
      consider(a.droppedAt + (a.releases[m.index] ?? 0), m, "release");
    }
  }
  return best;
}

/** Run the attempt forward by `dt` seconds, an event at a time. */
export function advance(a: Attempt, dt: number): void {
  if (a.phase === "setup" || a.phase === "cleared") {
    a.time += dt;
    return;
  }
  if (a.phase === "missed") {
    a.time += dt;
    return;
  }
  const until = a.time + dt;
  for (let guard = 0; guard < 1000; guard += 1) {
    const event = nextEvent(a, until);
    if (!event) break;
    a.time = Math.max(a.time, event.at);
    if (event.kind === "release") {
      release(a, event.marble, event.at);
    } else {
      arrive(a, event.marble, event.at);
      if (a.phase !== "rolling") break;
    }
  }
  if (a.phase === "rolling") a.time = until;
}

function arrive(a: Attempt, m: Marble, at: number): void {
  const node = a.board.nodes.get(m.edge!.to)!;
  if (node.kind === "cup") {
    m.cup = node.id;
    m.landedAt = at;
    if (node.symbol !== m.symbol) {
      a.phase = "missed";
      a.miss = { marble: m.index, cup: node.id, at };
      return;
    }
    if (a.marbles.every((x) => x.cup !== null)) {
      a.phase = "cleared";
      return;
    }
    // Junior waits for the next DROP; Classic carries on.
    return;
  }
  m.edge = node.kind === "switch" ? branchEdge(a.board, node.id, a.switches.get(node.id)!) : onlyEdge(a.board, node.id);
  m.enteredAt = at;
}

/** Where a marble is on the board, for drawing. */
export function marblePosition(a: Attempt, m: Marble): { x: number; y: number } | null {
  if (!m.edge) return null;
  if (m.cup) {
    const cup = a.board.nodes.get(m.cup)!;
    return { x: cup.x, y: cup.y };
  }
  return pointAt(m.edge, (a.time - m.enteredAt) * SPEED);
}

/**
 * The rails the next marble would take with the switches as they are now:
 * Junior's planning line.
 */
export function predictedRoute(a: Attempt): { edges: Edge[]; cup: string } {
  const edges: Edge[] = [];
  let edge = onlyEdge(a.board, a.board.launcher.id);
  for (let guard = 0; guard < 64; guard += 1) {
    edges.push(edge);
    const node = a.board.nodes.get(edge.to)!;
    if (node.kind === "cup") return { edges, cup: node.id };
    edge = node.kind === "switch" ? branchEdge(a.board, node.id, a.switches.get(node.id)!) : onlyEdge(a.board, node.id);
  }
  throw new Error("The track loops");
}

/** The next marble Junior will drop, if any is left. */
export function nextInQueue(a: Attempt): Marble | null {
  if (a.mode === "classic") return a.marbles.find((m) => m.edge === null) ?? null;
  return a.marbles[a.dropped] ?? null;
}

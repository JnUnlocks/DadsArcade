/**
 * Solving Marble Switch boards: proof that every level can be cleared, the
 * fewest taps it takes (which sets the stars), and Junior's hint.
 *
 * The Workshop's pieces move by themselves -- a flipper flips, a turntable
 * turns, a trip light opens a gate -- so a route can't be worked out from
 * the track alone. Both solvers play the real simulation forward instead.
 *
 * Junior is a shortest-path search over machine states. Before each drop the
 * player can set every control any way they like, at a cost of one tap per
 * flip or notch; the marble then rolls to rest and leaves the machine in a
 * new state. The cheapest way from the start to a cleared board is the
 * three-star number.
 *
 * Classic is a depth-first search over taps made as marbles arrive at
 * controls, with the budget raised one tap at a time, so the first schedule
 * found is the cheapest. A tap only counts if a phone player would have time
 * for it: the control must have been quiet for MIN_WINDOW seconds before.
 */

import { isControl, type Board, type NodeDef, type Symbol } from "./graph.ts";
import {
  advance,
  cloneAttempt,
  drop,
  flip,
  isRolling,
  peekEvent,
  startAttempt,
  type Attempt,
} from "./sim.ts";

// ----- Junior -----

/** One way to set the controls before a drop: the taps, in order. */
type Setting = string[];

/**
 * Every way to set the controls, with its taps. Geared switches move
 * together, so a gear is one choice, not one per switch.
 */
function settings(board: Board): Setting[] {
  // Each unit is its alternatives, as comma-separated taps ("" for none).
  const units: string[][] = [];
  const geared = new Set<string>();
  for (const node of board.controls) {
    if (node.kind === "turntable") {
      // Leave it, or turn it one or two notches.
      units.push(["", node.id, `${node.id},${node.id}`]);
    } else if (node.link) {
      if (geared.has(node.link)) continue;
      geared.add(node.link);
      units.push(["", node.id]);
    } else {
      units.push(["", node.id]);
    }
  }
  let all: Setting[] = [[]];
  for (const choices of units) {
    const next: Setting[] = [];
    for (const taps of all) {
      for (const choice of choices) next.push(choice ? [...taps, ...choice.split(",")] : taps);
    }
    all = next;
  }
  return all.sort((p, q) => p.length - q.length);
}

function machineKey(a: Attempt): string {
  const controls = [...a.switches.entries()].map(([id, exit]) => `${id}${exit[0]}`).join("");
  const lights = [...a.lights].sort().join(",");
  const held = a.marbles.map((m) => m.heldAt ?? "-").join(",");
  return `${a.dropped}|${controls}|${lights}|${held}`;
}

export interface JuniorPlan {
  /** Fewest taps that clear the board from here. */
  taps: number;
  /** The taps to make before each remaining drop. */
  steps: Setting[];
}

/** The cheapest way to clear a Junior board from where it stands. Null if it can't be cleared. */
export function solveJunior(start: Attempt): JuniorPlan | null {
  const options = settings(start.board);
  const best = new Map<string, number>();
  // Costs are small whole numbers: a bucket queue is all it needs.
  const buckets: Array<Array<{ a: Attempt; steps: Setting[] }>> = [[{ a: start, steps: [] }]];
  for (let cost = 0; cost < buckets.length; cost += 1) {
    for (const { a, steps } of buckets[cost] ?? []) {
      if (a.phase === "cleared") return { taps: cost, steps };
      const key = machineKey(a);
      if ((best.get(key) ?? Infinity) < cost) continue;
      for (const taps of options) {
        const b = cloneAttempt(a);
        b.flips = 0;
        if (!taps.every((id) => flip(b, id))) continue;
        if (!drop(b)) continue;
        advance(b, 120);
        if (b.phase === "missed") continue;
        const next = cost + taps.length;
        const k = machineKey(b);
        if ((best.get(k) ?? Infinity) <= next) continue;
        best.set(k, next);
        (buckets[next] ??= []).push({ a: b, steps: [...steps, taps] });
      }
    }
  }
  return null;
}

/** The control to tap next for Junior's hint, or null when the next drop needs none. */
export function hintFor(a: Attempt): string | null {
  return solveJunior(cloneAttempt(a))?.steps[0]?.[0] ?? null;
}

// ----- Classic -----

/** A tap in a Classic schedule: seconds after DROP, and the control. */
export type Tap = readonly [number, string];

export interface ClassicPlan {
  taps: number;
  schedule: Tap[];
}

/** A schedule's tap is made this long before the marble that needs it arrives. */
const TAP_LEAD = 0.25;

/** Symbols that can be reached from each piece, whatever the controls do. */
function reachable(board: Board): Map<string, Set<Symbol>> {
  const memo = new Map<string, Set<Symbol>>();
  const walk = (id: string): Set<Symbol> => {
    const known = memo.get(id);
    if (known) return known;
    const node = board.nodes.get(id)!;
    const set = new Set<Symbol>(node.symbol ? [node.symbol] : []);
    for (const edge of board.out.get(id) ?? []) for (const s of walk(edge.to)) set.add(s);
    memo.set(id, set);
    return set;
  };
  for (const id of board.nodes.keys()) walk(id);
  return memo;
}

/** When a control (or anything geared to it) last had a marble go through it. */
function lastCrossed(a: Attempt, node: NodeDef): number {
  const group = new Set([node.id]);
  if (node.link) for (const s of a.board.switches) if (s.link === node.link) group.add(s.id);
  let last = -Infinity;
  for (const e of a.events) if (e.kind === "cross" && group.has(e.node)) last = Math.max(last, e.at);
  return last;
}

/**
 * The cheapest Classic schedule, trying budgets up to `maxTaps`, with every
 * tap given at least `window` seconds of quiet. Null if there's none.
 */
export function solveClassic(
  board: Board,
  queue: readonly Symbol[],
  releases: readonly number[],
  window: number,
  maxTaps = 12,
): ClassicPlan | null {
  const reach = reachable(board);
  const canStillWin = (a: Attempt) =>
    a.marbles.every((m) => !isRolling(m) || reach.get(m.edge!.to)!.has(m.symbol));

  for (let budget = 0; budget <= maxTaps; budget += 1) {
    const start = startAttempt({ board, mode: "classic", queue, releases });
    drop(start);
    const found = search(start, budget, [], window, canStillWin);
    if (found) return { taps: found.length, schedule: found };
  }
  return null;
}

function search(
  from: Attempt,
  budget: number,
  taps: Tap[],
  window: number,
  canStillWin: (a: Attempt) => boolean,
): Tap[] | null {
  const a = cloneAttempt(from);
  a.events = [...from.events];
  for (let guard = 0; guard < 2000; guard += 1) {
    if (a.phase === "cleared") return taps;
    if (a.phase === "missed" || !canStillWin(a)) return null;
    const event = peekEvent(a);
    if (!event) {
      advance(a, 0.001);
      if (a.phase === "rolling" && !peekEvent(a)) return null;
      continue;
    }
    const node = event.kind === "arrive" ? a.board.nodes.get(event.marble.edge!.to)! : null;
    if (node && isControl(node)) {
      const steps = node.kind === "turntable" ? [0, 1, 2] : [0, 1];
      for (const k of steps) {
        if (k > budget) break;
        if (k > 0 && event.at - lastCrossed(a, node) < window) continue;
        const b = cloneAttempt(a);
        b.events = [...a.events];
        advance(b, event.at - b.time);
        for (let i = 0; i < k; i += 1) flip(b, node.id);
        advance(b, 1e-6);
        const at = Math.round((event.at - (b.droppedAt ?? 0) - TAP_LEAD) * 1000) / 1000;
        const next: Tap[] = [...taps, ...Array.from({ length: k }, (): Tap => [at, node.id])];
        const found = search(b, budget - k, next, window, canStillWin);
        if (found) return found;
      }
      return null;
    }
    advance(a, event.at - a.time + 1e-6);
  }
  return null;
}

export interface ClassicReplay {
  cleared: boolean;
  taps: number;
  /** The shortest quiet any tap had before it: from the last marble through that control. */
  tightest: number;
}

/** Play a Classic schedule for real, as a player tapping at those times would. */
export function replayClassic(board: Board, queue: readonly Symbol[], releases: readonly number[], schedule: readonly Tap[]): ClassicReplay {
  const a = startAttempt({ board, mode: "classic", queue, releases });
  let tightest = Infinity;
  const ordered = [...schedule].sort((p, q) => p[0] - q[0]);
  const early = ordered.filter(([at]) => at < 0);
  for (const [, id] of early) flip(a, id);
  drop(a);
  for (const [at, id] of ordered.filter(([at]) => at >= 0)) {
    advance(a, Math.max(0, at - a.time));
    if (a.phase !== "rolling") break;
    const node = board.nodes.get(id)!;
    tightest = Math.min(tightest, a.time - lastCrossed(a, node));
    flip(a, id);
  }
  for (let i = 0; i < 400 && a.phase === "rolling"; i += 1) advance(a, 0.5);
  return { cleared: a.phase === "cleared", taps: a.flips, tightest };
}

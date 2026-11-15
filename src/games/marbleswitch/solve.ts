/**
 * Solving Marble Switch boards: proof that every level can be cleared, the
 * fewest flips it takes (which sets the stars), and a hint for Junior.
 *
 * Junior is planned marble by marble: before each drop, set the switches on
 * one route to a matching cup. The fewest flips over the whole queue is a
 * small search over every setting of the switches.
 *
 * Classic is checked by playing it: a careful player flips each switch only
 * when the next marble to reach it needs the other side, a little before it
 * gets there. If that clears the board, and every flip it needed had a fair
 * window to make it in, the level works on a phone.
 */

import type { Board, Branch, Symbol } from "./graph.ts";
import { advance, arrivalTime, drop, flip, isRolling, startAttempt, type Attempt } from "./sim.ts";

/** One way to a matching cup: the setting each switch on the way needs. */
export type Route = ReadonlyMap<string, Branch>;

/** Every route from the launcher to a cup with this symbol. */
export function routesTo(board: Board, symbol: Symbol): Route[] {
  const found: Route[] = [];
  const walk = (nodeId: string, needs: Map<string, Branch>) => {
    const node = board.nodes.get(nodeId)!;
    if (node.kind === "cup") {
      if (node.symbol === symbol) found.push(new Map(needs));
      return;
    }
    for (const edge of board.out.get(nodeId) ?? []) {
      if (node.kind === "switch") {
        const next = new Map(needs);
        next.set(node.id, edge.branch!);
        walk(edge.to, next);
      } else {
        walk(edge.to, needs);
      }
    }
  };
  walk(board.launcher.id, new Map());
  return found;
}

export interface Plan {
  /** Fewest flips that clear the queue. */
  flips: number;
  /** For each marble, the route that plan sends it down. */
  routes: Route[];
}

/** The cheapest way through a queue, planning each marble before it drops. Null if there is none. */
export function plan(board: Board, queue: readonly Symbol[]): Plan | null {
  const ids = board.switches.map((s) => s.id);
  const key = (setting: ReadonlyMap<string, Branch>) => ids.map((id) => (setting.get(id) === "left" ? "L" : "R")).join("");
  const start = new Map(board.switches.map((s) => [s.id, s.start ?? "left"] as const));

  interface Step {
    cost: number;
    setting: Map<string, Branch>;
    routes: Route[];
  }
  let frontier = new Map<string, Step>([[key(start), { cost: 0, setting: start, routes: [] }]]);
  for (const symbol of queue) {
    const options = routesTo(board, symbol);
    if (options.length === 0) return null;
    const next = new Map<string, Step>();
    for (const step of frontier.values()) {
      for (const route of options) {
        let cost = step.cost;
        const setting = new Map(step.setting);
        for (const [id, side] of route) {
          if (setting.get(id) !== side) cost += 1;
          setting.set(id, side);
        }
        const k = key(setting);
        const known = next.get(k);
        if (!known || cost < known.cost) next.set(k, { cost, setting, routes: [...step.routes, route] });
      }
    }
    frontier = next;
  }
  let best: Step | null = null;
  for (const step of frontier.values()) if (!best || step.cost < best.cost) best = step;
  return best ? { flips: best.cost, routes: best.routes } : null;
}

/** The switch to flip next for Junior's hint, or null when the setting already works. */
export function hintFor(a: Attempt, route: Route | undefined): string | null {
  if (!route) return null;
  for (const s of a.board.switches) {
    const want = route.get(s.id);
    if (want && a.switches.get(s.id) !== want) return s.id;
  }
  return null;
}

/** How long before a marble reaches a switch the careful player flips it. */
const LEAD = 0.45;
const FRAME = 1 / 120;

export interface ClassicRun {
  cleared: boolean;
  flips: number;
  /** The tightest window any flip had: from the last marble crossing that switch to the next one needing it changed. */
  tightest: number;
  /** When each flip was made, after DROP. */
  schedule: Array<{ at: number; switchId: string }>;
}

/**
 * Play Classic the careful way, following the routes in `routes` (one per
 * marble), and report how it went.
 */
export function playClassic(
  board: Board,
  queue: readonly Symbol[],
  releases: readonly number[],
  routes: readonly Route[],
): ClassicRun {
  const a = startAttempt({ board, mode: "classic", queue, releases });
  const schedule: Array<{ at: number; switchId: string }> = [];
  const lastCrossed = new Map<string, number>();
  let tightest = Infinity;

  // Anything the first marble needs is set before DROP, as a player would.
  const firstRoute = routes[0];
  if (firstRoute) {
    for (const [id, side] of firstRoute) {
      if (a.switches.get(id) !== side) {
        flip(a, id);
        schedule.push({ at: 0, switchId: id });
      }
    }
  }
  drop(a);

  for (let guard = 0; guard < 120 * 600 && a.phase === "rolling"; guard += 1) {
    // Who reaches each switch next, and when.
    const coming = new Map<string, { at: number; marble: number }>();
    for (const m of a.marbles) {
      if (!isRolling(m)) continue;
      const to = m.edge!.to;
      if (a.board.nodes.get(to)?.kind !== "switch") continue;
      const at = arrivalTime(m);
      const seen = coming.get(to);
      if (!seen || at < seen.at || (at === seen.at && m.index < seen.marble)) coming.set(to, { at, marble: m.index });
    }
    for (const [switchId, next] of coming) {
      const want = routes[next.marble]?.get(switchId);
      if (!want || a.switches.get(switchId) === want) continue;
      if (next.at - a.time > LEAD) continue;
      flip(a, switchId);
      schedule.push({ at: a.time - (a.droppedAt ?? 0), switchId });
      tightest = Math.min(tightest, next.at - (lastCrossed.get(switchId) ?? -Infinity));
    }
    const before = a.marbles.map((m) => m.edge?.from);
    advance(a, FRAME);
    a.marbles.forEach((m, i) => {
      if (m.edge && m.edge.from !== before[i] && a.board.nodes.get(m.edge.from)?.kind === "switch") {
        lastCrossed.set(m.edge.from, m.enteredAt);
      }
    });
  }
  return { cleared: a.phase === "cleared", flips: a.flips, tightest, schedule };
}

/**
 * Marble Switch: the levels, and the rules of the track.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { boardProblems, buildBoard, type EdgeDef, type NodeDef } from "./graph.ts";
import { LEVELS } from "./levels.ts";
import { hintFor, plan, playClassic, routesTo } from "./solve.ts";
import {
  advance,
  arrivalTime,
  canDrop,
  canFlip,
  drop,
  flip,
  MISS_BEAT,
  predictedRoute,
  SPEED,
  startAttempt,
  type Attempt,
} from "./sim.ts";
import { loadProgress, recordResult, starsFor } from "./progress.ts";

/** A phone needs at least this long between a marble passing a switch and the next one needing it flipped. */
const FAIR_WINDOW = 1.5;

const fork: NodeDef[] = [
  { id: "L", kind: "launcher", x: 180, y: 40 },
  { id: "A", kind: "switch", x: 180, y: 200, start: "right" },
  { id: "c1", kind: "cup", x: 100, y: 470, symbol: "circle" },
  { id: "c2", kind: "cup", x: 260, y: 470, symbol: "triangle" },
];
const forkEdges: EdgeDef[] = [
  { id: "e1", from: "L", to: "A" },
  { id: "e2", from: "A", to: "c1", branch: "left", via: [[100, 300]] },
  { id: "e3", from: "A", to: "c2", branch: "right", via: [[260, 300]] },
];
const forkBoard = buildBoard(fork, forkEdges);

function run(a: Attempt, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds * 60); i += 1) advance(a, 1 / 60);
}

describe("the levels", () => {
  it("are ten, numbered in order", () => {
    assert.equal(LEVELS.length, 10);
    LEVELS.forEach((level, i) => assert.equal(level.number, i + 1));
  });

  for (const level of LEVELS) {
    describe(`${level.number}. ${level.name}`, () => {
      const board = buildBoard(level.nodes, level.edges);

      it("has a sound track", () => {
        assert.deepEqual(boardProblems(level.nodes, level.edges), []);
      });

      it("has a matching cup every marble can reach", () => {
        assert.ok(level.queue.length > 0);
        assert.equal(level.releases.length, level.queue.length);
        for (const symbol of level.queue) assert.ok(routesTo(board, symbol).length > 0, `no way to a ${symbol} cup`);
      });

      it("can be cleared in Junior in the flips three stars ask for", () => {
        const best = plan(board, level.queue);
        assert.ok(best);
        assert.equal(best.flips, level.stars.junior[1], "three stars should be the fewest flips");
        assert.ok(level.stars.junior[0] > level.stars.junior[1]);
        // And playing that plan for real clears it.
        const a = startAttempt({ board, mode: "junior", queue: level.queue, releases: level.releases });
        best.routes.forEach((route) => {
          for (const [id, side] of route) if (a.switches.get(id) !== side) assert.ok(flip(a, id));
          assert.ok(drop(a));
          run(a, 12);
        });
        assert.equal(a.phase, "cleared");
        assert.equal(a.flips, best.flips);
      });

      it("can be cleared in Classic, with time to make every flip", () => {
        const best = plan(board, level.queue)!;
        const result = playClassic(board, level.queue, level.releases, best.routes);
        assert.equal(result.cleared, true);
        assert.ok(result.flips <= level.stars.classic[1], `${result.flips} flips`);
        assert.ok(result.tightest >= FAIR_WINDOW, `a flip window of ${result.tightest.toFixed(2)}s`);
      });

      it("isn't cleared by doing nothing", () => {
        const a = startAttempt({ board, mode: "classic", queue: level.queue, releases: level.releases });
        drop(a);
        run(a, 40);
        assert.notEqual(a.phase, "cleared");
      });

      it("releases Classic marbles in order, spaced apart", () => {
        for (let i = 1; i < level.releases.length; i += 1) {
          assert.ok(level.releases[i]! - level.releases[i - 1]! >= 1.5);
        }
      });
    });
  }
});

describe("the track", () => {
  it("rejects a board that loops, dead-ends, or has a switch with one side", () => {
    assert.match(
      boardProblems(fork, [...forkEdges, { id: "back", from: "c1", to: "A" }]).join(" "),
      /cup c1 has a rail leaving it|loops/,
    );
    assert.match(boardProblems(fork, forkEdges.slice(0, 2)).join(" "), /one left and one right/);
    assert.match(boardProblems(fork, [{ ...forkEdges[0]!, to: "nowhere" }, ...forkEdges.slice(1)]).join(" "), /missing/);
    const loop: NodeDef[] = [...fork, { id: "J", kind: "junction", x: 180, y: 300 }];
    const loopEdges: EdgeDef[] = [
      { id: "e1", from: "L", to: "J" },
      { id: "e2", from: "J", to: "A" },
      { id: "e3", from: "A", to: "J", branch: "left" },
      { id: "e4", from: "A", to: "c2", branch: "right" },
    ];
    assert.match(boardProblems(loop, loopEdges).join(" "), /loops/);
  });

  it("measures a rail by its length", () => {
    const straight = forkBoard.edges.get("e1")!;
    assert.ok(Math.abs(straight.length - 160) < 0.5);
  });
});

describe("a switch", () => {
  const attempt = () => startAttempt({ board: forkBoard, mode: "classic", queue: ["circle"], releases: [0] });
  const toSwitch = 160 / SPEED;

  it("is read as the marble crosses it: a flip just before changes the route", () => {
    const a = attempt();
    drop(a);
    advance(a, toSwitch - 0.01);
    flip(a, "A");
    run(a, 6);
    assert.equal(a.phase, "cleared");
  });

  it("can't change a marble that has already gone past", () => {
    const a = attempt();
    drop(a);
    advance(a, toSwitch + 0.01);
    flip(a, "A");
    run(a, 6);
    assert.equal(a.phase, "missed");
    assert.equal(a.miss?.cup, "c2");
  });

  it("counts a flip made at the very instant of arrival, before the arrival", () => {
    const a = attempt();
    drop(a);
    advance(a, toSwitch - 1e-12);
    // The marble is due now: the tap lands first.
    flip(a, "A");
    run(a, 6);
    assert.equal(a.phase, "cleared");
  });

  it("is flipped once per tap, and every tap counts, before DROP too", () => {
    const a = attempt();
    flip(a, "A");
    flip(a, "A");
    flip(a, "A");
    assert.equal(a.flips, 3);
    assert.equal(a.switches.get("A"), "left");
  });
});

describe("Junior", () => {
  const attempt = () => startAttempt({ board: forkBoard, mode: "junior", queue: ["triangle", "circle"], releases: [0, 0] });

  it("drops one marble at a time and locks the switches while it rolls", () => {
    const a = attempt();
    assert.ok(drop(a));
    assert.equal(canDrop(a), false);
    assert.equal(canFlip(a), false);
    assert.equal(flip(a, "A"), false);
    run(a, 6);
    assert.equal(canFlip(a), true);
    assert.equal(canDrop(a), true);
  });

  it("shows where the next marble would go", () => {
    const a = attempt();
    assert.equal(predictedRoute(a).cup, "c2");
    flip(a, "A");
    assert.equal(predictedRoute(a).cup, "c1");
  });

  it("hints at the switch that needs flipping", () => {
    const a = attempt();
    const best = plan(forkBoard, ["triangle", "circle"])!;
    assert.equal(hintFor(a, best.routes[0]), null, "it already points at the triangle");
    drop(a);
    run(a, 6);
    assert.equal(hintFor(a, best.routes[1]), "A");
  });
});

describe("Classic", () => {
  it("lets the switches be flipped while marbles roll", () => {
    const a = startAttempt({ board: forkBoard, mode: "classic", queue: ["triangle", "circle"], releases: [0, 3] });
    drop(a);
    run(a, 2.5);
    assert.equal(canFlip(a), true);
    assert.ok(flip(a, "A"));
    run(a, 8);
    assert.equal(a.phase, "cleared");
  });

  it("handles a release and an arrival in the same frame, each at its own time", () => {
    const a = startAttempt({ board: forkBoard, mode: "classic", queue: ["triangle", "triangle"], releases: [0, 0.2] });
    drop(a);
    // One long frame covering both releases and both switch crossings.
    advance(a, 5);
    run(a, 3);
    assert.equal(a.phase, "cleared");
    assert.ok(a.marbles[0]!.landedAt < a.marbles[1]!.landedAt);
  });

  it("sends marbles arriving together through in launch order", () => {
    // Two rails into one junction, of equal length, so two marbles meet there.
    const nodes: NodeDef[] = [
      { id: "L", kind: "launcher", x: 180, y: 40 },
      { id: "A", kind: "switch", x: 180, y: 100, start: "left" },
      { id: "J", kind: "junction", x: 180, y: 300 },
      { id: "c", kind: "cup", x: 180, y: 470, symbol: "circle" },
    ];
    const edges: EdgeDef[] = [
      { id: "e1", from: "L", to: "A" },
      { id: "e2", from: "A", to: "J", branch: "left", via: [[100, 200]] },
      { id: "e3", from: "A", to: "J", branch: "right", via: [[260, 200]] },
      { id: "e4", from: "J", to: "c" },
    ];
    const board = buildBoard(nodes, edges);
    const a = startAttempt({ board, mode: "classic", queue: ["circle", "circle"], releases: [0, 0] });
    drop(a);
    run(a, 10);
    assert.equal(a.phase, "cleared");
    assert.ok(a.marbles[0]!.landedAt <= a.marbles[1]!.landedAt);
  });

  it("ends the attempt on a wrong cup, and nothing moves after", () => {
    const a = startAttempt({ board: forkBoard, mode: "classic", queue: ["circle", "triangle"], releases: [0, 2] });
    drop(a);
    run(a, 6);
    assert.equal(a.phase, "missed");
    assert.deepEqual(a.miss && { marble: a.miss.marble, cup: a.miss.cup }, { marble: 0, cup: "c2" });
    const second = a.marbles[1]!;
    const where = second.edge && arrivalTime(second);
    run(a, MISS_BEAT + 5);
    assert.equal(a.phase, "missed");
    assert.equal(second.edge && arrivalTime(second), where);
    assert.equal(flip(a, "A"), false);
  });
});

describe("Retry", () => {
  it("starts over exactly: queue, switches, flips and clock", () => {
    const level = LEVELS[6]!;
    const board = buildBoard(level.nodes, level.edges);
    const setup = { board, mode: "classic" as const, queue: level.queue, releases: level.releases };
    const first = startAttempt(setup);
    flip(first, "A");
    drop(first);
    run(first, 3);
    const again = startAttempt(setup);
    assert.equal(again.time, 0);
    assert.equal(again.flips, 0);
    assert.equal(again.phase, "setup");
    assert.deepEqual([...again.switches], board.switches.map((s) => [s.id, s.start]));
    assert.ok(again.marbles.every((m) => m.edge === null && m.cup === null));
  });
});

describe("medals", () => {
  const level = LEVELS[3]!;

  it("are one for a clear and more for fewer flips", () => {
    const [two, three] = level.stars.junior;
    assert.equal(starsFor(level, "junior", three), 3);
    assert.equal(starsFor(level, "junior", two), 2);
    assert.equal(starsFor(level, "junior", two + 1), 1);
  });

  it("keep the best result for each level and mode, and unlock the next level", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    recordResult("junior", 1, 2, storage);
    recordResult("junior", 1, 1, storage);
    recordResult("classic", 1, 3, storage);
    const progress = loadProgress(storage);
    assert.equal(progress.junior[1], 2);
    assert.equal(progress.classic[1], 3);
    assert.equal(progress.junior[2], undefined);
  });

  it("still play when storage is refused", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    recordResult("junior", 2, 3, broken);
    assert.equal(loadProgress(broken).junior[2], 3);
  });
});

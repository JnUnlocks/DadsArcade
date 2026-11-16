/**
 * Marble Switch: the levels, and the rules of the track.
 *
 * Every level is proved here: a sound track, the fewest taps found by an
 * exhaustive Junior search equal to its three-star number, and its
 * checked-in Classic schedule replayed for real -- clearing the board, in
 * the three-star number of taps, with every tap given a fair window on a
 * phone.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { boardProblems, buildBoard, type EdgeDef, type NodeDef, type Symbol } from "./graph.ts";
import { LEVELS } from "./levels.ts";
import { isUnlocked, loadProgress, recordResult, starsFor } from "./progress.ts";
import { hintFor, replayClassic, solveJunior } from "./solve.ts";
import {
  advance,
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

/** Seconds a phone player needs between a marble passing a control and the next tap on it. */
const fairWindow = (level: number) => (level <= 10 ? 1.5 : 1.2);

function run(a: Attempt, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds * 60); i += 1) advance(a, 1 / 60);
}

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

/** The same fork with one piece swapped for another. */
function variant(piece: Partial<NodeDef>): ReturnType<typeof buildBoard> {
  return buildBoard(fork.map((n) => (n.id === "A" ? { ...n, ...piece } : n)), forkEdges);
}

describe("the levels", () => {
  it("are twenty, numbered in order", () => {
    assert.equal(LEVELS.length, 20);
    LEVELS.forEach((level, i) => assert.equal(level.number, i + 1));
  });

  for (const level of LEVELS) {
    describe(`${level.number}. ${level.name}`, () => {
      const board = buildBoard(level.nodes, level.edges);
      const setup = { board, queue: level.queue, releases: level.releases };

      it("has a sound track", () => {
        assert.deepEqual(boardProblems(level.nodes, level.edges), []);
      });

      it("has a cup for every marble's shape", () => {
        assert.ok(level.queue.length > 0);
        assert.equal(level.releases.length, level.queue.length);
        const shapes = new Set<Symbol>(board.cups.map((c) => c.symbol!));
        for (const symbol of level.queue) assert.ok(shapes.has(symbol), `no ${symbol} cup`);
      });

      it("can be cleared in Junior in exactly the taps three stars ask for", () => {
        const best = solveJunior(startAttempt({ ...setup, mode: "junior" }));
        assert.ok(best, "no way to clear it");
        assert.equal(best.taps, level.stars.junior[1], "three stars should be the fewest taps");
        assert.ok(level.stars.junior[0] > level.stars.junior[1]);
        // And playing that plan for real clears it.
        const a = startAttempt({ ...setup, mode: "junior" });
        for (const taps of best.steps) {
          for (const id of taps) assert.ok(flip(a, id));
          assert.ok(drop(a));
          run(a, 15);
        }
        assert.equal(a.phase, "cleared");
        assert.equal(a.flips, best.taps);
      });

      it("has a Classic schedule that clears it, with time for every tap", () => {
        const result = replayClassic(board, level.queue, level.releases, level.solution);
        assert.equal(result.cleared, true);
        assert.equal(result.taps, level.stars.classic[1]);
        assert.ok(level.stars.classic[0] > level.stars.classic[1]);
        assert.ok(result.tightest >= fairWindow(level.number), `a tap with ${result.tightest.toFixed(2)}s to make it`);
      });

      it("isn't cleared by doing nothing", () => {
        const a = startAttempt({ ...setup, mode: "classic" });
        drop(a);
        run(a, 60);
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
    assert.match(boardProblems(fork, [...forkEdges, { id: "back", from: "c1", to: "A" }]).join(" "), /cup c1 has a rail leaving it|loops/);
    assert.match(boardProblems(fork, forkEdges.slice(0, 2)).join(" "), /one left and one right/);
    assert.match(boardProblems(fork, [{ ...forkEdges[0]!, to: "nowhere" }, ...forkEdges.slice(1)]).join(" "), /missing/);
  });

  it("rejects a gate with no trip light, a turntable without three exits, and a lone gear", () => {
    const gate: NodeDef[] = [...fork.slice(0, 1), { id: "G", kind: "gate", x: 180, y: 100, key: "nope" }, ...fork.slice(1)];
    assert.match(boardProblems(gate, [{ id: "e0", from: "L", to: "G" }, { ...forkEdges[0]!, from: "G" }, ...forkEdges.slice(1)]).join(" "), /trip light/);
    assert.match(boardProblems(fork.map((n) => (n.id === "A" ? { ...n, kind: "turntable" as const } : n)), forkEdges).join(" "), /left, middle and right/);
    assert.match(boardProblems(fork.map((n) => (n.id === "A" ? { ...n, link: "g" } : n)), forkEdges).join(" "), /only one switch/);
  });

  it("measures a rail by its length", () => {
    assert.ok(Math.abs(forkBoard.edges.get("e1")!.length - 160) < 0.5);
  });
});

describe("a switch", () => {
  const attempt = () => startAttempt({ board: forkBoard, mode: "classic", queue: ["circle"], releases: [0] });
  const toSwitch = 160 / SPEED;

  it("is read as the marble crosses it: a tap just before changes the route", () => {
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

  it("takes a tap made at the very instant of arrival before the arrival", () => {
    const a = attempt();
    drop(a);
    advance(a, toSwitch - 1e-12);
    flip(a, "A");
    run(a, 6);
    assert.equal(a.phase, "cleared");
  });

  it("counts every tap, before DROP too", () => {
    const a = attempt();
    flip(a, "A");
    flip(a, "A");
    flip(a, "A");
    assert.equal(a.flips, 3);
    assert.equal(a.switches.get("A"), "left");
  });
});

describe("the Workshop's pieces", () => {
  it("a flipper flips itself after each marble goes through", () => {
    const board = variant({ auto: true, start: "left" });
    const a = startAttempt({ board, mode: "classic", queue: ["circle", "triangle", "circle"], releases: [0, 2.5, 5] });
    drop(a);
    run(a, 15);
    assert.equal(a.phase, "cleared");
    assert.equal(a.flips, 0);
    assert.ok(a.events.filter((e) => e.kind === "kick").length === 3);
  });

  it("a turntable turns one notch per marble, and one per tap", () => {
    const nodes: NodeDef[] = [
      { id: "L", kind: "launcher", x: 180, y: 40 },
      { id: "T", kind: "turntable", x: 180, y: 200, start: "left" },
      { id: "c1", kind: "cup", x: 70, y: 470, symbol: "circle" },
      { id: "c2", kind: "cup", x: 180, y: 470, symbol: "triangle" },
      { id: "c3", kind: "cup", x: 290, y: 470, symbol: "diamond" },
    ];
    const edges: EdgeDef[] = [
      { id: "e1", from: "L", to: "T" },
      { id: "e2", from: "T", to: "c1", branch: "left" },
      { id: "e3", from: "T", to: "c2", branch: "middle" },
      { id: "e4", from: "T", to: "c3", branch: "right" },
    ];
    const board = buildBoard(nodes, edges);
    const a = startAttempt({ board, mode: "classic", queue: ["circle", "triangle", "diamond", "circle"], releases: [0, 2, 4, 6] });
    drop(a);
    run(a, 15);
    assert.equal(a.phase, "cleared");
    const b = startAttempt({ board, mode: "junior", queue: ["diamond"], releases: [0] });
    flip(b, "T");
    flip(b, "T");
    assert.equal(b.switches.get("T"), "right");
    assert.equal(b.flips, 2);
  });

  it("geared switches all flip on one tap, which counts once", () => {
    const level = LEVELS.find((l) => l.name === "Gear Pair")!;
    const board = buildBoard(level.nodes, level.edges);
    const a = startAttempt({ board, mode: "junior", queue: level.queue, releases: level.releases });
    assert.deepEqual([a.switches.get("B"), a.switches.get("C")], ["left", "right"]);
    flip(a, "C");
    assert.deepEqual([a.switches.get("B"), a.switches.get("C")], ["right", "left"]);
    assert.equal(a.flips, 1);
  });

  it("a gate holds marbles until its trip light is lit, then lets them go in order", () => {
    const level = LEVELS.find((l) => l.name === "Light Gate")!;
    const board = buildBoard(level.nodes, level.edges);
    const a = startAttempt({ board, mode: "junior", queue: ["triangle", "circle", "diamond"], releases: [0, 0, 0] });
    flip(a, "A"); // right, to the gate
    drop(a);
    run(a, 8);
    assert.equal(a.marbles[0]!.heldAt, "G");
    // A held marble isn't rolling: Junior can plan and drop the next one.
    assert.equal(canDrop(a), true);
    assert.equal(predictedRoute(a).cup, null, "the planning line stops at the shut gate");
    flip(a, "A"); // left, over the trip light
    drop(a);
    run(a, 10);
    assert.ok(a.lights.has("K"));
    assert.equal(a.marbles[0]!.cup, "c2");
    assert.ok(a.events.some((e) => e.kind === "open"));
  });

  it("calls a marble left behind a shut gate a lost attempt", () => {
    const level = LEVELS.find((l) => l.name === "Light Gate")!;
    const board = buildBoard(level.nodes, level.edges);
    const a = startAttempt({ board, mode: "classic", queue: ["triangle"], releases: [0] });
    flip(a, "A");
    drop(a);
    run(a, 10);
    assert.equal(a.phase, "missed");
    assert.equal(a.miss?.gate, "G");
    assert.equal(a.miss?.cup, null);
  });
});

describe("Junior", () => {
  const attempt = () => startAttempt({ board: forkBoard, mode: "junior", queue: ["triangle", "circle"], releases: [0, 0] });

  it("drops one marble at a time and locks the controls while it rolls", () => {
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

  it("hints at the control that needs tapping, from wherever the player is", () => {
    const a = attempt();
    assert.equal(hintFor(a), null, "it already points at the triangle");
    drop(a);
    run(a, 6);
    assert.equal(hintFor(a), "A");
  });
});

describe("Classic", () => {
  it("lets the controls be tapped while marbles roll", () => {
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
    advance(a, 5);
    run(a, 3);
    assert.equal(a.phase, "cleared");
    assert.ok(a.marbles[0]!.landedAt < a.marbles[1]!.landedAt);
  });

  it("sends marbles arriving together through in launch order", () => {
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
    const a = startAttempt({ board: buildBoard(nodes, edges), mode: "classic", queue: ["circle", "circle"], releases: [0, 0] });
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
    const where = { edge: second.edge?.id, at: second.enteredAt };
    run(a, MISS_BEAT + 5);
    assert.equal(a.phase, "missed");
    assert.deepEqual({ edge: second.edge?.id, at: second.enteredAt }, where);
    assert.equal(flip(a, "A"), false);
  });
});

describe("Retry", () => {
  it("starts over exactly: queue, controls, lights, taps and clock", () => {
    const level = LEVELS[19]!;
    const board = buildBoard(level.nodes, level.edges);
    const setup = { board, mode: "classic" as const, queue: level.queue, releases: level.releases };
    const first = startAttempt(setup);
    flip(first, "C");
    drop(first);
    run(first, 8);
    const again = startAttempt(setup);
    assert.equal(again.time, 0);
    assert.equal(again.flips, 0);
    assert.equal(again.phase, "setup");
    assert.equal(again.lights.size, 0);
    assert.deepEqual([...again.switches], board.controls.map((s) => [s.id, s.start]));
    assert.ok(again.marbles.every((m) => m.edge === null && m.cup === null && m.heldAt === null));
  });
});

describe("medals and unlocking", () => {
  const level = LEVELS[3]!;
  const memoryStore = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  };

  it("are one for a clear and more for fewer taps", () => {
    const [two, three] = level.stars.junior;
    assert.equal(starsFor(level, "junior", three), 3);
    assert.equal(starsFor(level, "junior", two), 2);
    assert.equal(starsFor(level, "junior", two + 1), 1);
  });

  it("keep the best result for each level and mode", () => {
    const storage = memoryStore();
    recordResult("junior", 1, 2, storage);
    recordResult("junior", 1, 1, storage);
    recordResult("classic", 1, 3, storage);
    const progress = loadProgress(storage);
    assert.equal(progress.junior[1], 2);
    assert.equal(progress.classic[1], 3);
  });

  it("unlock the next level in the same mode, and the Workshop from either", () => {
    const progress = { junior: { 1: 1, 10: 2 }, classic: {} as Record<number, number> };
    assert.equal(isUnlocked(progress, "junior", 2), true);
    assert.equal(isUnlocked(progress, "classic", 2), false);
    assert.equal(isUnlocked(progress, "classic", 11), true, "level 10 in Junior opens the Workshop for both");
    assert.equal(isUnlocked(progress, "classic", 12), false);
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

/**
 * Circuit Climb's rules: landing, the camera, scoring, and a route that can
 * always be climbed.
 *
 * The route test is the important one. A robot that only ever steers towards
 * the next pad on the guaranteed route climbs many seeds of both modes past
 * the height where the climb is as hard as it gets. If a generated step is
 * ever out of reach, it falls, and this fails.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLevel, extendTo, padX, routePads, type Pad } from "./level.ts";
import { createClimb, heightPoints, score, setViewHeight, stepClimb, type Climb } from "./run.ts";
import {
  ARENA_W,
  BODY_HALF,
  BOOST_BOUNCE,
  BOUNCE,
  GRAVITY,
  MODES,
  RELAY_BONUS,
  STEP,
  type Mode,
} from "./tuning.ts";

const APEX = (BOUNCE * BOUNCE) / (2 * GRAVITY);

/** Steers for the next route pad above the last thing he landed on. */
function climbWithBot(climb: Climb, untilHeight: number): void {
  let floor = -1;
  while (!climb.over && climb.peak < untilHeight) {
    const target = climb.level.pads
      .filter((p) => p.route && p.y > floor)
      .reduce<Pad | null>((low, p) => (!low || p.y < low.y ? p : low), null);
    const dx = target ? padX(target, climb.time) - climb.jes.x : 0;
    const landing = stepClimb(climb, Math.abs(dx) < 4 ? 0 : Math.sign(dx));
    if (landing) floor = landing.pad.y;
  }
}

/** A climb with only the pads given, for testing one rule at a time. */
function bare(pads: Array<Partial<Pad> & { y: number }>): Climb {
  const climb = createClimb(1, "classic", 640);
  climb.level.pads = pads.map((p, i) => ({
    id: 100 + i,
    kind: "standard",
    baseX: ARENA_W / 2,
    w: 100,
    route: true,
    swing: 0,
    speed: 0,
    phase: 0,
    powered: false,
    broken: false,
    ...p,
  }));
  // Nothing new appears above: the test owns the pads. And the camera stays
  // put, so a test can drop JES from anywhere without the run ending.
  climb.level.lastRoute = { ...climb.level.pads[0]!, y: 1e9 };
  climb.viewH = 1e7;
  climb.jes.x = ARENA_W / 2;
  return climb;
}

/** Step until he lands on something, and say what. */
function nextLanding(climb: Climb, limit = 600): Pad | null {
  for (let i = 0; i < limit; i += 1) {
    const landing = stepClimb(climb, 0);
    if (landing) return landing.pad;
  }
  return null;
}

describe("the route", () => {
  for (const mode of ["classic", "junior"] as Mode[]) {
    it(`can always be climbed in ${mode}, past the hardest it gets`, () => {
      const top = MODES[mode].rampHeight + 6000;
      for (let seed = 1; seed <= 10; seed += 1) {
        const climb = createClimb(seed * 7919, mode, 640);
        climbWithBot(climb, top);
        assert.equal(climb.over, false, `${mode} seed ${seed} fell at ${heightPoints(climb)} points`);
      }
    });

    it(`never asks for a jump higher than a bounce goes, in ${mode}`, () => {
      const level = createLevel(42, mode);
      extendTo(level, MODES[mode].rampHeight + 4000);
      const route = routePads(level);
      for (let i = 1; i < route.length; i += 1) {
        const rise = route[i]!.y - route[i - 1]!.y;
        assert.ok(rise <= 95, `a route step of ${rise.toFixed(0)}`);
        assert.ok(rise < APEX - 25, "a step that needs the very top of a bounce");
      }
    });

    it(`keeps every route pad still and solid in ${mode}`, () => {
      const level = createLevel(7, mode);
      extendTo(level, 20000);
      for (const pad of routePads(level)) {
        assert.ok(pad.kind === "standard" || pad.kind === "relay" || pad.kind === "ground", pad.kind);
        assert.equal(pad.swing, 0);
        assert.ok(pad.baseX - pad.w / 2 >= 0 && pad.baseX + pad.w / 2 <= ARENA_W);
      }
    });
  }

  it("is the same climb for the same seed", () => {
    const a = createLevel(99, "classic");
    const b = createLevel(99, "classic");
    extendTo(a, 8000);
    extendTo(b, 8000);
    assert.deepEqual(a.pads, b.pads);
  });

  it("is kinder in Junior: wider pads and smaller gaps", () => {
    const gaps = (mode: Mode) => {
      const level = createLevel(5, mode);
      extendTo(level, 30000);
      const route = routePads(level).slice(5);
      const widths = route.reduce((sum, p) => sum + p.w, 0) / route.length;
      const rise = (route.at(-1)!.y - route[0]!.y) / (route.length - 1);
      return { widths, rise };
    };
    const classic = gaps("classic");
    const junior = gaps("junior");
    assert.ok(junior.widths > classic.widths + 20);
    assert.ok(junior.rise < classic.rise - 8);
  });

  it("has a relay within the first five landings", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const level = createLevel(seed, "classic");
      extendTo(level, 2000);
      const first = routePads(level).findIndex((p) => p.kind === "relay");
      assert.ok(first > 0 && first <= 5, `first relay is route pad ${first}`);
    }
  });

  it("puts side paths beside the route, never on top of a route pad", () => {
    const level = createLevel(11, "classic");
    extendTo(level, 30000);
    const route = routePads(level);
    const side = level.pads.filter((p) => !p.route);
    for (const kind of ["moving", "brittle", "boost", "relay"]) {
      assert.ok(side.some((p) => p.kind === kind), `no ${kind} pads`);
    }
    assert.ok(side.length > route.length * 0.2, `only ${side.length} side pads`);
    for (const pad of side) {
      for (const r of route) {
        assert.ok(Math.abs(pad.y - r.y) >= 15, `a ${pad.kind} pad is level with a route pad`);
      }
    }
  });
});

describe("landing", () => {
  it("lands on a pad when coming down onto it", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 100 }]);
    climb.jes.y = 140;
    climb.jes.vy = -100;
    let landed: Pad | null = null;
    for (let i = 0; i < 120 && !landed; i += 1) landed = stepClimb(climb, 0)?.pad ?? null;
    assert.equal(landed?.y, 100);
    assert.equal(climb.jes.y, 100);
    assert.equal(climb.jes.vy, BOUNCE);
  });

  it("passes up through a pad from below", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 60 }]);
    const landings: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      const l = stepClimb(climb, 0);
      if (l) landings.push(l.pad.y);
    }
    // Going up through it at 60, then coming down onto it.
    assert.ok(climb.jes.y > 0);
    assert.deepEqual(landings.slice(0, 1), landings.length ? [60] : []);
    assert.ok(landings.every((y) => y === 60));
  });

  it("can't fall through a pad however fast he is going", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 300, w: 40 }]);
    climb.jes.y = 4000;
    climb.jes.vy = -20000;
    let landed: Pad | null = null;
    for (let i = 0; i < 2000 && !landed; i += 1) landed = stepClimb(climb, 0)?.pad ?? null;
    assert.equal(landed?.y, 300);
  });

  it("takes the higher of two pads crossed in one step", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 100 }, { y: 103 }]);
    climb.jes.y = 108;
    climb.jes.vy = -1200;
    const landed = stepClimb(climb, 0);
    assert.equal(landed?.pad.y, 103);
  });

  it("needs the foot over the pad, not just near it", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 100, baseX: 80, w: 60 }]);
    climb.jes.x = 80 + 30 + 12 + 1;
    climb.jes.y = 105;
    climb.jes.vy = -300;
    const landed = stepClimb(climb, 0) ?? stepClimb(climb, 0);
    assert.notEqual(landed?.pad.y, 100);
    climb.jes.x = 80 + 30 + 12 - 1;
    climb.jes.y = 105;
    climb.jes.vy = -300;
    const second = stepClimb(climb, 0) ?? stepClimb(climb, 0);
    assert.equal(second?.pad.y, 100);
  });

  it("bounces higher off a boost pad", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 50, kind: "boost" }]);
    climb.jes.y = 60;
    climb.jes.vy = -200;
    const landed = nextLanding(climb);
    assert.equal(landed?.kind, "boost");
    assert.equal(climb.jes.vy, BOOST_BOUNCE);
  });

  it("breaks a brittle pad after one bounce", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 50, kind: "brittle" }]);
    climb.jes.y = 60;
    climb.jes.vy = -200;
    const first = nextLanding(climb);
    assert.equal(first?.kind, "brittle");
    let next: Pad | null = null;
    for (let i = 0; i < 240 && !next; i += 1) next = stepClimb(climb, 0)?.pad ?? null;
    assert.equal(next?.kind, "ground", "the second time down, it's gone");
  });

  it("lands on a moving pad where it is, not where it started", () => {
    const climb = bare([
      { y: 0, w: 360, kind: "ground" },
      { y: 50, kind: "moving", baseX: 180, w: 50, swing: 100, speed: Math.PI, phase: Math.PI / 2 },
    ]);
    // At time zero the pad is at 180 + 100 = 280, not at 180.
    climb.jes.x = 280;
    climb.jes.y = 52;
    climb.jes.vy = -300;
    const landed = stepClimb(climb, 0);
    assert.equal(landed?.pad.kind, "moving");
  });
});

describe("steering", () => {
  it("is held against the walls", () => {
    const climb = createClimb(1, "classic", 640);
    for (let i = 0; i < 400; i += 1) stepClimb(climb, -1);
    assert.equal(climb.jes.x, BODY_HALF);
    for (let i = 0; i < 400; i += 1) stepClimb(climb, 1);
    assert.equal(climb.jes.x, ARENA_W - BODY_HALF);
  });

  it("slows to a stop when let go", () => {
    const climb = createClimb(1, "classic", 640);
    for (let i = 0; i < 30; i += 1) stepClimb(climb, 1);
    assert.ok(climb.jes.vx > 0);
    for (let i = 0; i < 60; i += 1) stepClimb(climb, 0);
    assert.equal(climb.jes.vx, 0);
  });

  it("bounces the same height whatever the frame rate", () => {
    // The arcade runs JES in fixed steps; what changes with a phone's screen
    // is only how many steps a frame holds. Same steps, same bounce.
    const peaks = [1, 2, 4].map((perFrame) => {
      const climb = bare([{ y: 0, w: 360, kind: "ground" }]);
      let peak = 0;
      for (let frame = 0; frame < 240 / perFrame; frame += 1) {
        for (let i = 0; i < perFrame; i += 1) stepClimb(climb, 0, STEP);
        peak = Math.max(peak, climb.jes.y);
      }
      return peak;
    });
    assert.ok(Math.abs(peaks[0]! - peaks[2]!) < 1, String(peaks));
    assert.ok(Math.abs(peaks[0]! - APEX) < 3, `bounces ${peaks[0]} against ${APEX}`);
  });
});

describe("the camera and the end", () => {
  it("follows him up and never comes down", () => {
    const climb = createClimb(3, "classic", 640);
    let low = climb.cameraY;
    let lastCamera = climb.cameraY;
    let floor = -1;
    for (let i = 0; i < 120 * 20 && !climb.over; i += 1) {
      const target = climb.level.pads.filter((p) => p.route && p.y > floor).sort((a, b) => a.y - b.y)[0]!;
      const dx = padX(target, climb.time) - climb.jes.x;
      const l = stepClimb(climb, Math.abs(dx) < 4 ? 0 : Math.sign(dx));
      if (l) floor = l.pad.y;
      assert.ok(climb.cameraY >= lastCamera);
      lastCamera = climb.cameraY;
      low = Math.min(low, climb.cameraY);
    }
    assert.ok(climb.cameraY > low + 500, "it should have climbed");
  });

  it("ends the run once he has fallen off the bottom", () => {
    const climb = bare([{ y: -5000, w: 10, baseX: 5 }]);
    climb.cameraY = 200;
    climb.jes.y = 400;
    climb.jes.vy = 0;
    let steps = 0;
    while (!climb.over && steps < 1000) {
      stepClimb(climb, 0);
      steps += 1;
    }
    assert.equal(climb.over, true);
    assert.ok(climb.jes.y < climb.cameraY, "not before he is off the screen");
    // And nothing more happens once it's over.
    const y = climb.jes.y;
    stepClimb(climb, 1);
    assert.equal(climb.jes.y, y);
  });

  it("keeps JES where he is when the screen changes size", () => {
    const climb = createClimb(4, "classic", 640);
    for (let i = 0; i < 100; i += 1) stepClimb(climb, 0);
    const { x, y } = climb.jes;
    const camera = climb.cameraY;
    setViewHeight(climb, 800);
    assert.equal(climb.jes.x, x);
    assert.equal(climb.jes.y, y);
    assert.equal(climb.cameraY, camera);
  });
});

describe("scoring", () => {
  it("is a point for every ten units of height, plus each relay once", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }, { y: 60, kind: "relay" }]);
    climb.jes.x = 180;
    for (let i = 0; i < 120 * 5; i += 1) stepClimb(climb, 0);
    // He has bounced on the relay again and again, and it paid once.
    assert.ok(climb.landings > 3);
    assert.equal(climb.relays, 1);
    assert.equal(heightPoints(climb), Math.floor(climb.peak / 10));
    assert.equal(score(climb), heightPoints(climb) + RELAY_BONUS);
  });

  it("counts the highest he got, not where he is", () => {
    const climb = bare([{ y: 0, w: 360, kind: "ground" }]);
    for (let i = 0; i < 40; i += 1) stepClimb(climb, 0);
    const peak = climb.peak;
    for (let i = 0; i < 40; i += 1) stepClimb(climb, 0);
    assert.ok(climb.peak >= peak);
    assert.equal(heightPoints(climb), Math.floor(climb.peak / 10));
  });
});

/**
 * How Marble Switch looks: a navy enamel cabinet ringed with marquee bulbs,
 * clear acrylic rails, brass levers, glass marbles and coloured cups. Drawn
 * from the level data, in board units (360 across, 520 down), so the picture
 * is always exactly the track the marbles run on.
 *
 * Rails are kept neutral -- clear, not coloured -- so a rail never seems to
 * promise a cup. Colour belongs to the marbles and cups, and every colour
 * comes with its shape, so nothing depends on telling colours apart.
 *
 * The Workshop's pieces show their state in how they're drawn: a flipper's
 * orange collar, a turntable's lit exit, the gears turning between a geared
 * pair, a trip light's bulb and the gate wired to it. The light show -- rails
 * that glow where a marble has just rolled, bulbs round each cup, the
 * marquee chase on a clear and the dimming on a miss -- reads the same
 * state, and holds still when reduced motion is on.
 */

import { gearedWith, pointAt, type Board, type Edge, type NodeDef, type Symbol } from "./graph.ts";
import { marblePosition, SPEED, type Attempt } from "./sim.ts";

export const BOARD_W = 360;
export const BOARD_H = 520;
export const FONT = "ui-monospace, Menlo, Consolas, monospace";

export const SYMBOL_COLOR: Readonly<Record<Symbol, string>> = {
  circle: "#2fe0c8",
  triangle: "#ffb02e",
  diamond: "#ff4fa0",
};
export const SYMBOL_NAME: Readonly<Record<Symbol, string>> = {
  circle: "circle",
  triangle: "triangle",
  diamond: "diamond",
};

const RAIL_W = 17;
const MARBLE_R = 11;
const BRASS = "#f2b832";
const FLIPPER = "#ff7a2f";
const LAMP = "#ffcf5a";
const WIRE = "#b58cff";

/** How the cabinet's bulbs are behaving. */
export interface Marquee {
  mode: "idle" | "chase" | "dim";
  /** Seconds the current mode has been running. */
  for: number;
  /** Three stars: a brighter, faster chase. */
  bright: boolean;
}

export interface BoardOptions {
  clock: number;
  calm: boolean;
  highContrast: boolean;
  /** Junior's planning line: the rails the next marble would take. */
  predicted: readonly Edge[] | null;
  /** A control to pulse, for Junior's hint. */
  hintSwitch: string | null;
  /** Each switch's lever, 0 (left) to 1 (right), eased towards its setting. */
  leverTurn: ReadonlyMap<string, number>;
  /** Each turntable's turn in notches, eased; it only ever counts up. */
  wheelTurn: ReadonlyMap<string, number>;
  /** Each gear group's angle, which turns as the pair is flipped. */
  gearAngle: ReadonlyMap<string, number>;
  /** When each trip light came on, for its flare. */
  litAt: ReadonlyMap<string, number>;
  /** Where each marble has just been, newest last, for the glowing trail. */
  trails: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
  /** Seconds since a wrong catch or a stuck marble, or null. */
  missFor: number | null;
}

// ----- The cabinet -----

/** The bulbs round the cabinet's edge, as points, clockwise from the top left. */
function bulbRing(x: number, y: number, w: number, h: number, spacing: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const along = (x1: number, y1: number, x2: number, y2: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / spacing));
    for (let i = 0; i < n; i += 1) points.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  };
  const inset = 9;
  along(x + 22, y + inset, x + w - 22, y + inset);
  along(x + w - inset, y + 22, x + w - inset, y + h - 22);
  along(x + w - 22, y + h - inset, x + 22, y + h - inset);
  along(x + inset, y + h - 22, x + inset, y + 22);
  return points;
}

export function drawCabinet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  calm: boolean,
  clock: number,
  marquee: Marquee,
): void {
  ctx.save();
  // How lit the whole machine is: a miss flickers and then powers down.
  let power = 1;
  if (marquee.mode === "dim") {
    const t = marquee.for;
    power = calm ? 0.45 : t < 0.5 ? (Math.sin(t * 60) > 0 ? 0.9 : 0.3) : Math.max(0.35, 1 - t);
  }

  const glow = calm ? 1 : 0.85 + 0.15 * Math.sin(clock * 1.6);
  ctx.shadowColor = "#ff8a3d";
  ctx.shadowBlur = 16 * glow * power;
  ctx.strokeStyle = `rgba(255,150,70,${0.8 * glow * power})`;
  ctx.lineWidth = 3;
  roundBox(ctx, x, y, w, h, 22);
  ctx.stroke();
  ctx.shadowBlur = 0;
  const enamel = ctx.createLinearGradient(0, y, 0, y + h);
  enamel.addColorStop(0, "#1b2a6b");
  enamel.addColorStop(1, "#121d4d");
  ctx.fillStyle = enamel;
  roundBox(ctx, x + 4, y + 4, w - 8, h - 8, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(70,224,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // The marquee bulbs.
  const bulbs = bulbRing(x, y, w, h, 19);
  bulbs.forEach(([bx, by], i) => {
    let on: number;
    if (marquee.mode === "chase") {
      // Lights running round the cabinet; three stars runs two chases, faster.
      const speed = marquee.bright ? 34 : 20;
      const head = (marquee.for * speed) % bulbs.length;
      const gap = (head - i + bulbs.length) % bulbs.length;
      const second = marquee.bright ? (head + bulbs.length / 2 - i + bulbs.length) % bulbs.length : Infinity;
      on = calm ? 1 : Math.max(0.25, 1 - Math.min(gap, second) / 6);
    } else if (marquee.mode === "dim") {
      on = power * 0.5;
    } else {
      // At rest, every other bulb glows and they swap now and then.
      on = calm ? 0.55 : (i + Math.floor(clock * 1.2)) % 2 === 0 ? 0.75 : 0.35;
    }
    const hue = marquee.mode === "chase" && marquee.bright ? ["#ffd75a", "#7cf2ff", "#ff8fd0"][i % 3]! : LAMP;
    ctx.fillStyle = hue;
    ctx.globalAlpha = on;
    if (on > 0.7) {
      ctx.shadowColor = hue;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  ctx.globalAlpha = 1;
  for (const [sx, sy] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]] as const) {
    screw(ctx, sx, sy, 4.5);
  }
  ctx.restore();
}

function screw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r);
  g.addColorStop(0, "#fff0b0");
  g.addColorStop(1, "#a7741a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(80,50,10,0.8)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y);
  ctx.lineTo(x + r * 0.6, y);
  ctx.stroke();
}

// ----- Rails -----

function trace(ctx: CanvasRenderingContext2D, edge: Edge, from = 0, to = edge.length): void {
  ctx.beginPath();
  let started = false;
  for (const s of edge.samples) {
    if (s.d < from || s.d > to) continue;
    if (!started) {
      ctx.moveTo(s.x, s.y);
      started = true;
    } else {
      ctx.lineTo(s.x, s.y);
    }
  }
}

function drawRail(ctx: CanvasRenderingContext2D, edge: Edge, highContrast: boolean): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (edge.bridge) {
    // An overpass: a shadow beneath and pillars, so it reads as passing over.
    ctx.strokeStyle = "rgba(0,0,10,0.55)";
    ctx.lineWidth = RAIL_W + 10;
    trace(ctx, edge, 40, edge.length - 40);
    ctx.stroke();
  }
  ctx.strokeStyle = highContrast ? "rgba(255,255,255,0.95)" : "rgba(205,235,255,0.62)";
  ctx.lineWidth = RAIL_W + 3;
  trace(ctx, edge);
  ctx.stroke();
  ctx.strokeStyle = edge.bridge ? "#1d2f78" : "#17255d";
  ctx.lineWidth = RAIL_W - 2;
  trace(ctx, edge);
  ctx.stroke();
  ctx.strokeStyle = "rgba(190,225,255,0.14)";
  ctx.lineWidth = RAIL_W - 2;
  trace(ctx, edge);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.5;
  trace(ctx, edge);
  ctx.stroke();
  if (edge.bridge) {
    for (const at of [0.3, 0.7]) {
      const p = pointAt(edge, edge.length * at);
      screw(ctx, p.x, p.y + 12, 3.5);
    }
  }
  ctx.restore();
}

/** Junior's planning line: a soft white trail along the rails the next marble would take. */
function drawPrediction(ctx: CanvasRenderingContext2D, edges: readonly Edge[], clock: number, calm: boolean): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.setLineDash([2, 9]);
  ctx.lineDashOffset = calm ? 0 : -clock * 22;
  for (const edge of edges) {
    trace(ctx, edge);
    ctx.stroke();
  }
  ctx.restore();
}

/** The glow a marble leaves in the acrylic where it has just rolled. Neutral white, so it promises nothing. */
function drawTrail(ctx: CanvasRenderingContext2D, points: ReadonlyArray<{ x: number; y: number }>): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 1; i < points.length; i += 1) {
    const k = i / points.length;
    ctx.strokeStyle = `rgba(220,245,255,${0.35 * k})`;
    ctx.lineWidth = 4 + 6 * k;
    ctx.beginPath();
    ctx.moveTo(points[i - 1]!.x, points[i - 1]!.y);
    ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ----- Controls -----

function exitAngle(node: NodeDef, edge: Edge): number {
  const p = pointAt(edge, 26);
  return Math.atan2(p.y - node.y, p.x - node.x);
}

function drawLabel(ctx: CanvasRenderingContext2D, node: NodeDef, label: string, dy = -24): void {
  ctx.save();
  ctx.fillStyle = "rgba(220,235,255,0.8)";
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, node.x, node.y + dy);
  ctx.restore();
}

function hintRing(ctx: CanvasRenderingContext2D, node: NodeDef, pulse: number, r = 26): void {
  if (pulse <= 0) return;
  ctx.strokeStyle = `rgba(255,214,90,${0.3 + 0.6 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r + 6 * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

/** A gear wheel's outline: teeth round a rim. */
function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, teeth: number, angle: number): void {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i += 1) {
    const a = angle + (i * Math.PI) / teeth;
    const rr = i % 2 === 0 ? r + 3 : r;
    const a2 = a + Math.PI / teeth;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
  }
  ctx.closePath();
}

/**
 * A switch: an enamel hub on a clear Y, and a brass lever lying along the
 * rail it is set to, with an arrow at its tip. A flipper has an orange
 * collar; a geared one sits in a brass gear.
 */
function drawSwitch(
  ctx: CanvasRenderingContext2D,
  board: Board,
  node: NodeDef,
  label: string,
  turn: number,
  pulse: number,
  gearAngle: number,
): void {
  const left = board.out.get(node.id)!.find((e) => e.branch === "left")!;
  const right = board.out.get(node.id)!.find((e) => e.branch === "right")!;
  const a = exitAngle(node, left);
  const b = exitAngle(node, right);
  let span = b - a;
  if (span > Math.PI) span -= Math.PI * 2;
  if (span < -Math.PI) span += Math.PI * 2;
  const angle = a + span * turn;

  ctx.save();
  hintRing(ctx, node, pulse);
  // The rail not taken, gated off with a short bar.
  const closed = turn < 0.5 ? right : left;
  const gatePoint = pointAt(closed, 18);
  const ga = exitAngle(node, closed) + Math.PI / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(gatePoint.x + Math.cos(ga) * 7, gatePoint.y + Math.sin(ga) * 7);
  ctx.lineTo(gatePoint.x - Math.cos(ga) * 7, gatePoint.y - Math.sin(ga) * 7);
  ctx.stroke();

  if (node.link) {
    ctx.fillStyle = "#8a6a1e";
    ctx.strokeStyle = "#ffd77a";
    ctx.lineWidth = 1.2;
    gear(ctx, node.x, node.y, 16, 10, gearAngle * (node.x < BOARD_W / 2 ? 1 : -1));
    ctx.fill();
    ctx.stroke();
  }
  // The hub.
  ctx.fillStyle = "#1a2a74";
  ctx.strokeStyle = node.auto ? FLIPPER : "rgba(70,224,255,0.8)";
  ctx.lineWidth = node.auto ? 3.5 : 2;
  ctx.beginPath();
  ctx.arc(node.x, node.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (node.auto) {
    // The flipper's mark: a little curved arrow round the collar.
    ctx.strokeStyle = FLIPPER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 18, Math.PI * 1.15, Math.PI * 1.75);
    ctx.stroke();
    const tip = Math.PI * 1.75;
    ctx.fillStyle = FLIPPER;
    ctx.beginPath();
    ctx.moveTo(node.x + Math.cos(tip) * 18 + 3, node.y + Math.sin(tip) * 18 + 1);
    ctx.lineTo(node.x + Math.cos(tip) * 18 - 2, node.y + Math.sin(tip) * 18 - 3);
    ctx.lineTo(node.x + Math.cos(tip) * 18 - 1, node.y + Math.sin(tip) * 18 + 4);
    ctx.closePath();
    ctx.fill();
  }

  // The lever, with its arrow.
  ctx.translate(node.x, node.y);
  ctx.rotate(angle);
  const brass = ctx.createLinearGradient(0, -4, 0, 4);
  brass.addColorStop(0, "#ffe08a");
  brass.addColorStop(1, "#b98316");
  ctx.fillStyle = brass;
  roundBox(ctx, -3, -4.5, 34, 9, 4.5);
  ctx.fill();
  ctx.fillStyle = "#3a2706";
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(23, -3.6);
  ctx.lineTo(23, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  screw(ctx, 0, 0, 5);
  ctx.restore();
  drawLabel(ctx, node, label, node.auto ? -30 : -24);
}

/**
 * A turntable: a brass-rimmed wheel with a bright channel across it pointing
 * at its current exit, and a little lamp lit over that exit.
 */
function drawTurntable(ctx: CanvasRenderingContext2D, board: Board, node: NodeDef, label: string, turn: number, pulse: number): void {
  const exits = ["left", "middle", "right"] as const;
  const angles = exits.map((e) => exitAngle(node, board.out.get(node.id)!.find((x) => x.branch === e)!));
  // Ease between the angles of the exits the wheel is turning through.
  const step = Math.floor(turn);
  const frac = turn - step;
  const from = angles[((step % 3) + 3) % 3]!;
  const to = angles[(((step + 1) % 3) + 3) % 3]!;
  let span = to - from;
  if (span > Math.PI) span -= Math.PI * 2;
  if (span < -Math.PI) span += Math.PI * 2;
  const angle = from + span * frac;

  ctx.save();
  hintRing(ctx, node, pulse, 30);
  // Exit lamps.
  const current = ((Math.round(turn) % 3) + 3) % 3;
  angles.forEach((a, i) => {
    const lx = node.x + Math.cos(a) * 30;
    const ly = node.y + Math.sin(a) * 30;
    ctx.fillStyle = i === current ? LAMP : "rgba(120,130,170,0.6)";
    if (i === current) {
      ctx.shadowColor = LAMP;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(lx, ly, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  // The wheel.
  const rim = ctx.createRadialGradient(node.x - 6, node.y - 6, 2, node.x, node.y, 22);
  rim.addColorStop(0, "#ffe9a8");
  rim.addColorStop(1, "#9c6d12");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(node.x, node.y, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a2a74";
  ctx.beginPath();
  ctx.arc(node.x, node.y, 17, 0, Math.PI * 2);
  ctx.fill();
  // Spokes, turning with it.
  ctx.translate(node.x, node.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255,224,140,0.45)";
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 6; k += 1) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos((k * Math.PI) / 3) * 16, Math.sin((k * Math.PI) / 3) * 16);
    ctx.stroke();
  }
  // The channel the marble rolls through, pointing at the exit.
  ctx.fillStyle = "rgba(205,235,255,0.85)";
  roundBox(ctx, -6, -4.5, 26, 9, 4.5);
  ctx.fill();
  ctx.fillStyle = "#3a2706";
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(12, -3.4);
  ctx.lineTo(12, 3.4);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  screw(ctx, 0, 0, 4.5);
  ctx.restore();
  drawLabel(ctx, node, label, -36);
}

/** A trip light: a bulb set into the rail. */
function drawTrip(ctx: CanvasRenderingContext2D, node: NodeDef, lit: boolean, flare: number, calm: boolean): void {
  ctx.save();
  if (lit) {
    const r = 26 + (calm ? 0 : 18 * flare);
    const halo = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, r);
    halo.addColorStop(0, `rgba(255,214,110,${0.55 + 0.4 * flare})`);
    halo.addColorStop(1, "rgba(255,214,110,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = lit ? "#ffe39a" : "#2a2f55";
  ctx.strokeStyle = lit ? "#fff4cf" : "rgba(181,140,255,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(node.x, node.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // The filament.
  ctx.strokeStyle = lit ? "#c06b00" : "rgba(181,140,255,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(node.x - 4, node.y + 2);
  ctx.lineTo(node.x - 2, node.y - 2);
  ctx.lineTo(node.x, node.y + 2);
  ctx.lineTo(node.x + 2, node.y - 2);
  ctx.lineTo(node.x + 4, node.y + 2);
  ctx.stroke();
  ctx.restore();
}

/** A gate: a bar across the rail, with a lamp that matches its trip light. It slides aside when the light is on. */
function drawGate(ctx: CanvasRenderingContext2D, board: Board, node: NodeDef, open: number): void {
  const out = board.out.get(node.id)![0]!;
  const a = exitAngle(node, out) + Math.PI / 2;
  const slide = open * 16;
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.rotate(a);
  ctx.fillStyle = "#13204a";
  ctx.strokeStyle = WIRE;
  ctx.lineWidth = 2;
  roundBox(ctx, -16, -7, 32, 14, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = open > 0.5 ? "#7cf2a0" : "#ff7a6a";
  roundBox(ctx, -12 + slide, -3.5, 24 - slide, 7, 3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = open > 0.5 ? LAMP : "#3a3f6a";
  ctx.strokeStyle = WIRE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(node.x + 20, node.y - 12, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ----- Marbles and cups -----

export function drawSymbol(ctx: CanvasRenderingContext2D, symbol: Symbol, x: number, y: number, r: number, color: string, width: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (symbol === "circle") {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (symbol === "triangle") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.95, y + r * 0.7);
    ctx.lineTo(x - r * 0.95, y + r * 0.7);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - r * 1.1);
    ctx.lineTo(x + r * 0.85, y);
    ctx.lineTo(x, y + r * 1.1);
    ctx.lineTo(x - r * 0.85, y);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

/** A glass marble. The symbol always faces the player; only the shine rolls. */
export function drawMarble(ctx: CanvasRenderingContext2D, symbol: Symbol, x: number, y: number, r: number, roll: number, alpha = 1): void {
  const color = SYMBOL_COLOR[symbol];
  ctx.save();
  ctx.globalAlpha *= alpha;
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.25, color);
  body.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  drawSymbol(ctx, symbol, x, y + (symbol === "triangle" ? 1 : 0), r * 0.48, "rgba(255,255,255,0.95)", Math.max(1.4, r * 0.14));
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35 + Math.sin(roll) * r * 0.15, y - r * 0.45, r * 0.32, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A cup, with a ring of bulbs along its rim that light one per marble caught. */
function drawCup(ctx: CanvasRenderingContext2D, node: NodeDef, flash: number, caught: number, highContrast: boolean, w = 60): void {
  const symbol = node.symbol!;
  const color = SYMBOL_COLOR[symbol];
  const h = 44;
  const x = node.x - w / 2;
  const y = node.y - 14;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + caught * 3;
  const glass = ctx.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, hexA(color, 0.55));
  glass.addColorStop(1, hexA(color, 0.85));
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - 5, y + h - 8);
  ctx.quadraticCurveTo(x + w - 6, y + h, x + w - 14, y + h);
  ctx.lineTo(x + 14, y + h);
  ctx.quadraticCurveTo(x + 6, y + h, x + 5, y + h - 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = highContrast ? "#ffffff" : shade(color, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = shade(color, 0.35);
  roundBox(ctx, x - 3, y - 4, w + 6, 8, 4);
  ctx.fill();
  // Bulbs along the rim.
  for (let i = 0; i < 5; i += 1) {
    const on = i < caught;
    const bx = x + 6 + i * ((w - 12) / 4);
    ctx.fillStyle = on ? "#fff6c8" : "rgba(10,14,40,0.55)";
    if (on) {
      ctx.shadowColor = "#fff2a8";
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(bx, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  drawSymbol(ctx, symbol, node.x, y + h * 0.55, 10, "rgba(255,255,255,0.95)", 2.6);
  if (flash > 0) {
    ctx.strokeStyle = `rgba(255,70,70,${flash})`;
    ctx.lineWidth = 4;
    roundBox(ctx, x - 7, y - 9, w + 14, h + 15, 10);
    ctx.stroke();
  }
  ctx.restore();
}

/** The clear tube the marbles wait in, next one at the bottom. */
function drawLauncher(ctx: CanvasRenderingContext2D, node: NodeDef, waiting: readonly Symbol[]): void {
  const shown = waiting.slice(0, 5);
  const tubeH = 18 + Math.max(1, shown.length) * 24;
  const x = node.x;
  const bottom = node.y + 6;
  ctx.save();
  ctx.fillStyle = "rgba(190,225,255,0.12)";
  ctx.strokeStyle = "rgba(205,235,255,0.7)";
  ctx.lineWidth = 2;
  roundBox(ctx, x - 16, bottom - tubeH, 32, tubeH, 10);
  ctx.fill();
  ctx.stroke();
  shown.forEach((symbol, i) => drawMarble(ctx, symbol, x, bottom - 14 - i * 24, MARBLE_R, 0));
  if (waiting.length > shown.length) {
    ctx.fillStyle = "rgba(220,235,255,0.85)";
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(`+${waiting.length - shown.length}`, x + 20, bottom - tubeH + 10);
  }
  ctx.fillStyle = BRASS;
  roundBox(ctx, x - 18, bottom - 2, 36, 6, 3);
  ctx.fill();
  ctx.restore();
}

// ----- The whole board -----

export function drawBoard(ctx: CanvasRenderingContext2D, a: Attempt, labels: ReadonlyMap<string, string>, opt: BoardOptions): void {
  const board = a.board;
  const edges = [...board.edges.values()];

  // Wires: a gate to its trip light, and a chain between geared switches.
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 2;
  for (const node of board.nodes.values()) {
    if (node.kind === "gate") {
      const key = board.nodes.get(node.key!)!;
      ctx.strokeStyle = a.lights.has(key.id) ? "rgba(255,214,110,0.7)" : "rgba(181,140,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(key.x, key.y);
      ctx.lineTo(node.x + 20, node.y - 12);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "rgba(255,215,122,0.55)";
  const chained = new Set<string>();
  for (const node of board.switches) {
    if (!node.link || chained.has(node.link)) continue;
    chained.add(node.link);
    const group = gearedWith(board, node.id);
    ctx.lineDashOffset = -(opt.gearAngle.get(node.link) ?? 0) * 20;
    ctx.beginPath();
    group.forEach((g, i) => (i === 0 ? ctx.moveTo(g.x, g.y) : ctx.lineTo(g.x, g.y)));
    ctx.stroke();
  }
  ctx.restore();

  for (const edge of edges) if (!edge.bridge) drawRail(ctx, edge, opt.highContrast);
  for (const edge of edges) if (edge.bridge) drawRail(ctx, edge, opt.highContrast);
  if (!opt.calm) for (const trail of opt.trails) drawTrail(ctx, trail);
  if (opt.predicted) drawPrediction(ctx, opt.predicted, opt.clock, opt.calm);

  // Where rails join: a clear collar, so a merge reads as one piece.
  for (const node of board.nodes.values()) {
    if (node.kind !== "junction") continue;
    ctx.save();
    ctx.fillStyle = "#1b2a6b";
    ctx.strokeStyle = "rgba(205,235,255,0.8)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(205,235,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(node.x - 5, node.y - 3);
    ctx.lineTo(node.x + 5, node.y - 3);
    ctx.lineTo(node.x, node.y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const flash = opt.missFor === null ? 0 : opt.calm ? 1 : 0.55 + 0.45 * Math.abs(Math.cos(opt.missFor * 7));
  // Cups are as wide as they can be without touching their neighbours.
  let gap = Infinity;
  for (let i = 1; i < board.cups.length; i += 1) gap = Math.min(gap, board.cups[i]!.x - board.cups[i - 1]!.x);
  const cupW = Math.min(60, gap - 8);
  for (const cup of board.cups) {
    const caught = a.marbles.filter((m) => m.cup === cup.id).length;
    drawCup(ctx, cup, a.miss?.cup === cup.id ? flash : 0, caught, opt.highContrast, cupW);
  }

  for (const node of board.nodes.values()) {
    if (node.kind === "trip") {
      const at = opt.litAt.get(node.id);
      const flare = at === undefined ? 0 : Math.max(0, 1 - (opt.clock - at) * 2);
      drawTrip(ctx, node, a.lights.has(node.id), flare, opt.calm);
    } else if (node.kind === "gate") {
      const at = opt.litAt.get(node.key!);
      const open = !a.lights.has(node.key!) ? 0 : opt.calm || at === undefined ? 1 : Math.min(1, (opt.clock - at) * 4);
      drawGate(ctx, board, node, open);
    }
  }

  for (const node of board.controls) {
    const pulse = opt.hintSwitch === node.id ? (opt.calm ? 1 : 0.5 + 0.5 * Math.sin(opt.clock * 6)) : 0;
    const label = labels.get(node.id) ?? node.id;
    if (node.kind === "turntable") {
      drawTurntable(ctx, board, node, label, opt.wheelTurn.get(node.id) ?? 0, pulse);
    } else {
      drawSwitch(ctx, board, node, label, opt.leverTurn.get(node.id) ?? 0, pulse, opt.gearAngle.get(node.link ?? "") ?? 0);
    }
  }

  const waiting = a.marbles.filter((m) => m.edge === null).map((m) => m.symbol);
  drawLauncher(ctx, board.launcher, waiting);

  for (const m of a.marbles) {
    const p = marblePosition(a, m);
    if (!p) continue;
    if (m.cup) {
      const cupMarbles = a.marbles.filter((x) => x.cup === m.cup);
      const k = cupMarbles.indexOf(m);
      drawMarble(ctx, m.symbol, p.x - 12 + (k % 3) * 12, p.y + 8 - Math.floor(k / 3) * 8, MARBLE_R * 0.9, 0);
    } else {
      const travelled = m.heldAt ? 0 : (a.time - m.enteredAt) * SPEED;
      const bob = m.heldAt && !opt.calm ? Math.sin(opt.clock * 5) * 1.2 : 0;
      drawMarble(ctx, m.symbol, p.x, p.y + bob, MARBLE_R, opt.calm ? 0 : travelled / MARBLE_R);
    }
    if (a.miss?.marble === m.index && opt.missFor !== null) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,70,${flash})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y + (m.cup ? 6 : 0), 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ----- The cabinet tile -----

export function drawMarbleSwitchIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 64;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = "#16245f";
  roundBox(ctx, 3, 3, 58, 58, 11);
  ctx.fill();
  ctx.strokeStyle = "#ff9a4d";
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const [bx, by] of [[10, 8], [22, 6], [42, 6], [54, 8], [58, 30], [6, 30]] as const) {
    ctx.fillStyle = LAMP;
    ctx.beginPath();
    ctx.arc(bx, by, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [w, c] of [[11, "rgba(205,235,255,0.7)"], [7, "#1b2a6b"]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(32, 26);
    ctx.lineTo(16, 42);
    ctx.lineTo(16, 50);
    ctx.moveTo(32, 26);
    ctx.lineTo(48, 42);
    ctx.lineTo(48, 50);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(32, 27);
  ctx.rotate(Math.PI * 0.75);
  ctx.fillStyle = BRASS;
  roundBox(ctx, -2, -3, 17, 6, 3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(32, 27, 3, 0, Math.PI * 2);
  ctx.fill();
  drawMarble(ctx, "circle", 32, 13, 6.5, 0);
  drawMarble(ctx, "diamond", 16, 52, 6, 0);
  drawMarble(ctx, "triangle", 48, 52, 6, 0);
  ctx.restore();
}

// ----- Helpers -----

export function roundBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function shade(hex: string, amount: number): string {
  const v = parseInt(hex.slice(1), 16);
  const mix = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  const ch = (s: number) => Math.round(((v >> s) & 255) + (mix - ((v >> s) & 255)) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function hexA(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

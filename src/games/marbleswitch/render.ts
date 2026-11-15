/**
 * How Marble Switch looks: a navy enamel cabinet, clear acrylic rails,
 * brass levers, glass marbles and coloured cups. Drawn from the level data,
 * in board units (360 across, 520 down), so the picture is always exactly
 * the track the marbles run on.
 *
 * Rails are kept neutral -- clear, not coloured -- so a rail never seems to
 * promise a cup. Colour belongs to the marbles and cups, and every colour
 * comes with its shape, so nothing depends on telling colours apart.
 */

import { pointAt, type Board, type Edge, type NodeDef, type Symbol } from "./graph.ts";
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

export interface BoardOptions {
  clock: number;
  calm: boolean;
  highContrast: boolean;
  /** Junior's planning line: the rails the next marble would take. */
  predicted: readonly Edge[] | null;
  /** A switch to pulse, for Junior's hint. */
  hintSwitch: string | null;
  /** The lever angle each switch is drawn at, eased towards its setting. */
  leverTurn: ReadonlyMap<string, number>;
  /** Seconds since a wrong catch, or null. */
  missFor: number | null;
}

// ----- The cabinet -----

export function drawCabinet(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, calm: boolean, clock: number): void {
  ctx.save();
  // Neon trim.
  const glow = calm ? 1 : 0.85 + 0.15 * Math.sin(clock * 1.6);
  ctx.shadowColor = "#ff8a3d";
  ctx.shadowBlur = 16 * glow;
  ctx.strokeStyle = `rgba(255,150,70,${0.8 * glow})`;
  ctx.lineWidth = 3;
  roundBox(ctx, x, y, w, h, 22);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Navy enamel.
  const enamel = ctx.createLinearGradient(0, y, 0, y + h);
  enamel.addColorStop(0, "#1b2a6b");
  enamel.addColorStop(1, "#121d4d");
  ctx.fillStyle = enamel;
  roundBox(ctx, x + 4, y + 4, w - 8, h - 8, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(70,224,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Brass screws.
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

// ----- The board -----

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
  // Clear acrylic: bright edges, a faint body, a glint down the middle.
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

/**
 * A switch: an enamel hub on a clear Y, and a brass lever lying along the
 * rail it is set to, with an arrow at its tip.
 */
function drawSwitch(
  ctx: CanvasRenderingContext2D,
  board: Board,
  node: NodeDef,
  label: string,
  turn: number,
  pulse: number,
): void {
  const left = board.out.get(node.id)!.find((e) => e.branch === "left")!;
  const right = board.out.get(node.id)!.find((e) => e.branch === "right")!;
  const dir = (edge: Edge) => {
    const p = pointAt(edge, 26);
    return Math.atan2(p.y - node.y, p.x - node.x);
  };
  const a = dir(left);
  const b = dir(right);
  // `turn` runs 0 (left) to 1 (right); the lever swings between the two.
  let span = b - a;
  if (span > Math.PI) span -= Math.PI * 2;
  if (span < -Math.PI) span += Math.PI * 2;
  const angle = a + span * turn;

  ctx.save();
  if (pulse > 0) {
    ctx.strokeStyle = `rgba(255,214,90,${0.3 + 0.6 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 26 + 6 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The rail not taken, gated off with a short bar.
  const closed = turn < 0.5 ? right : left;
  const gate = pointAt(closed, 18);
  const ga = dir(closed) + Math.PI / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(gate.x + Math.cos(ga) * 7, gate.y + Math.sin(ga) * 7);
  ctx.lineTo(gate.x - Math.cos(ga) * 7, gate.y - Math.sin(ga) * 7);
  ctx.stroke();

  // The hub.
  ctx.fillStyle = "#1a2a74";
  ctx.strokeStyle = "rgba(70,224,255,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(node.x, node.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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

  // Its name, so it can be talked about (and matches the button's label).
  ctx.save();
  ctx.fillStyle = "rgba(220,235,255,0.75)";
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, node.x, node.y - 22);
  ctx.restore();
}

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
  // A glint that slides as it rolls.
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35 + Math.sin(roll) * r * 0.15, y - r * 0.45, r * 0.32, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCup(ctx: CanvasRenderingContext2D, node: NodeDef, flash: number, highContrast: boolean): void {
  const symbol = node.symbol!;
  const color = SYMBOL_COLOR[symbol];
  const w = 60;
  const h = 44;
  const x = node.x - w / 2;
  const y = node.y - 14;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
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
  // The rim.
  ctx.fillStyle = shade(color, 0.35);
  roundBox(ctx, x - 3, y - 4, w + 6, 8, 4);
  ctx.fill();
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
  // The gate.
  ctx.fillStyle = BRASS;
  roundBox(ctx, x - 18, bottom - 2, 36, 6, 3);
  ctx.fill();
  ctx.restore();
}

export function drawBoard(ctx: CanvasRenderingContext2D, a: Attempt, labels: ReadonlyMap<string, string>, opt: BoardOptions): void {
  const board = a.board;
  const edges = [...board.edges.values()];
  for (const edge of edges) if (!edge.bridge) drawRail(ctx, edge, opt.highContrast);
  for (const edge of edges) if (edge.bridge) drawRail(ctx, edge, opt.highContrast);
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
  for (const cup of board.cups) drawCup(ctx, cup, a.miss?.cup === cup.id ? flash : 0, opt.highContrast);

  for (const node of board.switches) {
    const pulse = opt.hintSwitch === node.id ? (opt.calm ? 1 : 0.5 + 0.5 * Math.sin(opt.clock * 6)) : 0;
    drawSwitch(ctx, board, node, labels.get(node.id) ?? node.id, opt.leverTurn.get(node.id) ?? 0, pulse);
  }

  const waiting = a.marbles.filter((m) => m.edge === null).map((m) => m.symbol);
  drawLauncher(ctx, board.launcher, waiting);

  for (const m of a.marbles) {
    const p = marblePosition(a, m);
    if (!p) continue;
    if (m.cup) {
      // Settled in its cup, a little down inside it.
      const cupMarbles = a.marbles.filter((x) => x.cup === m.cup);
      const k = cupMarbles.indexOf(m);
      drawMarble(ctx, m.symbol, p.x - 12 + (k % 3) * 12, p.y + 8 - Math.floor(k / 3) * 8, MARBLE_R * 0.9, 0);
    } else {
      const travelled = (a.time - m.enteredAt) * SPEED;
      drawMarble(ctx, m.symbol, p.x, p.y, MARBLE_R, opt.calm ? 0 : travelled / MARBLE_R);
    }
    if (a.miss?.marble === m.index && opt.missFor !== null) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,70,${flash})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y + 6, 18, 0, Math.PI * 2);
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
  // A clear Y of rail.
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
  // The lever.
  ctx.save();
  ctx.translate(32, 27);
  ctx.rotate(Math.PI * 0.75);
  ctx.fillStyle = "#f2b832";
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

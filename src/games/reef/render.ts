/**
 * All drawing for Miss Riley's Reef.
 *
 * Riley is drawn with the classic wedge mouth -- that chomp is the single most
 * recognisable thing about the genre -- with a tail fin added so she reads as
 * a fish rather than a borrowed circle. Vector art throughout, no assets.
 */

import { COLS, Maze, ROWS } from "./maze";
import type { Dir, JellyKind, JellyMode } from "./types";

export const PALETTE = {
  water: "#062a45",
  waterDeep: "#04182a",
  coral: "#ff7a9c",
  coralDark: "#c94a70",
  coralLight: "#ffa5bd",
  riley: "#ffd23f",
  rileyFin: "#ffb01f",
  bubble: "#bfe9ff",
  pearl: "#ffffff",
  pearlGlow: "#8ef5ff",
  tailer: "#ff5470",
  ambusher: "#ff9ecb",
  flanker: "#54e0ff",
  shy: "#ffa94d",
  frightened: "#4b6bff",
  frightenedFlash: "#f2f6ff",
} as const;

const JELLY_COLOR: Record<JellyKind, string> = {
  tailer: PALETTE.tailer,
  ambusher: PALETTE.ambusher,
  flanker: PALETTE.flanker,
  shy: PALETTE.shy,
};

/** Maps tile space to pixels. Built once per run and passed around. */
export interface Layout {
  tile: number;
  originX: number;
  originY: number;
}

export function tileToPixel(layout: Layout, col: number, row: number): {
  x: number;
  y: number;
} {
  return {
    x: layout.originX + (col + 0.5) * layout.tile,
    y: layout.originY + (row + 0.5) * layout.tile,
  };
}

// ---------- Background and maze ----------

export function drawWater(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETTE.water);
  g.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Slow drifting light shafts -- cheap, and it stops the background reading
  // as a flat blue rectangle.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#bfe9ff";
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 97 + t * 6) % (w + 120)) - 60;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 34, 0);
    ctx.lineTo(x + 74, h);
    ctx.lineTo(x + 30, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Walls are drawn as full tiles so neighbours merge into continuous reef
 * banks. Insetting each tile individually left visible gaps between them and
 * the maze read as scattered blobs rather than corridors -- which also made
 * it genuinely harder to see which way you could turn.
 *
 * Corners are rounded only where they're actually exposed, so a long run of
 * wall stays a clean bar but a lone stub still looks like a rock.
 */
export function drawMaze(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  layout: Layout,
): void {
  const { tile } = layout;
  const r = tile * 0.42;
  const isWall = (c: number, rr: number) => maze.tileAt(c, rr) === "wall";

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!isWall(col, row)) continue;
      const x = layout.originX + col * tile;
      const y = layout.originY + row * tile;

      const up = isWall(col, row - 1);
      const down = isWall(col, row + 1);
      const left = isWall(col - 1, row);
      const right = isWall(col + 1, row);

      ctx.beginPath();
      ctx.roundRect(x, y, tile, tile, [
        up || left ? 0 : r,
        up || right ? 0 : r,
        down || right ? 0 : r,
        down || left ? 0 : r,
      ]);
      ctx.fillStyle = PALETTE.coral;
      ctx.fill();

      // A lit top face wherever the wall is exposed to the water above.
      if (!up) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, tile, tile * 0.4, [
          left ? 0 : r,
          right ? 0 : r,
          0,
          0,
        ]);
        ctx.fillStyle = PALETTE.coralLight;
        ctx.globalAlpha = 0.45;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // The den gate, drawn after so it sits cleanly between its wall neighbours.
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (maze.tileAt(col, row) !== "gate") continue;
      const x = layout.originX + col * tile;
      const y = layout.originY + row * tile;
      ctx.fillStyle = PALETTE.coralLight;
      ctx.fillRect(x, y + tile * 0.42, tile, tile * 0.16);
    }
  }
}

export function drawItems(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  layout: Layout,
  t: number,
): void {
  const pulse = 0.75 + Math.sin(t * 5) * 0.25;
  maze.forEachItem((col, row, item) => {
    const { x, y } = tileToPixel(layout, col, row);
    if (item === "bubble") {
      ctx.beginPath();
      ctx.arc(x, y, layout.tile * 0.11, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.bubble;
      ctx.fill();
    } else {
      // Pearls pulse so they read as the thing worth going for.
      ctx.save();
      ctx.shadowColor = PALETTE.pearlGlow;
      ctx.shadowBlur = 12 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, layout.tile * 0.28 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.pearl;
      ctx.fill();
      ctx.restore();
    }
  });
}

// ---------- Riley ----------

const DIR_ANGLE: Record<Dir, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

export function drawRiley(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: Dir,
  phase: number,
  radius: number,
): void {
  // Mouth opens and closes as she swims -- the chomp.
  const open = (Math.sin(phase * 9) * 0.5 + 0.5) * 0.62;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(DIR_ANGLE[dir]);

  // Tail fin, behind the body.
  ctx.beginPath();
  ctx.moveTo(-radius * 0.75, 0);
  ctx.lineTo(-radius * 1.65, -radius * 0.7);
  ctx.lineTo(-radius * 1.35, 0);
  ctx.lineTo(-radius * 1.65, radius * 0.7);
  ctx.closePath();
  ctx.fillStyle = PALETTE.rileyFin;
  ctx.fill();

  // Body with the wedge bitten out of it.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, open, Math.PI * 2 - open);
  ctx.closePath();
  ctx.fillStyle = PALETTE.riley;
  ctx.fill();

  // Top fin.
  ctx.beginPath();
  ctx.moveTo(-radius * 0.15, -radius * 0.85);
  ctx.quadraticCurveTo(-radius * 0.5, -radius * 1.5, -radius * 0.9, -radius * 0.7);
  ctx.closePath();
  ctx.fillStyle = PALETTE.rileyFin;
  ctx.fill();

  // Eye. Kept above the mouth line so the wedge never cuts through it.
  ctx.beginPath();
  ctx.arc(radius * 0.12, -radius * 0.42, radius * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = "#20303f";
  ctx.fill();

  ctx.restore();
}

// ---------- Jellyfish ----------

export function drawJelly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: JellyKind,
  mode: JellyMode,
  dir: Dir,
  phase: number,
  radius: number,
  /** True while a frightened phase is about to end, for the warning flash. */
  flashing: boolean,
): void {
  const eaten = mode === "eaten";
  const frightened = mode === "frightened";

  ctx.save();
  ctx.translate(x, y);

  if (!eaten) {
    const body = frightened
      ? flashing && Math.floor(phase * 12) % 2 === 0
        ? PALETTE.frightenedFlash
        : PALETTE.frightened
      : JELLY_COLOR[kind];

    // Dome.
    ctx.beginPath();
    ctx.arc(0, -radius * 0.1, radius, Math.PI, 0);
    ctx.lineTo(radius, radius * 0.25);
    ctx.lineTo(-radius, radius * 0.25);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();

    // Tentacles, waving.
    ctx.fillStyle = body;
    for (let i = -2; i <= 2; i += 1) {
      const sway = Math.sin(phase * 7 + i) * radius * 0.16;
      ctx.beginPath();
      ctx.moveTo(i * radius * 0.4 - radius * 0.16, radius * 0.2);
      ctx.quadraticCurveTo(
        i * radius * 0.4 + sway,
        radius * 0.7,
        i * radius * 0.4 + sway * 1.4,
        radius * 1.05,
      );
      ctx.lineTo(i * radius * 0.4 + sway * 1.4 + radius * 0.2, radius * 1.0);
      ctx.quadraticCurveTo(
        i * radius * 0.4 + sway + radius * 0.2,
        radius * 0.7,
        i * radius * 0.4 + radius * 0.16,
        radius * 0.2,
      );
      ctx.closePath();
      ctx.fill();
    }
  }

  // Eyes. Frightened jellyfish get a worried face; eaten ones are only eyes.
  const look = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  for (const side of [-1, 1] as const) {
    const ex = side * radius * 0.36;
    const ey = -radius * 0.18;
    ctx.beginPath();
    ctx.ellipse(ex, ey, radius * 0.26, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (!frightened) {
      ctx.beginPath();
      ctx.arc(
        ex + (look?.[0] ?? 0) * radius * 0.1,
        ey + (look?.[1] ?? 0) * radius * 0.1,
        radius * 0.13,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "#20303f";
      ctx.fill();
    }
  }

  if (frightened) {
    // A small wobbly mouth -- reads as "uh oh" rather than menacing, which is
    // the right note for a game aimed at kids.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = radius * 0.12;
    ctx.beginPath();
    for (let i = 0; i <= 4; i += 1) {
      const mx = -radius * 0.4 + (i * radius * 0.8) / 4;
      const my = radius * 0.42 + (i % 2 === 0 ? 0 : radius * 0.12);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/** The floating "+200" style callout used for pearls and bonus shells. */
export function drawPopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.pearlGlow;
  ctx.font = '700 13px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A bonus seashell that drifts through the maze for a few seconds. */
export function drawShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.8);
  ctx.arc(0, radius * 0.2, radius, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = "#ffc9de";
  ctx.fill();
  ctx.strokeStyle = "#e0699a";
  ctx.lineWidth = radius * 0.14;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.7);
    ctx.lineTo(i * radius * 0.42, -radius * 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

/** Riley's "lives remaining" pip in the shared HUD. */
export function drawRileyIcon(
  ctx: CanvasRenderingContext2D,
  highContrast: boolean,
): void {
  ctx.save();
  ctx.fillStyle = highContrast ? "#ffffff" : PALETTE.riley;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 6, 0.35, Math.PI * 2 - 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(-9, -4);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-9, 4);
  ctx.closePath();
  ctx.fillStyle = highContrast ? "#cccccc" : PALETTE.rileyFin;
  ctx.fill();
  ctx.restore();
}

/**
 * What the Number Game draws on a canvas: Uncle Potato Head himself, and the
 * cabinet's marquee art.
 *
 * He's the one piece of the cabinet that isn't DOM (sudoku.css). Like all the
 * arcade's art he is vector paths drawn at runtime, so the same drawing serves
 * the menu tile, the title card and the corner of the puzzle at any size.
 */

const SKIN = "#e9b872";
const SKIN_SHADE = "#c98d45";
const SKIN_LINE = "#7a4a1c";
const HAIR = "#4a2c12";
const FRAMES = "#1c1c22";

/** The first three keys of the pad, for the marquee. */
const TILES: readonly (readonly [string, string])[] = [
  ["1", "#2f7bff"],
  ["2", "#ff4fa3"],
  ["3", "#ff8a2a"],
];

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Uncle Potato Head: a potato in thick glasses, a moustache and a bow tie.
 * Centred on (cx, cy) and `height` tall, not counting the tuft of hair.
 *
 * Drawn in a space 100 units tall, so every number below is a percentage of
 * him: his body runs from -50 to 50 and about 38 either side.
 */
export function drawUncle(ctx: CanvasRenderingContext2D, cx: number, cy: number, height: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(height / 100, height / 100);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // The tuft, behind the body so it grows out of him.
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 2.6;
  for (const [fromX, toX, toY] of [
    [-4, -9, -57],
    [0, 1, -60],
    [4, 10, -56],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(fromX, -47);
    ctx.quadraticCurveTo(fromX, -54, toX, toY);
    ctx.stroke();
  }

  // The potato: a little lopsided, the way they are.
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.bezierCurveTo(30, -52, 40, -20, 38, 8);
  ctx.bezierCurveTo(37, 36, 22, 50, 0, 50);
  ctx.bezierCurveTo(-24, 50, -38, 34, -37, 6);
  ctx.bezierCurveTo(-37, -24, -26, -50, 0, -50);
  ctx.closePath();
  const skin = ctx.createRadialGradient(-10, -22, 8, 0, 0, 62);
  skin.addColorStop(0, SKIN);
  skin.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = SKIN_LINE;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "#a8712f";
  for (const [x, y] of [
    [-25, -30],
    [23, -35],
    [29, 20],
    [-29, 24],
    [-31, -2],
    [31, -8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bow tie, at what would be his collar.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 39);
    ctx.lineTo(side * 17, 30);
    ctx.lineTo(side * 17, 48);
    ctx.closePath();
    ctx.fillStyle = "#e23a4e";
    ctx.fill();
    ctx.strokeStyle = "#8f1c2c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // One stripe each way: enough to read as plaid at this size.
    ctx.strokeStyle = "#3558d6";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(side * 11, 34);
    ctx.lineTo(side * 11, 44);
    ctx.stroke();
  }
  roundedRect(ctx, -4, 34, 8, 10, 2.5);
  ctx.fillStyle = "#c22b40";
  ctx.fill();

  // Eyebrows over the frames.
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 27, -28);
    ctx.quadraticCurveTo(side * 17, -36, side * 7, -29);
    ctx.stroke();
  }

  // Glasses, and the eyes behind them.
  ctx.strokeStyle = FRAMES;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-4, -14);
  ctx.lineTo(4, -14);
  ctx.stroke();
  for (const side of [-1, 1]) {
    roundedRect(ctx, side === -1 ? -29 : 4, -25, 25, 22, 6);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();
    const eyeX = side * 15 + 1;
    ctx.fillStyle = "#2a1a0e";
    ctx.beginPath();
    ctx.arc(eyeX, -13, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(eyeX + 1.6, -15, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // A grin, mostly under the moustache.
  ctx.beginPath();
  ctx.moveTo(-10, 14);
  ctx.quadraticCurveTo(0, 28, 10, 14);
  ctx.closePath();
  ctx.fillStyle = "#7a2318";
  ctx.fill();

  ctx.fillStyle = HAIR;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(side * 8, 1, side * 23, 3, side * 31, 14);
    ctx.bezierCurveTo(side * 22, 17, side * 10, 19, 0, 12);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#e59a4a";
  ctx.fill();
  ctx.strokeStyle = "#9a5a22";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.restore();
}

/** Him on a canvas of his own, `px` CSS pixels square, for the DOM screens. */
export function uncleCanvas(px: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const side = Math.round(px * Math.min(3, window.devicePixelRatio || 1));
  canvas.width = side;
  canvas.height = side;
  canvas.className = "sd-uncle";
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (ctx) drawUncle(ctx, side / 2, side * 0.54, side * 0.84);
  return canvas;
}

/** The marquee: Uncle Potato Head over the first three keys of the pad. */
export function drawSudokuIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  drawUncle(ctx, size / 2, size * 0.42, size * 0.6);

  const tile = size * 0.17;
  const gap = size * 0.035;
  const left = (size - tile * 3 - gap * 2) / 2;
  const top = size * 0.78;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${tile * 0.7}px ui-rounded, "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif`;
  TILES.forEach(([digit, colour], at) => {
    const x = left + at * (tile + gap);
    roundedRect(ctx, x, top, tile, tile, tile * 0.24);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(digit, x + tile / 2, top + tile / 2 + tile * 0.04);
  });
  ctx.restore();
}

/**
 * The little the crossword draws on the canvas: the two cabinets' marquee art.
 *
 * Everything else about both cabinets is DOM (crossword.css). A crossword is
 * a grid of squares to tap and a list of clues to read, and on a tablet it
 * should use the whole screen -- which the shell's phone-shaped canvas, by
 * design, never does.
 */

const PAPER = "#f4efe2";
const INK = "#1b1a17";

/** A tiny grid with MOM written across and down, sharing the O. */
export function drawCrosswordIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const rows = ["#M#", "MOM", "#M#"];
  const cell = size * 0.27;
  const origin = (size - cell * 3) / 2;

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(origin - 2, origin - 2, cell * 3 + 4, cell * 3 + 4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${cell * 0.68}px Georgia, "Times New Roman", serif`;
  rows.forEach((row, r) => {
    [...row].forEach((letter, c) => {
      if (letter === "#") return;
      const x = origin + c * cell;
      const y = origin + r * cell;
      ctx.fillStyle = PAPER;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.fillStyle = INK;
      ctx.fillText(letter, x + cell / 2, y + cell / 2 + cell * 0.05);
    });
  });
  ctx.restore();
}

/** A magnifying glass over three squares, the middle one a question mark. */
export function drawFinderIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const cell = size * 0.24;
  const left = size * 0.1;
  const top = size * 0.56;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${cell * 0.7}px Georgia, "Times New Roman", serif`;
  ["C", "?", "T"].forEach((letter, i) => {
    const x = left + i * (cell + 3);
    ctx.fillStyle = PAPER;
    ctx.fillRect(x, top, cell, cell);
    ctx.fillStyle = letter === "?" ? "#b8860b" : INK;
    ctx.fillText(letter, x + cell / 2, top + cell / 2 + cell * 0.05);
  });

  // The glass, over the top right.
  const cx = size * 0.56;
  const cy = size * 0.3;
  const radius = size * 0.17;
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#7fd6c2";
  ctx.beginPath();
  ctx.moveTo(cx + radius * 0.75, cy + radius * 0.75);
  ctx.lineTo(cx + radius * 1.7, cy + radius * 1.7);
  ctx.stroke();
  ctx.fillStyle = "rgba(127, 214, 194, 0.18)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

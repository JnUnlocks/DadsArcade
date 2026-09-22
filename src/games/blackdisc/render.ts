/**
 * Black Disc's cabinet marquee art.
 *
 * The game itself is entirely DOM (see index.ts) -- there's no playfield to
 * simulate, just a phone getting passed around a table, and the DOM panel
 * covers the whole screen so nothing else needs drawing while it's running.
 * The only canvas art this game has is the icon for the arcade menu.
 */

const LIME = "#dbff73";
const PAPER = "#f4f1e9";

/** Cabinet marquee art: the black disc itself, with a clue ticket peeking out. */
export function drawDiscIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);

  // The clue ticket, tucked behind the disc and rotated like it's mid-pass.
  ctx.save();
  ctx.translate(21, 10);
  ctx.rotate(0.3);
  ctx.fillStyle = PAPER;
  ctx.fillRect(-6, -5, 12, 9);
  ctx.strokeStyle = "rgba(25,25,43,0.25)";
  ctx.lineWidth = 0.6;
  ctx.strokeRect(-6, -5, 12, 9);
  ctx.fillStyle = "rgba(25,25,43,0.55)";
  ctx.fillRect(-4, -2, 8, 1);
  ctx.fillRect(-4, 0.5, 5, 1);
  ctx.restore();

  // Three short ticks, as if it just buzzed.
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  for (const angle of [-0.9, -0.55, -0.2]) {
    const x1 = 15 + Math.cos(angle) * 12;
    const y1 = 17 + Math.sin(angle) * 12;
    const x2 = 15 + Math.cos(angle) * 15;
    const y2 = 17 + Math.sin(angle) * 15;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // The disc: near-black with a lime rim and a soft top-left gloss.
  ctx.beginPath();
  ctx.arc(15, 17, 10.5, 0, Math.PI * 2);
  ctx.fillStyle = "#101018";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = LIME;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.ellipse(11, 12, 7, 4, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = LIME;
  ctx.beginPath();
  ctx.arc(15, 17, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

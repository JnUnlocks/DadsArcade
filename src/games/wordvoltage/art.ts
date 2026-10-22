/**
 * Word Voltage's art: the cabinet marquee, the bolt, the badges.
 *
 * Like everything else in the arcade, all of it is drawn at run time --
 * canvas paths for the marquee, inline SVG for the rest -- so it's crisp on
 * any screen and costs nothing to download.
 */

/** The lightning bolt, in a 24-unit box. */
export const BOLT_PATH = "M13.6 1.5 4.2 13.4h6.1l-1.9 9.1 9.4-12.1h-6.2z";

export function boltSvg(className = "wv-bolt"): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="${BOLT_PATH}"/></svg>`;
}

export const ICONS = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
  hint: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-4 11.6c.8.7 1.2 1.5 1.2 2.4h5.6c0-.9.4-1.7 1.2-2.4A6.5 6.5 0 0 0 12 2.5z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/></svg>',
  tap: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.8 1.8 0 0 1 3.6 0V11"/><path d="M12.6 10.5V9.4a1.8 1.8 0 0 1 3.6 0v2.1"/><path d="M16.2 11a1.8 1.8 0 0 1 3.4.8V15a6.5 6.5 0 0 1-6.5 6.5h-.6a6.3 6.3 0 0 1-5.1-2.6L4.4 15.3a1.8 1.8 0 0 1 2.8-2.2L9 15"/></svg>',
  swipe: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="19" cy="15" r="2"/><path d="M6.4 15.4 10.6 8.8M13.6 8.4l4.2 5"/></svg>',
} as const;

/** A badge medallion: a hexagon in the badge's colour with a bolt inside. */
export function badgeSvg(color: string): string {
  return `<svg class="wv-badge-art" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 3 42 13.5v21L24 45 6 34.5v-21z" fill="#151a46" stroke="${color}" stroke-width="3"/>
    <path d="M24 9 37 16.5v15L24 39 11 31.5v-15z" fill="${color}" opacity="0.18"/>
    <path transform="translate(12 11) scale(1.05)" d="${BOLT_PATH}" fill="${color}"/>
  </svg>`;
}

/** The cabinet tile on the arcade floor. */
export function drawWordVoltageIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 64;
  ctx.save();
  ctx.scale(s, s);

  const bg = ctx.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, "#1c1460");
  bg.addColorStop(1, "#080d2b");
  ctx.fillStyle = bg;
  roundRect(ctx, 2, 2, 60, 60, 10);
  ctx.fill();

  // A strip of crossword squares along the top: two solved, one to come.
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i < 3 ? "#19dfff" : "#222451";
    roundRect(ctx, 9 + i * 12, 8, 10, 10, 2);
    ctx.fill();
  }
  ctx.fillStyle = "#080d2b";
  ctx.font = "800 8px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  "WOR".split("").forEach((ch, i) => ctx.fillText(ch, 14 + i * 12, 13.5));

  // The wheel: a ring with gold tiles round it, joined by a bright trail.
  const cx = 32;
  const cy = 41;
  ctx.strokeStyle = "rgba(119, 72, 255, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.stroke();
  const points = [0, 1, 2, 3, 4].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return { x: cx + 15 * Math.cos(a), y: cy + 15 * Math.sin(a) };
  });
  ctx.strokeStyle = "#19dfff";
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[4]!.x, points[4]!.y);
  ctx.lineTo(points[0]!.x, points[0]!.y);
  ctx.lineTo(points[2]!.x, points[2]!.y);
  ctx.stroke();
  for (const p of points) {
    ctx.fillStyle = "#ffd52a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7748ff";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // And the bolt in the middle, in magenta.
  ctx.translate(cx - 7, cy - 8);
  ctx.scale(0.62, 0.66);
  ctx.fillStyle = "#ff3bd4";
  ctx.fill(new Path2D(BOLT_PATH));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

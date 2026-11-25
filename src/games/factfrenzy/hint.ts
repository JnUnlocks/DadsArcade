/**
 * The picture Digit shows after a miss, built from the fact's Hint.
 *
 * Every picture is something to count, not the answer written out: fourteen
 * dots with eight sliding away, seven rows of eight, a bar cut into quarters.
 * Motion is CSS only, so the arcade's reduced-motion setting (the ff-calm
 * class) can stop it and leave the finished picture in place.
 */

import type { Hint } from "./decks";

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Dots in ten-frames: a, then b more in gold, or the last b sliding away. */
function frames(op: "+" | "−", a: number, b: number): HTMLElement {
  const total = op === "+" ? a + b : a;
  const wrap = el("div", "ff-frames");
  const count = Math.max(1, Math.ceil(total / 10));
  // Up to five a single row of five, like the fingers on a hand.
  const size = total <= 5 ? 5 : 10;
  let index = 0;
  for (let f = 0; f < count; f += 1) {
    const frame = el("div", size === 5 ? "ff-frame ff-frame--five" : "ff-frame");
    for (let slot = 0; slot < size; slot += 1) {
      const cell = el("span", "ff-cell");
      if (index < total) {
        const dot = el("span", "ff-dot");
        if (op === "+" && index >= a) dot.classList.add("ff-dot--more");
        if (op === "−" && index >= a - b) {
          dot.classList.add("ff-dot--away");
          dot.style.setProperty("--ff-delay", `${0.5 + (index - (a - b)) * 0.07}s`);
        } else {
          dot.style.setProperty("--ff-delay", `${index * 0.03}s`);
        }
        cell.append(dot);
      }
      index += 1;
      frame.append(cell);
    }
    wrap.append(frame);
  }
  return wrap;
}

/** A number as tens rods and ones dots. */
function rods(n: number): HTMLElement {
  const wrap = el("div", "ff-rods");
  wrap.append(el("span", "ff-rods-label", String(n)));
  const pile = el("div", "ff-rods-pile");
  for (let t = 0; t < Math.floor(n / 10); t += 1) pile.append(el("span", "ff-rod"));
  const ones = el("div", "ff-ones");
  for (let o = 0; o < n % 10; o += 1) ones.append(el("span", "ff-one"));
  pile.append(ones);
  wrap.append(pile);
  return wrap;
}

function tens(op: "+" | "−", a: number, b: number): HTMLElement {
  const wrap = el("div", "ff-tens");
  wrap.append(rods(a), el("span", "ff-tens-op", op === "+" ? "+" : "−"), rods(b));
  return wrap;
}

/** Rows of dots. With cols 0, a missing factor: the rows drawn as empty trays. */
function array(rows: number, cols: number): HTMLElement {
  const wrap = el("div", "ff-array");
  const big = Math.max(rows, cols);
  wrap.style.setProperty("--ff-dot", big > 10 ? "9px" : big > 7 ? "11px" : "14px");
  if (rows === 0 || cols === 0) {
    wrap.append(el("span", "ff-array-none", rows === 0 ? "No rows at all!" : `${rows} empty rows`));
    return wrap;
  }
  for (let r = 0; r < rows; r += 1) {
    const row = el("div", "ff-array-row");
    row.style.setProperty("--ff-delay", `${r * 0.08}s`);
    for (let c = 0; c < cols; c += 1) row.append(el("span", "ff-dot"));
    wrap.append(row);
  }
  return wrap;
}

/** Fraction bars, each cut into `parts`, with `shaded` pieces filled. */
function bars(parts: number, shaded: readonly number[]): HTMLElement {
  const wrap = el("div", "ff-bars");
  shaded.forEach((filled, i) => {
    const bar = el("div", "ff-bar");
    for (let p = 0; p < parts; p += 1) {
      bar.append(el("span", p < filled ? `ff-piece ff-piece--on ff-piece--${i}` : "ff-piece"));
    }
    const label = el("span", "ff-bar-label", `${filled}/${parts}`);
    const row = el("div", "ff-bar-row");
    row.append(bar, label);
    wrap.append(row);
  });
  return wrap;
}

function steps(lines: readonly string[]): HTMLElement {
  const list = el("ol", "ff-steps");
  for (const line of lines) list.append(el("li", "", line));
  return list;
}

/** The picture for a hint, without Digit or the bubble. */
export function hintPicture(hint: Hint): HTMLElement {
  switch (hint.kind) {
    case "frames":
      return frames(hint.op, hint.a, hint.b);
    case "tens":
      return tens(hint.op, hint.a, hint.b);
    case "array":
      return array(hint.rows, hint.cols);
    case "bars":
      return bars(hint.parts, hint.shaded);
    case "steps":
      return steps(hint.lines);
  }
}

/**
 * Digit's pictures, in whatever colour the player picked.
 *
 * The art is drawn purple. Other colours are painted at load time rather than
 * shipped as eight copies of every picture: each purple pixel keeps its
 * shading and gets the new hue, so the goggles, the shoes, the blue overalls
 * and the gold lightning in the tail stay as drawn. Each picture is painted
 * once per colour and kept for the rest of the visit.
 */

import overalls from "./art/digit-overalls.webp";
import goggles from "./art/digit-goggles.webp";
import jacket from "./art/digit-jacket.webp";
import wave from "./art/digit-wave.webp";
import think from "./art/digit-think.webp";
import jump from "./art/digit-jump.webp";
import jumpPlain from "./art/digit-jump-plain.webp";
import thinkPlain from "./art/digit-think-plain.webp";
import jumpJacket from "./art/digit-jump-jacket.webp";
import thinkJacket from "./art/digit-think-jacket.webp";
import rocket from "./art/digit-rocket.webp";
import wizard from "./art/digit-wizard.webp";
import champion from "./art/digit-champion.webp";
import itemRocket from "./art/item-rocket.webp";
import itemWizard from "./art/item-wizard.webp";
import itemChampion from "./art/item-champion.webp";
import thumbs from "./art/digit-thumbs.webp";
import itemOveralls from "./art/item-overalls.webp";
import itemGoggles from "./art/item-goggles.webp";
import itemJacket from "./art/item-jacket.webp";
import logo from "./art/logo.webp";
import tile from "./art/tile.webp";
import workshop from "./art/workshop.webp";
import tickets from "./art/tickets.webp";
import { furById, type OutfitId } from "./profiles";

/**
 * Digit standing in each outfit, Digit's four reactions, and each outfit on
 * its own -- painted too, so the Star Jacket in the closet is the colour
 * Digit will wear it in.
 */
export type Pose =
  | OutfitId
  | "wave"
  | "think"
  | "jump"
  | "thumbs"
  | "jump-plain"
  | "think-plain"
  | "jump-jacket"
  | "think-jacket"
  | `item-${OutfitId}`;

const POSES: Record<Pose, string> = {
  overalls,
  goggles,
  jacket,
  rocket,
  wizard,
  champion,
  wave,
  think,
  jump,
  thumbs,
  "jump-plain": jumpPlain,
  "think-plain": thinkPlain,
  "jump-jacket": jumpJacket,
  "think-jacket": thinkJacket,
  "item-rocket": itemRocket,
  "item-wizard": itemWizard,
  "item-champion": itemChampion,
  "item-overalls": itemOveralls,
  "item-goggles": itemGoggles,
  "item-jacket": itemJacket,
};

export const ART = {
  logo,
  tile,
  workshop,
  tickets,
};

/**
 * Digit jumping for joy, or thinking about a hint, in what they're wearing.
 * The newer outfits are only drawn standing, so they stand in for both:
 * `leap` asks for the standing picture to jump by animation instead.
 */
export function reaction(outfit: OutfitId, kind: "jump" | "think"): { pose: Pose; leap: boolean } {
  switch (outfit) {
    case "overalls":
      return { pose: kind === "jump" ? "jump-plain" : "think-plain", leap: false };
    case "goggles":
      return { pose: kind, leap: false };
    case "jacket":
      return { pose: kind === "jump" ? "jump-jacket" : "think-jacket", leap: false };
    default:
      return { pose: outfit, leap: kind === "jump" };
  }
}

const painted = new Map<string, Promise<string>>();

/** A URL for Digit in this pose and colour. Purple is the art as drawn. */
export function digitUrl(pose: Pose, furId: string): Promise<string> {
  const fur = furById(furId);
  const src = POSES[pose];
  if (!fur.paint) return Promise.resolve(src);
  const key = `${pose}|${fur.id}`;
  let job = painted.get(key);
  if (!job) {
    job = paint(src, fur.paint).catch(() => src);
    painted.set(key, job);
  }
  return job;
}

/**
 * An <img> of Digit, shown once its colour is ready, so a teal Digit never
 * flashes purple first.
 */
export function digitImg(pose: Pose, furId: string, className: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = className;
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.style.visibility = "hidden";
  img.addEventListener("load", () => (img.style.visibility = ""), { once: true });
  void digitUrl(pose, furId).then((url) => {
    img.src = url;
  });
  return img;
}

/** Start painting a player's pictures before they're needed. */
export function warmDigit(furId: string, poses: readonly Pose[]): void {
  for (const pose of poses) void digitUrl(pose, furId);
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function paint(src: string, [hue, saturation, lighten]: readonly [number, number, number]): Promise<string> {
  const img = await load(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolour(data.data, hue, saturation, lighten);
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
}

/**
 * Repaint Digit's purple in place. A pixel is Digit's purple when its hue is
 * between 250 and 315 degrees and it has some colour to it; anything else --
 * outlines, highlights, every other part of the picture -- is left alone.
 * Shading is kept by keeping each pixel's lightness and a share of its hue's
 * distance from the fur's middle.
 */
export function recolour(px: Uint8ClampedArray, hue: number, saturation: number, lighten: number): void {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i]! / 255;
    const g = px[i + 1]! / 255;
    const b = px[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0 || l <= 0.08) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    if (s <= 0.18) continue;
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    if (h < 250 || h > 315) continue;

    const nh = (((hue + (h - 282) * 0.6) % 360) + 360) % 360;
    const ns = Math.min(1, s * saturation);
    const nl = Math.min(1, l + lighten * (1 - l));
    const c = (1 - Math.abs(2 * nl - 1)) * ns;
    const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = nl - c / 2;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (nh < 60) [rr, gg, bb] = [c, x, 0];
    else if (nh < 120) [rr, gg, bb] = [x, c, 0];
    else if (nh < 180) [rr, gg, bb] = [0, c, x];
    else if (nh < 240) [rr, gg, bb] = [0, x, c];
    else if (nh < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    px[i] = Math.round((rr + m) * 255);
    px[i + 1] = Math.round((gg + m) * 255);
    px[i + 2] = Math.round((bb + m) * 255);
  }
}

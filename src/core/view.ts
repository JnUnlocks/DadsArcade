/**
 * Virtual-resolution canvas.
 *
 * Games are written against a fixed 360-unit-wide portrait space and never see
 * device pixels. Height flexes with the device's aspect ratio (within limits)
 * so a tall phone gets a taller playfield rather than black bars.
 */

/** Every game draws assuming this width. */
export const VIEW_WIDTH = 360;

const MIN_HEIGHT = 560;
const MAX_HEIGHT = 820;
const MAX_DPR = 3;

export class View {
  readonly ctx: CanvasRenderingContext2D;

  /** Playfield size in virtual units. Height varies by device. */
  w = VIEW_WIDTH;
  h = 640;

  /** Safe-area insets, expressed in virtual units, for HUD placement. */
  insetTop = 0;
  insetBottom = 0;

  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas is unavailable in this browser");
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    this.w = VIEW_WIDTH;
    this.h = Math.round(
      Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, (VIEW_WIDTH * cssH) / cssW)),
    );

    // Fit the virtual playfield inside the viewport, letterboxing only in the
    // extreme cases where the clamp above kicked in.
    this.scale = Math.min(cssW / this.w, cssH / this.h);
    this.offsetX = (cssW - this.w * this.scale) / 2;
    this.offsetY = (cssH - this.h * this.scale) / 2;

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    this.ctx.setTransform(
      this.scale * dpr,
      0,
      0,
      this.scale * dpr,
      this.offsetX * dpr,
      this.offsetY * dpr,
    );
    this.ctx.imageSmoothingEnabled = false;

    this.readSafeAreaInsets();
  }

  /** Convert a client-space (event) coordinate into virtual playfield units. */
  toWorldX(clientX: number): number {
    return (clientX - this.offsetX) / this.scale;
  }

  toWorldY(clientY: number): number {
    return (clientY - this.offsetY) / this.scale;
  }

  /** Convert a client-space distance into virtual units (no origin shift). */
  toWorldDistance(px: number): number {
    return px / this.scale;
  }

  /**
   * The notch and home indicator are reported to us in CSS pixels via a probe
   * element; convert to virtual units so the HUD can dodge them.
   */
  private readSafeAreaInsets(): void {
    const probe = document.getElementById("safe-area-probe");
    if (!probe) return;
    const style = getComputedStyle(probe);
    this.insetTop = this.toWorldDistance(parseFloat(style.paddingTop) || 0);
    this.insetBottom = this.toWorldDistance(parseFloat(style.paddingBottom) || 0);
  }
}

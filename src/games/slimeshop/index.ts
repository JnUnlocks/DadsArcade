/**
 * RILEY'S SLIME SHOP -- a colour-matching counter game.
 *
 * The brief was "slime, plus the chunky no-fail toy-shop feel", and those two
 * pull against each other the moment you add a leaderboard. Toy shops are
 * deliberately unscoreable: there's no way to lose, which is the whole appeal
 * and also the reason they never have a high-score table. A leaderboard needs
 * a skill that can be measured.
 *
 * The resolution is to make *colour mixing* the skill. Bottles mix like paint
 * (see color.ts -- blue and yellow make green), a customer asks for a specific
 * colour, and how close you got is a real, measurable, practisable thing. It
 * also happens to teach colour theory without ever saying so.
 *
 * Everything else keeps the toy rules intact:
 *
 *   - You cannot lose. A bad slime still gets served and still scores; the
 *     customer just looks unsure instead of delighted. There is no fail state,
 *     no timer running out, no lives.
 *   - Wrong mix-ins cost nothing. They earn no points, but they never subtract,
 *     so experimenting is free.
 *   - The speed bonus only ever adds. Taking your time costs you the bonus, not
 *     the order.
 *   - SLIME LAB is a pure sandbox with no score at all, so the toy stays a toy.
 *
 * Three modes, one engine:
 *   LAB     free play, unranked, no timer
 *   SHOP    six random orders, ranked on the all-time board
 *   TODAY   six orders seeded from the date, ranked on that day's own board
 *
 * TODAY is the interesting one. Because the seed comes from the date, everyone
 * playing on a given day gets the identical six orders, which turns the
 * leaderboard from a wall of unrelated numbers into a head-to-head on exactly
 * the same challenge. `weeklySeed()` in core/rng.ts was written for a feature
 * like this and had been sitting unused; this is it.
 */

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
} from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Particles } from "../../core/particles";
import { dailyKey, dailySeed, Rng } from "../../core/rng";
import {
  colourMatch,
  colourName,
  emptyRecipe,
  mixRecipe,
  toCss,
  totalPours,
  BOTTLES,
  type Bottle,
  type Recipe,
  type Rgb,
} from "./color";
import {
  drawBuriedPrize,
  drawCustomer,
  drawDigMeter,
  drawJarIcon,
  drawPoppedPrize,
  drawShop,
  drawShopIcon,
  drawTicket,
  SHOP_PALETTE,
  SlimeBlob,
  type Mood,
} from "./render";
import { addToCollection, collectionStats, loadCollection } from "./collection";
import { makeOrder, ORDERS_PER_DAY } from "./orders";
import {
  ALL_PRIZES,
  buryPrizes,
  prizeCount,
  rollPrizes,
  RARITY_COLOURS,
  RARITY_LABELS,
  type BuriedPrize,
  type Prize,
} from "./prizes";
import {
  MIX_IN_LABELS,
  MIX_INS,
  TEXTURE_LABELS,
  TEXTURES,
  type MixIn,
  type Mode,
  type Order,
  type Texture,
  type Verdict,
} from "./types";

/** Stops a recipe becoming an unreadable wall of taps. */
const MAX_POURS = 14;

/**
 * Scoring weights.
 *
 * Colour is worth more than everything else combined on purpose: it's the only
 * part that takes actual skill. Texture and mix-ins are recognition, not
 * judgement, and a game that paid them equally would reward reading the ticket
 * rather than mixing well.
 */
const COLOUR_POINTS = 500;
const TEXTURE_POINTS = 150;
const MIXIN_POINTS = 90;
const SPEED_POINTS = 150;
const PERFECT_BONUS = 250;

/**
 * Colour match below this earns nothing.
 *
 * Two unrelated colours still score around 0.5-0.7 on the redmean metric, so
 * without a floor every wild guess would bank a third of the colour points and
 * careful mixing would barely beat mashing bottles.
 */
const COLOUR_FLOOR = 0.72;

/** A match at or above this counts as spot-on for the perfect bonus. */
const PERFECT_MATCH = 0.94;

/** Seconds before the speed bonus is fully gone. Generous by design. */
const ORDER_PAR_SECONDS = 32;

/** How long the result card stays up between customers. */
const VERDICT_SECONDS = 2.4;

/** Salts this game's daily seed so two daily challenges never correlate. */
const SEED_SALT = 0x511e00;

/**
 * Work earned per virtual unit of drag on the squish screen.
 *
 * Paired with the thresholds in prizes.ts: vigorous squishing is roughly 5
 * work per second. Gentle poking still counts, just slower -- nothing here
 * demands strength, only patience.
 */
const DIG_RATE = 0.003;

/** Minimum gap between squelch sounds, so dragging isn't a wall of noise. */
const SQUELCH_COOLDOWN = 0.22;

type Phase = "choosing" | "serving" | "verdict" | "playing" | "closed";

/** Shared empty set -- an empty bowl shows no mix-ins whatever is selected. */
const EMPTY_MIX_INS: ReadonlySet<MixIn> = new Set<MixIn>();

export class SlimeShop implements GameInstance {
  private readonly root = document.createElement("div");
  private readonly blob = new SlimeBlob();
  private readonly particles = new Particles();

  private phase: Phase = "choosing";
  private mode: Mode = "shop";
  private rng = new Rng(Date.now() >>> 0);

  // Current bowl.
  private recipe: Recipe = emptyRecipe();
  private texture: Texture = "cloud";
  private mixIns = new Set<MixIn>();

  private order: Order | null = null;
  private orderIndex = 0;
  private orderElapsed = 0;
  private streak = 0;
  private slimesMade = 0;

  private verdict: Verdict | null = null;
  private verdictTimer = 0;
  private mood: Mood = "waiting";

  // ----- The squish screen -----
  private buried: BuriedPrize[] = [];
  private popped: Array<{ emoji: string; x: number; y: number; age: number; accent: string }> = [];
  private digEnergy = 0;
  private squelchTimer = 0;
  private lastFound: { prize: Prize; isNew: boolean } | null = null;
  private lastFoundAge = 0;
  /** Running colour accuracy, so a well-mixed day rolls better prizes. */
  private colourTotal = 0;

  /**
   * The daily board this run belongs to, captured when the run starts.
   *
   * Sampling the date again at the end would mean a run begun at 23:58 and
   * finished at 00:03 was seeded from one day's orders and filed on the next
   * day's board -- ranked against six colours it never mixed.
   */
  private boardId: string | undefined;

  private time = 0;
  /** Bumped on every new bowl so glitter re-scatters between slimes. */
  private scatterSeed = 1;

  /**
   * Panel height in CSS pixels, converted to virtual units at read time.
   *
   * Storing the converted value instead would go stale on rotation: the
   * conversion depends on view.scale, which changes with the viewport, while
   * the ResizeObserver only fires when the panel's own pixel height moves.
   */
  private panelPx = 200;
  private panelObserver: ResizeObserver | null = null;

  constructor(private readonly host: GameHost) {
    this.root.className = "slime-root";
    this.buildModeChooser();
    this.watchPanelHeight();
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    this.blob.update(dt, this.texture);

    // Squish. Relative deltas suit this better than an absolute position would:
    // you can drag anywhere on the counter and never cover the slime with your
    // own thumb.
    if (
      this.phase === "serving" ||
      this.phase === "choosing" ||
      this.phase === "playing"
    ) {
      if (input.pointerDown && (input.dragX !== 0 || input.dragY !== 0)) {
        this.blob.pull(input.dragX, input.dragY, this.texture);
        if (this.phase === "playing") {
          // Drag magnitude is already a per-frame distance, so total work
          // is frame-rate independent without scaling by dt.
          this.dig(Math.hypot(input.dragX, input.dragY));
        }
      } else if (!input.pointerDown) {
        this.blob.release();
      }
    }

    if (this.phase === "serving") {
      this.orderElapsed += dt;
    }

    if (this.phase === "playing") {
      this.squelchTimer = Math.max(0, this.squelchTimer - dt);
      this.lastFoundAge += dt;
      for (let i = this.popped.length - 1; i >= 0; i -= 1) {
        const p = this.popped[i]!;
        p.age += dt;
        if (p.age > 0.9) this.popped.splice(i, 1);
      }
    }

    if (this.phase === "verdict") {
      this.verdictTimer -= dt;
      if (this.verdictTimer <= 0) this.advance();
    }
  }

  /**
   * Turn squishing into progress against whatever is still buried.
   *
   * Only the shallowest unfound prize accrues work, so they surface one at a
   * time. Digging them in parallel would mean three popping at once and the
   * child missing two of them.
   */
  private dig(dragMagnitude: number): void {
    if (dragMagnitude <= 0) return;
    this.digEnergy += dragMagnitude * DIG_RATE;

    if (this.squelchTimer <= 0 && dragMagnitude > 6) {
      this.host.sfx("slimeSquelch");
      this.squelchTimer = SQUELCH_COOLDOWN;
    }

    const next = this.buried.find((b) => !b.found);
    if (!next) return;

    next.progress = this.digEnergy;
    if (next.progress < next.threshold) return;

    next.found = true;
    next.isNew = addToCollection(next.prize);
    this.lastFound = { prize: next.prize, isNew: next.isNew };
    this.lastFoundAge = 0;

    const { blobY, blobRadius } = this.layout();
    const accent = RARITY_COLOURS[next.prize.rarity];
    this.popped.push({
      emoji: next.prize.emoji,
      x: this.host.view.w / 2 + Math.cos(next.offsetAngle) * blobRadius * next.offsetDistance,
      y: blobY + Math.sin(next.offsetAngle) * blobRadius * next.offsetDistance,
      age: 0,
      accent,
    });

    this.blob.splash(22);
    this.particles.burst(this.host.view.w / 2, blobY, accent, 18, 100);

    if (next.prize.rarity === "legendary") {
      this.host.sfx("prizeLegendary");
      this.host.shake(4);
      this.particles.burst(this.host.view.w / 2, blobY, "#ffffff", 26, 150);
    } else if (next.prize.rarity === "rare") {
      this.host.sfx("prizeRare");
      this.host.shake(2);
    } else {
      this.host.sfx("prizePop");
    }

    this.refreshPlayControls();
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { view, settings } = this.host;
    const reduced = settings.reducedMotion;
    const { counterY, headerY, blobY, blobRadius } = this.layout();

    drawShop(ctx, view.w, view.h, counterY, blobY, this.time, reduced);

    if (this.phase === "choosing") {
      this.renderChooser(ctx, view.w, blobY, blobRadius);
      return;
    }

    if (this.order && this.mode !== "lab") {
      // Customer on the left, ticket on the right, on the same line -- it
      // reads as one moment (she is handing you this order) rather than two
      // unrelated widgets parked in opposite corners.
      drawCustomer(
        ctx,
        52,
        headerY + 32,
        this.order.customer,
        this.mood,
        this.time,
        reduced,
        1.5,
      );

      drawTicket(
        ctx,
        view.w - 162,
        headerY,
        150,
        this.order.colour,
        this.order.colourLabel,
        TEXTURE_LABELS[this.order.texture],
        this.order.mixIns.map((m) => MIX_IN_LABELS[m]),
        settings.largeText,
      );
    }

    // The dig banner takes over this slot on the squish screen, so the lab
    // title stands down rather than printing on top of it.
    if (this.mode === "lab" && this.phase !== "playing") {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = SHOP_PALETTE.neonCool;
      ctx.font = "700 13px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("SLIME LAB", view.w / 2, headerY + 16);
      ctx.fillStyle = SHOP_PALETTE.dim;
      ctx.font = "9px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("no score, no rush — just slime", view.w / 2, headerY + 32);
      ctx.restore();
    }

    this.renderBowl(ctx, blobY, blobRadius);

    if (this.phase === "playing") {
      this.renderDig(ctx, view.w, blobY, blobRadius, reduced);
    }

    this.particles.render(ctx);

    for (const p of this.popped) {
      drawPoppedPrize(ctx, p.x, p.y, p.emoji, p.age, p.accent);
    }

    if (this.phase === "verdict" && this.verdict) {
      this.renderVerdict(ctx, view.w, blobY, blobRadius);
    }
  }

  /** Buried prizes, the dig meter, and the banner for the latest find. */
  private renderDig(
    ctx: CanvasRenderingContext2D,
    w: number,
    blobY: number,
    blobRadius: number,
    reduced: boolean,
  ): void {
    const colour = mixRecipe(this.recipe);

    for (const b of this.buried) {
      if (b.found) continue;
      // Only the one currently being worked on shows through, so the slime
      // doesn't look like a bag of visible objects from the first second.
      const progress = b.threshold > 0 ? clamp01(b.progress / b.threshold) : 0;
      if (progress <= 0.08) continue;
      drawBuriedPrize(
        ctx,
        w / 2 + Math.cos(b.offsetAngle) * blobRadius * b.offsetDistance,
        blobY + Math.sin(b.offsetAngle) * blobRadius * b.offsetDistance,
        b.prize.emoji,
        progress,
        colour,
        this.time,
        reduced,
      );
    }

    const found = this.buried.filter((b) => b.found).length;
    drawDigMeter(ctx, w / 2, blobY + blobRadius + 26, found, this.buried.length);

    const header = this.layout().headerY;
    ctx.save();
    ctx.textAlign = "center";

    if (this.lastFound && this.lastFoundAge < 2.6) {
      const { prize, isNew } = this.lastFound;
      ctx.fillStyle = RARITY_COLOURS[prize.rarity];
      ctx.font = "700 15px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        `${prize.emoji}  ${prize.name.toUpperCase()}`,
        w / 2,
        header + 14,
      );
      ctx.font = "9px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        isNew ? `NEW!  ·  ${RARITY_LABELS[prize.rarity]}` : RARITY_LABELS[prize.rarity],
        w / 2,
        header + 30,
      );
    } else {
      ctx.fillStyle = SHOP_PALETTE.neonCool;
      ctx.font = "700 15px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        found >= this.buried.length ? "ALL FOUND!" : "SQUISH IT!",
        w / 2,
        header + 14,
      );
      ctx.fillStyle = SHOP_PALETTE.dim;
      ctx.font = "9px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        found >= this.buried.length
          ? "every prize is in your jar"
          : "drag anywhere to stretch — something is in there",
        w / 2,
        header + 30,
      );
    }
    ctx.restore();
  }

  hud(): HudState {
    if (this.mode === "lab") {
      return { lives: 0, progress: this.slimesMade, progressLabel: "Slimes" };
    }
    return {
      // Reskinned as jars still to fill -- see drawJarIcon.
      lives: Math.max(0, ORDERS_PER_DAY - this.orderIndex),
      progress: Math.min(this.orderIndex + 1, ORDERS_PER_DAY),
      progressLabel: "Order",
    };
  }

  onPause(): void {
    this.blob.release();
  }

  // ----- Rendering pieces -----

  private renderChooser(
    ctx: CanvasRenderingContext2D,
    w: number,
    blobY: number,
    blobRadius: number,
  ): void {
    ctx.save();
    ctx.textAlign = "center";

    ctx.fillStyle = SHOP_PALETTE.neon;
    ctx.font = "700 24px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("SLIME SHOP", w / 2, blobY - blobRadius - 34);

    ctx.fillStyle = SHOP_PALETTE.dim;
    ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("mix it. match it. serve it.", w / 2, blobY - blobRadius - 16);
    ctx.restore();

    // A demo blob so the shop is never a dead screen while you choose -- and
    // it is draggable, so the first thing you can do here is squish something.
    this.blob.render(
      ctx,
      w / 2,
      blobY,
      blobRadius,
      { r: 0.36, g: 0.87, b: 0.6 },
      "cloud",
      new Set<MixIn>(["glitter", "star"]),
      7,
      this.host.settings.reducedMotion,
    );
  }

  private renderBowl(
    ctx: CanvasRenderingContext2D,
    cy: number,
    radius: number,
  ): void {
    const { view, settings } = this.host;
    const cx = view.w / 2;

    // The bowl sits directly under the slime rather than down on the counter,
    // so the two stay together at any screen height.
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + radius * 0.78, radius + 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const empty = totalPours(this.recipe) === 0;
    const colour = mixRecipe(this.recipe);

    // An empty bowl is white, which is correct and also looks exactly like a
    // blank placeholder disc filling the screen. Ghosting it instead makes it
    // read as "nothing in here yet" and leaves the first pour something to
    // visibly arrive into.
    // Ghosting has to go through the blob rather than the context: canvas
    // globalAlpha is absolute, so anything set out here is simply overwritten
    // by the blob's own alpha the moment it starts drawing.
    this.blob.render(
      ctx,
      cx,
      cy,
      radius,
      empty ? { r: 0.75, g: 0.78, b: 0.9 } : colour,
      this.texture,
      empty ? EMPTY_MIX_INS : this.mixIns,
      this.scatterSeed,
      settings.reducedMotion,
      empty ? 0.16 : 1,
    );

    if (empty) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = SHOP_PALETTE.neonCool;
      ctx.font = "700 11px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("TAP A BOTTLE TO POUR", cx, cy + 4);
      ctx.restore();
    }

    // Name the colour under the bowl. Immediate feedback is what makes the
    // mixing loop teachable -- you learn "more yellow" by watching the label
    // move toward the one on the ticket.
    if (totalPours(this.recipe) > 0) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = SHOP_PALETTE.dim;
      ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        colourName(colour).toUpperCase(),
        cx,
        cy + radius * 0.78 + 26,
      );
      ctx.restore();
    }
  }

  private renderVerdict(
    ctx: CanvasRenderingContext2D,
    w: number,
    blobY: number,
    blobRadius: number,
  ): void {
    const v = this.verdict;
    if (!v) return;

    const cardW = 188;
    const cardH = 74;
    const x = (w - cardW) / 2;
    // Above the slime, never over it -- the served slime is what the score is
    // about, so covering it up to report the score is backwards.
    const y = Math.max(this.layout().headerY, blobY - blobRadius - cardH - 14);

    ctx.save();
    ctx.fillStyle = "rgba(8,4,18,0.9)";
    ctx.strokeStyle = v.perfect ? "#ffd84d" : SHOP_PALETTE.neonCool;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = v.perfect ? "#ffd84d" : SHOP_PALETTE.neonCool;
    ctx.font = "700 14px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(
      v.perfect ? "PERFECT!" : v.colourScore > 0 ? "NICE ONE" : "THAT'S… A SLIME",
      w / 2,
      y + 20,
    );

    ctx.fillStyle = "#e8f0ff";
    ctx.font = "700 18px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(`+${v.points}`, w / 2, y + 42);

    ctx.fillStyle = SHOP_PALETTE.dim;
    ctx.font = "8px ui-monospace, Menlo, Consolas, monospace";
    const bits = [`COLOUR ${v.colourPercent}%`];
    if (v.textureMatched) bits.push("TEXTURE");
    if (v.mixInsCorrect > 0) bits.push(`${v.mixInsCorrect} MIX-IN`);
    if (v.streakAfter > 1) bits.push(`x${v.streakAfter} STREAK`);
    ctx.fillText(bits.join("  ·  "), w / 2, y + 58);
    ctx.restore();
  }

  // ----- Layout -----

  /**
   * Everything positional, worked out in one place.
   *
   * The panel is DOM (real tap targets, scales with the large-text setting)
   * and the shop is canvas, so the two have to be reconciled somewhere. A
   * ResizeObserver keeps the panel height exact without reading offsetHeight
   * every frame, which would force a layout on each tick.
   *
   * The slime is then sized to *fill* whatever is left between the header and
   * the counter rather than being a fixed radius. At a fixed radius a tall
   * phone left a dead void down the middle with the slime stranded at the
   * bottom, which made the thing the game is named after the least prominent
   * object on screen.
   */
  private layout(): {
    counterY: number;
    headerY: number;
    blobY: number;
    blobRadius: number;
  } {
    const { view } = this.host;
    const panelUnits = view.toWorldDistance(this.panelPx);
    const counterY = Math.max(view.h * 0.42, view.h - panelUnits - 8);
    // Clears the shell 56px pause button in the top-right corner.
    const headerY = view.insetTop + 74;
    const headerH = this.mode === "lab" ? 44 : 96;

    const top = headerY + headerH;
    const band = Math.max(80, counterY - top - 18);
    const blobRadius = Math.max(30, Math.min(92, band / 2 - 12));
    const blobY = top + band / 2;

    return { counterY, headerY, blobY, blobRadius };
  }

  private watchPanelHeight(): void {
    const measure = () => {
      const px = this.root.offsetHeight;
      if (px > 0) this.panelPx = px;
    };
    if (typeof ResizeObserver !== "undefined") {
      this.panelObserver = new ResizeObserver(measure);
      this.panelObserver.observe(this.root);
    }
    // The observer doesn't fire until the element is in the document, and the
    // shell mounts it after construction.
    requestAnimationFrame(measure);
  }

  // ----- Mode selection -----

  private buildModeChooser(): void {
    const panel = div("slime-panel slime-panel--modes");

    panel.append(
      modeButton(
        "SLIME LAB",
        "Free play. No score, no timer.",
        "lab",
        () => this.begin("lab"),
      ),
      modeButton(
        "SHOP DAY",
        `${ORDERS_PER_DAY} customers. Ranked.`,
        "shop",
        () => this.begin("shop"),
      ),
      modeButton(
        "TODAY'S SPECIAL",
        "Same 6 orders for everyone today.",
        "daily",
        () => this.begin("daily"),
      ),
    );

    this.root.replaceChildren(panel);
  }

  private begin(mode: Mode): void {
    this.mode = mode;
    this.host.sfx("uiSelect");

    // One reading of the clock, used for both the seed and the board id, so
    // they cannot disagree however long the run takes.
    const now = new Date();
    this.boardId = mode === "daily" ? `daily-${dailyKey(now)}` : undefined;

    this.rng =
      mode === "daily"
        ? // Salted per game, so this shop and any future daily challenge
          // don't march in lockstep on the same date.
          new Rng((dailySeed(now) ^ SEED_SALT) >>> 0)
        : new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

    this.orderIndex = 0;
    this.streak = 0;
    this.slimesMade = 0;
    this.colourTotal = 0;
    this.buildControls();

    if (mode === "lab") {
      this.phase = "serving";
      this.order = null;
      this.newBowl();
    } else {
      this.nextOrder();
    }
  }

  // ----- Orders -----

  private nextOrder(): void {
    if (this.orderIndex >= ORDERS_PER_DAY) {
      this.closeShop();
      return;
    }
    this.order = makeOrder(this.rng, this.orderIndex);
    this.orderElapsed = 0;
    this.mood = "waiting";
    this.phase = "serving";
    this.newBowl();
    this.host.sfx("orderIn");
    this.refreshControls();
  }

  private advance(): void {
    this.orderIndex += 1;
    if (this.orderIndex >= ORDERS_PER_DAY) {
      // The day's takings, as one last slime to pull apart. Ending a shop day
      // on a score screen wastes the best thing the game has.
      const quality = clamp01(
        this.colourTotal / (ORDERS_PER_DAY * COLOUR_POINTS),
      );
      this.enterPlay(quality);
      return;
    }
    this.nextOrder();
  }

  /**
   * Hand the finished slime over to be played with.
   *
   * `quality` (0..1) only tilts the prize table -- it never gates the dig. A
   * badly mixed slime still hides prizes, because the squish screen is the
   * toy and the toy is not something you can fail your way out of.
   */
  private enterPlay(quality: number): void {
    this.phase = "playing";
    this.digEnergy = 0;
    this.popped = [];
    this.lastFound = null;
    this.lastFoundAge = 99;
    this.buried = buryPrizes(
      this.rng,
      rollPrizes(this.rng, prizeCount(this.rng, quality), quality),
    );
    this.blob.splash(14);
    this.host.sfx("slimeStretch");
    this.buildPlayControls();
  }

  private closeShop(): void {
    this.phase = "closed";
    this.host.sfx("shopClose");
    this.root.replaceChildren();
    this.host.gameOver({
      progress: ORDERS_PER_DAY,
      progressLabel: "Orders",
      boardId: this.boardId,
    });
  }

  // ----- Serving -----

  private serve(): void {
    const order = this.order;
    if (!order || this.phase !== "serving") return;
    if (totalPours(this.recipe) === 0) return;

    const mixed = mixRecipe(this.recipe);
    const match = colourMatch(mixed, order.colour);

    // Remap so only genuinely close mixes score, then square-root it so the
    // last few percent of accuracy stay worth chasing without the middle of
    // the range feeling dead.
    const t = clamp01((match - COLOUR_FLOOR) / (1 - COLOUR_FLOOR));
    const colourScore = Math.round(COLOUR_POINTS * Math.sqrt(t));
    // Shown on the verdict card. Deliberately the raw match rather than the
    // scored value: those are on different curves, and reporting the scored
    // one meant a PERFECT order could be captioned "COLOUR 89%".
    const colourPercent = Math.round(match * 100);

    const textureMatched = this.texture === order.texture;
    const wanted = new Set(order.mixIns);
    let correct = 0;
    for (const m of this.mixIns) if (wanted.has(m)) correct += 1;
    const missed = wanted.size - correct;
    const extra = this.mixIns.size - correct;

    const speedBonus = Math.round(
      SPEED_POINTS * clamp01(1 - this.orderElapsed / ORDER_PAR_SECONDS),
    );

    const perfect =
      match >= PERFECT_MATCH && textureMatched && missed === 0 && extra === 0;

    if (perfect) this.streak += 1;
    else this.streak = 0;

    // The streak multiplier is the only place skill compounds, which is what
    // separates the top of the board from a careful-but-plodding run.
    const multiplier = 1 + 0.15 * Math.min(this.streak, 4);

    const subtotal =
      colourScore +
      (textureMatched ? TEXTURE_POINTS : 0) +
      correct * MIXIN_POINTS +
      speedBonus +
      (perfect ? PERFECT_BONUS : 0);

    const points = Math.round(subtotal * multiplier);

    this.verdict = {
      colourScore,
      colourPercent,
      textureMatched,
      mixInsCorrect: correct,
      mixInsMissed: missed,
      mixInsExtra: extra,
      speedBonus,
      perfect,
      streakAfter: this.streak,
      points,
    };

    this.host.addScore(points);
    this.slimesMade += 1;
    this.colourTotal += colourScore;

    // Nobody is ever told they failed. The worst outcome on screen is a
    // customer who looks unsure.
    this.mood = perfect ? "delighted" : colourScore > 0 ? "happy" : "unsure";

    const { blobY } = this.layout();
    this.blob.splash(26);
    this.particles.burst(
      this.host.view.w / 2,
      blobY,
      toCss(mixed),
      perfect ? 26 : 14,
      perfect ? 130 : 80,
    );

    if (perfect) {
      this.host.sfx("perfectOrder");
      this.host.shake(3);
    } else {
      this.host.sfx("slimeServe");
    }

    this.phase = "verdict";
    this.verdictTimer = VERDICT_SECONDS;
    this.refreshControls();
  }

  // ----- Bowl -----

  private newBowl(): void {
    this.recipe = emptyRecipe();
    this.mixIns.clear();
    this.scatterSeed = (this.scatterSeed * 1103515245 + 12345) >>> 0;
    this.blob.reset();
    this.refreshControls();
  }

  private pour(bottle: Bottle): void {
    if (this.phase !== "serving") return;
    if (totalPours(this.recipe) >= MAX_POURS) return;
    this.recipe[bottle] += 1;
    this.blob.splash(9);
    this.host.sfx("slimePour");
    this.refreshControls();
  }

  private setTexture(texture: Texture): void {
    if (this.phase !== "serving") return;
    this.texture = texture;
    this.blob.splash(7);
    this.host.sfx("slimeStir");
    this.refreshControls();
  }

  private toggleMixIn(mixIn: MixIn): void {
    if (this.phase !== "serving") return;
    if (this.mixIns.has(mixIn)) this.mixIns.delete(mixIn);
    else this.mixIns.add(mixIn);
    this.blob.splash(6);
    this.host.sfx("slimeStir");
    this.refreshControls();
  }

  private dump(): void {
    if (this.phase !== "serving") return;
    // Free and unlimited. A child who can't undo a mistake stops experimenting.
    this.newBowl();
    this.host.sfx("uiMove");
  }

  private finishLab(): void {
    this.root.replaceChildren();
    this.host.gameOver({
      progress: Math.max(1, this.slimesMade),
      progressLabel: "Slimes",
      ranked: false,
      headline: "SLIME LAB CLOSED",
    });
  }

  // ----- The counter panel -----

  private buildControls(): void {
    const panel = div("slime-panel");

    const bottles = div("slime-row slime-bottles");
    for (const bottle of BOTTLES) {
      const button = document.createElement("button");
      button.className = "slime-bottle";
      button.dataset.bottle = bottle;
      button.setAttribute("aria-label", `Add one pour of ${bottle}`);
      const swatch = div("slime-swatch");
      swatch.style.background = BOTTLE_CSS[bottle];
      const count = div("slime-count");
      button.append(swatch, count);
      button.addEventListener("click", () => this.pour(bottle));
      bottles.append(button);
    }

    const textures = div("slime-row slime-chips");
    for (const texture of TEXTURES) {
      const button = document.createElement("button");
      button.className = "slime-chip slime-chip--texture";
      button.dataset.texture = texture;
      button.textContent = TEXTURE_LABELS[texture];
      button.addEventListener("click", () => this.setTexture(texture));
      textures.append(button);
    }

    const mixIns = div("slime-row slime-chips");
    for (const mixIn of MIX_INS) {
      const button = document.createElement("button");
      button.className = "slime-chip slime-chip--mixin";
      button.dataset.mixin = mixIn;
      button.textContent = MIX_IN_LABELS[mixIn];
      button.addEventListener("click", () => this.toggleMixIn(mixIn));
      mixIns.append(button);
    }

    const actions = div("slime-row slime-actions");
    const dump = document.createElement("button");
    dump.className = "slime-act slime-act--dump";
    dump.textContent = "DUMP";
    dump.addEventListener("click", () => this.dump());

    const serve = document.createElement("button");
    serve.className = "slime-act slime-act--serve";
    serve.dataset.role = "serve";
    serve.textContent = this.mode === "lab" ? "PLAY WITH IT" : "SERVE";
    serve.addEventListener("click", () => {
      if (this.mode === "lab") {
        this.slimesMade += 1;
        this.host.sfx("slimeServe");
        // Straight to the squish screen. Mixing a slime and then binning it
        // was the old flow's mistake -- the thing you made should be the
        // thing you get to play with.
        this.enterPlay(0.5);
      } else {
        this.serve();
      }
    });

    actions.append(dump, serve);

    if (this.mode === "lab") {
      const finish = document.createElement("button");
      finish.className = "slime-act slime-act--finish";
      finish.textContent = "DONE";
      finish.addEventListener("click", () => this.finishLab());
      actions.append(finish);
    }

    panel.append(bottles, textures, mixIns, actions);
    this.root.replaceChildren(panel);
    this.refreshControls();
  }

  /**
   * Paint current state onto the existing buttons.
   *
   * Deliberately mutates in place rather than rebuilding the panel: replacing
   * the nodes mid-tap cancels the press on mobile, so a fast player would see
   * pours silently go missing.
   */
  private refreshControls(): void {
    const active = this.phase === "serving";

    for (const node of this.root.querySelectorAll<HTMLElement>(".slime-bottle")) {
      const bottle = node.dataset.bottle as Bottle | undefined;
      if (!bottle) continue;
      const count = this.recipe[bottle];
      const label = node.querySelector<HTMLElement>(".slime-count");
      if (label) label.textContent = count > 0 ? String(count) : "";
      node.classList.toggle("is-used", count > 0);
      (node as HTMLButtonElement).disabled = !active;
    }

    for (const node of this.root.querySelectorAll<HTMLElement>(".slime-chip--texture")) {
      const on = node.dataset.texture === this.texture;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-pressed", String(on));
      (node as HTMLButtonElement).disabled = !active;
    }

    for (const node of this.root.querySelectorAll<HTMLElement>(".slime-chip--mixin")) {
      const mixIn = node.dataset.mixin as MixIn | undefined;
      const on = mixIn ? this.mixIns.has(mixIn) : false;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-pressed", String(on));
      (node as HTMLButtonElement).disabled = !active;
    }

    const serve = this.root.querySelector<HTMLButtonElement>('[data-role="serve"]');
    if (serve) {
      // An empty bowl can't be served. It stops a run being six instant
      // no-op serves, which the scoreboard would rightly reject as
      // implausibly fast anyway.
      serve.disabled = !active || totalPours(this.recipe) === 0;
    }
  }

  // ----- The squish screen's controls -----

  private buildPlayControls(): void {
    const panel = div("slime-panel slime-panel--play");

    const tray = div("slime-tray");
    tray.dataset.role = "tray";
    panel.append(tray);

    const actions = div("slime-row slime-actions");

    const jar = document.createElement("button");
    jar.className = "slime-act slime-act--jar";
    jar.textContent = "PRIZE JAR";
    jar.addEventListener("click", () => this.showJar());
    actions.append(jar);

    if (this.mode === "lab") {
      const again = document.createElement("button");
      again.className = "slime-act slime-act--serve";
      again.textContent = "NEW SLIME";
      again.addEventListener("click", () => this.backToMixing());

      const done = document.createElement("button");
      done.className = "slime-act slime-act--finish";
      done.textContent = "DONE";
      done.addEventListener("click", () => this.finishLab());

      actions.append(again, done);
    } else {
      const finish = document.createElement("button");
      finish.className = "slime-act slime-act--serve";
      finish.textContent = "FINISH DAY";
      finish.addEventListener("click", () => this.closeShop());
      actions.append(finish);
    }

    panel.append(actions);
    this.root.replaceChildren(panel);
    this.refreshPlayControls();
  }

  /** Repaint the tray of what has surfaced so far. */
  private refreshPlayControls(): void {
    const tray = this.root.querySelector<HTMLElement>('[data-role="tray"]');
    if (!tray) return;

    const chips = this.buried.map((b) => {
      const chip = div(
        b.found ? `slime-prize is-found is-${b.prize.rarity}` : "slime-prize",
      );
      // Unfound slots stay as empty sockets rather than being hidden, so the
      // tray shows how much is still in there -- that's the reason to keep
      // squishing.
      chip.textContent = b.found ? b.prize.emoji : "?";
      if (b.found && b.isNew) chip.classList.add("is-new");
      chip.title = b.found ? b.prize.name : "Still buried";
      return chip;
    });
    tray.replaceChildren(...chips);
  }

  private backToMixing(): void {
    this.phase = "serving";
    this.buried = [];
    this.popped = [];
    this.lastFound = null;
    this.newBowl();
    this.buildControls();
    this.host.sfx("uiSelect");
  }

  /**
   * The Prize Jar.
   *
   * DOM rather than canvas for the same reason the leaderboard is: it scrolls,
   * it scales with the large-text setting, and a screen reader can read it.
   */
  private showJar(): void {
    const collection = loadCollection();
    const stats = collectionStats(collection);

    const panel = div("slime-panel slime-panel--jar");

    const head = div("slime-jar-head");
    const title = div("slime-jar-title");
    title.textContent = "PRIZE JAR";
    const count = div("slime-jar-count");
    count.textContent = `${stats.distinct}/${stats.possible} kinds · ${stats.total} found`;
    head.append(title, count);

    const grid = div("slime-jar-grid");
    for (const prize of ALL_PRIZES) {
      const owned = collection[prize.emoji] ?? 0;
      const cell = div(
        owned > 0 ? `slime-jar-cell is-owned is-${prize.rarity}` : "slime-jar-cell",
      );
      const face = div("slime-jar-emoji");
      // Undiscovered prizes stay silhouetted, so the jar doubles as a list of
      // what there is still to find.
      face.textContent = owned > 0 ? prize.emoji : "?";
      cell.append(face);
      if (owned > 1) {
        const n = div("slime-jar-n");
        n.textContent = `x${owned}`;
        cell.append(n);
      }
      cell.title = owned > 0 ? `${prize.name} (${RARITY_LABELS[prize.rarity]})` : "Not found yet";
      grid.append(cell);
    }

    const back = document.createElement("button");
    back.className = "slime-act slime-act--serve";
    back.textContent = "BACK TO THE SLIME";
    back.addEventListener("click", () => {
      this.host.sfx("uiSelect");
      this.buildPlayControls();
    });

    panel.append(head, grid, back);
    this.root.replaceChildren(panel);
  }

  destroy(): void {
    this.panelObserver?.disconnect();
  }
}

const BOTTLE_CSS: Record<Bottle, string> = {
  red: "#ff3b3b",
  yellow: "#ffe14d",
  blue: "#3f7fd6",
  white: "#ffffff",
  black: "#2c2033",
};

function modeButton(
  title: string,
  hint: string,
  mode: Mode,
  onPick: () => void,
): HTMLElement {
  const button = document.createElement("button");
  button.className = `slime-mode slime-mode--${mode}`;
  const name = div("slime-mode-name");
  name.textContent = title;
  const sub = div("slime-mode-hint");
  sub.textContent = hint;
  button.append(name, sub);
  button.addEventListener("click", onPick);
  return button;
}

function div(className: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export const slimeShopModule: GameModule = {
  id: "riley-slime-shop",
  title: "RILEY'S SLIME SHOP",
  shortTitle: "SLIME SHOP",
  progressShort: "ORD",
  blurb: "Mix the colour, match the order. Or just squish it.",
  accent: "#ff5fae",
  hasDailyChallenge: true,

  drawIcon(ctx, size) {
    drawShopIcon(ctx, size);
  },

  drawLifeIcon(ctx, highContrast) {
    drawJarIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new SlimeShop(host);
  },
};

export type { Rgb };

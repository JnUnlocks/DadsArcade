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
  drawCustomer,
  drawJarIcon,
  drawShop,
  drawShopIcon,
  drawTicket,
  SHOP_PALETTE,
  SlimeBlob,
  type Mood,
} from "./render";
import { makeOrder, ORDERS_PER_DAY } from "./orders";
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

type Phase = "choosing" | "serving" | "verdict" | "closed";

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

  private time = 0;
  /** Bumped on every new bowl so glitter re-scatters between slimes. */
  private scatterSeed = 1;

  /** Panel height in virtual units, so canvas art can sit clear of it. */
  private panelUnits = 210;
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
    if (this.phase === "serving" || this.phase === "choosing") {
      if (input.pointerDown && (input.dragX !== 0 || input.dragY !== 0)) {
        this.blob.pull(input.dragX, input.dragY, this.texture);
      } else if (!input.pointerDown) {
        this.blob.release();
      }
    }

    if (this.phase === "serving") {
      this.orderElapsed += dt;
    }

    if (this.phase === "verdict") {
      this.verdictTimer -= dt;
      if (this.verdictTimer <= 0) this.advance();
    }
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

    if (this.mode === "lab") {
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
    this.particles.render(ctx);

    if (this.phase === "verdict" && this.verdict) {
      this.renderVerdict(ctx, view.w, blobY, blobRadius);
    }
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
    ctx.save();
    if (empty) ctx.globalAlpha = 0.16;
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
    );
    ctx.restore();

    if (empty) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = SHOP_PALETTE.dim;
      ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
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
    const bits = [`COLOUR ${Math.round((v.colourScore / COLOUR_POINTS) * 100)}%`];
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
    const counterY = Math.max(view.h * 0.42, view.h - this.panelUnits - 8);
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
      if (px > 0) this.panelUnits = this.host.view.toWorldDistance(px);
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

    this.rng =
      mode === "daily"
        ? // Salted per game, so this shop and any future daily challenge
          // don't march in lockstep on the same date.
          new Rng((dailySeed() ^ SEED_SALT) >>> 0)
        : new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

    this.orderIndex = 0;
    this.streak = 0;
    this.slimesMade = 0;
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
      this.closeShop();
      return;
    }
    this.nextOrder();
  }

  private closeShop(): void {
    this.phase = "closed";
    this.host.sfx("shopClose");
    this.root.replaceChildren();
    this.host.gameOver({
      progress: ORDERS_PER_DAY,
      progressLabel: "Orders",
      boardId: this.mode === "daily" ? `daily-${dailyKey()}` : undefined,
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
    serve.textContent = this.mode === "lab" ? "NEW BATCH" : "SERVE";
    serve.addEventListener("click", () => {
      if (this.mode === "lab") {
        this.slimesMade += 1;
        this.host.sfx("slimeServe");
        this.blob.splash(24);
        this.newBowl();
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

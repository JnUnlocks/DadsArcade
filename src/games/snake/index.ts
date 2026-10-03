/**
 * JB'S HYPER SNAKE -- the snake from the old phone, and the one it grew into.
 *
 * Two games behind one cabinet, picked on the title card:
 *
 *   CLASSIC  The 1997 rules, on the 1997 screen. A walled field, one life,
 *            and a snake that moves a whole square at a time. Every fifth
 *            piece of food is a level: the snake gets a step quicker, up to
 *            level 9, and a bonus critter turns up, worth less the longer
 *            you leave it. Nothing else. It has its own scoreboard, because
 *            a Classic score and a Hyper score aren't the same kind of number.
 *
 *   HYPER    The same snake in the arcade's neon. The edges are open -- out
 *            one side, back in on the other -- so the danger is what's on
 *            the floor: crates to steer round, lasers that telegraph before
 *            they fire, and your own tail. Stages with a target to eat,
 *            three lives, and pickups: a shield that forgives one
 *            crash, a magnet that drags apples toward you, and gold nuts for
 *            points. Hold BOOST to sprint -- anything eaten at a sprint
 *            scores double, which is the whole risk-and-reward of the mode.
 *
 * What both keep from the original, because it's what made it good: turns are
 * buffered so a fast UP-then-LEFT never drops one, and you can follow your own
 * tail through the square it's just leaving. See rules.ts.
 *
 * Swiping is the default, but the phone this came from had buttons, so the
 * title card offers a keypad too: 2, 4, 6 and 8, laid out as they were.
 */

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Particles } from "../../core/particles";
import { Rng } from "../../core/rng";
import { loadBests } from "../../core/storage";
import {
  CLASSIC_BONUS_EVERY,
  CLASSIC_BONUS_SECONDS,
  CLASSIC_FOOD_POINTS,
  COLS,
  ROWS,
  advance,
  cellKey,
  classicBonusValue,
  classicLevel,
  classicSpeed,
  createSnake,
  occupies,
  pickFreeCell,
  pullToward,
  queueTurn,
  safeDirs,
  type Cell,
  type Dir,
  type Snake,
} from "./rules";
import { buildStage, laserPhase, type Stage } from "./stages";
import {
  FRAME,
  LCD,
  LCD_HEADER,
  LCD_PAD,
  NEON,
  cellCentre,
  drawApple,
  drawCrates,
  drawGoalPips,
  drawLaser,
  drawLcdBanner,
  drawLcdBonus,
  drawLcdFood,
  drawLcdHeader,
  drawLcdPanel,
  drawLcdSnake,
  drawNeonBackdrop,
  drawNeonBanner,
  drawNeonBoard,
  drawNeonSnake,
  drawPickup,
  drawPopup,
  drawSnakeIcon,
  drawSnakeLifeIcon,
  drawStatus,
  drawTitleCard,
  type Layout,
  type PickupKind,
} from "./render";
import "./snake.css";

type Mode = "classic" | "hyper";
type Phase = "choosing" | "ready" | "playing" | "stunned" | "dying" | "cleared";

const GAME_ID = "snake";
/** Classic runs are filed here, apart from the Hyper board. */
export const CLASSIC_BOARD = "classic";
const MODE_KEY = "hyperdrive.snake.mode";
const KEYPAD_KEY = "hyperdrive.snake.keypad";

/** The phone's own steering keys, and the desktop number keys that match. */
const KEYPAD: ReadonlyArray<{ digit: string; letters: string; dir: Dir; label: string }> = [
  { digit: "2", letters: "abc", dir: "up", label: "Up" },
  { digit: "4", letters: "ghi", dir: "left", label: "Left" },
  { digit: "6", letters: "mno", dir: "right", label: "Right" },
  { digit: "8", letters: "tuv", dir: "down", label: "Down" },
];

const READY_TIME = 1.3;
const DYING_TIME = 1.3;
const CLEARED_TIME = 1.9;
const STUN_TIME = 0.55;

const START_LIVES = 3;
const BOOST_FACTOR = 1.7;
const MAGNET_SECONDS = 8;
const PICKUP_SECONDS = 9;
const NUT_POINTS = 50;
/** After a respawn or a shield save, lasers can't hurt for a moment. */
const LASER_GRACE = 1.6;

/** Virtual units a thumb has to travel before it counts as a turn. */
const SWIPE_THRESHOLD = 11;

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  colour: string;
}

interface Pickup {
  kind: PickupKind;
  cell: Cell;
  life: number;
}

class HyperSnake implements GameInstance {
  private readonly host: GameHost;
  private readonly rng = new Rng((Math.random() * 0xffffffff) >>> 0);
  private readonly particles = new Particles();
  private readonly root: HTMLElement;
  private readonly boostButton: HTMLButtonElement;
  private readonly keypad: HTMLElement;
  private useKeypad = loadKeypad();

  private mode: Mode = loadLastMode();
  private phase: Phase = "choosing";
  private phaseTimer = 0;
  private time = 0;

  private snake: Snake = createSnake();
  private food: Cell | null = null;
  /** Fraction of a step accumulated; also how far to slide when drawing. */
  private stepClock = 0;
  private foodEaten = 0;
  private ended = false;

  // Classic.
  private bonus: { cell: Cell; left: number } | null = null;

  // Hyper.
  private stage: Stage = buildStage(1);
  private stageTime = 0;
  private stageEaten = 0;
  private lives = START_LIVES;
  private shielded = false;
  private magnetLeft = 0;
  private laserGrace = 0;
  private pickup: Pickup | null = null;
  private pickupTimer = 7;
  private boostHeld = false;
  private boostKey = false;
  private clearBonus = 0;

  private popups: Popup[] = [];

  private swipeX = 0;
  private swipeY = 0;
  private lastAxisX = 0;
  private lastAxisY = 0;

  private layout: Layout = { cell: 18, x0: 0, y0: 0 };
  private layoutFor = { w: 0, h: 0, key: "" };

  constructor(host: GameHost) {
    this.host = host;
    this.root = document.createElement("div");
    this.root.className = "snake-root";
    this.boostButton = this.buildBoostButton();
    this.keypad = this.buildKeypad();
    this.buildChooser();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  // ----- Title card -----

  private buildChooser(): void {
    const bests = loadBests();
    const panel = document.createElement("div");
    panel.className = "snake-panel";

    const option = (mode: Mode, name: string, pitch: string, best: number) => {
      const button = document.createElement("button");
      button.className = `snake-mode snake-mode--${mode}`;
      if (mode === this.mode) button.classList.add("is-last");
      const title = document.createElement("span");
      title.className = "snake-mode__name";
      title.textContent = name;
      const desc = document.createElement("span");
      desc.className = "snake-mode__pitch";
      desc.textContent = pitch;
      button.append(title, desc);
      if (best > 0) {
        const record = document.createElement("span");
        record.className = "snake-mode__best";
        record.textContent = `YOUR BEST ${String(best).padStart(6, "0")}`;
        button.append(record);
      }
      button.addEventListener("click", () => this.begin(mode));
      return button;
    };

    panel.append(
      option(
        "classic",
        "CLASSIC",
        "The one from the old phone. One life, solid walls, no tricks.",
        bests[`${GAME_ID}:${CLASSIC_BOARD}`] ?? 0,
      ),
      option(
        "hyper",
        "HYPER",
        "Go through a wall, come out the other side. Crates, lasers, power-ups, and BOOST for double points.",
        bests[GAME_ID] ?? 0,
      ),
    );

    // Swipe or buttons. The choice is remembered, and swiping keeps working
    // with the keypad up, so nobody is ever stuck with the wrong one.
    const controls = document.createElement("button");
    controls.className = "snake-controls";
    const hint = document.createElement("p");
    hint.className = "snake-hint";
    const describe = () => {
      controls.textContent = this.useKeypad ? "CONTROLS: KEYPAD" : "CONTROLS: SWIPE";
      controls.setAttribute("aria-pressed", String(this.useKeypad));
      hint.textContent = this.useKeypad
        ? "Steer with 2, 4, 6 and 8, like the old phone."
        : "Swipe anywhere to turn. Tap for buttons instead.";
    };
    controls.addEventListener("click", () => {
      this.useKeypad = !this.useKeypad;
      saveKeypad(this.useKeypad);
      this.host.sfx("uiMove");
      describe();
    });
    describe();
    panel.append(controls, hint);

    this.root.classList.remove("snake-root--keypad");
    this.root.replaceChildren(panel);
  }

  /**
   * The four steering keys off a phone keypad, in the cross they made there:
   * 2 up, 4 left, 6 right, 8 down, with a blank 5 between them.
   */
  private buildKeypad(): HTMLElement {
    const pad = document.createElement("div");
    pad.className = "snake-keypad";
    pad.setAttribute("role", "group");
    pad.setAttribute("aria-label", "Steer");

    for (const key of KEYPAD) {
      const button = document.createElement("button");
      button.className = `snake-key snake-key--${key.dir}`;
      button.setAttribute("aria-label", key.label);
      const digit = document.createElement("span");
      digit.className = "snake-key__digit";
      digit.textContent = key.digit;
      const letters = document.createElement("span");
      letters.className = "snake-key__letters";
      letters.textContent = key.letters;
      button.append(digit, letters);
      // pointerdown, not click: a turn that waits for the thumb to lift
      // arrives a square too late.
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (this.phase !== "choosing") queueTurn(this.snake, key.dir);
      });
      button.addEventListener("contextmenu", (event) => event.preventDefault());
      pad.append(button);
    }
    const middle = document.createElement("span");
    middle.className = "snake-key snake-key--middle";
    middle.setAttribute("aria-hidden", "true");
    middle.textContent = "5";
    pad.append(middle);
    return pad;
  }

  private buildBoostButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "snake-boost";
    button.textContent = "BOOST";
    button.setAttribute("aria-label", "Boost: hold to sprint for double points");
    const set = (held: boolean) => {
      this.boostHeld = held;
      button.classList.toggle("is-held", held);
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      // Capture so a thumb that drifts off the button keeps sprinting.
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Carry on uncaptured.
      }
      set(true);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      button.addEventListener(type, () => set(false));
    }
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    return button;
  }

  private begin(mode: Mode): void {
    this.mode = mode;
    saveLastMode(mode);
    this.host.sfx("uiSelect");
    this.root.classList.toggle("snake-root--keypad", this.useKeypad);
    this.root.replaceChildren(
      ...(this.useKeypad ? [this.keypad] : []),
      ...(mode === "hyper" ? [this.boostButton] : []),
    );

    this.snake = createSnake(mode === "hyper");
    this.foodEaten = 0;
    this.bonus = null;
    this.lives = START_LIVES;
    this.popups = [];
    if (mode === "hyper") this.loadStage(1);
    this.placeFood();
    this.enterReady();
  }

  private loadStage(number: number): void {
    this.stage = buildStage(number);
    this.stageTime = 0;
    this.stageEaten = 0;
    this.pickup = null;
    this.pickupTimer = this.rng.range(5, 8);
    this.magnetLeft = 0;
    this.snake = createSnake(true);
  }

  private enterReady(): void {
    this.phase = "ready";
    this.phaseTimer = READY_TIME;
    this.stepClock = 0;
    this.swipeX = 0;
    this.swipeY = 0;
  }

  // ----- Input -----

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Space") this.boostKey = true;
    // 2, 4, 6 and 8 steer on a real keyboard too, top row or number pad.
    const key = KEYPAD.find((k) => event.code === `Digit${k.digit}` || event.code === `Numpad${k.digit}`);
    if (key && this.phase !== "choosing" && !event.repeat) queueTurn(this.snake, key.dir);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") this.boostKey = false;
  };

  private get boosting(): boolean {
    return this.mode === "hyper" && (this.boostHeld || this.boostKey);
  }

  /**
   * A turn fires the moment the thumb has travelled far enough, and the
   * tally resets, so one continuous drag can steer round a whole corner
   * without lifting -- the way a thumb actually moves on glass.
   */
  private readSteering(input: InputSnapshot): void {
    this.swipeX += input.dragX;
    this.swipeY += input.dragY;
    if (Math.abs(this.swipeX) > SWIPE_THRESHOLD || Math.abs(this.swipeY) > SWIPE_THRESHOLD) {
      const dir: Dir =
        Math.abs(this.swipeX) > Math.abs(this.swipeY)
          ? this.swipeX > 0
            ? "right"
            : "left"
          : this.swipeY > 0
            ? "down"
            : "up";
      queueTurn(this.snake, dir);
      this.swipeX = 0;
      this.swipeY = 0;
    }
    if (!input.pointerDown) {
      this.swipeX = 0;
      this.swipeY = 0;
    }

    // Keys turn on the press, per axis, so holding RIGHT and tapping UP works.
    if (input.axisX !== this.lastAxisX && input.axisX !== 0) {
      queueTurn(this.snake, input.axisX > 0 ? "right" : "left");
    }
    if (input.axisY !== this.lastAxisY && input.axisY !== 0) {
      queueTurn(this.snake, input.axisY > 0 ? "down" : "up");
    }
    this.lastAxisX = input.axisX;
    this.lastAxisY = input.axisY;
  }

  // ----- Update -----

  update(dt: number, input: InputSnapshot): void {
    this.ensureLayout();
    this.time += dt;
    this.particles.update(dt);
    this.updatePopups(dt);
    if (this.phase === "choosing") return;

    this.readSteering(input);

    switch (this.phase) {
      case "ready":
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.phase = "playing";
        return;
      case "stunned":
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.recoverFromStun();
        return;
      case "dying":
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.afterDeath();
        return;
      case "cleared":
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.loadStage(this.stage.number + 1);
          this.placeFood();
          this.enterReady();
        }
        return;
      case "playing":
        this.play(dt);
        return;
    }
  }

  private play(dt: number): void {
    if (this.mode === "classic") {
      if (this.bonus) {
        this.bonus.left -= dt;
        if (this.bonus.left <= 0) this.bonus = null;
      }
    } else {
      this.stageTime += dt;
      this.laserGrace = Math.max(0, this.laserGrace - dt);
      this.magnetLeft = Math.max(0, this.magnetLeft - dt);
      this.updatePickup(dt);
    }

    const speed =
      this.mode === "classic"
        ? classicSpeed(this.foodEaten)
        : this.stage.speed * (this.boosting ? BOOST_FACTOR : 1);
    this.stepClock += dt * speed;
    while (this.stepClock >= 1 && this.phase === "playing") {
      this.stepClock -= 1;
      this.step();
    }

    if (this.mode === "hyper" && this.phase === "playing") this.checkLasers();
  }

  private readonly blocked = (col: number, row: number): boolean =>
    this.mode === "hyper" && this.stage.crates.has(cellKey(col, row));

  private step(): void {
    if (advance(this.snake, this.blocked) === "crashed") {
      this.crash();
      return;
    }
    const head = this.snake.body[0]!;

    if (this.food && sameCell(this.food, head)) this.eatFood(head);

    if (this.bonus && sameCell(this.bonus.cell, head)) {
      const points = classicBonusValue(this.bonus.left);
      this.host.addScore(points);
      this.host.sfx("extraLife");
      this.popup(head, `+${points}`, LCD.bg);
      this.bonus = null;
    }

    if (this.pickup && sameCell(this.pickup.cell, head)) this.takePickup(this.pickup.kind, head);

    if (this.magnetLeft > 0 && this.food) {
      this.food = pullToward(this.food, head, (col, row) => this.isEmpty(col, row));
    }
  }

  private eatFood(head: Cell): void {
    this.snake.grow += 1;
    this.foodEaten += 1;
    const centre = cellCentre(this.layout, head.col, head.row);

    if (this.mode === "classic") {
      this.host.addScore(CLASSIC_FOOD_POINTS);
      const level = classicLevel(this.foodEaten);
      if (level > classicLevel(this.foodEaten - 1)) {
        this.host.sfx("levelUp");
        this.popup(head, `LEVEL ${level}`, LCD.bg);
      } else {
        this.host.sfx("uiMove");
      }
      this.placeFood();
      if (this.foodEaten % CLASSIC_BONUS_EVERY === 0 && !this.bonus) {
        const cell = pickFreeCell(this.rng, (c, r) => !this.isEmpty(c, r));
        if (cell) this.bonus = { cell, left: CLASSIC_BONUS_SECONDS };
      }
      return;
    }

    const base = 10 + (this.stage.number - 1) * 2;
    const points = this.boosting ? base * 2 : base;
    this.host.addScore(points);
    this.host.sfx("jumpScore");
    this.particles.burst(centre.x, centre.y, NEON.apple, 12, 80);
    this.popup(head, this.boosting ? `+${points} x2` : `+${points}`, this.boosting ? NEON.nut : "#ffffff");

    this.stageEaten += 1;
    if (this.stageEaten >= this.stage.target) {
      this.clearStage();
      return;
    }
    this.placeFood();
  }

  private clearStage(): void {
    this.food = null;
    this.pickup = null;
    this.clearBonus = this.stage.number * 100 + this.snake.body.length * 5;
    this.host.addScore(this.clearBonus);
    this.host.sfx("levelClear");
    this.phase = "cleared";
    this.phaseTimer = CLEARED_TIME;
    for (const segment of this.snake.body) {
      const c = cellCentre(this.layout, segment.col, segment.row);
      this.particles.burst(c.x, c.y, NEON.snakeLight, 4, 60);
    }
  }

  private takePickup(kind: PickupKind, head: Cell): void {
    this.pickup = null;
    this.pickupTimer = this.rng.range(7, 11);
    const centre = cellCentre(this.layout, head.col, head.row);
    if (kind === "shield") {
      this.shielded = true;
      this.host.sfx("wrenchGet");
      this.popup(head, "SHIELD", NEON.shield);
      this.particles.burst(centre.x, centre.y, NEON.shield, 14, 80);
    } else if (kind === "magnet") {
      this.magnetLeft = MAGNET_SECONDS;
      this.host.sfx("wrenchGet");
      this.popup(head, "MAGNET", NEON.magnet);
      this.particles.burst(centre.x, centre.y, NEON.magnet, 14, 80);
    } else {
      this.host.addScore(NUT_POINTS);
      this.host.sfx("extraLife");
      this.popup(head, `+${NUT_POINTS}`, NEON.nut);
      this.particles.burst(centre.x, centre.y, NEON.nut, 14, 80);
    }
  }

  private updatePickup(dt: number): void {
    if (this.pickup) {
      this.pickup.life -= dt;
      if (this.pickup.life <= 0) {
        this.pickup = null;
        this.pickupTimer = this.rng.range(7, 11);
      }
      return;
    }
    this.pickupTimer -= dt;
    if (this.pickupTimer > 0) return;
    const cell = pickFreeCell(this.rng, (c, r) => !this.isEmpty(c, r));
    if (!cell) return;
    // No second shield while one is up, and no magnet on top of a magnet.
    const kinds: PickupKind[] = ["nut"];
    if (!this.shielded) kinds.push("shield", "shield");
    if (this.magnetLeft <= 0) kinds.push("magnet");
    this.pickup = { kind: this.rng.pick(kinds), cell, life: PICKUP_SECONDS };
  }

  private checkLasers(): void {
    if (this.laserGrace > 0) return;
    const head = this.snake.body[0]!;
    const key = cellKey(head.col, head.row);
    for (const laser of this.stage.lasers) {
      if (laserPhase(this.stage, laser, this.stageTime) !== "on") continue;
      if (!laser.cells.includes(key)) continue;
      if (this.shielded) {
        // The shield takes the beam and the snake carries straight on.
        this.spendShield(head);
        return;
      }
      this.die();
      return;
    }
  }

  private spendShield(head: Cell): void {
    this.shielded = false;
    this.laserGrace = LASER_GRACE;
    const c = cellCentre(this.layout, head.col, head.row);
    this.particles.burst(c.x, c.y, NEON.shield, 20, 110);
    this.popup(head, "SAVED", NEON.shield);
    this.host.sfx("towerBonk");
    this.host.shake(4);
  }

  private crash(): void {
    if (this.mode === "hyper" && this.shielded) {
      // A beat to choose a way out, rather than being bounced somewhere.
      this.spendShield(this.snake.body[0]!);
      this.snake.queue = [];
      this.phase = "stunned";
      this.phaseTimer = STUN_TIME;
      this.stepClock = 1;
      return;
    }
    this.die();
  }

  private recoverFromStun(): void {
    const turn = this.snake.queue.shift();
    const safe = safeDirs(this.snake, this.blocked);
    // The player's own choice wins if it's survivable; otherwise the snake
    // takes whichever way is open. No way open means the shield bought nothing.
    const dir = turn && safe.includes(turn) ? turn : safe[0];
    if (!dir) {
      this.die();
      return;
    }
    this.snake.dir = dir;
    this.snake.queue = [];
    this.stepClock = 0;
    this.phase = "playing";
  }

  private die(): void {
    this.phase = "dying";
    this.phaseTimer = DYING_TIME;
    this.stepClock = 1;
    if (this.mode === "classic") {
      this.host.sfx("roundFail");
      return;
    }
    this.host.sfx("playerExplode");
    this.host.shake(7);
    this.host.hitStop(0.06);
    for (const segment of this.snake.body) {
      const c = cellCentre(this.layout, segment.col, segment.row);
      this.particles.burst(c.x, c.y, NEON.snake, 5, 90);
    }
  }

  private afterDeath(): void {
    if (this.mode === "classic") {
      this.end();
      return;
    }
    this.lives -= 1;
    if (this.lives <= 0) {
      this.end();
      return;
    }
    // Stage progress is kept; only the snake starts over.
    this.snake = createSnake(true);
    this.shielded = false;
    this.magnetLeft = 0;
    this.laserGrace = LASER_GRACE + READY_TIME;
    if (this.food && occupies(this.snake, this.food.col, this.food.row)) this.placeFood();
    if (this.pickup && occupies(this.snake, this.pickup.cell.col, this.pickup.cell.row)) {
      this.pickup = null;
    }
    this.enterReady();
  }

  private end(headline?: string): void {
    if (this.ended) return;
    this.ended = true;
    this.root.replaceChildren();
    if (this.mode === "classic") {
      this.host.gameOver({
        progress: this.snake.body.length,
        progressLabel: "Length",
        boardId: CLASSIC_BOARD,
        ...(headline ? { headline } : {}),
      });
    } else {
      this.host.gameOver({
        progress: this.stage.number,
        progressLabel: "Stage",
        ...(headline ? { headline } : {}),
      });
    }
  }

  /** Nothing there: no crate, no snake, no food, no bonus, no pickup. */
  private isEmpty(col: number, row: number): boolean {
    if (this.blocked(col, row) || occupies(this.snake, col, row)) return false;
    if (this.food && this.food.col === col && this.food.row === row) return false;
    if (this.bonus && this.bonus.cell.col === col && this.bonus.cell.row === row) return false;
    if (this.pickup && this.pickup.cell.col === col && this.pickup.cell.row === row) return false;
    return true;
  }

  private placeFood(): void {
    this.food = null;
    this.food = pickFreeCell(this.rng, (c, r) => !this.isEmpty(c, r));
    // A snake that fills the board has nowhere left to put food. It's never
    // happened, but it shouldn't end as a crash if it does.
    if (!this.food) this.end("BOARD FULL!");
  }

  private popup(cell: Cell, text: string, colour: string): void {
    const c = cellCentre(this.layout, cell.col, cell.row);
    this.popups.push({ x: c.x, y: c.y - this.layout.cell * 0.7, text, life: 0.9, colour });
  }

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const popup = this.popups[i]!;
      popup.life -= dt;
      popup.y -= 22 * dt;
      if (popup.life <= 0) {
        this.popups[i] = this.popups[this.popups.length - 1]!;
        this.popups.pop();
      }
    }
  }

  // ----- Layout -----

  /** Rebuilt when the view settles or rotates, and when the mode changes. */
  private ensureLayout(): void {
    const { w, h, insetTop, insetBottom } = this.host.view;
    const f = this.layoutFor;
    const key = `${this.mode}:${this.useKeypad}`;
    if (f.w === w && f.h === h && f.key === key) return;
    this.layoutFor = { w, h, key };

    const classic = this.mode === "classic";
    const top = insetTop + 58 + (classic ? LCD_HEADER + LCD_PAD + 4 : FRAME + 2);
    // Hyper keeps room under the board for BOOST and the lives row, and the
    // keypad needs a good deal more in either mode.
    const under = this.useKeypad ? (classic ? 172 : 204) : classic ? LCD_PAD + 12 : 84;
    const bottom = h - insetBottom - under;
    const side = classic ? LCD_PAD + 6 : FRAME + 3;
    const cell = Math.min((w - side * 2) / COLS, (bottom - top) / ROWS);
    this.layout = {
      cell,
      x0: (w - cell * COLS) / 2,
      y0: top + (bottom - top - cell * ROWS) / 2,
    };
  }

  // ----- Render -----

  render(ctx: CanvasRenderingContext2D): void {
    this.ensureLayout();
    const { w, h, insetTop } = this.host.view;
    const highContrast = this.host.settings.highContrast;

    drawNeonBackdrop(ctx, w, h);
    if (this.phase === "choosing") {
      // Sits in the upper part of the screen, clear of the mode buttons, and
      // moves down on a tall phone rather than leaving a hole in the middle.
      const top = Math.max(insetTop + 74, h * 0.37 - 120);
      drawTitleCard(ctx, w, top, this.time, highContrast);
      return;
    }
    if (this.mode === "classic") this.renderClassic(ctx, highContrast);
    else this.renderHyper(ctx, highContrast);
  }

  private renderClassic(ctx: CanvasRenderingContext2D, highContrast: boolean): void {
    const layout = this.layout;
    drawLcdPanel(ctx, layout, highContrast);
    drawLcdHeader(
      ctx,
      layout,
      this.host.score,
      classicLevel(this.foodEaten),
      this.bonus ? classicBonusValue(this.bonus.left) : null,
      highContrast,
    );
    if (this.food) drawLcdFood(ctx, layout, this.food, highContrast);
    if (this.bonus) drawLcdBonus(ctx, layout, this.bonus.cell, highContrast);

    // The original's death: the snake just blinks at you.
    const blink = this.phase === "dying" && Math.floor(this.phaseTimer * 7) % 2 === 0;
    if (!blink) drawLcdSnake(ctx, layout, this.snake, highContrast);

    for (const popup of this.popups) {
      drawPopup(ctx, popup.x, popup.y, popup.text, popup.life * 2, popup.colour);
    }
    if (this.phase === "ready") drawLcdBanner(ctx, layout, "READY", highContrast);
  }

  private renderHyper(ctx: CanvasRenderingContext2D, highContrast: boolean): void {
    const layout = this.layout;
    const { h, insetBottom } = this.host.view;

    drawNeonBoard(ctx, layout);
    drawGoalPips(ctx, layout, this.stageEaten, this.stage.target);
    for (const laser of this.stage.lasers) {
      const phase = this.phase === "cleared" ? "off" : laserPhase(this.stage, laser, this.stageTime);
      drawLaser(ctx, layout, laser, phase, this.time);
    }
    drawCrates(ctx, layout, this.stage);
    if (this.food) drawApple(ctx, layout, this.food, this.time);
    if (this.pickup) {
      // Blink for the last couple of seconds so it doesn't just vanish.
      const fading = this.pickup.life < 2.2 && Math.floor(this.time * 8) % 2 === 0;
      if (!fading) drawPickup(ctx, layout, this.pickup.kind, this.pickup.cell, this.time);
    }

    const gone = this.phase === "dying" && Math.floor(this.phaseTimer * 9) % 2 === 0;
    if (!gone) {
      drawNeonSnake(ctx, layout, this.snake, {
        alpha: this.phase === "playing" ? Math.min(1, this.stepClock) : 1,
        boosting: this.boosting && this.phase === "playing",
        shielded: this.shielded,
        magnet: this.magnetLeft > 0,
        highContrast,
        time: this.time,
      });
    }

    this.particles.render(ctx);
    for (const popup of this.popups) {
      drawPopup(ctx, popup.x, popup.y, popup.text, popup.life * 2, popup.colour);
    }

    drawStatus(
      ctx,
      16 + START_LIVES * 18 + 14,
      h - insetBottom - 22,
      this.shielded,
      this.magnetLeft,
      MAGNET_SECONDS,
    );

    if (this.phase === "ready") {
      const left = this.stage.target - this.stageEaten;
      drawNeonBanner(ctx, layout, `STAGE ${this.stage.number}`, `EAT ${left} APPLE${left === 1 ? "" : "S"}`);
    } else if (this.phase === "cleared") {
      drawNeonBanner(ctx, layout, "STAGE CLEAR", `BONUS +${this.clearBonus}`);
    }
  }

  // ----- Shell hooks -----

  hud(): HudState {
    if (this.mode === "classic" || this.phase === "choosing") {
      const length = this.phase === "choosing" ? 0 : this.snake.body.length;
      return { lives: 0, progress: length, progressLabel: "Length" };
    }
    return { lives: Math.max(0, this.lives), progress: this.stage.number, progressLabel: "Stage" };
  }

  private releaseBoost(): void {
    this.boostHeld = false;
    this.boostKey = false;
    this.boostButton.classList.remove("is-held");
  }

  onPause(): void {
    this.releaseBoost();
  }

  onResume(): void {
    this.releaseBoost();
    this.swipeX = 0;
    this.swipeY = 0;
  }

  /** The title card has nothing moving that a pause would protect. */
  pausesWhenHidden(): boolean {
    return this.phase !== "choosing";
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}

const sameCell = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;

function loadLastMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "hyper" ? "hyper" : "classic";
  } catch {
    return "classic";
  }
}

function loadKeypad(): boolean {
  try {
    return localStorage.getItem(KEYPAD_KEY) === "1";
  } catch {
    return false;
  }
}

function saveKeypad(on: boolean): void {
  try {
    localStorage.setItem(KEYPAD_KEY, on ? "1" : "0");
  } catch {
    // Storage disabled -- the choice just won't be remembered.
  }
}

function saveLastMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage disabled -- the chooser just won't remember.
  }
}

export const snakeModule: GameModule = {
  id: GAME_ID,
  title: "JB'S HYPER SNAKE",
  shortTitle: "SNAKE",
  progressShort: "ST",
  blurb: "Swipe or use the keypad. The old phone's snake, or the neon one with lasers.",
  accent: "#ff5247",
  extraBoard: { id: CLASSIC_BOARD, label: "CLASSIC", progressShort: "LEN" },

  drawIcon(ctx, size) {
    drawSnakeIcon(ctx, size);
  },

  drawLifeIcon(ctx, highContrast) {
    drawSnakeLifeIcon(ctx, highContrast);
  },

  create(host: GameHost): GameInstance {
    return new HyperSnake(host);
  },
};

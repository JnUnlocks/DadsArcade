/**
 * FOREST DASH -- a one-thumb race through a glowing mushroom forest.
 *
 * Pick an animal and a course, then race Pip the squirrel and the runs the
 * rest of the family has set on that course.
 *
 * The rules that make it work on a phone:
 *
 *   - You never steer. Your animal runs on its own; the one button is jump,
 *     and holding it after the top of the jump is a glide. Anyone who can tap
 *     can play, and the skill is entirely in timing.
 *   - Nothing ends the race. A pit costs you a second or two and puts you
 *     back a few steps earlier; a log trips you and you lose speed. A bad run
 *     is slow, never over, so a child always gets to the finish line.
 *   - The other racers play by your rules. Pip is a recording of a computer
 *     player running this exact course on this exact physics, played back a
 *     touch slower than it ran. The family's racers are their own button
 *     presses, replayed on the same course. Nobody does anything you can't.
 *   - The family doesn't have to be playing at the same time. Each device's
 *     fastest run of a course is saved, and shows up in everyone else's next
 *     race on it (see ghosts.ts). Your own fastest runs beside you too, faint,
 *     as something to chase.
 *   - There is a new course every day, the same for everyone (see daily.ts).
 */

import { STEP } from "../../core/loop.ts";
import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
  StartOptions,
} from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { Particles } from "../../core/particles.ts";
import { dailyKey } from "../../core/rng.ts";
import { loadVisitorId, markDailySeen } from "../../core/storage.ts";
import { CAST, characterById, type Character } from "./cast.ts";
import { dailyCourse } from "./daily.ts";
import {
  bestRun,
  bestTime,
  dropOldDailies,
  fetchGhosts,
  fetchRacers,
  fetchTimes,
  loadChoices,
  recordRun,
  resendAll,
  saveChoices,
  sendBest,
  type Opponents,
} from "./ghosts.ts";
import {
  Camera,
  drawBanner,
  drawCourse,
  drawForestDashIcon,
  drawRaceBar,
  drawRacer,
  drawSky,
  drawSquirrel,
  drawTag,
  PALETTE,
  WORLD_SCALE,
} from "./render.ts";
import {
  createRacer,
  InputRecorder,
  paceFinishTime,
  poseOf,
  RACER_HALF_W,
  recordBotRun,
  replayRun,
  RULES_VERSION,
  sampleRun,
  stepRacer,
  type Racer,
  type RecordedRun,
} from "./rules.ts";
import { courseKey, COURSES, type Course, type Track } from "./track.ts";
import "./forestdash.css";

const GAME_ID = "forest-dash";

/**
 * How fast Pip runs, as a fraction of a clean computer run.
 *
 * At 0.9 he finishes about four seconds behind a clean run, so a first-timer
 * who falls once or twice will usually lose to him and a second try usually
 * won't. The plan's easy, medium and fast racers are this number at three
 * settings.
 */
const RIVAL_PACE = 0.9;

/** Seconds for each beat of READY, 3, 2, 1. */
const COUNT_BEAT = 0.6;
/** How long the finish line celebration runs before the results screen. */
const FINISH_SECONDS = 2.2;

/** Where your racer stands on screen, in screen units from the left edge. */
const FOX_SCREEN_X = 80;

const ACORN_POINTS = 10;

const PLACES = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH"];

/**
 * The course of the race just run, so PLAY AGAIN can go straight back to it.
 * Kept here rather than on the instance because PLAY AGAIN makes a new one.
 */
let lastCourseId: string | null = null;

type Phase = "choosing" | "countdown" | "racing" | "finished" | "over";

/** Someone else on the course: Pip, one of the family's runs, or your own best. */
interface Rival {
  name: string;
  /** Null for Pip, who is drawn as the squirrel he is. */
  character: Character | null;
  color: string;
  run: RecordedRun;
  pace: number;
  finishTime: number;
  /**
   * True for your own fastest run. It's there to chase, not to beat: it's
   * drawn fainter and doesn't count towards your place, or every race you
   * didn't set a new best in would be a race you "lost".
   */
  pacer: boolean;
}

export class ForestDash implements GameInstance {
  private readonly host: GameHost;
  private readonly root: HTMLElement;
  private readonly cam = new Camera();
  private readonly particles = new Particles();
  private readonly taken = new Set<number>();
  /** Today's course first, then the four that are always there. */
  private readonly courses: readonly Course[];
  private readonly daily: Course;

  private character: Character;
  private opponents: Opponents;
  private course: Course;
  private track: Track;
  private key: string;
  private fox: Racer;
  private rivals: Rival[] = [];
  private recorder = new InputRecorder();

  private phase: Phase = "choosing";
  private countdown = COUNT_BEAT * 4;
  /** Seconds since the start gun. */
  private raceTime = 0;
  /** Seconds since the game opened, for animation. */
  private time = 0;
  private finishTime = 0;
  private finishTimer = 0;
  private newBest = false;
  private wasHeld = false;
  private lastBeat = -1;
  /** A tip shown after a fall, and how much longer it stays up. */
  private hint = "";
  private hintTimer = 0;
  private falls = 0;

  // Assigned explicitly rather than via parameter properties, so Node's type
  // stripping can load this file in tests, as with the other games.
  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.daily = dailyCourse();
    this.courses = [this.daily, ...COURSES];
    dropOldDailies(`${this.daily.id}-`);

    const choices = loadChoices();
    this.character = characterById(choices.character);
    this.opponents = choices.opponents;
    this.course = this.courses.find((c) => c.id === choices.course) ?? COURSES[0]!;
    this.track = this.course.build();
    this.key = this.keyOf(this.course, this.track);
    this.fox = createRacer(this.track.startX);
    this.root = document.createElement("div");
    this.root.className = "fd-root";

    // PLAY AGAIN: the same course, straight to the start line.
    const again = start?.again ? this.courses.find((c) => c.id === lastCourseId) : undefined;
    if (again) this.begin(again);
    else this.buildChooser();
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  /** Nothing moves on the title card or once the race is over. */
  pausesWhenHidden(): boolean {
    return this.phase !== "choosing" && this.phase !== "over";
  }

  private keyOf(course: Course, track: Track): string {
    return courseKey(course.id, track, RULES_VERSION);
  }

  private remember(): void {
    saveChoices(this.character.id, this.course.id, this.opponents);
  }

  // ----- Title card -----

  /**
   * Pick an animal and who to race, then tap a course to race it. All three
   * are remembered, so the second race of the day is one tap.
   */
  private buildChooser(): void {
    const panel = document.createElement("div");
    panel.className = "fd-panel";

    // A device nobody has put initials on would show up in the family's races
    // as "FOX". Asked for here, not demanded: the courses below still work.
    if (this.host.initials === null) {
      const who = document.createElement("div");
      who.className = "fd-who";
      const why = document.createElement("p");
      why.className = "fd-hint";
      why.textContent = "Add your initials so the family can see who they're racing.";
      who.append(
        why,
        this.host.initialsPrompt("SAVE", (initials) => {
          // Runs saved before now are on the server with no name.
          void resendAll(loadVisitorId(), initials);
          this.buildChooser();
        }),
      );
      panel.append(who);
    }

    const cast = document.createElement("div");
    cast.className = "fd-cast";
    const animals = CAST.map((who) => {
      const button = document.createElement("button");
      button.className = "fd-animal";
      const art = document.createElement("canvas");
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      art.width = 56 * dpr;
      art.height = 50 * dpr;
      const ctx = art.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        drawRacer(ctx, 30, 46, "run", 0.1, who);
      }
      const name = document.createElement("span");
      name.textContent = who.name;
      button.append(art, name);
      button.addEventListener("click", () => {
        this.character = who;
        this.remember();
        this.host.sfx("uiMove");
        markAnimal();
      });
      return { who, button };
    });
    const markAnimal = () => {
      for (const { who, button } of animals) {
        button.setAttribute("aria-pressed", String(who === this.character));
      }
    };
    markAnimal();
    cast.append(...animals.map((a) => a.button));

    const courses = document.createElement("div");
    courses.className = "fd-courses";
    for (const course of this.courses) {
      const button = document.createElement("button");
      button.className = "fd-course";
      if (course === this.daily) button.classList.add("fd-course--daily");
      if (course === this.course) button.classList.add("is-last");
      const name = document.createElement("span");
      name.className = "fd-course__name";
      name.textContent = course.name;
      const blurb = document.createElement("span");
      blurb.className = "fd-course__blurb";
      blurb.textContent = course.blurb;
      button.append(name, blurb);
      const best = bestTime(this.keyOf(course, course.build()));
      if (best !== null) {
        const record = document.createElement("span");
        record.className = "fd-course__best";
        record.textContent = `YOUR BEST ${formatTime(best / 1000)}`;
        button.append(record);
      }
      button.addEventListener("click", () => this.begin(course));
      courses.append(button);
    }

    const times = document.createElement("button");
    times.className = "fd-link";
    times.textContent = "FASTEST TIMES";
    times.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.buildTimes(this.course);
    });

    const hint = document.createElement("p");
    hint.className = "fd-hint";
    hint.textContent = "Pick your racer, then tap a course to start.";

    panel.append(cast, this.buildOpponents(), courses, times, hint);
    this.root.replaceChildren(panel);
  }

  /**
   * Who joins your race: the fastest few, the few nearest your own time, or
   * one person. The people are whoever else has a saved run, so their chips
   * arrive a moment after the card does, and not at all with no signal.
   */
  private buildOpponents(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "fd-against";
    const label = document.createElement("span");
    label.className = "fd-label";
    label.textContent = "RACE AGAINST";
    const chips = document.createElement("div");
    chips.className = "fd-chips";
    wrap.append(label, chips);

    const buttons = new Map<Opponents, HTMLButtonElement>();
    const mark = () => {
      for (const [value, chip] of buttons) {
        chip.setAttribute("aria-pressed", String(value === this.opponents));
      }
    };
    const add = (value: Opponents, text: string) => {
      if (buttons.has(value)) return;
      const chip = document.createElement("button");
      chip.className = "fd-chip";
      chip.textContent = text;
      chip.addEventListener("click", () => {
        this.opponents = value;
        this.remember();
        this.host.sfx("uiMove");
        mark();
      });
      buttons.set(value, chip);
      chips.append(chip);
    };
    add("fastest", "FASTEST");
    add("near", "NEAR MY TIME");
    // The person picked last time keeps their chip even before the list
    // arrives, so the card never shows nothing selected.
    if (this.opponents !== "fastest" && this.opponents !== "near") {
      add(this.opponents, this.opponents);
    }
    mark();

    void fetchRacers(loadVisitorId()).then((racers) => {
      for (const initials of racers) add(initials, initials);
      mark();
    });
    return wrap;
  }

  /** The fastest times on each course, one row per device. */
  private buildTimes(selected: Course): void {
    const panel = document.createElement("div");
    panel.className = "fd-panel fd-times";

    const title = document.createElement("h3");
    title.className = "fd-times__title";
    title.textContent = "FASTEST TIMES";

    const chips = document.createElement("div");
    chips.className = "fd-chips";
    const list = document.createElement("div");
    list.className = "fd-times__list";

    const say = (text: string) => {
      const p = document.createElement("p");
      p.className = "fd-hint";
      p.textContent = text;
      list.replaceChildren(p);
    };

    // A reply only draws if its course is still the one chosen.
    let showing: Course | null = null;
    const show = (course: Course) => {
      showing = course;
      for (const [c, chip] of buttons) chip.setAttribute("aria-pressed", String(c === course));
      say("Loading…");
      void fetchTimes(this.keyOf(course, course.build()), loadVisitorId()).then((rows) => {
        if (showing !== course) return;
        if (rows === null) return say("Can't reach the times right now.");
        if (rows.length === 0) return say("Nobody has finished this one yet. Go set the time.");
        list.replaceChildren(
          ...rows.map((row, i) => {
            const line = document.createElement("div");
            line.className = "fd-time";
            if (row.isYou) line.classList.add("is-you");
            const animal = characterById(row.character);
            const cells = [
              String(i + 1).padStart(2, "0"),
              row.initials || "???",
              animal.name,
              formatTime(row.timeMs / 1000),
            ];
            for (const text of cells) {
              const cell = document.createElement("span");
              cell.textContent = text;
              line.append(cell);
            }
            return line;
          }),
        );
      });
    };

    const buttons = new Map<Course, HTMLButtonElement>();
    for (const course of this.courses) {
      const chip = document.createElement("button");
      chip.className = "fd-chip";
      chip.textContent = course.short;
      chip.addEventListener("click", () => {
        this.host.sfx("uiMove");
        show(course);
      });
      buttons.set(course, chip);
      chips.append(chip);
    }

    const back = document.createElement("button");
    back.className = "fd-link";
    back.textContent = "BACK";
    back.addEventListener("click", () => {
      this.host.sfx("uiMove");
      this.buildChooser();
    });

    panel.append(title, chips, list, back);
    this.root.replaceChildren(panel);
    show(selected);
  }

  private begin(course: Course): void {
    if (this.phase !== "choosing") return;
    this.course = course;
    this.track = course.build();
    this.key = this.keyOf(course, this.track);
    this.fox = createRacer(this.track.startX);
    this.remember();
    lastCourseId = course.id;
    if (course === this.daily) markDailySeen(GAME_ID, dailyKey());
    this.root.replaceChildren();
    this.host.sfx("uiSelect");

    const pip = recordBotRun(this.track, STEP);
    this.rivals = [
      {
        name: "PIP",
        character: null,
        color: PALETTE.squirrel,
        run: pip,
        pace: RIVAL_PACE,
        finishTime: paceFinishTime(pip, RIVAL_PACE),
        pacer: false,
      },
    ];

    // Your own fastest run here, to chase.
    const mine = bestRun(this.key);
    if (mine) {
      const run = replayRun(this.track, STEP, mine.log);
      if (Number.isFinite(run.finishTime)) {
        const character = characterById(mine.character);
        this.rivals.push({
          name: "BEST",
          character,
          color: character.body,
          run,
          pace: 1,
          finishTime: run.finishTime,
          pacer: true,
        });
      }
    }

    this.phase = "countdown";
    this.countdown = COUNT_BEAT * 4;

    const deviceId = loadVisitorId();
    const key = this.key;
    const track = this.track;
    // A fast run from an earlier race that never reached the server.
    void sendBest(key, deviceId, this.host.initials ?? "");
    // The family joins on the start line or not at all: a racer appearing
    // halfway round would be a racer you could never have been ahead of.
    void fetchGhosts(key, deviceId, this.opponents, mine?.timeMs ?? null).then((ghosts) => {
      if (this.phase !== "countdown" || this.key !== key) return;
      for (const ghost of ghosts) {
        const run = replayRun(track, STEP, ghost.log);
        // A run that doesn't finish here wasn't made on this course.
        if (!Number.isFinite(run.finishTime)) continue;
        const character = characterById(ghost.character);
        this.rivals.push({
          name: ghost.initials || character.name,
          character,
          color: character.body,
          run,
          pace: 1,
          finishTime: run.finishTime,
          pacer: false,
        });
      }
    });
  }

  // ----- Loop -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.hintTimer > 0) this.hintTimer -= dt;

    if (this.phase === "choosing") {
      this.follow(dt);
      return;
    }

    // One button: a touch anywhere, or Space, Z, J, Up or W on a keyboard.
    // Every one of them can be held to glide.
    const up = input.axisY < 0;
    const held = input.pointerDown || up || input.fireHeld;
    const pressed = input.justPressed || (held && !this.wasHeld);
    this.wasHeld = held;

    if (this.phase === "countdown") {
      this.countdown -= dt;
      const beat = Math.ceil(this.countdown / COUNT_BEAT);
      if (beat !== this.lastBeat && beat >= 1 && beat <= 3) this.host.sfx("uiMove");
      this.lastBeat = beat;
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.host.sfx("waveStart");
      }
      this.follow(dt);
      return;
    }

    if (this.phase === "over") return;

    this.raceTime += dt;
    const controls =
      this.phase === "racing" ? { pressed, held } : { pressed: false, held: false };
    // Every step of the race goes in the recording, and nothing after it:
    // that's what lets the run be replayed to the same finish elsewhere.
    if (this.phase === "racing") this.recorder.push(controls);
    for (const event of stepRacer(this.fox, this.track, controls, dt)) this.onEvent(event);
    this.collectAcorns();

    if (this.phase === "racing" && this.fox.x >= this.track.finishX) {
      this.finishTime = this.raceTime;
      this.phase = "finished";
      this.finishTimer = FINISH_SECONDS;
      this.host.sfx(this.place() === 1 ? "dashFinish" : "lockMiss");
      this.burst(this.track.finishX, 60, PALETTE.finish, 28, 120);
      this.keepRun();
    }

    if (this.phase === "finished") {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.end();
    }

    this.follow(dt);
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const { view, settings } = this.host;
    const reduced = settings.reducedMotion;
    const cam = this.cam;
    // On the title card the forest floor sits higher up, so the animal
    // you've picked stands above the buttons instead of behind them.
    cam.floor = view.h * (this.phase === "choosing" ? 0.3 : 0.76);

    drawSky(ctx, view.w, view.h, cam, this.time, reduced);
    drawCourse(ctx, this.track, cam, view.w, view.h, this.time, this.taken, reduced);

    const span = this.track.finishX - this.track.startX;
    const dots: Array<{ at: number; color: string }> = [];
    for (const [i, rival] of this.rivals.entries()) {
      const at = this.rivalAt(rival);
      // Everyone starts from the same spot, so on the start line the others
      // are drawn lined up behind you, and close up as the race gets going.
      // Their name tags sit at different heights so two together can be read.
      // Spaced so that even a full field still fits between you and the edge.
      const spacing = Math.min(26, (FOX_SCREEN_X - 12) / this.rivals.length);
      const lineUp = (i + 1) * spacing * Math.max(0, 1 - this.raceTime / 0.8);
      const rx = cam.sx(at.x) - lineUp;
      const ry = cam.sy(at.y);
      const tagY = ry - (rival.character ? 38 : 34) - i * 13;
      if (rival.character) {
        // See-through, so your own racer is never hidden behind one -- and
        // your own best fainter still, so it reads as a shadow, not a racer.
        const alpha = rival.pacer ? 0.45 : 0.8;
        drawRacer(ctx, rx, ry, at.pose, this.raceTime, rival.character, alpha);
      } else {
        drawSquirrel(ctx, rx, ry, at.pose, this.time);
      }
      if (at.pose !== "gone" && rx > -20 && rx < view.w + 20) {
        drawTag(ctx, rx, tagY, rival.name, rival.color);
      }
      dots.push({ at: (at.x - this.track.startX) / span, color: rival.color });
    }

    drawRacer(
      ctx,
      cam.sx(this.fox.x),
      cam.sy(this.fox.y),
      poseOf(this.fox),
      this.fox.stride,
      this.character,
    );

    ctx.save();
    ctx.translate(-cam.x * WORLD_SCALE, cam.floor + cam.y * WORLD_SCALE);
    this.particles.render(ctx);
    ctx.restore();

    if (this.phase === "choosing") return;

    drawRaceBar(
      ctx,
      view.w,
      view.insetTop + 58,
      formatTime(this.phase === "countdown" ? 0 : this.shownTime()),
      { at: (this.fox.x - this.track.startX) / span, color: this.character.body },
      dots,
    );

    const mid = view.insetTop + (cam.floor - view.insetTop) * 0.42;
    if (this.phase === "countdown") {
      const beat = Math.ceil(this.countdown / COUNT_BEAT);
      drawBanner(ctx, view.w, mid, beat >= 4 ? "READY" : String(beat), beat >= 4 ? 30 : 46);
      drawBanner(ctx, view.w, mid + 40, "TAP TO JUMP · HOLD TO GLIDE", 11);
    } else if (this.phase === "racing" && this.raceTime < 0.7) {
      drawBanner(ctx, view.w, mid, "GO!", 46);
    } else if (this.phase === "racing" && this.hintTimer > 0) {
      drawBanner(ctx, view.w, mid, this.hint, 12);
    } else if (this.phase === "finished") {
      const won = this.place() === 1;
      drawBanner(ctx, view.w, mid, won ? "YOU WIN!" : `${this.winner().name} WINS!`, 34);
      drawBanner(ctx, view.w, mid + 36, formatTime(this.finishTime), 18);
      if (this.newBest) drawBanner(ctx, view.w, mid + 62, "YOUR BEST YET", 12);
    }
  }

  hud(): HudState {
    return { lives: 0, progress: this.place(), progressLabel: "Place" };
  }

  // ----- Race -----

  private shownTime(): number {
    return this.phase === "racing" ? this.raceTime : this.finishTime;
  }

  private rivalAt(rival: Rival) {
    if (this.phase === "choosing" || this.phase === "countdown") {
      return { x: this.track.startX, y: 0, pose: "run" as const };
    }
    return sampleRun(rival.run, STEP, this.raceTime, rival.pace);
  }

  /** Where you are in the race: 1 plus everyone ahead of you. */
  private place(): number {
    const done = this.phase === "finished" || this.phase === "over";
    let ahead = 0;
    for (const rival of this.rivals) {
      if (rival.pacer) continue;
      if (done ? rival.finishTime < this.finishTime : this.rivalAt(rival).x > this.fox.x) {
        ahead += 1;
      }
    }
    return 1 + ahead;
  }

  /** The fastest of the other racers. Pip is always one, so there always is one. */
  private winner(): Rival {
    return this.rivals
      .filter((r) => !r.pacer)
      .reduce((a, b) => (b.finishTime < a.finishTime ? b : a));
  }

  /**
   * Save this run if it's your fastest here, for the family to race.
   *
   * It's replayed first, and kept only if the replay finishes when you did:
   * a recording that doesn't reproduce the run would put a racer on someone
   * else's screen doing something you never did.
   */
  private keepRun(): void {
    const log = this.recorder.log;
    const replay = replayRun(this.track, STEP, log);
    if (Math.abs(replay.finishTime - this.finishTime) > 0.05) return;
    const timeMs = Math.round(this.finishTime * 1000);
    this.newBest = recordRun(this.key, timeMs, log, this.character.id);
    void sendBest(this.key, loadVisitorId(), this.host.initials ?? "");
  }

  private end(): void {
    this.phase = "over";
    const place = this.place();
    this.host.gameOver({
      progress: place,
      progressLabel: "Place",
      headline: `${PLACES[place - 1] ?? `${place}TH`} PLACE · ${formatTime(this.finishTime)}`,
      // The race clock, not the time since the game opened: the shell's
      // clock also counts the title card, the countdown and the celebration.
      durationMs: Math.round(this.finishTime * 1000),
      ranked: false,
      // PLAY AGAIN is the same course again; this is the way back to the card.
      changeLabel: "CHANGE COURSE",
    });
  }

  private onEvent(event: string): void {
    const f = this.fox;
    switch (event) {
      case "jump":
        this.host.sfx("dashJump");
        break;
      case "bounce":
        this.host.sfx("dashBounce");
        this.burst(f.x, f.y, PALETTE.capPink, 12, 80);
        break;
      case "trip":
        this.host.sfx("dashTrip");
        this.host.shake(2);
        this.burst(f.x + RACER_HALF_W, f.y + 10, PALETTE.logRing, 8, 60);
        break;
      case "fall":
        this.host.sfx("frogSplat");
        this.falls += 1;
        this.hintAfterFall();
        break;
      case "respawn":
        this.burst(f.x, f.y + 10, PALETTE.glow, 14, 70);
        break;
    }
  }

  /**
   * A pit you keep falling into is the one place this game could stop being
   * "slow, never over", so after a fall it says what that pit wants.
   */
  private hintAfterFall(): void {
    const x = this.fox.x;
    const updraft = this.track.updrafts.some((u) => x > u.x0 - 400 && x < u.x1 + 300);
    if (updraft) this.hint = "HOLD IN THE GLOW TO FLOAT UP";
    else if (this.falls <= 2) this.hint = "HOLD AFTER A JUMP TO GLIDE";
    else return;
    this.hintTimer = 3.5;
  }

  private collectAcorns(): void {
    const f = this.fox;
    if (f.respawnTimer > 0) return;
    for (let i = 0; i < this.track.acorns.length; i += 1) {
      if (this.taken.has(i)) continue;
      const a = this.track.acorns[i]!;
      if (Math.abs(a.x - f.x) < RACER_HALF_W + 6 && Math.abs(a.y - (f.y + 14)) < 22) {
        this.taken.add(i);
        this.host.addScore(ACORN_POINTS);
        this.host.sfx("dashAcorn");
        this.burst(a.x, a.y, PALETTE.acorn, 6, 50);
      }
    }
  }

  /** Particles live in world space, so they stay put as the forest scrolls. */
  private burst(wx: number, wy: number, color: string, count: number, power: number): void {
    this.particles.burst(wx * WORLD_SCALE, -wy * WORLD_SCALE, color, count, power);
  }

  /**
   * Keep your racer at a fixed spot on screen, and only lift the view when
   * it's thrown higher than an ordinary jump -- a camera that bobs on every
   * jump makes the ground you're aiming for move too.
   */
  private follow(dt: number): void {
    this.cam.x = this.fox.x - FOX_SCREEN_X / WORLD_SCALE;
    const target = Math.max(0, this.fox.y - 140);
    this.cam.y += (target - this.cam.y) * Math.min(1, dt * 4);
  }
}

/** 42.37 seconds as "0:42.3". */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

export const forestDashModule: GameModule = {
  id: GAME_ID,
  title: "FOREST DASH",
  shortTitle: "FOREST",
  progressShort: "PL",
  blurb: "Race Pip and the family through the mushroom forest. Tap to jump, hold to glide.",
  howToPlay: [
    "Your animal runs on its own. Tap to jump.",
    "Keep holding after a jump to glide over wide gaps.",
    "Land on a big mushroom to bounce high.",
    "Hold in the glowing spores to float up.",
    "Logs, brambles and puddles slow you down. Falling in a pit pops you back a few steps. Nothing ends the race.",
    "The other racers are Pip and the family's saved runs. The faint one marked BEST is your own fastest run.",
  ],
  accent: "#ff5a6e",
  dailyWithoutBoard: true,
  // Still in family testing: the daily course is new and nobody has raced a
  // week of them yet.
  beta: true,

  drawIcon(ctx, size) {
    drawForestDashIcon(ctx, size);
  },

  create(host: GameHost, start?: StartOptions): GameInstance {
    return new ForestDash(host, start);
  },
};

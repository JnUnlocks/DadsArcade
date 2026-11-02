/**
 * REFLEX RUSH -- four short skill games behind one cabinet.
 *
 *   NEON SKYLINE  timing    stack the sliding block, as high as you can
 *   FLASH POINT   reaction  wait for GO, then tap
 *   ZAP DASH      accuracy  (coming)
 *   OVERDRIVE     speed     (coming)
 *
 * Like Brickfall's two games, opening the cabinet asks which, and PLAY AGAIN
 * goes straight back into the one just played. Each game is ranked on the
 * arcade's own scoreboard under its own name (GameModule.modeBoards): Neon
 * Skyline files on the cabinet's main board, Flash Point on a board of its
 * own, so a tower's points are never compared with a reaction time's.
 */

import type {
  GameHost,
  GameInstance,
  GameModule,
  HudState,
  StartOptions,
} from "../../core/game.ts";
import type { InputSnapshot } from "../../core/input.ts";
import { loadBests } from "../../core/storage.ts";
import { drawCity, drawReflexIcon, RR } from "./art.ts";
import { FLASH_BOARD, FlashPointGame } from "./flashGame.ts";
import { Presses, type Press } from "./presses.ts";
import { NeonSkylineGame } from "./skylineGame.ts";
import "./reflexrush.css";

const GAME_ID = "reflex-rush";
const MODE_KEY = "hyperdrive.reflexrush.mode";

type Mode = "skyline" | "flash";

interface Pick {
  mode: Mode | null;
  skill: string;
  name: string;
  pitch: string;
  colour: string;
  /** The key its personal best is kept under, if it has one yet. */
  bestKey?: string;
  best?: (score: number) => string;
}

const PICKS: readonly Pick[] = [
  {
    mode: "skyline",
    skill: "TIMING",
    name: "NEON SKYLINE",
    pitch: "Tap when the moving block lines up. Build as high as you can!",
    colour: RR.cyan,
    bestKey: GAME_ID,
    best: (score) => `YOUR BEST ${score}`,
  },
  {
    mode: "flash",
    skill: "REACTION",
    name: "FLASH POINT",
    pitch: "Wait for GO, then tap as fast as you can. Don't jump early!",
    colour: RR.yellow,
    bestKey: `${GAME_ID}:${FLASH_BOARD}`,
    best: (score) => `YOUR BEST ${score}`,
  },
  {
    mode: null,
    skill: "ACCURACY",
    name: "ZAP DASH",
    pitch: "Tap the energy orbs. Avoid the hazards! Coming soon.",
    colour: "#a77bff",
  },
  {
    mode: null,
    skill: "SPEED",
    name: "OVERDRIVE",
    pitch: "Tap to charge the reactor. How much power can you make? Coming soon.",
    colour: "#ff7a4d",
  },
];

interface Playing {
  update(dt: number, presses: readonly Press[]): void;
  render(ctx: CanvasRenderingContext2D): void;
  hud(): HudState;
  pausesWhenHidden(): boolean;
  onPause?(): void;
}

function loadLastMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "flash" ? "flash" : "skyline";
  } catch {
    return "skyline";
  }
}

function saveLastMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: PLAY AGAIN just won't remember.
  }
}

export class ReflexRush implements GameInstance {
  private readonly host: GameHost;
  private readonly root: HTMLElement;
  private readonly presses = new Presses();
  private playing: Playing | null = null;

  constructor(host: GameHost, start?: StartOptions) {
    this.host = host;
    this.root = document.createElement("div");
    this.root.className = "rr-root";
    if (start?.again) this.begin(loadLastMode(), false);
    else this.buildChooser();
  }

  private buildChooser(): void {
    const bests = loadBests();
    const panel = document.createElement("div");
    panel.className = "rr-panel";

    const head = document.createElement("div");
    head.className = "rr-head";
    const title = document.createElement("h2");
    title.className = "rr-head__title";
    title.textContent = "REFLEX RUSH";
    const tag = document.createElement("p");
    tag.className = "rr-head__tag";
    tag.textContent = "TIMING · REACTION · ACCURACY · SPEED";
    head.append(title, tag);

    const grid = document.createElement("div");
    grid.className = "rr-grid";
    for (const pick of PICKS) {
      const button = document.createElement("button");
      button.className = "rr-mode";
      button.style.setProperty("--mode", pick.colour);
      const skill = document.createElement("span");
      skill.className = "rr-mode__skill";
      skill.textContent = pick.skill;
      const name = document.createElement("span");
      name.className = "rr-mode__name";
      name.textContent = pick.name;
      const pitch = document.createElement("span");
      pitch.className = "rr-mode__pitch";
      pitch.textContent = pick.pitch;
      button.append(skill, name, pitch);

      const mode = pick.mode;
      if (mode === null) {
        button.disabled = true;
        button.setAttribute("aria-label", `${pick.name}, coming soon`);
      } else {
        const best = pick.bestKey ? (bests[pick.bestKey] ?? 0) : 0;
        if (best > 0 && pick.best) {
          const record = document.createElement("span");
          record.className = "rr-mode__best";
          record.textContent = pick.best(best);
          button.append(record);
        }
        button.addEventListener("click", () => this.begin(mode, true));
      }
      grid.append(button);
    }

    panel.append(head, grid);
    this.root.replaceChildren(panel);
  }

  private begin(mode: Mode, chosen: boolean): void {
    saveLastMode(mode);
    if (chosen) this.host.sfx("uiSelect");
    this.root.replaceChildren();
    // Whatever pressed the button that got us here doesn't count in the game.
    this.presses.take();
    const done = () => this.presses.pause();
    this.playing =
      mode === "flash"
        ? new FlashPointGame(this.host, this.root, done)
        : new NeonSkylineGame(this.host, done);
  }

  update(dt: number, _input: InputSnapshot): void {
    const presses = this.presses.take();
    this.playing?.update(dt, presses);
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    if (this.playing) {
      this.playing.render(ctx);
      return;
    }
    const { view } = this.host;
    drawCity(ctx, view.w, view.h, view.h * 0.62, 0);
  }

  hud(): HudState {
    return this.playing?.hud() ?? { lives: 0, progress: 0, progressLabel: "" };
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  pausesWhenHidden(): boolean {
    return this.playing?.pausesWhenHidden() ?? false;
  }

  onPause(): void {
    this.presses.pause();
    this.playing?.onPause?.();
  }

  onResume(): void {
    this.presses.resume();
  }

  destroy(): void {
    this.presses.destroy();
  }
}

export const reflexRushModule: GameModule = {
  id: GAME_ID,
  title: "REFLEX RUSH",
  shortTitle: "REFLEX",
  progressShort: "FL",
  blurb: "Four quick skill games. Stack the neon tower, or wait for GO and tap.",
  howToPlay: [
    "Pick a game from the four. PLAY AGAIN goes straight back into the one you just played.",
    "NEON SKYLINE: tap, Space or Enter when the sliding block lines up with the one below.",
    "NEON SKYLINE: whatever hangs over is cut off. Land it dead on for a PERFECT, and three in a row win width back.",
    "FLASH POINT: wait for the yellow GO, then tap as fast as you can. Tapping during WAIT is a false start.",
    "FLASH POINT: five tries. Each GO is worth 1,000 points, less one for every millisecond you take.",
    "Timings depend a little on your phone and screen, so compare them on the same device.",
  ],
  accent: "#2ee6ff",
  // Tried on dev by the family and finished: NEW for two weeks.
  newUntil: "2026-11-16",
  modeBoards: {
    main: { title: "NEON SKYLINE", shortTitle: "SKYLINE", accent: RR.cyan, progressShort: "FL" },
    others: [
      {
        id: FLASH_BOARD,
        title: "FLASH POINT",
        shortTitle: "FLASH",
        accent: RR.yellow,
        progressShort: "MS",
      },
    ],
  },

  drawIcon(ctx, size) {
    drawReflexIcon(ctx, size);
  },

  create(host: GameHost, start?: StartOptions): GameInstance {
    return new ReflexRush(host, start);
  },
};

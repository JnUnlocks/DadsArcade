/**
 * The contract between the arcade shell and an individual game.
 *
 * The shell owns everything that isn't gameplay: the loop, pause, audio,
 * scoring, the leaderboard, the HUD chrome, safe areas. A game implements two
 * methods and reports what it did. Adding Snake -- or a truck game, or a word
 * game -- means writing one file in `src/games/` and adding one line to the
 * registry, with no changes to the shell.
 */

import type { InputSnapshot } from "./input";
import type { SoundName } from "./audio";
import type { Settings } from "./storage";
import type { View } from "./view";

/** Services the shell provides to a running game. */
export interface GameHost {
  readonly view: View;
  readonly settings: Readonly<Settings>;

  /** Current run's score. */
  readonly score: number;

  /** Play a sound effect (a no-op if audio is muted or unavailable). */
  sfx(name: SoundName): void;

  /** Award points. The shell tracks the running total and personal bests. */
  addScore(points: number): void;

  /**
   * Kick the camera. `strength` is in virtual units of maximum displacement;
   * the shell honours the player's reduced-motion setting.
   */
  shake(strength: number): void;

  /**
   * Freeze the simulation for a few frames on a big impact. This is the single
   * cheapest trick for making hits feel like they landed.
   */
  hitStop(seconds: number): void;

  /** End the run. The shell handles scoring, leaderboard submission and UI. */
  gameOver(summary: RunSummary): void;
}

/** What a game reports when a run ends. */
export interface RunSummary {
  /** How far the player got -- wave, level, length, whatever the game counts. */
  progress: number;
  /** Label for that number in the UI, e.g. "Wave" or "Length". */
  progressLabel: string;
}

/** Values the shell paints into the HUD each frame. */
export interface HudState {
  lives: number;
  progress: number;
  progressLabel: string;
}

export interface GameInstance {
  update(dt: number, input: InputSnapshot): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
  hud(): HudState;

  /** Optional hooks for games that need to react to the pause overlay. */
  onPause?(): void;
  onResume?(): void;
}

export interface GameModule {
  /** Stable id -- used as the leaderboard key, so never change it once live. */
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  /** Accent colour for this game's cabinet in the arcade menu. */
  readonly accent: string;
  /** Draw the cabinet's marquee art into a size x size box at the origin. */
  drawIcon(ctx: CanvasRenderingContext2D, size: number): void;
  create(host: GameHost): GameInstance;
}

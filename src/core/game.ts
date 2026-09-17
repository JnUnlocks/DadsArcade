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
import type { Track } from "./music";
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

  /**
   * Start a looping track, and stop it. Safe to call before the first user
   * gesture has unlocked audio -- the shell starts it once there's somewhere
   * to play it. A game that starts music owns stopping it in destroy().
   */
  playMusic(track: Track): void;
  stopMusic(): void;
  /** Nudge the tempo without re-pitching, e.g. as the level climbs. */
  setMusicTempo(scale: number): void;

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

  /**
   * Which leaderboard this run belongs on. Defaults to the game's main board.
   *
   * This is what makes a seeded challenge possible: a run of the same game can
   * be filed under `daily-2026-09-06` so it's only ever compared against other
   * people playing that exact set of orders, rather than muddled in with the
   * all-time board.
   */
  boardId?: string;

  /**
   * False for a run that shouldn't be scored at all -- a sandbox or practice
   * mode. The shell skips submission entirely rather than posting a zero and
   * polluting the board with runs that were never a competition.
   */
  ranked?: boolean;

  /** Replaces "GAME OVER" -- for modes where losing isn't a concept. */
  headline?: string;
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

  /**
   * Release anything the garbage collector won't -- observers, timers,
   * listeners on nodes outside the game's own subtree. Called when the run
   * ends or the player quits to the arcade.
   */
  destroy?(): void;

  /**
   * Extra DOM control(s) a game needs beyond the shared pause button -- a
   * fire trigger, for instance. Mounted once when the game starts; the game
   * owns the returned element and may mutate it directly from its own
   * update() as state changes (e.g. a shell counter).
   */
  extraControls?(): HTMLElement;
}

export interface GameModule {
  /** Stable id -- used as the leaderboard key, so never change it once live. */
  readonly id: string;
  readonly title: string;
  /**
   * A short name for tight spaces -- the game filter on the high-score screen.
   * Defaults to `title`, which is too long for a chip on a phone for most games.
   */
  readonly shortTitle?: string;
  /**
   * Abbreviation for this game's progress number on a score row, e.g. "LV" for
   * Level or "RD" for Round. Defaults to "W". Every row used to say "W6"
   * whatever the game, which is Starfighter's wave and meaningless elsewhere.
   */
  readonly progressShort?: string;
  readonly blurb: string;
  /** Accent colour for this game's cabinet in the arcade menu. */
  readonly accent: string;
  /**
   * True when this game files some runs under a per-day board, which tells the
   * leaderboard screen to offer the "TODAY" tab. Games without one never show
   * an empty tab.
   */
  readonly hasDailyChallenge?: boolean;
  /** Draw the cabinet's marquee art into a size x size box at the origin. */
  drawIcon(ctx: CanvasRenderingContext2D, size: number): void;
  /**
   * Draw one "lives remaining" pip into a ~10x10 box centered at the origin.
   * Optional -- games that don't supply one get the default ship glyph. A
   * shooter's lives are ships; a shotgun game's are shells, so this is the
   * one piece of chrome the shell lets a game reskin rather than hardcode.
   */
  drawLifeIcon?(ctx: CanvasRenderingContext2D, highContrast: boolean): void;
  create(host: GameHost): GameInstance;
}

/**
 * The arcade shell.
 *
 * Owns the loop, pause, audio, scoring and every screen that isn't gameplay.
 * Games plug in through GameModule and never worry about any of it.
 */

import { flushQueue, submitScore } from "./core/api";
import { AudioEngine, type SoundName } from "./core/audio";
import type { GameHost, GameInstance, GameModule, RunSummary } from "./core/game";
import { Input } from "./core/input";
import { GameLoop } from "./core/loop";
import {
  createDeviceId,
  loadPlayer,
  loadSettings,
  recordBest,
  savePlayer,
  saveSettings,
  type Player,
  type QueuedScore,
  type Settings,
} from "./core/storage";
import { View } from "./core/view";
import { WakeLock } from "./core/wakelock";
import { drawCrtOverlay, drawHud } from "./ui/hud";
import { buildAboutScreen } from "./ui/about";
import { buildInitialsPrompt, buildLeaderboardScreen } from "./ui/leaderboard";
import { buildHowToScreen, buildSettingsScreen } from "./ui/settings";

type ScreenName = "menu" | "playing" | "paused" | "resuming" | "gameover";

/** How long each "3... 2... 1..." beat lasts before play resumes. */
const COUNTDOWN_BEAT_MS = 700;

export class Shell implements GameHost {
  readonly view: View;

  private readonly audio = new AudioEngine();
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly ui: HTMLElement;
  private readonly wakeLock = new WakeLock();

  private _settings: Settings;
  private _score = 0;
  private player: Player | null = loadPlayer();

  private games: GameModule[] = [];
  private module: GameModule | null = null;
  private instance: GameInstance | null = null;

  private screen: ScreenName = "menu";
  private shakeAmount = 0;
  private shakeDecay = 0;
  private hitStopRemaining = 0;
  private countdownTimer: number | null = null;
  private elapsedMs = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.view = new View(canvas);
    this.ui = ui;
    this._settings = loadSettings();

    this.input = new Input(canvas, this.view);
    this.input.autofire = this._settings.autofire;
    this.input.sensitivity = this._settings.sensitivity;

    this.audio.muted = this._settings.muted;
    this.audio.volume = this._settings.volume;

    this.loop = new GameLoop(this.step, this.draw);
    this.applyAccessibilitySettings();
    this.attachLifecycleHandlers();
  }

  // ----- GameHost -----

  get settings(): Readonly<Settings> {
    return this._settings;
  }

  get score(): number {
    return this._score;
  }

  sfx(name: SoundName): void {
    this.audio.play(name);
  }

  addScore(points: number): void {
    this._score += points;
  }

  shake(strength: number): void {
    if (this._settings.reducedMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, strength);
    this.shakeDecay = Math.max(this.shakeDecay, strength);
  }

  hitStop(seconds: number): void {
    if (this._settings.reducedMotion) return;
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  gameOver(summary: RunSummary): void {
    if (this.screen === "gameover") return;
    this.screen = "gameover";
    this.loop.pause();
    this.input.reset();
    this.wakeLock.release();
    const isBest = this.module ? recordBest(this.module.id, this._score) : false;
    this.renderGameOver(summary, isBest);
  }

  // ----- Lifecycle -----

  register(games: GameModule[]): void {
    this.games = games;
  }

  boot(): void {
    this.loop.start();
    this.showMenu();
    // Anything recorded while offline gets another chance on every launch and
    // whenever the connection comes back.
    if (this.player) void flushQueue(this.player);
    window.addEventListener("online", () => {
      if (this.player) void flushQueue(this.player);
    });
  }

  private attachLifecycleHandlers(): void {
    window.addEventListener("resize", () => this.view.resize());
    window.addEventListener("orientationchange", () => this.view.resize());

    // The pause that actually matters on a phone: an incoming call, a
    // notification pulled down, or switching apps. Without this the game keeps
    // simulating in the background and he comes back to a dead ship.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
    });

    window.addEventListener("blur", () => this.pause());
  }

  // ----- Loop callbacks -----

  private step = (dt: number): void => {
    if (!this.instance) return;
    this.elapsedMs += dt * 1000;

    // Hit-stop freezes the world but not the timer. We deliberately don't
    // consume input here, so a drag during the freeze still lands afterwards.
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= dt;
      return;
    }

    this.instance.update(dt, this.input.consume());

    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeDecay * dt * 4);
    }
  };

  private draw = (alpha: number): void => {
    const { ctx, w, h } = this.view;

    ctx.save();
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, w, h);

    if (this.instance) {
      // Shake the world, not the HUD -- a jittering score readout reads as a
      // rendering bug rather than as impact.
      ctx.save();
      if (this.shakeAmount > 0) {
        const dx = (Math.random() * 2 - 1) * this.shakeAmount;
        const dy = (Math.random() * 2 - 1) * this.shakeAmount;
        ctx.translate(dx, dy);
      }
      this.instance.render(ctx, alpha);
      ctx.restore();

      drawHud(ctx, this.view, this._score, this.instance.hud(), this._settings);
    }

    ctx.restore();

    if (this._settings.crt) drawCrtOverlay(ctx, this.view);
  };

  // ----- Screens -----

  private clearUi(): void {
    this.ui.replaceChildren();
  }

  showMenu(): void {
    this.screen = "menu";
    this.module = null;
    this.instance = null;
    this.wakeLock.release();
    this.clearUi();

    const screen = el("div", "screen");
    screen.append(
      el("h1", "", "HYPERDRIVE"),
      el("p", "", "Pick your machine."),
    );

    for (const game of this.games) {
      const button = el("button", "btn btn--primary", game.title);
      button.style.borderColor = game.accent;
      button.style.background = game.accent;
      button.addEventListener("click", () => {
        this.audio.unlock(); // must happen inside a real gesture
        this.audio.play("uiSelect");
        this.startGame(game);
      });
      screen.append(button);

      const blurb = el("p", "", game.blurb);
      screen.append(blurb);
    }

    const board = el("button", "btn btn--ghost", "HIGH SCORES");
    board.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.play("uiSelect");
      this.showLeaderboard(this.games[0]?.id ?? "starfighter");
    });

    const settings = el("button", "btn btn--ghost", "SETTINGS");
    settings.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.play("uiSelect");
      this.showSettings();
    });

    const about = el("button", "btn btn--quiet", "ⓘ  THE STORY");
    about.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.play("uiMove");
      this.showAbout();
    });

    screen.append(board, settings, about);
    this.ui.append(screen);
  }

  showAbout(): void {
    this.clearUi();
    this.ui.append(
      buildAboutScreen(
        () => this.showMenu(),
        () => this.showSettings(true),
      ),
    );
  }

  showLeaderboard(gameId: string): void {
    this.clearUi();
    this.ui.append(
      buildLeaderboardScreen(gameId, this.player, () => this.showMenu()),
    );
  }

  /** `openFeedback` jumps straight to the note box, scrolled into view. */
  showSettings(openFeedback = false): void {
    this.clearUi();
    this.ui.append(
      buildSettingsScreen(
        this._settings,
        this.player,
        (patch) => this.updateSettings(patch),
        () => this.showMenu(),
        openFeedback,
      ),
    );
  }

  startGame(module: GameModule): void {
    // First time anyone has played on this device: explain the controls once,
    // then start. Never shown again.
    if (!this._settings.seenHowTo) {
      this.clearUi();
      this.ui.append(
        buildHowToScreen(() => {
          this.updateSettings({ seenHowTo: true });
          this.audio.play("uiSelect");
          this.startGame(module);
        }),
      );
      return;
    }

    this.module = module;
    this._score = 0;
    this.elapsedMs = 0;
    this.shakeAmount = 0;
    this.hitStopRemaining = 0;
    this.instance = module.create(this);
    this.input.reset();
    this.screen = "playing";
    this.clearUi();
    this.ui.append(this.buildPauseButton());
    void this.wakeLock.acquire();
    this.loop.resume();
  }

  private buildPauseButton(): HTMLElement {
    const button = el("button", "pause-btn");
    button.setAttribute("aria-label", "Pause");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    button.addEventListener("click", () => this.pause());
    return button;
  }

  pause(): void {
    if (this.screen !== "playing" && this.screen !== "resuming") return;
    this.cancelCountdown();
    this.screen = "paused";
    this.loop.pause();
    this.input.reset();
    this.audio.suspend();
    this.instance?.onPause?.();
    this.renderPauseMenu();
  }

  private renderPauseMenu(): void {
    this.clearUi();
    const screen = el("div", "screen");
    screen.append(el("h2", "", "PAUSED"));

    const resume = el("button", "btn btn--primary", "RESUME");
    resume.addEventListener("click", () => this.requestResume());

    const restart = el("button", "btn", "RESTART");
    restart.addEventListener("click", () => {
      if (this.module) this.startGame(this.module);
    });

    const quit = el("button", "btn btn--danger", "QUIT TO ARCADE");
    quit.addEventListener("click", () => this.showMenu());

    screen.append(resume, restart, quit);
    this.ui.append(screen);
  }

  /**
   * Resume behind a 3-2-1 countdown. Dropping straight back into a bullet
   * pattern after a pause is how you lose a life to the pause button itself.
   */
  private requestResume(): void {
    if (this.screen !== "paused") return;
    this.screen = "resuming";
    this.clearUi();
    this.ui.append(this.buildPauseButton());

    const overlay = el("div", "countdown");
    const label = el("span", "", "3");
    overlay.append(label);
    this.ui.append(overlay);

    this.audio.resume();
    let remaining = 3;

    const tick = () => {
      remaining -= 1;
      // Backgrounded mid-countdown -- fall back to the pause menu.
      if (document.hidden) {
        this.pause();
        return;
      }
      if (remaining > 0) {
        label.textContent = String(remaining);
        // Retrigger the pop animation.
        label.style.animation = "none";
        void label.offsetWidth;
        label.style.animation = "";
        this.audio.play("uiMove");
        this.countdownTimer = window.setTimeout(tick, COUNTDOWN_BEAT_MS);
        return;
      }
      overlay.remove();
      this.countdownTimer = null;
      this.screen = "playing";
      this.input.reset();
      this.instance?.onResume?.();
      this.loop.resume();
      this.audio.play("uiSelect");
    };

    this.audio.play("uiMove");
    this.countdownTimer = window.setTimeout(tick, COUNTDOWN_BEAT_MS);
  }

  private cancelCountdown(): void {
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private renderGameOver(summary: RunSummary, isBest: boolean): void {
    this.clearUi();
    const screen = el("div", "screen");
    screen.append(el("h2", "", "GAME OVER"));
    screen.append(el("h1", "", String(this._score).padStart(6, "0")));
    if (isBest) {
      const badge = el("p", "", "NEW PERSONAL BEST");
      badge.style.color = "var(--accent-warm)";
      screen.append(badge);
    }
    const seconds = Math.round(this.elapsedMs / 1000);
    screen.append(
      el(
        "p",
        "",
        `${summary.progressLabel} ${summary.progress}   ·   ${formatDuration(seconds)}`,
      ),
    );

    // Where the submission result lands once we know it.
    const status = el("p", "board-status", "");
    screen.append(status);

    const again = el("button", "btn btn--primary", "PLAY AGAIN");
    again.addEventListener("click", () => {
      if (this.module) this.startGame(this.module);
    });

    const board = el("button", "btn", "HIGH SCORES");
    board.addEventListener("click", () => {
      if (this.module) this.showLeaderboard(this.module.id);
    });

    const menu = el("button", "btn btn--ghost", "ARCADE");
    menu.addEventListener("click", () => this.showMenu());

    const run: QueuedScore = {
      gameId: this.module?.id ?? "unknown",
      score: this._score,
      wave: summary.progress,
      durationMs: Math.round(this.elapsedMs),
      playedAt: Date.now(),
    };

    if (this.player) {
      screen.append(again, board, menu);
      void this.uploadRun(run, this.player, status);
    } else {
      // First ever run on this device: ask for initials the way the machine
      // would have, then submit.
      const prompt = buildInitialsPrompt((initials) => {
        const player: Player = { initials, deviceId: createDeviceId() };
        this.player = player;
        savePlayer(player);
        prompt.remove();
        screen.insertBefore(again, status.nextSibling);
        screen.append(board, menu);
        this.audio.play("uiSelect");
        void this.uploadRun(run, player, status);
      });
      screen.append(prompt);
    }

    this.ui.append(screen);
  }

  private async uploadRun(
    run: QueuedScore,
    player: Player,
    status: HTMLElement,
  ): Promise<void> {
    status.textContent = "Sending to the scoreboard…";
    const result = await submitScore(run, player);

    if (result.status === "submitted") {
      status.textContent =
        result.rank === null
          ? "Score saved to the scoreboard."
          : `#${result.rank} on the scoreboard.`;
      status.style.color = "var(--accent)";
    } else if (result.status === "queued") {
      status.textContent = "Offline — saved, will upload automatically.";
      status.style.color = "var(--dim)";
    } else {
      // Be honest rather than pretending it worked.
      status.textContent = "Scoreboard rejected this run.";
      status.style.color = "var(--danger)";
    }
  }

  // ----- Settings -----

  updateSettings(patch: Partial<Settings>): void {
    this._settings = { ...this._settings, ...patch };
    saveSettings(this._settings);
    this.input.autofire = this._settings.autofire;
    this.input.sensitivity = this._settings.sensitivity;
    this.audio.muted = this._settings.muted;
    this.audio.volume = this._settings.volume;
    this.applyAccessibilitySettings();
  }

  private applyAccessibilitySettings(): void {
    // The OS preferences are read once, at first launch, in loadSettings().
    // From then on the player's own choice is authoritative.
    document.documentElement.style.setProperty(
      "--ui-scale",
      this._settings.largeText ? "1.25" : "1",
    );
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Tiny element helper -- avoids a pile of createElement boilerplate. */
function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

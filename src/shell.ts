/**
 * The arcade shell.
 *
 * Owns the loop, pause, audio, scoring and every screen that isn't gameplay.
 * Games plug in through GameModule and never worry about any of it.
 */

import { flushQueue, submitScore } from "./core/api";
import { AudioEngine, type SoundName } from "./core/audio";
import type { Track } from "./core/music";
import type { GameHost, GameInstance, GameModule, RunSummary } from "./core/game";
import { Input } from "./core/input";
import { GameLoop } from "./core/loop";
import { dailyKey } from "./core/rng";
import {
  createDeviceId,
  loadDailySeen,
  loadPlayer,
  loadSeenVersion,
  loadSettings,
  recordBest,
  savePlayer,
  saveSeenVersion,
  saveSettings,
  type Player,
  type QueuedScore,
  type Settings,
} from "./core/storage";
import { View } from "./core/view";
import { WakeLock } from "./core/wakelock";
import { drawCrtOverlay, drawHud } from "./ui/hud";
import { buildAboutScreen } from "./ui/about";
import { buildReleaseNotesScreen } from "./ui/releases";
import { LATEST_RELEASE, unseenReleases } from "./releases";
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
    this.audio.musicMuted = !this._settings.music;

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

  playMusic(track: Track): void {
    this.audio.playMusic(track);
  }

  stopMusic(): void {
    this.audio.stopMusic();
  }

  setMusicTempo(scale: number): void {
    this.audio.setMusicTempo(scale);
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
    this.audio.stopMusic();
    // An unranked run is practice: it shouldn't touch the personal best any
    // more than it should reach the server.
    const ranked = summary.ranked !== false;
    const isBest =
      ranked && this.module ? recordBest(this.module.id, this._score) : false;
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

      drawHud(
        ctx,
        this.view,
        this._score,
        this.instance.hud(),
        this._settings,
        this.module,
      );
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
    this.instance?.destroy?.();
    this.audio.stopMusic();
    this.module = null;
    this.instance = null;
    this.wakeLock.release();
    this.clearUi();

    const screen = el("div", "screen");
    screen.append(
      el("h1", "", "DAD'S ARCADE"),
      el("p", "", "Pick your machine."),
    );

    // A grid of cabinets rather than a column of full-width buttons. Each
    // game already draws its own marquee art through GameModule.drawIcon --
    // which, until now, nothing in the app ever called. Five machines stacked
    // as buttons-plus-blurbs overflowed the screen; as tiles they fit, and the
    // floor finally looks like an arcade instead of a list.
    const cabinets = el("div", "cabinets");
    for (const game of this.games) {
      cabinets.append(this.buildCabinet(game));
    }
    screen.append(cabinets);

    const board = el("button", "btn btn--ghost", "HIGH SCORES");
    board.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.play("uiSelect");
      // All games. This used to open games[0], so the menu could only ever
      // show Starfighter's board.
      this.showLeaderboard(null);
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

    // On the same line as THE STORY rather than below it: the menu already
    // fills a phone screen, and a seventh row would push it into scrolling.
    // The version number lives on the notes screen and in Settings; here the
    // label has to share a line with THE STORY on a 360px-wide phone.
    const whatsNew = el("button", "btn btn--quiet", "WHAT'S NEW");
    if (unseenReleases(loadSeenVersion()).length > 0) {
      // The badge is the only reason anyone opens release notes, and it only
      // shows until they have.
      whatsNew.append(el("span", "badge-new", "NEW"));
    }
    whatsNew.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.play("uiMove");
      this.showReleaseNotes(() => this.showMenu());
    });

    const footer = el("div", "menu-footer");
    footer.append(about, whatsNew);

    screen.append(board, settings, footer);
    this.ui.append(screen);
  }

  /** One cabinet tile: marquee art, name, and the game's accent colour. */
  private buildCabinet(game: GameModule): HTMLElement {
    const button = el("button", "cabinet");
    button.style.setProperty("--cabinet-accent", game.accent);

    // Today's challenge exists whether or not anyone ever opens this cabinet
    // to find it -- the badge is what tells them it's there.
    const hasFreshDaily =
      game.hasDailyChallenge === true &&
      loadDailySeen()[game.id] !== dailyKey();

    // The blurb is the accessible description; sighted players get the art.
    button.setAttribute(
      "aria-label",
      `${game.title}. ${game.blurb}` +
        (hasFreshDaily ? " Today's challenge is up." : ""),
    );

    const art = document.createElement("canvas");
    art.className = "cabinet-art";
    art.setAttribute("aria-hidden", "true");

    // Drawn at device resolution so the vector art stays crisp; drawIcon
    // works in a 0..size box, so the context is scaled rather than the art.
    const size = 64;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    art.width = size * dpr;
    art.height = size * dpr;
    const ctx = art.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      game.drawIcon(ctx, size);
    }

    const name = el("span", "cabinet-name", game.title);

    /*
     * The blurb has to be ON the tile, not just in the aria-label.
     *
     * The previous menu printed it under each button and the first draft of
     * this grid moved it to the label only, reasoning that sighted players get
     * the art instead. They don't: a 56px marquee cannot say "Tap to hop" or
     * "tap with a second finger". That quietly removed the control
     * instructions for every game at once, and the only fallback --
     * buildHowToScreen -- is Starfighter-specific AND gated on `seenHowTo`,
     * which is already true on every device this family owns. Nobody would
     * ever have been told how to play the new cabinet.
     */
    const hint = el("span", "cabinet-hint", game.blurb);

    button.append(art, name, hint);
    if (hasFreshDaily) {
      button.append(el("span", "cabinet-badge", "TODAY"));
    }
    button.addEventListener("click", () => {
      this.audio.unlock(); // must happen inside a real gesture
      this.audio.play("uiSelect");
      this.startGame(game);
    });
    return button;
  }

  /** Release notes. Marks the latest as seen once they've been shown. */
  showReleaseNotes(onBack: () => void): void {
    this.clearUi();
    // Read before saving, so this visit still badges what was new to them.
    const lastSeen = loadSeenVersion();
    this.ui.append(buildReleaseNotesScreen(lastSeen, onBack));
    saveSeenVersion(LATEST_RELEASE.version);
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

  /** `null` opens the all-games view; a game id opens that game's board. */
  showLeaderboard(gameId: string | null): void {
    this.clearUi();
    this.ui.append(
      buildLeaderboardScreen(this.games, gameId, this.player, () => this.showMenu()),
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
        () => this.showReleaseNotes(() => this.showSettings()),
      ),
    );
  }

  startGame(module: GameModule): void {
    // First time anyone plays Starfighter on this device: explain the controls
    // once, then start. The screen is Starfighter's own instructions, so it
    // only goes in front of Starfighter -- a new phone whose first pick was
    // the tower was being told how to fly a spaceship. Every other game's
    // controls are on its cabinet.
    if (module.id === "starfighter" && !this._settings.seenHowTo) {
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

    this.instance?.destroy?.();
    this.audio.stopMusic();
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
    const extra = this.instance.extraControls?.();
    if (extra) this.ui.append(extra);
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
    // clearUi() just tore out every child of #ui, including whatever DOM a
    // game mounted through extraControls() -- its D-pad, its whole panel,
    // whatever. Without re-mounting it here, resuming from pause would leave
    // that control surface gone for the rest of the run.
    const extra = this.instance?.extraControls?.();
    if (extra) this.ui.append(extra);

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
    const ranked = summary.ranked !== false;
    const screen = el("div", "screen");
    screen.append(el("h2", "", summary.headline ?? "GAME OVER"));
    if (ranked) {
      screen.append(el("h1", "", String(this._score).padStart(6, "0")));
    }
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
      ...(summary.boardId ? { boardId: summary.boardId } : {}),
    };

    // A sandbox run ends here: no upload, and no initials prompt, because
    // there is nothing to put a name to.
    if (!ranked) {
      screen.append(again, board, menu);
      this.ui.append(screen);
      return;
    }

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
    this.audio.musicMuted = !this._settings.music;
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

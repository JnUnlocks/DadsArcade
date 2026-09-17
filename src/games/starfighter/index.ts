/**
 * STARFIGHTER -- a Galaga-shaped shooter.
 *
 * Deliberately keeps the arcade constraints that define the original rather
 * than "modernising" them away:
 *   - Only two of your shots may be in the air at once. This is the single
 *     biggest reason Galaga plays the way it does; unlimited fire turns it into
 *     a bullet hose and the whole risk/reward of aiming evaporates.
 *   - Enemies fly in along curves and lock into a grid, then peel off to dive.
 *   - A cruiser can capture your fighter; shoot it down and you fly dual.
 *
 * The one concession to touch: the player can move a little vertically inside
 * the bottom band of the screen. Pure horizontal movement feels wrong under a
 * dragging thumb.
 */

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { Rng } from "../../core/rng";
import {
  COLS,
  ROWS,
  headingOnPath,
  makeDivePath,
  makeEntryPath,
  makeReturnPath,
  pointOnPath,
  slotPosition,
  type Vec2,
} from "./formation";
import {
  PALETTE,
  Particles,
  Starfield,
  drawEnemy,
  drawEnemyBullet,
  drawPlayer,
  drawPlayerBullet,
  drawScorePopup,
  drawTractorBeam,
} from "./render";
import type { Bullet, Enemy, EnemyKind, Popup } from "./types";

const PLAYER_KEY_SPEED = 260;
const PLAYER_RADIUS = 8;
const ENEMY_RADIUS = 10;
const BULLET_SPEED = 620;
const ENEMY_BULLET_SPEED = 190;
const FIRE_INTERVAL = 0.2;
const MAX_PLAYER_BULLETS = 2;
const RESPAWN_INVULN = 2.2;
const CAPTURE_BEAM_DURATION = 2.6;
const BEAM_LENGTH = 120;

/** Points for a kill while the enemy sits in formation. Divers are worth 2x. */
const SCORE: Record<EnemyKind, number> = {
  grunt: 50,
  escort: 80,
  cruiser: 150,
};

const HP: Record<EnemyKind, number> = {
  grunt: 1,
  escort: 1,
  cruiser: 3,
};

const FIRST_EXTRA_LIFE = 20000;
const EXTRA_LIFE_INTERVAL = 40000;

class Starfighter implements GameInstance {
  private readonly rng = new Rng((Math.random() * 0xffffffff) >>> 0);
  private readonly starfield: Starfield;
  private readonly particles = new Particles();

  private enemies: Enemy[] = [];
  private playerBullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private popups: Popup[] = [];

  private playerX: number;
  private playerY: number;
  private playerAlive = true;
  private invulnerable = RESPAWN_INVULN;
  private respawnTimer = 0;
  private thrust = 0;

  /** Rescued wingman flying alongside -- doubles your guns. */
  private dualFighter = false;
  private captureHeld = false;

  private lives = 3;
  private wave = 1;
  private time = 0;
  private fireCooldown = 0;
  private diveTimer = 2.5;
  private waveBannerTimer = 1.6;
  private nextExtraLife = FIRST_EXTRA_LIFE;
  private gameEnded = false;

  constructor(private readonly host: GameHost) {
    const { w, h } = host.view;
    this.starfield = new Starfield(w, h);
    this.playerX = w / 2;
    this.playerY = h - host.view.insetBottom - 70;
    this.buildWave();
    this.host.sfx("waveStart");
  }

  // ----- Update -----

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.starfield.update(dt);
    this.particles.update(dt);
    if (this.waveBannerTimer > 0) this.waveBannerTimer -= dt;

    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePopups(dt);
    this.resolveCollisions();
    this.maybeStartDive(dt);
    this.checkWaveCleared();
  }

  private updatePlayer(dt: number, input: InputSnapshot): void {
    const { w, h, insetBottom } = this.host.view;

    if (!this.playerAlive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (this.lives > 0) {
          this.playerAlive = true;
          this.playerX = w / 2;
          this.invulnerable = RESPAWN_INVULN;
        } else if (!this.gameEnded) {
          this.gameEnded = true;
          this.host.gameOver({ progress: this.wave, progressLabel: "Wave" });
        }
      }
      return;
    }

    if (this.invulnerable > 0) this.invulnerable -= dt;

    const dx = input.dragX + input.axisX * PLAYER_KEY_SPEED * dt;
    const dy = input.dragY + input.axisY * PLAYER_KEY_SPEED * dt;
    this.playerX += dx;
    this.playerY += dy;
    this.thrust = Math.min(1, Math.abs(dx) * 0.06 + Math.abs(dy) * 0.06);

    // Horizontal: full width. Vertical: a band at the bottom only.
    const margin = this.dualFighter ? 22 : 13;
    this.playerX = clamp(this.playerX, margin, w - margin);
    this.playerY = clamp(this.playerY, h * 0.68, h - insetBottom - 26);

    this.fireCooldown -= dt;
    if (
      input.firing &&
      this.fireCooldown <= 0 &&
      this.playerBullets.length < this.maxBullets()
    ) {
      this.firePlayerShot();
    }
  }

  private maxBullets(): number {
    return this.dualFighter ? MAX_PLAYER_BULLETS * 2 : MAX_PLAYER_BULLETS;
  }

  private firePlayerShot(): void {
    this.fireCooldown = FIRE_INTERVAL;
    this.playerBullets.push({
      x: this.playerX,
      y: this.playerY - 12,
      vx: 0,
      vy: -BULLET_SPEED,
    });
    if (this.dualFighter) {
      this.playerBullets.push({
        x: this.playerX + 18,
        y: this.playerY - 12,
        vx: 0,
        vy: -BULLET_SPEED,
      });
    }
    this.host.sfx("shoot");
  }

  /**
   * Where the top row of the formation sits. Proportional to screen height so
   * a tall phone doesn't strand the block against the top bezel with a dead
   * void underneath it.
   */
  private formationTop(): number {
    const { h, insetTop } = this.host.view;
    return insetTop + Math.max(72, h * 0.15);
  }

  private updateEnemies(dt: number): void {
    const { w, h } = this.host.view;
    const topMargin = this.formationTop();

    for (const enemy of this.enemies) {
      if (enemy.flash > 0) enemy.flash -= dt;

      switch (enemy.state) {
        case "waiting": {
          enemy.spawnDelay -= dt;
          if (enemy.spawnDelay <= 0) enemy.state = "entering";
          break;
        }

        case "entering":
        case "returning": {
          if (!enemy.path) {
            enemy.state = "formation";
            break;
          }
          enemy.pathDistance += enemy.speed * dt;
          const t = enemy.pathDistance / enemy.path.length;
          if (t >= 1) {
            enemy.state = "formation";
            enemy.path = null;
            enemy.pathDistance = 0;
          } else {
            const point = pointOnPath(enemy.path, t);
            enemy.x = point.x;
            enemy.y = point.y;
            enemy.angle = headingOnPath(enemy.path, t);
          }
          break;
        }

        case "formation": {
          const slot = slotPosition(enemy.row, enemy.col, w, topMargin, this.time);
          enemy.x = slot.x;
          enemy.y = slot.y;
          enemy.angle = Math.PI / 2; // facing the player
          this.maybeFire(enemy, dt, 0.06);
          break;
        }

        case "diving": {
          if (!enemy.path) {
            enemy.state = "formation";
            break;
          }
          enemy.pathDistance += enemy.speed * dt;
          const t = enemy.pathDistance / enemy.path.length;
          if (t >= 1) {
            // Flew off the bottom -- loop around and rejoin the formation.
            const slot = slotPosition(enemy.row, enemy.col, w, topMargin, this.time);
            enemy.path = makeReturnPath(slot, w);
            enemy.pathDistance = 0;
            enemy.state = "returning";
          } else {
            const point = pointOnPath(enemy.path, t);
            enemy.x = point.x;
            enemy.y = point.y;
            enemy.angle = headingOnPath(enemy.path, t);
            this.maybeFire(enemy, dt, 0.5);
          }
          break;
        }

        case "beaming": {
          enemy.beamTimer -= dt;
          // Drift slowly toward the player while the beam is out, so it reads
          // as hunting rather than parked.
          enemy.x += Math.sign(this.playerX - enemy.x) * 22 * dt;
          enemy.angle = Math.PI / 2;
          if (enemy.beamTimer <= 0) {
            const slot = slotPosition(enemy.row, enemy.col, w, topMargin, this.time);
            enemy.path = makeReturnPath(slot, w);
            enemy.pathDistance = 0;
            enemy.state = "returning";
          } else if (this.beamHasPlayer(enemy)) {
            this.capturePlayer(enemy);
          }
          break;
        }
      }

      // Safety net: anything that wanders far outside the playfield gets
      // pulled back into the formation rather than lost forever.
      if (enemy.y > h + 120 && enemy.state !== "diving") {
        const slot = slotPosition(enemy.row, enemy.col, w, topMargin, this.time);
        enemy.x = slot.x;
        enemy.y = slot.y;
        enemy.state = "formation";
        enemy.path = null;
      }
    }
  }

  private maybeFire(enemy: Enemy, dt: number, ratePerSecond: number): void {
    if (!this.playerAlive) return;
    enemy.fireCooldown -= dt;
    if (enemy.fireCooldown > 0) return;
    // Re-arm on a randomised interval so shots don't arrive on a metronome.
    enemy.fireCooldown = this.rng.range(0.6, 2.4) / (ratePerSecond * 10 + 0.2);
    if (!this.rng.chance(ratePerSecond)) return;

    const angle = Math.atan2(this.playerY - enemy.y, this.playerX - enemy.x);
    const speed = ENEMY_BULLET_SPEED + this.wave * 4;
    this.enemyBullets.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }

  private updateBullets(dt: number): void {
    const { h } = this.host.view;

    for (let i = this.playerBullets.length - 1; i >= 0; i -= 1) {
      const b = this.playerBullets[i]!;
      b.y += b.vy * dt;
      if (b.y < -20) removeAt(this.playerBullets, i);
    }

    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = this.enemyBullets[i]!;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > h + 20 || b.y < -20 || b.x < -20 || b.x > this.host.view.w + 20) {
        removeAt(this.enemyBullets, i);
      }
    }
  }

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const p = this.popups[i]!;
      p.life -= dt;
      p.y -= 26 * dt;
      if (p.life <= 0) removeAt(this.popups, i);
    }
  }

  // ----- Collisions -----

  private resolveCollisions(): void {
    // Player shots vs enemies.
    for (let bi = this.playerBullets.length - 1; bi >= 0; bi -= 1) {
      const bullet = this.playerBullets[bi]!;
      for (let ei = this.enemies.length - 1; ei >= 0; ei -= 1) {
        const enemy = this.enemies[ei]!;
        if (enemy.state === "waiting") continue;
        if (!within(bullet.x, bullet.y, enemy.x, enemy.y, ENEMY_RADIUS)) continue;

        removeAt(this.playerBullets, bi);
        enemy.hp -= 1;
        enemy.flash = 0.08;

        if (enemy.hp > 0) {
          this.host.sfx("bossHit");
        } else {
          this.killEnemy(enemy, ei);
        }
        break;
      }
    }

    if (!this.playerAlive || this.invulnerable > 0) return;

    // Enemy shots vs player.
    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.enemyBullets[i]!;
      if (within(bullet.x, bullet.y, this.playerX, this.playerY, PLAYER_RADIUS)) {
        removeAt(this.enemyBullets, i);
        this.killPlayer();
        return;
      }
    }

    // Ramming.
    for (const enemy of this.enemies) {
      if (enemy.state === "waiting") continue;
      if (
        within(
          enemy.x,
          enemy.y,
          this.playerX,
          this.playerY,
          PLAYER_RADIUS + ENEMY_RADIUS - 4,
        )
      ) {
        this.killPlayer();
        return;
      }
    }
  }

  private killEnemy(enemy: Enemy, index: number): void {
    // Galaga's rule: an enemy caught mid-dive is worth double.
    const diving =
      enemy.state === "diving" ||
      enemy.state === "beaming" ||
      enemy.state === "returning";
    const points = SCORE[enemy.kind] * (diving ? 2 : 1);

    this.host.addScore(points);
    this.popups.push({
      x: enemy.x,
      y: enemy.y,
      text: `+${points}`,
      life: 0.7,
    });
    this.particles.burst(
      enemy.x,
      enemy.y,
      enemy.kind === "cruiser" ? PALETTE.cruiser : PALETTE.grunt,
      enemy.kind === "cruiser" ? 26 : 14,
      enemy.kind === "cruiser" ? 140 : 90,
    );

    // Destroying the cruiser that stole your fighter gives it back.
    if (enemy.holdingCapture) {
      this.captureHeld = false;
      this.dualFighter = true;
      this.host.sfx("rescue");
      this.host.shake(6);
      this.popups.push({
        x: enemy.x,
        y: enemy.y - 16,
        text: "WINGMAN FREED",
        life: 1.4,
      });
    } else {
      this.host.sfx("enemyExplode");
      this.host.shake(enemy.kind === "cruiser" ? 4 : 2);
    }

    this.host.hitStop(enemy.kind === "cruiser" ? 0.06 : 0.02);
    removeAt(this.enemies, index);
    this.checkExtraLife();
  }

  private killPlayer(): void {
    this.playerAlive = false;
    this.respawnTimer = 1.5;
    this.lives -= 1;
    // Losing your ship also loses the rescued wingman.
    this.dualFighter = false;
    this.particles.burst(this.playerX, this.playerY, PALETTE.player, 30, 150);
    this.host.sfx("playerExplode");
    this.host.shake(9);
    this.host.hitStop(0.09);
  }

  private checkExtraLife(): void {
    if (this.host.score < this.nextExtraLife) return;
    this.lives += 1;
    this.nextExtraLife += EXTRA_LIFE_INTERVAL;
    this.host.sfx("extraLife");
    this.popups.push({
      x: this.host.view.w / 2,
      y: this.host.view.h * 0.4,
      text: "EXTRA SHIP",
      life: 1.6,
    });
  }

  // ----- Capture mechanic -----

  private beamHasPlayer(cruiser: Enemy): boolean {
    if (!this.playerAlive || this.invulnerable > 0) return false;
    if (this.playerY < cruiser.y || this.playerY > cruiser.y + BEAM_LENGTH) {
      return false;
    }
    // Cone widens with distance; check against the half-width at this depth.
    const depth = (this.playerY - cruiser.y) / BEAM_LENGTH;
    const halfWidth = 5 + 21 * depth;
    return Math.abs(this.playerX - cruiser.x) < halfWidth;
  }

  private capturePlayer(cruiser: Enemy): void {
    // Never let a capture be the thing that ends the run -- being robbed of
    // your last life by a grab you couldn't shoot feels cheap.
    if (this.lives <= 1) {
      this.killPlayer();
      return;
    }
    this.playerAlive = false;
    this.respawnTimer = 1.6;
    this.lives -= 1;
    this.captureHeld = true;
    this.dualFighter = false;
    cruiser.holdingCapture = true;
    cruiser.beamTimer = 0;
    this.host.sfx("captureBeam");
    this.host.shake(7);
    this.popups.push({
      x: cruiser.x,
      y: cruiser.y + 30,
      text: "FIGHTER CAPTURED",
      life: 1.8,
    });
  }

  // ----- Wave management -----

  private buildWave(): void {
    const { w, h } = this.host.view;
    const topMargin = this.formationTop();
    this.enemies = [];

    let queueIndex = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const kind = kindForSlot(row, col);
        if (!kind) continue;

        const slot: Vec2 = slotPosition(row, col, w, topMargin, 0);
        // Stagger entry so squads arrive in readable groups of four.
        const delay = Math.floor(queueIndex / 4) * 0.55 + (queueIndex % 4) * 0.13;

        this.enemies.push({
          kind,
          row,
          col,
          x: slot.x,
          y: -60,
          angle: Math.PI / 2,
          state: "waiting",
          path: makeEntryPath(slot, Math.floor(queueIndex / 4), w, h),
          pathDistance: 0,
          speed: 190 + this.wave * 9,
          hp: HP[kind],
          flash: 0,
          fireCooldown: this.rng.range(1, 4),
          spawnDelay: delay,
          beamTimer: 0,
          holdingCapture: false,
        });
        queueIndex += 1;
      }
    }

    // Faster, more frequent dives as waves progress, with a floor so it stays
    // readable rather than becoming a wall.
    this.diveTimer = Math.max(0.9, 2.6 - this.wave * 0.12);
    this.waveBannerTimer = 1.6;
  }

  private maybeStartDive(dt: number): void {
    this.diveTimer -= dt;
    if (this.diveTimer > 0 || !this.playerAlive) return;

    const interval = Math.max(0.7, 2.4 - this.wave * 0.11);
    this.diveTimer = this.rng.range(interval * 0.6, interval * 1.4);

    const candidates = this.enemies.filter((e) => e.state === "formation");
    if (candidates.length === 0) return;

    const enemy = this.rng.pick(candidates);
    const { h } = this.host.view;

    // Cruisers sometimes go for a capture instead of a straight dive -- but
    // only once at a time, and never on the player's last life.
    const wantsCapture =
      enemy.kind === "cruiser" &&
      !this.captureHeld &&
      this.lives > 1 &&
      this.wave >= 2 &&
      this.rng.chance(0.45);

    if (wantsCapture) {
      enemy.state = "beaming";
      enemy.beamTimer = CAPTURE_BEAM_DURATION;
      enemy.y = h * 0.42;
      enemy.path = null;
      this.host.sfx("captureBeam");
      return;
    }

    enemy.state = "diving";
    enemy.path = makeDivePath({ x: enemy.x, y: enemy.y }, this.playerX, h, this.rng);
    enemy.pathDistance = 0;
    enemy.speed = 210 + this.wave * 11;
  }

  private checkWaveCleared(): void {
    if (this.enemies.length > 0 || this.gameEnded) return;
    this.wave += 1;
    this.enemyBullets.length = 0;
    this.buildWave();
    this.host.sfx("waveStart");
  }

  // ----- Render -----

  render(ctx: CanvasRenderingContext2D): void {
    this.starfield.render(ctx);

    for (const enemy of this.enemies) {
      if (enemy.state === "waiting") continue;
      if (enemy.state === "beaming") {
        drawTractorBeam(ctx, enemy.x, enemy.y + 10, BEAM_LENGTH, this.time);
      }
      drawEnemy(ctx, enemy.kind, enemy.x, enemy.y, enemy.angle, enemy.flash > 0);
      if (enemy.holdingCapture) {
        // The stolen fighter, tethered above its captor.
        drawPlayer(ctx, enemy.x, enemy.y - 22, 0);
      }
    }

    for (const bullet of this.playerBullets) {
      drawPlayerBullet(ctx, bullet.x, bullet.y);
    }
    for (const bullet of this.enemyBullets) {
      drawEnemyBullet(ctx, bullet.x, bullet.y);
    }

    if (this.playerAlive) {
      // Blink while invulnerable so the state is legible.
      const blinking = this.invulnerable > 0 && Math.floor(this.time * 12) % 2 === 0;
      if (!blinking) {
        drawPlayer(ctx, this.playerX, this.playerY, this.thrust);
        if (this.dualFighter) {
          drawPlayer(ctx, this.playerX + 18, this.playerY, this.thrust);
        }
      }
    }

    this.particles.render(ctx);

    for (const popup of this.popups) {
      drawScorePopup(ctx, popup.x, popup.y, popup.text, Math.min(1, popup.life * 2));
    }

    if (this.waveBannerTimer > 0) {
      this.drawWaveBanner(ctx);
    }
  }

  private drawWaveBanner(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.host.view;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.waveBannerTimer * 1.4);
    ctx.fillStyle = PALETTE.player;
    ctx.font = '700 22px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = "center";
    ctx.fillText(`WAVE ${this.wave}`, w / 2, h * 0.42);
    ctx.restore();
  }

  hud(): HudState {
    return {
      lives: Math.max(0, this.lives),
      progress: this.wave,
      progressLabel: "Wave",
    };
  }

  onResume(): void {
    // Nothing to restore -- the shell freezes the whole simulation -- but
    // clearing stale enemy fire makes the countdown a genuinely safe re-entry.
    this.enemyBullets.length = 0;
  }
}

// ----- Helpers -----

function kindForSlot(row: number, col: number): EnemyKind | null {
  if (row === 0) return col === 3 || col === 4 ? "cruiser" : null;
  if (row === 1) return col >= 2 && col <= 5 ? "escort" : null;
  return "grunt";
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function within(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= radius * radius;
}

/** Swap-and-pop removal -- order is irrelevant for all of these arrays. */
function removeAt<T>(items: T[], index: number): void {
  items[index] = items[items.length - 1]!;
  items.pop();
}

// ----- Module -----

export const starfighterModule: GameModule = {
  id: "starfighter",
  title: "STARFIGHTER",
  progressShort: "WV",
  blurb: "Drag to fly. The guns handle themselves.",
  accent: "#46e0ff",

  drawIcon(ctx, size) {
    const scale = size / 32;
    ctx.save();
    ctx.scale(scale, scale);
    drawPlayer(ctx, 16, 20, 0.5);
    drawEnemy(ctx, "grunt", 8, 8, Math.PI / 2, false);
    drawEnemy(ctx, "grunt", 24, 8, Math.PI / 2, false);
    ctx.restore();
  },

  create(host: GameHost): GameInstance {
    return new Starfighter(host);
  },
};

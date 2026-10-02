import * as THREE from 'three';
import { PlayerConfig, PursuitConfig } from '../config/GameConfig';
import { Difficulty } from '../core/Difficulty';
import type { EventBus, PursuitCue } from '../core/EventBus';
import type { Player } from '../player/Player';
import { clamp, damp, lerp } from '../utils/MathUtils';
import type { Random } from '../utils/Random';
import { Pursuer } from './Pursuer';

/**
 * The pursuit, modelled as a single number: the gap (in meters) between the
 * runner and the riders behind.
 *
 *   RUN CLEAN  → you're faster than they are, the gap grows
 *   MAKE MISTAKES (collisions, mud, exhaustion) → the gap shrinks
 *   GAP REACHES 0 → caught
 *
 * The pursuers are rarely seen: mostly heard (shouts, hounds, hooves, a
 * warning shot) and glimpsed — behind you if you glance back (Q), or riding
 * a parallel line out on the flank.
 */
export class PursuitManager {
  /** Meters between runner and pursuers. */
  gap: number = PursuitConfig.startGap;
  /** 0..1 — how close the danger is (for HUD / audio / post). */
  danger = 0;
  caught = false;
  /** Seconds since the gap closed (drives the capture sequence). */
  caughtTime = 0;

  private readonly group = new THREE.Group();
  private readonly chasers: Pursuer[] = [];
  private readonly flankers: Pursuer[] = [];
  private chaserX: number[] = [];
  private cueTimer = 4;
  private glimpseTimer = PursuitConfig.glimpseCooldown * 0.5;
  private flank: { side: number; x: number; d: number; time: number; active: boolean } = { side: 1, x: 0, d: 0, time: 0, active: false };
  private dangerEmitTimer = 0;

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus,
  ) {
    this.group.name = 'pursuers';
    scene.add(this.group);
    // Two riders and two hounds behind; two riders for flank glimpses.
    for (const kind of ['rider', 'rider', 'dog', 'dog'] as const) {
      const p = new Pursuer(kind);
      this.chasers.push(p);
      this.group.add(p.object);
    }
    for (let i = 0; i < 2; i++) {
      const p = new Pursuer('rider');
      this.flankers.push(p);
      this.group.add(p.object);
    }
    bus.on('player:hit', (e) => this.penalize(e.damage));
  }

  reset(): void {
    this.gap = PursuitConfig.startGap;
    this.danger = 0;
    this.caught = false;
    this.caughtTime = 0;
    this.cueTimer = 4;
    this.glimpseTimer = PursuitConfig.glimpseCooldown * 0.5;
    this.flank.active = false;
    this.chaserX = [0, 0, 0, 0];
    for (const p of [...this.flankers, ...this.chasers]) p.object.visible = false;
  }

  /** Lose ground (collisions, explosions). */
  penalize(meters: number): void {
    if (this.caught) return;
    this.gap -= meters;
  }

  /** The pursuers' current speed. */
  pursuerSpeed(distance: number): number {
    const factor = lerp(PursuitConfig.speedFactorStart, PursuitConfig.speedFactorMax, Difficulty.at(distance));
    return Difficulty.runSpeed(distance) * factor;
  }

  update(dt: number, p: Player, darkness: number, rng: Random, groundHeight: (x: number, d: number) => number): void {
    if (!this.caught) {
      this.gap += (p.speed - this.pursuerSpeed(p.d)) * dt;
      this.gap = Math.min(this.gap, PursuitConfig.maxGap);
      if (this.gap <= 0) {
        this.gap = 0;
        this.caught = true;
        this.caughtTime = 0;
        this.bus.emit('pursuit:cue', { kind: 'shout', distance: 3, pan: 0 });
      }
    } else {
      this.caughtTime += dt;
    }

    this.danger = clamp(1 - this.gap / PursuitConfig.dangerGap, 0, 1);
    this.dangerEmitTimer -= dt;
    if (this.dangerEmitTimer <= 0) {
      this.dangerEmitTimer = 0.25;
      this.bus.emit('pursuit:danger', { level: this.danger });
    }

    this.updateCues(dt, rng);
    this.updateChasers(dt, p, darkness, groundHeight);
    this.updateFlank(dt, p, darkness, rng, groundHeight);
  }

  /** Sounds of the chase — more frequent and closer as the gap shrinks. */
  private updateCues(dt: number, rng: Random): void {
    if (this.caught) return;
    this.cueTimer -= dt;
    if (this.cueTimer > 0) return;
    const closeness = clamp(1 - this.gap / PursuitConfig.maxGap, 0, 1);
    this.cueTimer = lerp(PursuitConfig.cueIntervalFar, PursuitConfig.cueIntervalNear, closeness) * rng.range(0.7, 1.3);
    const table: Partial<Record<PursuitCue, number>> = {
      shout: 3,
      dog: 3 + closeness * 2,
      horse: 2 + closeness * 3,
      whistle: 0.6,
      gunshot: closeness > 0.6 ? 0.8 : 0.15,
    };
    const kind = rng.weighted(table) ?? 'shout';
    this.bus.emit('pursuit:cue', { kind, distance: this.gap, pan: rng.range(-0.6, 0.6) });
  }

  /** The riders and hounds that are actually behind you, at the gap distance. */
  private updateChasers(dt: number, p: Player, darkness: number, groundHeight: (x: number, d: number) => number): void {
    const visible = this.gap < 150;
    const speed = this.caught ? Math.max(0, 6 - this.caughtTime * 4) : this.pursuerSpeed(p.d);
    const layout = [
      [-2.2, 0],
      [2.4, 1.5],
      [-0.8, -3.5],
      [1.2, -4.5],
    ];
    this.chasers.forEach((c, i) => {
      c.object.visible = visible;
      if (!visible) return;
      // Follow the runner's line with a lag.
      this.chaserX[i] = damp(this.chaserX[i], p.x + layout[i][0], 0.8 + i * 0.2, dt);
      const x = clamp(this.chaserX[i], -PlayerConfig.corridorHalfWidth, PlayerConfig.corridorHalfWidth);
      const gap = this.caught ? Math.max(2.2 + i * 0.8, 6 - this.caughtTime * 2.5) : this.gap;
      const d = p.d - gap + layout[i][1];
      c.object.position.set(x, groundHeight(x, d), -d);
      c.object.rotation.y = 0;
      c.setLantern(darkness);
      c.animate(dt, speed);
    });
  }

  /**
   * Occasionally a pair of riders appears out on the flank ahead, searching,
   * then turns away — a reminder that the whole country is looking.
   */
  private updateFlank(dt: number, p: Player, darkness: number, rng: Random, groundHeight: (x: number, d: number) => number): void {
    const f = this.flank;
    if (!f.active) {
      this.glimpseTimer -= dt;
      if (this.glimpseTimer <= 0 && !this.caught) {
        this.glimpseTimer = PursuitConfig.glimpseCooldown * rng.range(0.8, 1.6);
        f.active = true;
        f.side = rng.sign();
        f.x = f.side * rng.range(22, 38);
        f.d = p.d + rng.range(70, 110);
        f.time = 0;
        this.bus.emit('pursuit:cue', { kind: 'horse', distance: 60, pan: f.side * 0.8 });
      }
    }
    for (const r of this.flankers) r.object.visible = f.active;
    if (!f.active) return;
    f.time += dt;
    // Ride parallel for a while, then veer off away from the corridor.
    const speed = 8;
    f.d += speed * dt;
    if (f.time > 5) f.x += f.side * 10 * dt;
    this.flankers.forEach((r, i) => {
      const x = f.x + f.side * i * 2.2;
      const d = f.d - i * 3;
      r.object.position.set(x, groundHeight(x, d), -d);
      r.object.rotation.y = f.time > 5 ? -f.side * 0.6 : 0; // ride ahead (−z), then veer off
      r.setLantern(darkness);
      r.animate(dt, speed);
    });
    if (f.time > 11 || f.d < p.d - 20) f.active = false;
  }
}

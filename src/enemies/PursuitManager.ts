import * as THREE from 'three';
import { HealthConfig, PlayerConfig, PursuitConfig } from '../config/GameConfig';
import { Anim } from '../characters/HumanPose';
import type { Characters } from '../characters/Characters';
import type { Human } from '../characters/HumanCrowd';
import type { Animal } from '../characters/Quadruped';
import { Styles } from '../characters/Styles';
import { Difficulty } from '../core/Difficulty';
import type { EventBus, PursuitCue } from '../core/EventBus';
import type { Particles } from '../effects/Particles';
import type { Player } from '../player/Player';
import { clamp, damp, lerp } from '../utils/MathUtils';
import type { Random } from '../utils/Random';

interface Rider {
  horse: Animal;
  man: Human;
  x: number;
  /** Lateral slot relative to the runner's line, and how far behind the pack. */
  offset: number;
  lag: number;
  fireTimer: number;
  recoil: number;
}

/**
 * The pursuit, modelled as a single number: the gap (in meters) between the
 * runner and the riders behind.
 *
 *   RUN CLEAN  → you're faster than they are, the gap grows
 *   MAKE MISTAKES (collisions, falls, mud, exhaustion) → the gap shrinks
 *   GAP REACHES 0 → caught
 *
 * Inside 50 ft the riders open fire. Some shots miss (sidestepping makes you
 * harder to hit), some hit; three hits and the run is over.
 *
 * The pursuers are mostly heard (shouts, hounds, hooves, gunfire) and
 * glimpsed — behind you if you glance back (Q), or riding the flank.
 */
export class PursuitManager {
  gap: number = PursuitConfig.startGap;
  /** 0..1 — how close the danger is (for HUD / audio / post). */
  danger = 0;
  caught = false;
  caughtTime = 0;
  /** Set when the runner has been shot dead. */
  shotDown = false;

  private chasers: Rider[] = [];
  private hounds: { dog: Animal; x: number; offset: number; lag: number }[] = [];
  private flankers: { horse: Animal; man: Human }[] = [];
  private cueTimer = 4;
  private glimpseTimer = PursuitConfig.glimpseCooldown * 0.5;
  private flank = { side: 1, x: 0, d: 0, time: 0, active: false };
  private dangerEmitTimer = 0;
  private time = 0;
  private readonly muzzle = new THREE.Vector3();

  constructor(
    private readonly bus: EventBus,
    private readonly characters: Characters,
    private readonly particles: Particles,
  ) {
    bus.on('player:hit', (e) => this.penalize(e.damage));
  }

  /** (Re)create the riders and hounds for a new run. */
  reset(): void {
    this.gap = PursuitConfig.startGap;
    this.danger = 0;
    this.caught = false;
    this.shotDown = false;
    this.caughtTime = 0;
    this.cueTimer = 4;
    this.glimpseTimer = PursuitConfig.glimpseCooldown * 0.5;
    this.flank.active = false;
    this.despawn();
    const C = this.characters;
    const coats = [0x4a2f1e, 0x2a211b, 0x6b4a2e, 0x7d7368];
    const layout = [
      { offset: -2.3, lag: 0 },
      { offset: 2.5, lag: 2.2 },
    ];
    layout.forEach((l, i) => {
      const horse = C.horses.spawn(coats[i % coats.length]);
      const man = C.humans.spawn(Styles.catcher(i * 0.37 + 0.1));
      if (horse && man) this.chasers.push({ horse, man, x: 0, offset: l.offset, lag: l.lag, fireTimer: 1 + i, recoil: 0 });
    });
    for (const [offset, lag] of [
      [-0.8, -4],
      [1.1, -5.2],
    ]) {
      const dog = C.hounds.spawn(0x6a4a30);
      if (dog) this.hounds.push({ dog, x: 0, offset, lag });
    }
    for (let i = 0; i < 2; i++) {
      const horse = C.horses.spawn(coats[(i + 2) % coats.length]);
      const man = C.humans.spawn(Styles.catcher(0.6 + i * 0.2));
      if (horse && man) this.flankers.push({ horse, man });
    }
    this.hideAll();
  }

  private despawn(): void {
    const C = this.characters;
    for (const r of this.chasers) {
      C.horses.remove(r.horse);
      C.humans.remove(r.man);
    }
    for (const h of this.hounds) C.hounds.remove(h.dog);
    for (const f of this.flankers) {
      C.horses.remove(f.horse);
      C.humans.remove(f.man);
    }
    this.chasers = [];
    this.hounds = [];
    this.flankers = [];
  }

  /** Park everyone far below the world until they are needed. */
  private hideAll(): void {
    for (const r of this.chasers) this.park(r.horse, r.man);
    for (const f of this.flankers) this.park(f.horse, f.man);
    for (const h of this.hounds) h.dog.y = -50;
  }

  private park(horse: Animal, man: Human): void {
    horse.y = -50;
    man.pose.y = -50;
  }

  penalize(meters: number): void {
    if (this.caught) return;
    this.gap -= meters;
  }

  pursuerSpeed(distance: number): number {
    return Difficulty.runSpeed(distance) * Difficulty.pursuitFactor(distance);
  }

  update(dt: number, p: Player, rng: Random, groundHeight: (x: number, d: number) => number): void {
    this.time += dt;
    if (!this.caught && !this.shotDown) {
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

    // Wounds ease off if you stay out of the line of fire.
    p.sinceHit += dt;
    if (p.sinceHit > HealthConfig.regenDelay) p.health = Math.min(HealthConfig.max, p.health + HealthConfig.regenPerSecond * dt);

    this.updateCues(dt, rng);
    this.updateChasers(dt, p, groundHeight);
    this.updateGunfire(dt, p, rng);
    this.updateFlank(dt, p, rng, groundHeight);
  }

  private updateCues(dt: number, rng: Random): void {
    if (this.caught || this.shotDown) return;
    this.cueTimer -= dt;
    if (this.cueTimer > 0) return;
    const closeness = clamp(1 - this.gap / PursuitConfig.maxGap, 0, 1);
    this.cueTimer = lerp(PursuitConfig.cueIntervalFar, PursuitConfig.cueIntervalNear, closeness) * rng.range(0.7, 1.3);
    const table: Partial<Record<PursuitCue, number>> = {
      shout: 3,
      dog: 3 + closeness * 2,
      horse: 2 + closeness * 3,
      whistle: 0.6,
      gunshot: this.gap > PursuitConfig.fireRange && closeness > 0.6 ? 0.8 : 0.15,
    };
    const kind = rng.weighted(table) ?? 'shout';
    this.bus.emit('pursuit:cue', { kind, distance: this.gap, pan: rng.range(-0.6, 0.6) });
  }

  /** The riders and hounds actually behind you, at the gap distance. */
  private updateChasers(dt: number, p: Player, groundHeight: (x: number, d: number) => number): void {
    const visible = this.gap < 150;
    const speed = this.caught || this.shotDown ? Math.max(0, 6 - this.caughtTime * 4) : this.pursuerSpeed(p.d);
    const limit = PlayerConfig.corridorHalfWidth;
    for (const r of this.chasers) {
      if (!visible) {
        this.park(r.horse, r.man);
        continue;
      }
      r.x = damp(r.x, clamp(p.x + r.offset, -limit, limit), 0.9, dt);
      const ended = this.caught || this.shotDown;
      const gap = ended ? Math.max(3 + r.lag, Math.min(this.gap + r.lag, 9) - this.caughtTime * 2.5) : this.gap + r.lag;
      const d = p.d - gap;
      const h = r.horse;
      h.x = r.x;
      h.z = -d;
      h.y = groundHeight(r.x, d);
      h.yaw = 0;
      h.speed = speed;
      // Rider in the saddle; raises the rifle when in range.
      const inRange = this.gap < PursuitConfig.fireRange * 1.3 && !ended;
      r.recoil = Math.max(0, r.recoil - dt * 4);
      if (inRange) Anim.rideAim(r.man.pose, this.time, r.recoil);
      else Anim.ride(r.man.pose, this.time, true);
      r.man.pose.x = h.x;
      r.man.pose.z = h.z + 0.05;
      r.man.pose.y = h.y + h.dims.saddleY + h.bob;
      r.man.pose.yaw = 0;
    }
    for (const hd of this.hounds) {
      if (!visible) {
        hd.dog.y = -50;
        continue;
      }
      hd.x = damp(hd.x, clamp(p.x + hd.offset, -limit, limit), 1.6, dt);
      const ended = this.caught || this.shotDown;
      const gap = ended ? Math.max(1.5, Math.min(this.gap + hd.lag, 6) - this.caughtTime * 3) : this.gap + hd.lag;
      const d = p.d - Math.max(1.2, gap);
      hd.dog.x = hd.x;
      hd.dog.z = -d;
      hd.dog.y = groundHeight(hd.x, d);
      hd.dog.speed = speed * 1.05;
    }
  }

  /** Within 50 ft the riders shoot. Some shots hit. */
  private updateGunfire(dt: number, p: Player, rng: Random): void {
    if (this.caught || this.shotDown || this.gap > PursuitConfig.fireRange) return;
    const C = PursuitConfig;
    for (const r of this.chasers) {
      r.fireTimer -= dt;
      if (r.fireTimer > 0) continue;
      r.fireTimer = rng.range(C.fireInterval[0], C.fireInterval[1]);
      r.recoil = 1;
      // Muzzle flash and powder smoke at the rider.
      const m = this.characters.humans.muzzle(r.man, this.muzzle);
      this.particles.muzzle(m.x, m.y, m.z, 0, -1, false);

      const closeness = 1 - this.gap / C.fireRange;
      let chance = lerp(C.hitChanceFar, C.hitChanceNear, closeness);
      chance -= (Math.abs(p.vx) / PlayerConfig.strafeSpeed) * C.dodgeBonus;
      if (p.downed) chance += 0.15;
      if (!p.grounded) chance -= 0.08;
      const hit = rng.next() < clamp(chance, 0.06, 0.8);
      this.bus.emit('pursuit:shot', { hit, distance: this.gap, pan: clamp((r.x - p.x) / 6, -1, 1) });
      if (hit) {
        p.health -= HealthConfig.shotDamage;
        p.sinceHit = 0;
        p.stumbleTimer = Math.max(p.stumbleTimer, 0.6);
        p.speed *= 0.8;
        this.bus.emit('player:wounded', { health: p.health });
        if (p.health <= 0) {
          this.shotDown = true;
          this.caughtTime = 0;
        }
        return; // one hit at a time
      }
      // The ball kicks up dirt somewhere near you.
      const side = rng.sign();
      this.particles.dustKick(p.x + side * rng.range(0.6, 2.5), p.y, p.z - rng.range(1, 6), 1.2, 0x6a5a48);
    }
  }

  /** Occasionally riders appear out on the flank ahead, searching, then turn away. */
  private updateFlank(dt: number, p: Player, rng: Random, groundHeight: (x: number, d: number) => number): void {
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
    if (!f.active) {
      for (const r of this.flankers) this.park(r.horse, r.man);
      return;
    }
    f.time += dt;
    const speed = 8;
    f.d += speed * dt;
    if (f.time > 5) f.x += f.side * 10 * dt;
    this.flankers.forEach((r, i) => {
      const x = f.x + f.side * i * 2.4;
      const d = f.d - i * 3.2;
      r.horse.x = x;
      r.horse.z = -d;
      r.horse.y = groundHeight(x, d);
      r.horse.yaw = f.time > 5 ? -f.side * 0.6 : 0;
      r.horse.speed = speed;
      Anim.ride(r.man.pose, this.time + i, true);
      r.man.pose.x = x;
      r.man.pose.z = -d + 0.05;
      r.man.pose.y = r.horse.y + r.horse.dims.saddleY + r.horse.bob;
      r.man.pose.yaw = r.horse.yaw;
    });
    if (f.time > 11 || f.d < p.d - 20) f.active = false;
  }
}

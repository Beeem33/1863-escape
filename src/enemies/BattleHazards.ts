import * as THREE from 'three';
import { HazardConfig, PlayerConfig } from '../config/GameConfig';
import { Difficulty } from '../core/Difficulty';
import type { EventBus } from '../core/EventBus';
import type { Particles } from '../effects/Particles';
import type { Player } from '../player/Player';
import type { Random } from '../utils/Random';

interface Shell {
  x: number;
  d: number;
  y: number;
  timer: number;
  marker: THREE.Mesh;
}

/**
 * Battlefield dangers aimed (loosely) at the runner: artillery shells that
 * whistle in and burst ahead, and musket balls kicking up dirt nearby.
 * Every strike is telegraphed: a whistle, then a darkening patch where it
 * will land, so a quick runner can always get clear.
 */
export class BattleHazards {
  private shells: Shell[] = [];
  private markers: THREE.Mesh[] = [];
  private timer = 6;
  private whizTimer = 3;
  /** Untargeted shell bursts all over the field — the battle doesn't care about you. */
  private barrageTimer = 2;
  private readonly group = new THREE.Group();
  private readonly markerGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus,
    private readonly particles: Particles,
  ) {
    scene.add(this.group);
  }

  reset(): void {
    for (const s of this.shells) this.freeMarker(s.marker);
    this.shells = [];
    this.timer = 6;
  }

  private takeMarker(): THREE.Mesh {
    const m =
      this.markers.pop() ??
      new THREE.Mesh(this.markerGeo, new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  private freeMarker(m: THREE.Mesh): void {
    this.group.remove(m);
    this.markers.push(m);
  }

  /**
   * @param intensity 0..1 — how much battlefield is present here (0 = none)
   * @returns true if the player was knocked down this frame
   */
  update(dt: number, p: Player, intensity: number, rng: Random, groundHeight: (x: number, d: number) => number): boolean {
    let knocked = false;
    if (intensity > 0.05) {
      const interval = Difficulty.artilleryInterval(p.d) / intensity;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = interval * rng.range(0.6, 1.4);
        this.fire(p, rng, groundHeight);
      }
      // Shells bursting across the field, on the flanks and far ahead.
      this.barrageTimer -= dt;
      if (this.barrageTimer <= 0) {
        this.barrageTimer = rng.range(0.4, 1.2) / intensity;
        const flank = rng.chance(0.75);
        const x = flank ? rng.sign() * rng.range(13, 70) : rng.range(-9, 9);
        const d = flank ? p.d + rng.range(-10, 120) : p.d + rng.range(55, 140);
        const y = groundHeight(x, d);
        const strength = rng.range(0.6, 1.2);
        this.particles.explosion(x, y, -d, strength);
        this.bus.emit('battle:explosion', { x, z: -d, distance: Math.hypot(x - p.x, d - p.d), strength });
      }
      // Musket balls whizzing past and kicking the dirt.
      this.whizTimer -= dt * intensity;
      if (this.whizTimer <= 0) {
        this.whizTimer = rng.range(1.2, 4);
        const x = p.x + rng.sign() * rng.range(1.5, 6);
        const d = p.d + rng.range(4, 16);
        this.particles.dustKick(x, groundHeight(x, d), -d, 1.2, 0x6a5a48);
        this.bus.emit('battle:volley', { distance: 4, pan: Math.sign(x - p.x) * 0.6, count: 1 });
      }
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.timer -= dt;
      const k = 1 - Math.max(0, s.timer) / HazardConfig.artilleryWarning;
      const mat = s.marker.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 * k * k;
      s.marker.scale.setScalar(HazardConfig.artilleryBlastRadius * (0.5 + 0.5 * k));
      if (s.timer <= 0) {
        knocked = this.explode(s, p) || knocked;
        this.freeMarker(s.marker);
        this.shells.splice(i, 1);
      }
    }
    return knocked;
  }

  private fire(p: Player, rng: Random, groundHeight: (x: number, d: number) => number): void {
    // Aim near where the runner will be, never exactly on them.
    const lead = p.speed * HazardConfig.artilleryWarning;
    const d = p.d + lead + rng.range(-2, 14);
    const limit = PlayerConfig.corridorHalfWidth;
    const x = Math.max(-limit, Math.min(limit, p.x + rng.range(-7, 7)));
    const y = groundHeight(x, d);
    const marker = this.takeMarker();
    marker.position.set(x, y + 0.05, -d);
    this.shells.push({ x, d, y, timer: HazardConfig.artilleryWarning, marker });
    this.bus.emit('battle:artillery', { x, z: -d, distance: Math.hypot(x - p.x, d - p.d), incoming: true });
  }

  private explode(s: Shell, p: Player): boolean {
    this.particles.explosion(s.x, s.y, -s.d, 1);
    const dist = Math.hypot(s.x - p.x, s.d - p.d);
    this.bus.emit('battle:explosion', { x: s.x, z: -s.d, distance: dist, strength: 1 });
    if (dist < HazardConfig.artilleryBlastRadius && p.invulnerableTimer <= 0 && p.y - s.y < 1.5) {
      p.knockedDown = 1.1;
      p.invulnerableTimer = 2;
      p.stumbleTimer = PlayerConfig.stumbleDuration;
      p.speed *= 0.2;
      p.vx = Math.sign(p.x - s.x || 1) * 5;
      this.bus.emit('player:hit', { obstacle: 'artillery', severity: 1.3, damage: HazardConfig.artilleryGapPenalty, x: s.x, z: -s.d });
      return true;
    }
    return false;
  }
}

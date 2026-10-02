import * as THREE from 'three';
import { FallConfig, HazardConfig, PlayerConfig } from '../config/GameConfig';
import type { EventBus } from '../core/EventBus';
import type { Particles } from '../effects/Particles';
import type { Player } from '../player/Player';
import type { Chunk } from '../world/ChunkManager';
import { Barrel } from './Barrel';
import { Barricade, BurningDebris, Debris } from './BattlefieldDebris';
import { Crater, Ditch, Trench } from './Crater';
import { FallenTree, Narrows } from './FallenTree';
import { Fence } from './Fence';
import { FallenBranch, HayBale, Plow, Rock, Roots, Stump } from './FarmObstacles';
import type { CollisionBox, Obstacle } from './Obstacle';
import type { ObstacleKind } from './ObstacleKinds';
import { BrokenWagon, Wagon } from './Wagon';
import { MudPit, ShallowWater, Stream } from './Water';

/**
 * Registry of obstacle classes. To add a new obstacle:
 *   1. Add its id to ObstacleKind (ObstacleKinds.ts)
 *   2. Give it a spec in ObstacleCatalog.ts (size, collision, damage)
 *   3. Subclass Obstacle and register the class here
 *   4. Give it a spawn weight in a map's table in config/MapConfig.ts
 */
const REGISTRY: Record<ObstacleKind, () => Obstacle> = {
  fence: () => new Fence(),
  barrel: () => new Barrel(),
  wagon: () => new Wagon(),
  hayBale: () => new HayBale(),
  branch: () => new FallenBranch(),
  rock: () => new Rock(),
  plow: () => new Plow(),
  ditch: () => new Ditch(),
  fallenTree: () => new FallenTree(),
  mudPit: () => new MudPit(),
  water: () => new ShallowWater(),
  roots: () => new Roots(),
  narrows: () => new Narrows(),
  stream: () => new Stream(),
  stump: () => new Stump(),
  crater: () => new Crater(),
  trench: () => new Trench(),
  barricade: () => new Barricade(),
  brokenWagon: () => new BrokenWagon(),
  debris: () => new Debris(),
  burningDebris: () => new BurningDebris(),
};

export interface HitResult {
  obstacle: Obstacle;
  severity: number;
  /** Tripped over a low obstacle and is going down on his face (see FallConfig). */
  trip: boolean;
}

export class ObstacleManager {
  readonly group = new THREE.Group();
  private pools = new Map<ObstacleKind, Obstacle[]>();
  readonly active = new Set<Obstacle>();
  /** Show collision boxes (debug). */
  private debugGroup = new THREE.Group();
  private debugBoxes = false;

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus,
    private readonly particles: Particles,
  ) {
    this.group.name = 'obstacles';
    scene.add(this.group, this.debugGroup);
  }

  /** Spawn every obstacle in a freshly built chunk. */
  populate(chunk: Chunk, groundHeight: (x: number, d: number) => number): void {
    for (const s of chunk.layout.obstacles) {
      const pool = this.pools.get(s.kind) ?? [];
      this.pools.set(s.kind, pool);
      const o = pool.pop() ?? REGISTRY[s.kind]();
      // Holes sit on the undeformed ground; everything else on the local surface.
      const y = o.spec.deformation ? groundHeight(s.x, s.d - s.depth) : groundHeight(s.x, s.d);
      o.spawn(s, y);
      this.group.add(o.object);
      this.active.add(o);
      chunk.owned.push({ release: () => this.release(o) });
    }
    if (this.debugBoxes) this.rebuildDebug();
  }


  private release(o: Obstacle): void {
    if (!this.active.delete(o)) return;
    o.release();
    this.pools.get(o.kind)!.push(o);
  }

  update(dt: number, time: number, playerD: number): void {
    const ctx = { dt, time, particles: this.particles, playerD };
    for (const o of this.active) o.update(ctx);
  }

  /**
   * Test the player against nearby obstacles. Applies slowdowns directly and
   * returns the first collision (if any) for the game to react to.
   */
  collide(p: Player): HitResult | null {
    const r = PlayerConfig.radius;
    let slow = 1;
    let hit: HitResult | null = null;
    p.terrainSlow = 1;

    for (const o of this.active) {
      if (Math.abs(o.d - p.d) > o.depth / 2 + 3) continue;
      for (const b of o.boxes) {
        if (!this.overlaps(b, p.x, p.d, r, o)) continue;
        const feet = p.y - o.baseY;
        switch (b.kind) {
          case 'slow':
            if (p.grounded) slow = Math.min(slow, HazardConfig.mudSlow);
            break;
          case 'ground':
            if (p.grounded && !hit && p.invulnerableTimer <= 0) hit = { obstacle: o, severity: 0.7, trip: false };
            break;
          case 'vault':
          case 'solid':
            // Cleared it if the feet are above the top (small forgiveness).
            if (feet < b.height - 0.12 && !hit && p.invulnerableTimer <= 0) hit = { obstacle: o, severity: b.kind === 'solid' ? 1 : 0.8, trip: b.kind === 'vault' && !p.falling && Math.random() < FallConfig.chance };
            break;
        }
      }
    }
    if (p.inWater) slow = Math.min(slow, HazardConfig.waterSlow);
    p.terrainSlow = slow;
    if (slow < 1 && p.surface !== 'water') p.surface = 'mud';

    if (hit) this.applyHit(p, hit);
    return hit;
  }

  private overlaps(b: CollisionBox, x: number, d: number, r: number, o: Obstacle): boolean {
    if (b.radius !== undefined) return Math.hypot(x - o.x, d - o.d) < b.radius;
    return x + r > b.minX && x - r < b.maxX && d + r > b.minD && d - r < b.maxD;
  }

  private applyHit(p: Player, h: HitResult): void {
    const o = h.obstacle;
    p.invulnerableTimer = PlayerConfig.hitInvulnerability;
    p.stumbleTimer = PlayerConfig.stumbleDuration;
    p.speed *= h.trip ? 0.6 : h.severity >= 1 ? 0.35 : 0.55;
    // Shove the runner sideways, away from the obstacle's centre (a trip pitches him forward instead).
    const dir = p.x < o.x ? -1 : 1;
    p.vx = h.trip ? 0 : dir * o.knockback;
    o.onHit(p.x, this.particles);
    // A fall costs its time on the ground instead of the usual gap penalty.
    const damage = h.trip ? FallConfig.extraDamage : o.damage * (h.severity >= 1 ? 1 : 0.8);
    this.bus.emit('player:hit', { obstacle: o.kind, severity: h.severity, damage, x: o.x, z: -o.d });
  }

  clear(): void {
    for (const o of [...this.active]) this.release(o);
  }

  get debugEnabled(): boolean {
    return this.debugBoxes;
  }

  /** Toggle wireframe collision boxes (F3). */
  setDebug(on: boolean): void {
    this.debugBoxes = on;
    this.rebuildDebug();
  }

  rebuildDebug(): void {
    for (const c of [...this.debugGroup.children]) {
      this.debugGroup.remove(c);
      (c as THREE.LineSegments).geometry.dispose();
    }
    if (!this.debugBoxes) return;
    const colors = { solid: 0xff3030, vault: 0xffd030, ground: 0x30a0ff, slow: 0x60ff60 };
    for (const o of this.active) {
      for (const b of o.boxes) {
        const h = Math.max(0.05, b.height);
        const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.maxX - b.minX, h, b.maxD - b.minD));
        const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: colors[b.kind], depthTest: false }));
        line.position.set((b.minX + b.maxX) / 2, o.baseY + h / 2, -(b.minD + b.maxD) / 2);
        this.debugGroup.add(line);
      }
    }
  }
}

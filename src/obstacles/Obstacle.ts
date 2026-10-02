import * as THREE from 'three';
import type { Particles } from '../effects/Particles';
import { Random } from '../utils/Random';
import type { ObstacleSpawn } from '../world/ProceduralGenerator';
import { OBSTACLE_SPECS, type ObstacleSpec } from './ObstacleCatalog';
import type { CollisionKind, ObstacleKind } from './ObstacleKinds';

/** Axis-aligned collision footprint in (x, d) space plus a height above the obstacle's base. */
export interface CollisionBox {
  minX: number;
  maxX: number;
  minD: number;
  maxD: number;
  height: number;
  kind: CollisionKind;
  /** Optional circular footprint (craters): centre + radius replace the box test. */
  radius?: number;
}

export interface ObstacleUpdateContext {
  dt: number;
  time: number;
  particles: Particles;
  playerD: number;
}

/**
 * Base class for every obstacle.
 *
 * Subclasses implement `build()` to dress the obstacle for its size (using
 * `part()` so meshes are reused when the obstacle is pooled) and may override
 * `buildCollision()`, `onHit()` and `animate()`.
 *
 * Configurable per obstacle (see ObstacleCatalog.ts): position, size,
 * collision kind, damage, knockback; spawn probability lives in MapConfig.ts.
 */
export abstract class Obstacle {
  abstract readonly kind: ObstacleKind;
  readonly object = new THREE.Group();
  x = 0;
  d = 0;
  /** Ground height at the obstacle's centre. */
  baseY = 0;
  width = 1;
  depth = 1;
  boxes: CollisionBox[] = [];
  /** True once the player has collided with it (plays the hit reaction once). */
  wasHit = false;
  protected hitAge = 0;
  protected hitDir = 0;
  protected rng = new Random(1);
  protected spawnInfo!: ObstacleSpawn;
  private partIndex = 0;

  get spec(): ObstacleSpec {
    return OBSTACLE_SPECS[this.kind];
  }

  get damage(): number {
    return this.spec.damage;
  }

  get knockback(): number {
    return this.spec.knockback;
  }

  spawn(s: ObstacleSpawn, groundY: number): void {
    this.spawnInfo = s;
    this.x = s.x;
    this.d = s.d;
    this.width = s.width;
    this.depth = s.depth;
    this.baseY = groundY;
    this.wasHit = false;
    this.hitAge = 0;
    this.rng = new Random(s.seed);
    this.object.position.set(s.x, groundY, -s.d);
    this.object.rotation.set(0, 0, 0);
    this.object.scale.set(1, 1, 1);
    this.partIndex = 0;
    this.build(this.rng);
    // Hide parts left over from a previous, larger configuration.
    for (let i = this.partIndex; i < this.object.children.length; i++) this.object.children[i].visible = false;
    this.boxes = [];
    this.buildCollision();
  }

  /** Dress the obstacle. Use `part()` for every mesh. */
  protected abstract build(rng: Random): void;

  /** Default: a single box covering the footprint. */
  protected buildCollision(): void {
    this.addBox(this.x, this.d, this.width, this.depth, this.spec.height, this.spec.collision);
  }

  protected addBox(cx: number, cd: number, w: number, dpt: number, height: number, kind: CollisionKind): void {
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minD: cd - dpt / 2, maxD: cd + dpt / 2, height, kind });
  }

  /**
   * Add (or reuse) a child mesh. Position is local to the obstacle centre:
   * x across the corridor, y up, z along the run (+z = toward the player).
   */
  protected part(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): THREE.Mesh {
    let mesh = this.object.children[this.partIndex] as THREE.Mesh | undefined;
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.object.add(mesh);
    }
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.visible = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.userData.base = { px: x, py: y, pz: z, rx, ry, rz };
    this.partIndex++;
    return mesh;
  }

  /** Called once when the player collides with this obstacle. */
  onHit(playerX: number, particles: Particles): void {
    this.wasHit = true;
    this.hitAge = 0;
    this.hitDir = playerX < this.x ? 1 : -1;
    particles.dustKick(playerX, this.baseY, -this.d, 2.5, 0x8a7458);
  }

  update(ctx: ObstacleUpdateContext): void {
    if (this.wasHit) {
      this.hitAge += ctx.dt;
      this.animateHit(this.hitAge);
    }
    this.animate(ctx);
  }

  /** Default hit reaction: a short shudder. */
  protected animateHit(age: number): void {
    if (age > 0.5) {
      this.object.rotation.z = 0;
      return;
    }
    this.object.rotation.z = Math.sin(age * 40) * 0.04 * (1 - age / 0.5);
  }

  /** Continuous animation (fire, sway…). */
  protected animate(_ctx: ObstacleUpdateContext): void {}

  /** Stop animating when returned to the pool. */
  release(): void {
    this.object.removeFromParent();
  }
}

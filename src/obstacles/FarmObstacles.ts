import * as THREE from 'three';
import type { Random } from '../utils/Random';
import { Obstacle } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';
import { prep } from '../world/props/GeometryUtils';

/** A low row of bound hay bales — vault them. */
export class HayBale extends Obstacle {
  readonly kind = 'hayBale' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const n = Math.max(1, Math.round(this.width / 1.1));
    const w = this.width / n;
    for (let i = 0; i < n; i++) {
      const x = -this.width / 2 + w * (i + 0.5);
      const ry = rng.range(-0.12, 0.12);
      this.part(Geo.box(), M.hay, x, 0, rng.range(-0.1, 0.1), 0, ry, 0, w * 0.95, rng.range(0.85, 0.98), 1.0);
      // Twine.
      this.part(Geo.box(), M.woodDark, x - w * 0.25, 0, 0, 0, ry, 0, 0.03, 0.99, 1.02);
      this.part(Geo.box(), M.woodDark, x + w * 0.25, 0, 0, 0, ry, 0, 0.03, 0.99, 1.02);
    }
  }
}

/** A fallen limb with dead leaves — low enough to hurdle. */
export class FallenBranch extends Obstacle {
  readonly kind = 'branch' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const r = 0.16;
    this.part(Geo.logX(), M.bark, 0, r + 0.02, 0, 0, rng.range(-0.15, 0.15), rng.range(-0.04, 0.04), this.width, r, r);
    for (let i = 0; i < 5; i++) {
      const x = rng.range(-0.45, 0.45) * this.width;
      const len = rng.range(0.8, 1.6);
      const a = rng.range(-1, 1);
      this.part(Geo.logX(), M.bark, x + len * 0.3, 0.3, Math.sin(a) * 0.4, 0, a + Math.PI / 2, 0.5, len, 0.05, 0.05);
      this.part(Geo.sphere(), M.leaves, x, 0.4, rng.range(-0.3, 0.3), 0, rng.range(0, 3), 0, rng.range(0.4, 0.7), 0.3, 0.5);
    }
  }
}

/** Arching cypress roots breaking through the mud. */
export class Roots extends Obstacle {
  readonly kind = 'roots' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const n = Math.max(3, Math.round(this.width * 1.4));
    for (let i = 0; i < n; i++) {
      const x = rng.range(-0.5, 0.5) * this.width;
      const span = rng.range(0.8, 1.6);
      this.part(cachedArc(span), M.barkDark, x, 0, rng.range(-0.4, 0.4), 0, rng.range(-0.8, 0.8), 0, 1, rng.range(0.6, 1.0), 1);
    }
  }
}

const arcCache = new Map<number, THREE.BufferGeometry>();
function cachedArc(span: number): THREE.BufferGeometry {
  const key = Math.round(span * 4) / 4;
  let g = arcCache.get(key);
  if (!g) {
    g = prep(new THREE.TorusGeometry(key / 2, 0.09, 5, 10, Math.PI), 0xffffff);
    arcCache.set(key, g);
  }
  return g;
}

/** A boulder — solid; go around. */
export class Rock extends Obstacle {
  readonly kind = 'rock' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const v = rng.int(0, 3);
    this.part(Geo.rock(v), M.stone, 0, -0.15, 0, 0, rng.range(0, Math.PI * 2), 0, this.width * 0.55, this.spec.height * 1.25, this.depth * 0.55);
    if (rng.chance(0.6)) this.part(Geo.rock(v + 4), M.stone, this.width * 0.45, -0.1, 0.3, 0, rng.range(0, 6), 0, 0.4, 0.5, 0.4);
  }
}

/** A tree stump with spreading roots. */
export class Stump extends Obstacle {
  readonly kind = 'stump' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const r = this.width * 0.42;
    this.part(Geo.cylinder(9), M.bark, 0, -0.1, 0, rng.range(-0.05, 0.05), rng.range(0, 3), 0, r, this.spec.height + 0.1, r);
    this.part(Geo.cylinder(9), M.woodWeathered, 0, this.spec.height - 0.01, 0, 0, 0, 0, r * 0.92, 0.02, r * 0.92);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
      this.part(Geo.logX(), M.bark, Math.cos(a) * r, 0.08, Math.sin(a) * r, 0, -a, -0.35, r * 1.4, 0.09, 0.09);
    }
  }
}

/** A plough or harrow left in the furrows. */
export class Plow extends Obstacle {
  readonly kind = 'plow' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const ry = rng.range(-0.6, 0.6);
    this.part(Geo.box(), M.woodDark, 0, 0.5, 0, 0.35, ry, 0, 0.14, 0.14, 1.7);
    this.part(Geo.box(), M.iron, Math.sin(ry) * 0.7, 0.05, Math.cos(ry) * -0.7, 0.6, ry, 0, 0.35, 0.05, 0.55);
    for (const side of [-1, 1]) {
      this.part(Geo.box(), M.woodDark, Math.cos(ry) * side * 0.3 + Math.sin(ry) * 0.6, 0.55, Math.cos(ry) * 0.6 - Math.sin(ry) * side * 0.3, -0.7, ry, 0, 0.06, 0.06, 1.1);
    }
    if (this.width > 2) {
      // A harrow frame beside it.
      this.part(Geo.box(), M.woodDark, -0.9, 0.05, 0.2, 0, rng.range(0, 1), 0, 1.0, 0.1, 1.0);
    }
  }
}

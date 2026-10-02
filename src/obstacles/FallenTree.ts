import type { Random } from '../utils/Random';
import { Obstacle } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/** A great trunk down across the trail, root plate torn from the mud. Vault it. */
export class FallenTree extends Obstacle {
  readonly kind = 'fallenTree' as const;
  private plateSide = 0;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const r = 0.46;
    const yaw = rng.range(-0.08, 0.08);
    this.part(Geo.logX(), M.bark, 0, r, 0, 0, yaw, rng.range(-0.02, 0.02), this.width, r, r);
    // Broken stubs of branches.
    for (let i = 0; i < 5; i++) {
      const x = rng.range(-0.4, 0.45) * this.width;
      const a = rng.range(0.4, 1.2) * rng.sign();
      this.part(Geo.logX(), M.bark, x, r * 1.4, rng.range(-0.2, 0.2), a, rng.range(-1, 1), 1.0, rng.range(0.6, 1.4), 0.08, 0.08);
    }
    // Root plate on whichever end sits outside the corridor (never blocks the route).
    const leftEnd = this.x - this.width / 2;
    const rightEnd = this.x + this.width / 2;
    this.plateSide = leftEnd < -10.5 ? -1 : rightEnd > 10.5 ? 1 : 0;
    if (this.plateSide !== 0) {
      this.part(Geo.sphere(), M.earth, (this.plateSide * this.width) / 2, 0.9, 0, 0, rng.range(0, 3), 0, 0.35, 1.3, 1.4);
    }
    if (rng.chance(0.5)) this.part(Geo.sphere(), M.leaves, rng.range(-0.3, 0.3) * this.width, 0.9, -0.3, 0, rng.range(0, 3), 0, 1.0, 0.5, 0.8);
  }
}

/**
 * Narrow passage: massive trunks and root masses crowd in from both sides,
 * leaving one gap. The generator places one on each side of the route.
 */
export class Narrows extends Obstacle {
  readonly kind = 'narrows' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const n = Math.max(1, Math.round(this.width / 2.2));
    for (let i = 0; i < n; i++) {
      const x = -this.width / 2 + (this.width * (i + 0.5)) / n;
      const r = rng.range(0.7, 1.1);
      this.part(Geo.cylinder(9), M.bark, x, -0.2, rng.range(-0.3, 0.3), rng.range(-0.06, 0.06), rng.range(0, 3), rng.range(-0.06, 0.06), r, rng.range(4, 7), r);
      this.part(Geo.cone(), M.barkDark, x, -0.1, 0, 0, rng.range(0, 3), 0, r * 1.7, 1.4, r * 1.7);
    }
    // Hanging moss / tangled vines across the gap edges.
    for (let i = 0; i < 3; i++) {
      this.part(Geo.sphere(), M.leaves, rng.range(-0.5, 0.5) * this.width, rng.range(2.5, 4), 0, 0, rng.range(0, 3), 0, rng.range(0.8, 1.4), 0.6, 0.8);
    }
  }
}

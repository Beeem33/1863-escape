import type { Random } from '../utils/Random';
import { Materials } from '../world/Materials';
import { Obstacle } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/**
 * Slowing hazards. Wading through standing water is detected automatically
 * from the water level, so ponds and streams need no collision boxes; mud
 * uses a `slow` box.
 */

/** Sucking mud — drags your feet. */
export class MudPit extends Obstacle {
  readonly kind = 'mudPit' as const;

  protected build(rng: Random): void {
    this.part(Geo.disc(), Materials().mud, 0, -0.07, 0, 0, rng.range(0, 3), 0, this.width / 2 * 0.95, 1, this.depth / 2 * 0.95);
    for (let i = 0; i < 4; i++) {
      this.part(Geo.sphere(), Materials().mud, rng.range(-0.35, 0.35) * this.width, -0.06, rng.range(-0.35, 0.35) * this.depth, 0, 0, 0, rng.range(0.2, 0.5), 0.06, rng.range(0.2, 0.5));
    }
  }

  protected override buildCollision(): void {
    this.addBox(this.x, this.d, this.width * 0.8, this.depth * 0.8, 0, 'slow');
  }

  protected override animateHit(): void {}
}

/** A shallow pool across the trail — lily pads and reeds. */
export class ShallowWater extends Obstacle {
  readonly kind = 'water' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      this.part(Geo.disc(), M.leaves, Math.cos(a) * this.width * 0.3, -0.19, Math.sin(a) * this.depth * 0.3, 0, a, 0, rng.range(0.25, 0.4), 1, rng.range(0.25, 0.4));
    }
  }

  protected override buildCollision(): void {}
}

/**
 * A stream across the whole corridor with a plank footbridge on the safe
 * route. Some bridges are broken — jump the gap or splash through.
 */
export class Stream extends Obstacle {
  readonly kind = 'stream' as const;
  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const b = this.spawnInfo.bridge;
    if (!b) return;
    const bx = b.x - this.x;
    const len = this.depth + 2.4;
    const planks = Math.round(len / 0.32);
    for (let i = 0; i < planks; i++) {
      const z = -len / 2 + (i + 0.5) * (len / planks);
      if (b.gap > 0 && Math.abs(z) < b.gap / 2) continue;
      this.part(Geo.box(), rng.chance(0.3) ? M.woodWeathered : M.wood, bx + rng.range(-0.05, 0.05), 0.12, z, 0, rng.range(-0.04, 0.04), rng.range(-0.03, 0.03), b.width, 0.07, 0.28);
    }
    for (const side of [-1, 1]) {
      for (const z of [-len / 2, -len / 4, len / 4, len / 2]) {
        this.part(Geo.box(), M.woodDark, bx + (side * b.width) / 2, -0.6, z, 0, 0, 0, 0.12, 1.6, 0.12);
      }
      // Hand rail (missing on broken bridges).
      if (b.gap === 0) this.part(Geo.box(), M.woodDark, bx + (side * b.width) / 2, 0.9, 0, 0, 0, 0, 0.07, 0.07, len);
    }
    if (b.gap > 0) {
      // A broken plank dangling into the water.
      this.part(Geo.box(), M.woodWeathered, bx + 0.3, -0.15, b.gap / 2 - 0.1, 0.9, 0.2, 0, b.width * 0.6, 0.07, 0.28);
    }
  }

  protected override buildCollision(): void {}

  protected override animateHit(): void {}
}

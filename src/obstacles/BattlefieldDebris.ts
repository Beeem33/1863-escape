import type { Random } from '../utils/Random';
import { Obstacle, type ObstacleUpdateContext } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/** Chevaux-de-frise: a log bristling with sharpened stakes. Go around. */
export class Barricade extends Obstacle {
  readonly kind = 'barricade' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    this.part(Geo.logX(), M.bark, 0, 0.75, 0, 0, rng.range(-0.05, 0.05), 0, this.width, 0.16, 0.16);
    const n = Math.max(3, Math.round(this.width / 0.55));
    for (let i = 0; i < n; i++) {
      const x = -this.width / 2 + 0.2 + (i * (this.width - 0.4)) / (n - 1);
      const a = i % 2 === 0 ? 0.75 : -0.75;
      // Stakes cross through the log in an X.
      this.part(Geo.boxC(), M.woodWeathered, x, 0.75, 0, a, 0, 0, 0.07, 2.0, 0.07);
    }
  }

  protected override animateHit(age: number): void {
    this.object.position.x = this.x + Math.sin(age * 35) * 0.04 * Math.exp(-age * 6);
  }
}

/** Battle debris: smashed crates, a wheel, loose planks, a dropped drum. Vault it. */
export class Debris extends Obstacle {
  readonly kind = 'debris' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const n = Math.round(this.width * 1.2);
    for (let i = 0; i < n; i++) {
      const x = rng.range(-0.45, 0.45) * this.width;
      const z = rng.range(-0.3, 0.3) * this.depth;
      switch (rng.int(0, 3)) {
        case 0:
          this.part(Geo.box(), M.woodWeathered, x, 0, z, rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2), 0.6, 0.55, 0.6);
          break;
        case 1:
          this.part(Geo.wheel(), M.woodDark, x, 0.1, z, Math.PI / 2 - 0.2, 0, rng.range(0, 3), 0.55, 0.55, 0.55);
          break;
        case 2:
          this.part(Geo.box(), M.woodDark, x, 0.25, z, 0, rng.range(0, 3), rng.range(0.2, 0.5), 1.6, 0.06, 0.25);
          break;
        default:
          this.part(Geo.cylinder(10), M.clothDirty, x, 0, z, Math.PI / 2, rng.range(0, 3), 0, 0.28, 0.4, 0.28);
      }
    }
  }
}

/** A wrecked caisson burning in the field. The heat drives you around it. */
export class BurningDebris extends Obstacle {
  readonly kind = 'burningDebris' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    this.part(Geo.box(), M.charred, 0, 0, 0, 0, rng.range(-0.3, 0.3), 0.15, this.width * 0.8, 0.8, this.depth * 0.7);
    this.part(Geo.wheel(), M.charred, this.width * 0.35, 0.6, this.depth * 0.4, 0, 0, 0.3, 0.6, 0.6, 0.6);
    for (let i = 0; i < 4; i++) {
      this.part(Geo.box(), M.charred, rng.range(-0.5, 0.5) * this.width, 0.4, rng.range(-0.5, 0.5) * this.depth, rng.range(-0.6, 0.6), rng.range(0, 3), rng.range(-0.6, 0.6), 1.4, 0.12, 0.15);
    }
  }

  protected override animate(ctx: ObstacleUpdateContext): void {
    if (Math.abs(ctx.playerD - this.d) > 160) return;
    ctx.particles.fire(this.x, this.baseY + 0.6, -this.d, this.width * 0.45, ctx.dt, 1);
  }
}

/**
 * Wire entanglement: telegraph wire strung low and criss-crossed between
 * sharpened stakes (barbed wire was not invented until after the war).
 */
export class WireEntanglement extends Obstacle {
  readonly kind = 'wire' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const n = Math.max(2, Math.round(this.width / 1.6));
    const xs: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = -this.width / 2 + (i * this.width) / n + rng.range(-0.15, 0.15);
      xs.push(x);
      for (const z of [-0.35, 0.35]) {
        const h = rng.range(0.7, 0.9);
        this.part(Geo.box(), M.woodWeathered, x, -0.15, z + rng.range(-0.1, 0.1), rng.range(-0.15, 0.15), 0, rng.range(-0.12, 0.12), 0.06, h + 0.15, 0.06);
      }
    }
    // Wire strands: thin dark lines between stakes at several heights, plus diagonals.
    for (let i = 0; i < n; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const len = Math.hypot(x1 - x0, 0.1);
      for (const y of [0.2, 0.45, 0.68]) {
        for (const z of [-0.35, 0.35]) {
          this.part(Geo.boxC(), M.iron, (x0 + x1) / 2, y + rng.range(-0.04, 0.04), z, 0, 0, rng.range(-0.05, 0.05), len, 0.008, 0.008);
        }
      }
      // Criss-cross between the two rows.
      const diag = Math.hypot(x1 - x0, 0.7);
      this.part(Geo.boxC(), M.iron, (x0 + x1) / 2, 0.4, 0, 0, Math.atan2(0.7, x1 - x0), 0.35, diag, 0.008, 0.008);
      this.part(Geo.boxC(), M.iron, (x0 + x1) / 2, 0.4, 0, 0, -Math.atan2(0.7, x1 - x0), -0.35, diag, 0.008, 0.008);
    }
  }
}

import type { Random } from '../utils/Random';
import { Obstacle, type ObstacleUpdateContext } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/**
 * Ground hazards shaped by a terrain Deformation (the hole is in the ground
 * mesh itself). They only catch you if your feet are on the ground — jump
 * across them.
 */

/** A fresh shell crater, still smoking. */
export class Crater extends Obstacle {
  readonly kind = 'crater' as const;
  private smokeTimer = 0;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    // Thrown-up clods around the rim.
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = (this.width / 2) * rng.range(1.0, 1.35);
      this.part(Geo.rock(i % 4), M.earth, Math.cos(a) * r, 0.1, Math.sin(a) * r, 0, rng.range(0, 6), 0, rng.range(0.2, 0.45), 0.3, rng.range(0.2, 0.45));
    }
    if (rng.chance(0.5)) this.part(Geo.box(), M.charred, rng.range(-1, 1), 0, rng.range(-1, 1), 0.3, rng.range(0, 3), 0.2, 1.4, 0.12, 0.2);
    this.smokeTimer = rng.range(0, 1);
  }

  protected override buildCollision(): void {
    const r = (this.width / 2) * 0.72;
    this.boxes.push({ minX: this.x - r, maxX: this.x + r, minD: this.d - r, maxD: this.d + r, height: 0, kind: 'ground', radius: r });
  }

  protected override animateHit(): void {}

  protected override animate(ctx: ObstacleUpdateContext): void {
    if (Math.abs(ctx.playerD - this.d) > 90) return;
    this.smokeTimer -= ctx.dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = 0.35 + Math.random() * 0.4;
    ctx.particles.spawnSmoke({
      x: this.x + (Math.random() - 0.5) * this.width * 0.5,
      y: this.baseY - 0.3,
      z: -this.d + (Math.random() - 0.5) * this.width * 0.5,
      vx: 0.3,
      vy: 0.6 + Math.random() * 0.4,
      life: 4 + Math.random() * 2,
      size: 0.8,
      endSize: 3.5,
      alpha: 0.35,
      color: 0x55504a,
      fadeIn: 0.2,
    });
  }
}

/** A dug trench across the field, revetted with planks. */
export class Trench extends Obstacle {
  readonly kind = 'trench' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    // Spoil heap / parapet on the far side, revetment planks on the walls.
    for (const side of [-1, 1]) {
      this.part(Geo.box(), M.woodDark, 0, -1.1, side * (this.depth / 2 - 0.15), 0, 0, 0, this.width * 0.95, 1.05, 0.06);
    }
    for (let x = -this.width / 2 + 0.6; x < this.width / 2; x += rng.range(1.4, 2.4)) {
      this.part(Geo.box(), M.woodDark, x, -1.15, -this.depth / 2 + 0.1, 0, 0, 0, 0.12, 1.25, 0.12);
    }
    if (rng.chance(0.5)) {
      // A gabion basket or two on the lip.
      this.part(Geo.cylinder(10), M.woodWeathered, rng.range(-0.4, 0.4) * this.width, 0, -this.depth / 2 - 0.7, 0, 0, 0, 0.5, 1.0, 0.5);
    }
  }

  protected override buildCollision(): void {
    this.addBox(this.x, this.d, this.width * 0.95, this.depth * 0.7, 0, 'ground');
  }

  protected override animateHit(): void {}
}

/** An irrigation / drainage ditch cut across the field. */
export class Ditch extends Obstacle {
  readonly kind = 'ditch' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    // A plank someone laid across — not where you need it.
    if (rng.chance(0.5)) {
      const x = rng.range(-0.45, 0.45) * this.width;
      this.part(Geo.box(), M.woodWeathered, x, -0.05, 0, 0, Math.PI / 2 + rng.range(-0.2, 0.2), 0.05, 0.35, 0.06, this.depth + 1.2);
    }
    for (let i = 0; i < 3; i++) {
      this.part(Geo.rock(i), M.stone, rng.range(-0.5, 0.5) * this.width, -0.4, rng.range(-0.3, 0.3), 0, rng.range(0, 6), 0, 0.25, 0.25, 0.25);
    }
  }

  protected override buildCollision(): void {
    this.addBox(this.x, this.d, this.width * 0.92, this.depth * 0.65, 0, 'ground');
  }

  protected override animateHit(): void {}
}

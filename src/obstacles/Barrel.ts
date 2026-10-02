import type * as THREE from 'three';
import type { Random } from '../utils/Random';
import { Obstacle } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/** One to three wooden barrels. Knock one and it tumbles away. */
export class Barrel extends Obstacle {
  readonly kind = 'barrel' as const;
  private barrels: { group: THREE.Object3D[]; x: number; lying: boolean }[] = [];

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const count = Math.max(1, Math.min(3, Math.round(this.width / 0.8)));
    this.barrels = [];
    for (let i = 0; i < count; i++) {
      const x = -this.width / 2 + 0.4 + (i * (this.width - 0.8)) / Math.max(1, count - 1);
      const lying = count > 1 && rng.chance(0.25);
      const z = rng.range(-0.2, 0.2);
      const parts: THREE.Object3D[] = [];
      if (lying) {
        parts.push(this.part(Geo.barrel(), M.woodDark, x, 0.33, z + 0.45, Math.PI / 2, rng.range(-0.5, 0.5), 0));
      } else {
        const ry = rng.range(0, Math.PI);
        parts.push(this.part(Geo.barrel(), M.woodDark, x, 0, z, 0, ry, 0));
        parts.push(this.part(Geo.hoop(), M.iron, x, 0.16, z, 0, 0, 0, 0.33, 1, 0.33));
        parts.push(this.part(Geo.hoop(), M.iron, x, 0.74, z, 0, 0, 0, 0.33, 1, 0.33));
        parts.push(this.part(Geo.cylinder(14), M.woodDark, x, 0.86, z, 0, 0, 0, 0.29, 0.03, 0.29));
      }
      this.barrels.push({ group: parts, x, lying });
    }
  }

  protected override buildCollision(): void {
    for (const b of this.barrels) this.addBox(this.x + b.x, this.d, 0.72, 0.8, this.spec.height, 'vault');
  }

  protected override animateHit(age: number): void {
    // Barrels topple and roll off in the direction they were struck.
    const t = Math.min(age, 1.5);
    for (const b of this.barrels) {
      for (const p of b.group) {
        const base = p.userData.base as { px: number; py: number; pz: number; rx: number; rz: number };
        p.position.x = base.px + this.hitDir * t * 2.2;
        p.position.z = base.pz - t * 1.5;
        p.rotation.z = base.rz + this.hitDir * Math.min(1, age * 4) * (Math.PI / 2) * (b.lying ? 0 : 1);
        if (!b.lying) p.position.y = base.py * Math.max(0.35, 1 - age * 3) + Math.min(1, age * 4) * 0.3;
      }
    }
  }
}

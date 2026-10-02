import type { Random } from '../utils/Random';
import { Obstacle } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/**
 * A run of plank fence, often broken. Sections with every rail missing are
 * real gaps you can run through; the rest must be vaulted (Space).
 */
export class Fence extends Obstacle {
  readonly kind = 'fence' as const;
  private sections: { x0: number; x1: number; solid: boolean }[] = [];

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const posts = Math.max(2, Math.round(this.width / 2.4) + 1);
    const span = this.width / (posts - 1);
    const left = -this.width / 2;
    const wood = rng.chance(0.5) ? M.woodWeathered : M.wood;
    this.sections = [];
    for (let i = 0; i < posts; i++) {
      const x = left + i * span;
      const lean = rng.chance(0.2) ? rng.range(-0.25, 0.25) : rng.range(-0.04, 0.04);
      const h = rng.range(1.05, 1.25);
      this.part(Geo.box(), wood, x, -0.2, 0, lean, 0, lean * 0.5, 0.14, h + 0.2, 0.14);
      if (i === posts - 1) break;
      // Rails between this post and the next.
      let rails = 0;
      const broken = rng.chance(0.22);
      for (let r = 0; r < 3; r++) {
        if (broken && rng.chance(0.6)) continue;
        const y = 0.3 + r * 0.32;
        const sag = rng.range(-0.05, 0.05);
        const drop = broken && rng.chance(0.3);
        this.part(Geo.plank(0xffffff), wood, x + span / 2, drop ? 0.12 : y, 0.06, drop ? 0.4 : 0, rng.range(-0.03, 0.03), drop ? 0.25 : sag, span + 0.1, 0.12, 0.035);
        rails++;
      }
      this.sections.push({ x0: x, x1: x + span, solid: rails > 0 });
    }
  }

  protected override buildCollision(): void {
    for (const s of this.sections) {
      if (!s.solid) continue;
      this.addBox(this.x + (s.x0 + s.x1) / 2, this.d, s.x1 - s.x0 + 0.1, 0.45, this.spec.height, 'vault');
    }
  }

  protected override animateHit(age: number): void {
    // The fence shudders and leans away from the impact.
    const k = Math.min(1, age * 6);
    this.object.rotation.x = -0.12 * k * Math.exp(-age * 0.5);
    this.object.rotation.z = Math.sin(age * 30) * 0.02 * Math.exp(-age * 6);
  }
}

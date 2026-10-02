import type { Random } from '../utils/Random';
import { Obstacle } from './Obstacle';
import { Geo } from './ObstacleGeometry';
import { ObstacleMaterials } from './ObstacleMaterials';

/** Farm wagon, sometimes with a canvas cover. Too tall to vault — go around. */
export class Wagon extends Obstacle {
  readonly kind = 'wagon' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const across = this.width >= this.depth;
    const len = (across ? this.width : this.depth) * 0.92;
    const wid = Math.min(1.9, (across ? this.depth : this.width) * 0.95);
    const ry = across ? Math.PI / 2 : 0;
    // Everything is built along local Z then rotated with the bed.
    const rot = (lx: number, lz: number): [number, number] => (across ? [lz, -lx] : [lx, lz]);
    const [bx, bz] = rot(0, 0);
    this.part(Geo.box(), M.wood, bx, 0.75, bz, 0, ry, 0, wid, 0.18, len);
    for (const side of [-1, 1]) {
      const [sx, sz] = rot((side * wid) / 2, 0);
      this.part(Geo.box(), M.wood, sx, 0.9, sz, 0, ry, 0, 0.08, 0.55, len);
    }
    for (const end of [-1, 1]) {
      const [ex, ez] = rot(0, (end * len) / 2);
      this.part(Geo.box(), M.wood, ex, 0.9, ez, 0, ry, 0, wid, 0.55, 0.08);
    }
    // Wheels (bigger at the back).
    for (const [lz, r] of [
      [len * 0.33, 0.62],
      [-len * 0.33, 0.48],
    ] as const) {
      for (const side of [-1, 1]) {
        const [wx, wz] = rot((side * (wid / 2 + 0.08)), lz);
        this.part(Geo.wheel(), M.woodDark, wx, r, wz, 0, ry + Math.PI / 2, rng.range(0, 3), r, r, r);
      }
    }
    // Tongue.
    const [tx, tz] = rot(0, -len / 2 - 0.9);
    this.part(Geo.box(), M.woodDark, tx, 0.45, tz, 0.25, ry, 0, 0.1, 0.1, 1.9);
    if (rng.chance(0.55)) {
      const [cx, cz] = rot(0, 0);
      this.part(Geo.cover(), M.clothDirty, cx, 1.15, cz, 0, ry, 0, wid / 2 + 0.05, 1.2, len * 0.85);
    } else {
      // Loaded with cotton sacks / crates.
      for (let i = 0; i < 4; i++) {
        const [cx, cz] = rot(rng.range(-0.4, 0.4) * wid, rng.range(-0.35, 0.35) * len);
        this.part(Geo.box(), rng.chance(0.5) ? M.clothDirty : M.woodWeathered, cx, 0.93, cz, 0, rng.range(0, 3), 0, 0.6, 0.5, 0.6);
      }
    }
  }
}

/** An overturned, smashed army wagon on the battlefield. */
export class BrokenWagon extends Obstacle {
  readonly kind = 'brokenWagon' as const;

  protected build(rng: Random): void {
    const M = ObstacleMaterials();
    const len = this.width * 0.9;
    const wood = rng.chance(0.4) ? M.charred : M.woodDark;
    // Wagon bed flipped upside down on its side boards, slightly askew.
    this.part(Geo.box(), wood, 0, 0.9, 0, 0, 0, 0.1, len, 0.15, 1.6);
    for (const side of [-1, 1]) this.part(Geo.box(), wood, 0, 0.25, side * 0.75, 0, 0, 0.1, len * 0.95, 0.65, 0.1);
    // One wheel up in the air, one in the dirt.
    this.part(Geo.wheel(), M.woodDark, -len * 0.3, 1.45, -0.5, 0.2, 0, rng.range(0, 3), 0.55, 0.55, 0.55);
    this.part(Geo.wheel(), M.woodDark, len * 0.35, 0.12, 0.6, Math.PI / 2 - 0.1, 0, 0, 0.6, 0.6, 0.6);
    // Spilled crates.
    for (let i = 0; i < 3; i++) {
      this.part(Geo.box(), M.woodWeathered, rng.range(-len / 2, len / 2), 0, rng.range(0.4, 0.9), 0, rng.range(0, 3), 0, 0.55, 0.45, 0.55);
    }
  }
}

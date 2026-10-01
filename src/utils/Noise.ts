import { hash32 } from './Random';

/**
 * Seeded 2D value noise + fractal sum. Deterministic per seed, continuous in
 * world space (so terrain chunks join seamlessly) and cheap enough to sample
 * thousands of times per chunk.
 */
export class Noise2D {
  constructor(private readonly seed: number) {}

  private lattice(ix: number, iy: number): number {
    return hash32(ix, iy, this.seed) / 4294967295;
  }

  /** Smooth value noise in [0, 1]. */
  value(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = this.lattice(ix, iy);
    const b = this.lattice(ix + 1, iy);
    const c = this.lattice(ix, iy + 1);
    const d = this.lattice(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /** Signed fractal noise in roughly [-1, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += (this.value(x * freq, y * freq) * 2 - 1) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

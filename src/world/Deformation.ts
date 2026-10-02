import { smoothstep } from '../utils/MathUtils';

export type DeformationKind = 'crater' | 'pond' | 'mud' | 'ditch' | 'trench' | 'stream';

/**
 * A local change to the ground shape — a crater, a pond, a trench. Obstacles
 * that are "holes" create one of these; the terrain mesh AND the player's
 * ground query both include it, so what you see is what you run on.
 */
export class Deformation {
  /** Axis-aligned bounds (x, d) for quick rejection. */
  readonly minX: number;
  readonly maxX: number;
  readonly minD: number;
  readonly maxD: number;

  constructor(
    readonly kind: DeformationKind,
    readonly x: number,
    readonly d: number,
    /** Half extent across (x). */
    readonly rx: number,
    /** Half extent along the run (d). */
    readonly rd: number,
    readonly depth: number,
    /** Optional walkable deck across a stream: [minX, maxX], and a broken gap along d. */
    readonly bridge: { minX: number; maxX: number; gap: number } | null = null,
  ) {
    const pad = kind === 'crater' ? 1.6 : 0.6;
    this.minX = x - rx - pad;
    this.maxX = x + rx + pad;
    this.minD = d - rd - pad;
    this.maxD = d + rd + pad;
  }

  contains(x: number, d: number): boolean {
    return x >= this.minX && x <= this.maxX && d >= this.minD && d <= this.maxD;
  }

  /**
   * Height offset at (x, d). `forWalking` lets a bridge deck carry the runner
   * over a stream while the rendered ground still dips beneath it.
   */
  height(x: number, d: number, forWalking: boolean): number {
    if (!this.contains(x, d)) return 0;
    const ex = (x - this.x) / this.rx;
    const ed = (d - this.d) / this.rd;
    switch (this.kind) {
      case 'crater': {
        const r = Math.sqrt(ex * ex + ed * ed);
        const bowl = r < 1 ? -this.depth * (1 - r * r) : 0;
        const rim = 0.32 * Math.exp(-((r - 1.05) * (r - 1.05)) / 0.035);
        return bowl + rim;
      }
      case 'pond':
      case 'mud': {
        const r = Math.sqrt(ex * ex + ed * ed);
        return -this.depth * (1 - smoothstep(0.55, 1, r));
      }
      case 'ditch':
      case 'trench': {
        const across = 1 - smoothstep(0.85, 1.05, Math.abs(ex));
        const along = 1 - smoothstep(0.55, 1, Math.abs(ed));
        return -this.depth * across * along;
      }
      case 'stream': {
        const along = 1 - smoothstep(0.5, 1, Math.abs(ed));
        const dip = -this.depth * along;
        if (forWalking && this.bridge && x >= this.bridge.minX && x <= this.bridge.maxX && Math.abs(d - this.d) < this.rd + 1.2) {
          const inGap = this.bridge.gap > 0 && Math.abs(d - this.d) < this.bridge.gap / 2;
          return inGap ? dip : 0.22;
        }
        return dip;
      }
    }
  }

  /** 0..1 — how much this deformation recolours the ground at (x, d). */
  stain(x: number, d: number): number {
    if (!this.contains(x, d)) return 0;
    const ex = (x - this.x) / (this.rx + 0.8);
    const ed = (d - this.d) / (this.rd + 0.8);
    if (this.kind === 'ditch' || this.kind === 'trench' || this.kind === 'stream') {
      return (1 - smoothstep(0.8, 1, Math.abs(ex))) * (1 - smoothstep(0.6, 1, Math.abs(ed)));
    }
    const r = Math.sqrt(ex * ex + ed * ed);
    return 1 - smoothstep(0.6, 1, r);
  }

  /** Colour this deformation tints the ground (hex). */
  get stainColor(): number {
    switch (this.kind) {
      case 'crater':
        return 0x2a221c;
      case 'mud':
        return 0x2e2117;
      case 'pond':
      case 'stream':
        return 0x2d2a1c;
      case 'trench':
        return 0x4a3a2a;
      case 'ditch':
        return 0x5a4430;
    }
  }
}

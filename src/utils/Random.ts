/**
 * Seeded random number generation.
 *
 * Every run has a single numeric seed. Chunks derive their own RNG from
 * (seed, chunkIndex) so a chunk always generates identically no matter the
 * order chunks are created in — which makes bugs reproducible with `?seed=`.
 */

/** 32-bit integer hash (based on a variant of Thomas Wang's / murmur finalizer). */
export function hash32(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  /** Mulberry32 — fast, good-quality 32-bit generator. Returns [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Approximate normal distribution (mean 0, sd ~1) via sum of uniforms. */
  gaussian(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }

  /**
   * Pick a key from a weight table, e.g. `{ fence: 20, barrel: 10 }`.
   * Keys with weight <= 0 are never chosen. Returns null if all weights are 0.
   */
  weighted<K extends string>(table: Partial<Record<K, number>>): K | null {
    let total = 0;
    for (const k in table) total += Math.max(0, table[k] ?? 0);
    if (total <= 0) return null;
    let roll = this.next() * total;
    for (const k in table) {
      roll -= Math.max(0, table[k] ?? 0);
      if (roll <= 0) return k;
    }
    return null;
  }

  /** Derive an independent child generator. */
  fork(salt: number): Random {
    return new Random(hash32(Math.floor(this.next() * 4294967296), salt));
  }
}

/** A fresh, human-friendly seed for a new run. */
export function makeSeed(): number {
  return Math.floor(Math.random() * 999_999) + 1;
}

import type { Random } from '../utils/Random';
import type { Noise2D } from '../utils/Noise';
import type { DecorKind, FeatureKind } from './DecorKinds';

export interface PlaceOptions {
  /** Rotation around the vertical axis (radians). Random if omitted. */
  rotY?: number;
  /** Uniform scale. */
  scale?: number;
  /** Extra vertical stretch on top of `scale`. */
  scaleY?: number;
  /** Height offset from the ground. */
  y?: number;
  /** Small tilt for natural variety (radians). */
  tilt?: number;
  /** Instance tint (multiplies the base colour). */
  tint?: number;
}

/**
 * The API a map uses to dress one chunk. Coordinates are (x, d):
 *   x = lateral meters (0 = corridor centre, + = right)
 *   d = distance along the run (increases forward)
 */
export interface DecorationContext {
  readonly chunkIndex: number;
  /** Distance at the start / end of this chunk. */
  readonly d0: number;
  readonly d1: number;
  readonly rng: Random;
  readonly noise: Noise2D;
  /** Half-width of the playable corridor. */
  readonly corridor: number;
  /** Distance at which this map's stretch of the journey begins (for one-off landmarks). */
  readonly mapStart: number;
  /** How many times the journey has looped (0 on the first pass). */
  readonly lap: number;
  /** 0..1 — how strongly THIS map is present at distance d (fades during transitions). */
  weight(d: number): number;
  groundHeight(x: number, d: number): number;
  place(kind: DecorKind, x: number, d: number, opts?: PlaceOptions): void;
  feature(kind: FeatureKind, x: number, d: number, params?: Record<string, number>): void;
  /** False if an obstacle occupies this spot (avoid planting cotton through a wagon). */
  isClear(x: number, d: number, radius: number): boolean;
}

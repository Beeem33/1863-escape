import * as THREE from 'three';
import type { EventBus } from '../../core/EventBus';
import type { Particles } from '../../effects/Particles';
import type { Characters } from '../../characters/Characters';
import type { Random } from '../../utils/Random';

export interface FeatureContext {
  dt: number;
  time: number;
  playerX: number;
  playerD: number;
  particles: Particles;
  bus: EventBus;
  characters: Characters;
}

/**
 * An animated set piece placed by a map (a firing cannon battery, a burning
 * wagon, a waving flag…). Features are pooled per kind: `setup` is called
 * each time one is reused.
 */
export abstract class Feature {
  readonly object = new THREE.Group();
  /** World position (z = −d). */
  x = 0;
  y = 0;
  d = 0;

  setup(x: number, y: number, d: number, params: Record<string, number>, rng: Random): void {
    this.x = x;
    this.y = y;
    this.d = d;
    this.object.position.set(x, y, -d);
    this.configure(params, rng);
  }

  /** Per-placement randomisation. */
  protected abstract configure(params: Record<string, number>, rng: Random): void;

  abstract update(ctx: FeatureContext): void;

  /** Called when the feature returns to the pool — free any characters it owns. */
  dispose(_ctx: { characters: Characters }): void {}

  /** Distance from the player (m) — for level-of-detail and audio. */
  protected distanceTo(ctx: FeatureContext): number {
    return Math.hypot(this.x - ctx.playerX, this.d - ctx.playerD);
  }

  /** Stereo pan (-1 left .. 1 right) of this feature relative to the player. */
  protected panFor(ctx: FeatureContext): number {
    const dx = this.x - ctx.playerX;
    return Math.max(-1, Math.min(1, dx / (Math.abs(this.d - ctx.playerD) + Math.abs(dx) + 1)));
  }
}

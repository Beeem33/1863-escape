import * as THREE from 'three';
import type { Surface } from '../core/EventBus';
import { lerp } from '../utils/MathUtils';
import { Noise2D } from '../utils/Noise';
import type { MapBlend, MapManager } from './MapManager';

/**
 * Samples the blended ground of the current journey: height, colour, surface
 * and water level at any (x, d). Two maps are blended during transitions.
 */
export class Terrain {
  noise = new Noise2D(1);
  private readonly blend: MapBlend;
  private readonly ca = new THREE.Color();
  private readonly cb = new THREE.Color();

  constructor(private readonly maps: MapManager) {
    this.blend = maps.blendAt(0, { a: maps.maps.cotton, b: maps.maps.cotton, t: 0 });
  }

  reset(seed: number): void {
    this.noise = new Noise2D(seed);
  }

  /** Blend info for a distance (cached object — copy if you need to keep it). */
  blendAt(d: number): MapBlend {
    return this.maps.blendAt(d, this.blend);
  }

  baseHeight(x: number, d: number, blend = this.blendAt(d)): number {
    const ha = blend.a.terrain.height(x, d, this.noise);
    if (blend.t <= 0 || blend.a === blend.b) return ha;
    return lerp(ha, blend.b.terrain.height(x, d, this.noise), blend.t);
  }

  color(x: number, d: number, out: THREE.Color, blend = this.blendAt(d)): THREE.Color {
    blend.a.terrain.color(x, d, this.noise, this.ca);
    if (blend.t <= 0 || blend.a === blend.b) return out.copy(this.ca);
    blend.b.terrain.color(x, d, this.noise, this.cb);
    return out.copy(this.ca).lerp(this.cb, blend.t);
  }

  surface(x: number, d: number): Surface {
    const blend = this.blendAt(d);
    const m = blend.t > 0.5 ? blend.b : blend.a;
    return m.terrain.surface(x, d, this.noise);
  }

  waterLevel(d: number): number {
    const blend = this.blendAt(d);
    return lerp(blend.a.atmosphere.waterLevel, blend.b.atmosphere.waterLevel, blend.t);
  }
}

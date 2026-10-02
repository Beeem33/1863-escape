import type { Color } from 'three';
import type { Surface } from '../core/EventBus';
import type { MapTuning } from '../config/MapConfig';
import type { Noise2D } from '../utils/Noise';
import type { DecorationContext } from '../world/DecorationContext';
import type { AmbienceProfile } from '../audio/AmbienceProfile';

export type MapId = 'cotton' | 'swamp' | 'battlefield';

/**
 * Everything that gives a map its mood. The Environment blends two of these
 * smoothly while the player crosses a transition zone.
 * Colors are hex numbers; angles are degrees.
 */
export interface AtmosphereSettings {
  skyZenith: number;
  skyHorizon: number;
  /** Cloud cover 0..1. */
  clouds: number;
  cloudColor: number;
  /** Colour of the glow around the sun. */
  sunGlow: number;
  sunColor: number;
  sunIntensity: number;
  /** Sun height above the horizon (deg). Low = long golden shadows. */
  sunElevation: number;
  /** Sun direction relative to the running direction (deg, 0 = straight ahead). */
  sunAzimuth: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  /** Exponential fog density. ~0.004 = clear, ~0.03 = thick swamp fog. */
  fogDensity: number;
  exposure: number;
  /** Post-process colour grade. */
  grade: {
    /** Multiplies highlights (RGB 0..2). */
    gain: [number, number, number];
    /** Adds to shadows (RGB -0.1..0.1). */
    lift: [number, number, number];
    saturation: number;
    contrast: number;
    vignette: number;
  };
  bloom: number;
  /** Floating dust / pollen / ash particles (0..1). */
  dust: number;
  dustColor: number;
  /** Low ground mist (0..1). */
  mist: number;
  mistColor: number;
  /** Drifting battle smoke (0..1). */
  smoke: number;
  /** Height of standing water. Set very low to disable water. */
  waterLevel: number;
  waterColor: number;
  /** Colour of the distant tree-line silhouette. */
  horizonColor: number;
  /** 0..1 — how much the far tree-line ring shows. */
  horizonTrees: number;
}

/** Ground shape and colour. Must be continuous in world space. */
export interface TerrainProfile {
  /** Base ground height (before obstacle deformations like craters). x = lateral, d = distance. */
  height(x: number, d: number, noise: Noise2D): number;
  /** Writes the ground colour at (x, d) into `out`. */
  color(x: number, d: number, noise: Noise2D, out: Color): void;
  /** Surface type underfoot (drives footstep sounds). */
  surface(x: number, d: number, noise: Noise2D): Surface;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  /** Short caption shown when the player enters the map. */
  caption: string;
  tuning: MapTuning;
  atmosphere: AtmosphereSettings;
  terrain: TerrainProfile;
  ambience: AmbienceProfile;
  /**
   * Place decorations (plants, trees, buildings, distant set pieces) for one chunk.
   * During transitions this is called for BOTH maps; use `ctx.weight(d)` to
   * thin your decorations as the map fades out.
   */
  decorate(ctx: DecorationContext): void;
}

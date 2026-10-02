/**
 * ============================================================================
 *  WEATHER
 * ============================================================================
 *  Each run starts in a random weather and drifts to new weather every couple
 *  of minutes, blending smoothly. A preset modifies the current map's
 *  atmosphere (it never replaces it — fog in the swamp stays swampy).
 * ============================================================================
 */
export type WeatherKind = 'clear' | 'hazy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'storm';

export interface WeatherPreset {
  /** Added to cloud cover (0..1). */
  clouds: number;
  /** Multiplies sunlight. */
  sun: number;
  /** Multiplies sky (ambient) light. */
  hemi: number;
  /** Multiplies fog density. */
  fog: number;
  /** Rain intensity 0..1. */
  rain: number;
  /** Lightning strikes per minute. */
  lightning: number;
  /** Multiplies wind (foliage sway, wind audio, rain slant). */
  wind: number;
  /** Multiplies colour saturation. */
  saturation: number;
  /** Multiplies floating dust / pollen (rain washes it out). */
  dust: number;
  /** Added to ground mist (0..1). */
  mist: number;
  /** 0..1 — pulls sky, clouds and fog toward storm grey. */
  gloom: number;
  /** 0..1 — darker, glossier ground and muddy footsteps. */
  wet: number;
  /** Multiplies exposure. */
  exposure: number;
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherPreset> = {
  clear: { clouds: -0.15, sun: 1.05, hemi: 1, fog: 0.85, rain: 0, lightning: 0, wind: 0.8, saturation: 1.05, dust: 1, mist: 0, gloom: 0, wet: 0, exposure: 1 },
  hazy: { clouds: 0, sun: 0.85, hemi: 1.05, fog: 1.35, rain: 0, lightning: 0, wind: 0.6, saturation: 0.92, dust: 1.4, mist: 0.1, gloom: 0.05, wet: 0, exposure: 1.03 },
  overcast: { clouds: 0.5, sun: 0.35, hemi: 1.15, fog: 1.2, rain: 0, lightning: 0, wind: 1.1, saturation: 0.82, dust: 0.6, mist: 0.05, gloom: 0.45, wet: 0.1, exposure: 1.05 },
  fog: { clouds: 0.35, sun: 0.4, hemi: 1.15, fog: 2.6, rain: 0, lightning: 0, wind: 0.3, saturation: 0.75, dust: 0.3, mist: 0.6, gloom: 0.3, wet: 0.3, exposure: 1.06 },
  drizzle: { clouds: 0.55, sun: 0.3, hemi: 1.1, fog: 1.45, rain: 0.35, lightning: 0, wind: 1.1, saturation: 0.78, dust: 0.15, mist: 0.15, gloom: 0.55, wet: 0.6, exposure: 1.05 },
  rain: { clouds: 0.7, sun: 0.18, hemi: 1.0, fog: 1.8, rain: 0.8, lightning: 0.4, wind: 1.5, saturation: 0.7, dust: 0, mist: 0.2, gloom: 0.75, wet: 1, exposure: 1.06 },
  storm: { clouds: 0.85, sun: 0.1, hemi: 0.85, fog: 2.0, rain: 1, lightning: 5, wind: 2.1, saturation: 0.62, dust: 0, mist: 0.25, gloom: 1, wet: 1, exposure: 1.08 },
};

export const WeatherConfig = {
  /** How likely each weather is when a new one is picked. */
  weights: { clear: 26, hazy: 18, overcast: 16, fog: 10, drizzle: 12, rain: 11, storm: 7 } as Record<WeatherKind, number>,
  /** Seconds a weather lasts before the next one rolls in [min, max]. */
  duration: [70, 160] as [number, number],
  /** Seconds to blend from one weather to the next. */
  transition: 22,
  /** Raindrops simulated around the camera at full rain. */
  maxDrops: 7000,
  /** Storm-grey that `gloom` pulls the sky toward. */
  gloomColor: 0x5b5f63,
};

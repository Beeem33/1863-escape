import * as THREE from 'three';
import { MAP_TUNING } from '../config/MapConfig';
import { smoothstep } from '../utils/MathUtils';
import type { Noise2D } from '../utils/Noise';
import type { DecorationContext } from '../world/DecorationContext';
import type { MapDefinition } from './MapDefinition';

/**
 * MAP 2 — THE SWAMP
 * Dark, quiet, unpredictable. Cypress knees in black water, moss hanging low
 * over a muddy trail, fog that hides what's ahead. Beautiful, and dangerous.
 */

const WATER_LEVEL = -0.22;
const MUD = new THREE.Color(0x4f4230);
const MUD_WET = new THREE.Color(0x2c241a);
const MOSS = new THREE.Color(0x4a5130);
const LITTER = new THREE.Color(0x6a563a);
const TRAIL = new THREE.Color(0x6a5840);

/** Marsh height outside the trail: hummocks and pools around the water line. */
const marsh = (x: number, d: number, n: Noise2D) => -0.5 + (n.fbm(x * 0.045, d * 0.045, 3) + 0.25) * 1.1 + n.value(x * 0.2, d * 0.2) * 0.2;

/** The trail meanders a little; the corridor itself stays dry-ish. */
const trailCenter = (d: number) => Math.sin(d * 0.017 + 2) * 3.2;

export const SwampMap: MapDefinition = {
  id: 'swamp',
  name: 'The Swamp',
  caption: 'The water hides your trail. It hides other things too.',
  tuning: MAP_TUNING.swamp,

  atmosphere: {
    skyZenith: 0x3e4d55,
    skyHorizon: 0x8a937f,
    clouds: 0.72,
    cloudColor: 0x7c8478,
    sunGlow: 0xc8b88a,
    sunColor: 0xc9c2a2,
    sunIntensity: 1.25,
    sunElevation: 12,
    sunAzimuth: -28,
    hemiSky: 0x8b9a8c,
    hemiGround: 0x3c3826,
    hemiIntensity: 1.35,
    fogColor: 0x5e6a5a,
    fogDensity: 0.0175,
    exposure: 1.08,
    grade: { gain: [0.93, 1.0, 0.96], lift: [0.0, 0.016, 0.012], saturation: 0.78, contrast: 1.1, vignette: 0.55 },
    bloom: 0.55,
    dust: 0.35,
    dustColor: 0xd6ff7a,
    mist: 0.85,
    mistColor: 0xb4c0b0,
    smoke: 0,
    waterLevel: WATER_LEVEL,
    waterColor: 0x2a3122,
    horizonColor: 0x1f261c,
    horizonTrees: 1,
  },

  terrain: {
    height(x, d, n) {
      const ax = Math.abs(x);
      const out = smoothstep(10.5, 15, ax);
      const trail = 0.04 + n.value(x * 0.5, d * 0.5) * 0.08 - 0.03 * smoothstep(1.5, 0, Math.abs(x - trailCenter(d)));
      return trail * (1 - out) + marsh(x, d, n) * out;
    },
    color(x, d, n, out) {
      const v = n.value(x * 0.1, d * 0.1);
      out.copy(MUD).lerp(LITTER, v * 0.7);
      out.lerp(MOSS, smoothstep(0.45, 0.8, n.value(x * 0.05 + 9, d * 0.05)) * 0.7);
      // Darker and wetter toward the waterline.
      const h = SwampMap.terrain.height(x, d, n);
      out.lerp(MUD_WET, smoothstep(0.25, -0.15, h));
      out.lerp(TRAIL, (1 - smoothstep(0.8, 2.2, Math.abs(x - trailCenter(d)))) * 0.5);
    },
    surface(x, d, n) {
      return n.value(x * 0.05 + 9, d * 0.05) > 0.6 ? 'grass' : 'mud';
    },
  },

  ambience: { wind: 0.2, birds: 0.18, insects: 0.95, frogs: 0.85, water: 0.6, trees: 0.55, battle: 0, fire: 0, drone: 0.6, dronePitch: 46 },

  decorate(ctx: DecorationContext) {
    const { rng, d0, d1, noise, corridor } = ctx;
    const h = (x: number, d: number) => SwampMap.terrain.height(x, d, noise);

    // ---- Walls of trees crowding the trail -------------------------------
    for (let i = 0; i < 16; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const side = rng.sign();
      const x = side * rng.range(corridor + 2.5, corridor + 9);
      if (rng.chance(0.55)) ctx.place('cypress', x, d, { scale: rng.range(0.8, 1.2), tint: 0xd8e0c8 });
      else ctx.place('oakMoss', x, d, { scale: rng.range(0.85, 1.25), tint: 0xb8c8a0 });
    }
    // ---- Deep swamp beyond -----------------------------------------------
    for (let i = 0; i < 34; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(corridor + 9, 150);
      const r = rng.next();
      if (r < 0.55) ctx.place('cypress', x, d, { scale: rng.range(0.8, 1.35), tint: 0xc8d0b8 });
      else if (r < 0.78) ctx.place('oakMoss', x, d, { scale: rng.range(0.8, 1.3), tint: 0xa8b890 });
      else ctx.place('deadTree', x, d, { scale: rng.range(0.8, 1.3), tilt: rng.range(-0.15, 0.15) });
    }

    // ---- Undergrowth: reeds at the waterline, ferns on the hummocks ------
    for (let i = 0; i < 150; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(corridor - 1, 55);
      const gh = h(x, d);
      const inCorridor = Math.abs(x) < corridor;
      if (inCorridor && (!ctx.isClear(x, d, 1.2) || rng.chance(0.6))) continue;
      if (gh < WATER_LEVEL - 0.08) {
        if (rng.chance(0.35)) ctx.place('lilyPads', x, d, { y: WATER_LEVEL - gh + 0.01, scale: rng.range(0.7, 1.2) });
      } else if (gh < WATER_LEVEL + 0.25) {
        ctx.place('reeds', x, d, { scale: rng.range(0.7, 1.2) });
      } else if (rng.chance(0.5)) {
        ctx.place('fern', x, d, { scale: rng.range(0.7, 1.3), tint: 0xb0c0a0 });
      } else if (rng.chance(0.4)) {
        ctx.place('shrub', x, d, { scale: rng.range(0.5, 1), tint: 0x9aa888 });
      } else {
        ctx.place('grassTuft', x, d, { scale: rng.range(0.8, 1.4), tint: 0x9aa070 });
      }
    }

    // ---- Fallen logs, stumps, rocks off the trail ------------------------
    for (let i = 0; i < 5; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(corridor + 1.5, 40);
      const k = rng.next();
      if (k < 0.45) ctx.place('log', x, d, { rotY: rng.range(0, Math.PI), scale: rng.range(0.7, 1.3) });
      else if (k < 0.8) ctx.place('stump', x, d, { scale: rng.range(0.7, 1.4) });
      else ctx.place('rock', x, d, { scale: rng.range(0.5, 1.0) });
    }

    // ---- A lantern hung on a branch: someone is helping people through ---
    if (rng.chance(0.12 * ctx.weight(d0))) {
      const side = rng.sign();
      const d = rng.range(d0 + 4, d1 - 4);
      const x = side * (corridor + rng.range(2, 4));
      ctx.place('oakMoss', x + side * 2, d, { scale: 0.9, tint: 0xb8c8a0 });
      ctx.feature('signalLantern', x, d, { height: rng.range(2.6, 3.4) });
    }

    // ---- An abandoned trapper's shack deep in the trees ------------------
    if (rng.chance(0.07 * ctx.weight(d0))) {
      ctx.place('cabin', rng.sign() * rng.range(35, 70), rng.range(d0, d1), { tint: 0x6a6658, scale: 0.85 });
    }
  },
};

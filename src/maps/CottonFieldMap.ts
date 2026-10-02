import * as THREE from 'three';
import { MAP_TUNING } from '../config/MapConfig';
import { smoothstep } from '../utils/MathUtils';
import type { Noise2D } from '../utils/Noise';
import type { DecorationContext } from '../world/DecorationContext';
import type { MapDefinition } from './MapDefinition';

/**
 * MAP 1 — THE COTTON FIELD
 * Warm, golden, expansive — and oppressive. The big house watches from the end
 * of its oak alley; the quarters stand in a row. The player runs the furrows
 * toward the tree line.
 */

/** The packed-dirt cart path that winds through the field. */
const pathCenter = (d: number) => Math.sin(d * 0.011) * 4 + Math.sin(d * 0.029 + 1.3) * 1.8;

const SOIL = new THREE.Color(0x8c6141);
const SOIL_DARK = new THREE.Color(0x6e4a30);
const PATH = new THREE.Color(0xae8a62);
const FALLOW = new THREE.Color(0x7a7140);
const FAR_COTTON = new THREE.Color(0xd9d3c3);

/** Cart lanes cut across the field every so often (scenes play out along them). */
export const CROSS_LANE_SPACING = 170;
const LANE_HALF = 3.2;
const laneCenter = (d: number) => Math.round((d - 100) / CROSS_LANE_SPACING) * CROSS_LANE_SPACING + 100;
const inCrossLane = (d: number) => Math.abs(d - laneCenter(d)) < LANE_HALF;
/**
 * Before each cross lane the stalks have been cut down over a long stretch, so
 * from the trail you can see across the field to the lane where scenes play
 * out. 0 = full-height cotton, 1 = cut down.
 */
const CUT_LENGTH = 58;
function cutDown(d: number): number {
  const rel = d - laneCenter(d);
  return rel > -LANE_HALF ? 0 : smoothstep(-CUT_LENGTH, -CUT_LENGTH + 10, rel);
}

/**
 * Where (m into the level) the hanging trees stand, and on which side. Two per
 * level, fixed, close beside the trail, so they cannot be missed.
 */
export const HANGING_SPOTS: [number, number][] = [
  [520, -1],
  [1380, 1],
];

/** The next cross lane at or beyond distance d. */
export function nextCrossLane(d: number): number {
  const c = laneCenter(d);
  return c >= d ? c : c + CROSS_LANE_SPACING;
}

/** 0..1 fallow (unplanted, grassy) patches. */
const fallow = (x: number, d: number, n: Noise2D) => smoothstep(0.62, 0.75, n.value(x * 0.025 + 40, d * 0.02));

export const CottonFieldMap: MapDefinition = {
  id: 'cotton',
  name: 'The Cotton Fields',
  caption: 'Go now. Run for the tree line, and do not look back.',
  tuning: MAP_TUNING.cotton,

  atmosphere: {
    skyZenith: 0x5b82b8,
    skyHorizon: 0xf4bf80,
    clouds: 0.32,
    cloudColor: 0xe6d2b8,
    sunGlow: 0xffa954,
    sunColor: 0xffd6a0,
    sunIntensity: 3.4,
    sunElevation: 13,
    sunAzimuth: 32,
    hemiSky: 0xcfc3a8,
    hemiGround: 0x6b4c2e,
    hemiIntensity: 1.15,
    fogColor: 0xe6c393,
    fogDensity: 0.0042,
    exposure: 0.92,
    grade: { gain: [1.07, 1.0, 0.88], lift: [0.025, 0.012, -0.01], saturation: 0.9, contrast: 1.08, vignette: 0.38 },
    bloom: 0.38,
    dust: 0.65,
    dustColor: 0xffdca0,
    mist: 0.04,
    mistColor: 0xf3dfc0,
    smoke: 0,
    waterLevel: -20,
    waterColor: 0x434a33,
    horizonColor: 0x4e5638,
    horizonTrees: 0.85,
  },

  terrain: {
    height(x, d, n) {
      const ax = Math.abs(x);
      const out = smoothstep(12, 34, ax);
      const hills = n.fbm(x * 0.007, d * 0.007, 3) * 7 + n.fbm(x * 0.03, d * 0.03, 2) * 1.2;
      const micro = n.value(x * 0.6, d * 0.6) * 0.05;
      return micro + out * (hills + 2.4);
    },
    color(x, d, n, out) {
      const v = n.value(x * 0.08, d * 0.08);
      out.copy(SOIL).lerp(SOIL_DARK, v * 0.6);
      const ax = Math.abs(x);
      // Distant fields read as white from afar.
      const farCotton = smoothstep(26, 40, ax) * (1 - smoothstep(110, 170, ax)) * 0.55 * (0.6 + 0.4 * n.value(x * 0.02, d * 0.02));
      out.lerp(FAR_COTTON, farCotton);
      out.lerp(FALLOW, fallow(x, d, n) * 0.8);
      const p = Math.abs(x - pathCenter(d));
      out.lerp(PATH, (1 - smoothstep(1.0, 1.9, p)) * 0.85);
      const lane = Math.abs(d - laneCenter(d));
      out.lerp(PATH, (1 - smoothstep(LANE_HALF - 1.2, LANE_HALF + 0.4, lane)) * 0.75 * (1 - smoothstep(40, 70, Math.abs(x))));
    },
    surface(x, d, n) {
      return fallow(x, d, n) > 0.5 ? 'grass' : 'dirt';
    },
  },

  ambience: { wind: 0.45, birds: 0.8, insects: 0.45, frogs: 0, water: 0, trees: 0.2, battle: 0, fire: 0, drone: 0.35, dronePitch: 55 },

  decorate(ctx: DecorationContext) {
    const { rng, d0, d1, noise, corridor } = ctx;

    // A man hanged as a warning to others who would run, at fixed points beside
    // the trail. Decided first so the cotton around the tree, and along the
    // approach to it, can be cleared.
    let hang: { x: number; d: number; side: number } | null = null;
    for (const [at, side] of HANGING_SPOTS) {
      const d = ctx.mapStart + at;
      if (d < d0 || d >= d1) continue;
      hang = { side, x: side * (corridor + 3.6), d };
      ctx.place('oak', hang.x + side * 0.4, d, { scale: 1.0, rotY: rng.range(0, Math.PI * 2) });
      ctx.feature('hangingTree', hang.x, d, { facing: (side > 0 ? Math.PI : 0) + rng.range(-0.1, 0.1) });
      ctx.feature('birds', hang.x, d, { count: 6, radius: 7, height: 11 }); // crows circling over it
    }
    const inHangClearing = (x: number, d: number) =>
      hang !== null && Math.sign(x) === hang.side && d > hang.d - 6 && d < hang.d + 6 && Math.abs(x) > corridor - 1.5 && Math.abs(x) < Math.abs(hang.x) + 6;
    const onHangApproach = (x: number, d: number) =>
      hang !== null && Math.sign(x) === hang.side && d > hang.d - 45 && d <= hang.d - 6 && Math.abs(x) > corridor - 3 && Math.abs(x) < Math.abs(hang.x) + 6;

    // ---- Cotton rows (decoration — never blocks the runner) -------------
    const rowSpacing = 1.3;
    for (let x = -27; x <= 27; x += rowSpacing) {
      for (let d = d0 + rng.range(0, 0.9); d < d1; d += rng.range(0.85, 1.25)) {
        const w = ctx.weight(d);
        const px = x + rng.range(-0.12, 0.12);
        if (Math.abs(px - pathCenter(d)) < 1.5) continue;
        if (inCrossLane(d) || inHangClearing(px, d)) continue;
        // Fields thin out and go to seed as this map fades.
        if (rng.next() > w * w * (1 - fallow(px, d, noise) * 0.9)) {
          if (rng.chance(0.18 * (1 - w) + 0.05)) ctx.place('dryGrass', px, d, { scale: rng.range(0.7, 1.3) });
          continue;
        }
        // Cotton stands a little taller than a man (~1.9–2.1 m). Inside the
        // running corridor it is sparser, and kept clear around obstacles and
        // for several meters in front of them, so hazards always read.
        const inCorridor = Math.abs(px) < corridor + 0.5;
        if (inCorridor && rng.chance(0.62)) continue;
        if (!ctx.isClear(px, d, inCorridor ? 1.5 : 0.5, inCorridor ? 7 : 0)) continue;
        const cut = Math.max(cutDown(d), onHangApproach(px, d) ? 1 : 0);
        if (cut > 0 && rng.chance(0.35 * cut)) continue;
        const scaleY = rng.range(0.93, 1.05) * (1 - 0.64 * cut);
        ctx.place('cottonPlant', px, d, { scale: rng.range(0.92, 1.08), scaleY, tilt: rng.range(-0.07, 0.07) });
      }
    }

    // ---- Grass along the path and the field edges ------------------------
    for (let i = 0; i < 26; i++) {
      const d = rng.range(d0, d1);
      const x = pathCenter(d) + rng.sign() * rng.range(1.3, 2.2);
      if (ctx.isClear(x, d, 0.4)) ctx.place('dryGrass', x, d, { scale: rng.range(0.6, 1.1) });
    }
    for (let i = 0; i < 40; i++) {
      const d = rng.range(d0, d1);
      const x = rng.sign() * rng.range(corridor + 2, 60);
      if (fallow(x, d, noise) > 0.3 || Math.abs(x) > 28) ctx.place(rng.chance(0.5) ? 'grassTuft' : 'dryGrass', x, d, { scale: rng.range(0.8, 1.5) });
    }

    // ---- Split-rail fences marking the field edges -----------------------
    for (const side of [-1, 1]) {
      if (noise.value(side * 13, d0 * 0.01) < 0.45) continue;
      for (let d = d0 + 6; d < d1; d += 12) {
        if (rng.chance(0.15)) continue; // fallen sections
        ctx.place('railFence', side * rng.range(30.5, 31.5), d, { rotY: Math.PI / 2 + rng.range(-0.04, 0.04) });
      }
    }

    // ---- Trees: scattered live oaks, pine lines in the distance ----------
    const treeDensity = 0.6 + noise.value(d0 * 0.004, 3) * 1.4;
    for (let i = 0; i < 6 * treeDensity; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(36, 170);
      ctx.place(rng.chance(0.55) ? 'oakMoss' : 'oak', x, d, { scale: rng.range(0.8, 1.35), tint: rng.chance(0.5) ? 0xffffff : 0xe8f0d8 });
    }
    for (let i = 0; i < 5; i++) {
      const d = rng.range(d0, d1);
      const x = rng.sign() * rng.range(120, 205);
      ctx.place('pine', x, d, { scale: rng.range(0.9, 1.3) });
    }
    // The field gives way to scrub and young trees near the swamp.
    for (let i = 0; i < 10; i++) {
      const d = rng.range(d0, d1);
      const w = ctx.weight(d);
      if (w > 0.95 || rng.next() > 1 - w) continue;
      ctx.place(rng.chance(0.7) ? 'shrub' : 'oakMoss', rng.sign() * rng.range(corridor + 4, 45), d, { scale: rng.range(0.6, 1.1) });
    }

    // ---- Landmarks of the plantation (first stretch of each cotton map) --
    const rel = d0 - ctx.mapStart;
    if (rel <= 150 && rel + (d1 - d0) > 150) {
      const hd = ctx.mapStart + 150;
      // The big house at the end of its oak alley, on the left.
      ctx.place('plantationHouse', -150, hd, { rotY: Math.PI / 2, scale: 1 });
      for (let x = -128; x <= -40; x += 11) {
        ctx.place('oakMoss', x, hd - 11, { scale: rng.range(1.0, 1.2) });
        ctx.place('oakMoss', x, hd + 11, { scale: rng.range(1.0, 1.2) });
      }
      ctx.place('barn', -120, hd + 60, { rotY: Math.PI / 2 });
      ctx.feature('birds', -110, hd, { count: 8, radius: 24, height: 26 });
    }
    if (rel <= 330 && rel + (d1 - d0) > 330) {
      // The quarters: a row of small cabins on the right, smoke rising from a chimney.
      const qd = ctx.mapStart + 330;
      for (let i = 0; i < 7; i++) {
        ctx.place('cabin', 72, qd - 30 + i * 11, { rotY: -Math.PI / 2, scale: rng.range(0.95, 1.05) });
      }
      ctx.feature('smokeColumn', 75, qd + 3, { size: 0.18 });
    }

    // ---- Occasional farmstead or hay ricks --------------------------------
    if (rng.chance(0.2 * ctx.weight(d0))) {
      const side = rng.sign();
      const x = side * rng.range(60, 110);
      const d = rng.range(d0 + 5, d1 - 5);
      ctx.place('barn', x, d, { rotY: rng.range(0, Math.PI) });
      for (let i = 0; i < 3; i++) ctx.place('haystack', x + rng.range(-16, 16), d + rng.range(-16, 16), { scale: rng.range(0.8, 1.1) });
    }
    if (rng.chance(0.25)) {
      ctx.place('haystack', rng.sign() * rng.range(34, 70), rng.range(d0, d1), { scale: rng.range(0.8, 1.15) });
    }
    if (rng.chance(0.12)) ctx.feature('birds', rng.sign() * rng.range(20, 60), rng.range(d0, d1), { count: rng.int(4, 9), radius: 16, height: 18 });

    // ---- A few rocks ------------------------------------------------------
    for (let i = 0; i < 2; i++) {
      ctx.place('rock', rng.sign() * rng.range(corridor + 3, 50), rng.range(d0, d1), { scale: rng.range(0.4, 0.9) });
    }
  },
};

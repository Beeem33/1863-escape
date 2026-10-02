import * as THREE from 'three';
import { MAP_TUNING } from '../config/MapConfig';
import { smoothstep } from '../utils/MathUtils';
import type { Noise2D } from '../utils/Noise';
import type { DecorationContext } from '../world/DecorationContext';
import type { MapDefinition } from './MapDefinition';

/**
 * MAP 3 — THE BATTLEFIELD
 * Chaotic, loud, smoke-filled. Two armies trade fire across the field and
 * the runner has to cross between them. Experienced through sound, smoke,
 * light and distant figures — not gore. Union lines hold the right flank;
 * beyond them, for the first time, the word "free" means something nearby.
 */

const TRAMPLED = new THREE.Color(0x7d7250);
const MUD = new THREE.Color(0x4a3b2b);
const SCORCH = new THREE.Color(0x2c2620);
const GRASS = new THREE.Color(0x857c52);

/** Old shell holes pock the whole field. */
const pocks = (x: number, d: number, n: Noise2D) => smoothstep(0.78, 0.92, n.value(x * 0.12 + 50, d * 0.12)) * 0.7;

export const BattlefieldMap: MapDefinition = {
  id: 'battlefield',
  name: 'The Battlefield',
  caption: 'The armies are between you and freedom. Keep low. Keep moving.',
  tuning: MAP_TUNING.battlefield,

  atmosphere: {
    skyZenith: 0x5a5753,
    skyHorizon: 0xbb9b78,
    clouds: 0.85,
    cloudColor: 0x6c645c,
    sunGlow: 0xff7838,
    sunColor: 0xffb47c,
    sunIntensity: 2.1,
    sunElevation: 15,
    sunAzimuth: 12,
    hemiSky: 0xaa9c8c,
    hemiGround: 0x5c4a36,
    hemiIntensity: 1.7,
    fogColor: 0x9b8a76,
    fogDensity: 0.0078,
    exposure: 1.18,
    grade: { gain: [1.06, 0.97, 0.87], lift: [0.022, 0.01, 0.0], saturation: 0.7, contrast: 1.12, vignette: 0.42 },
    bloom: 0.5,
    dust: 0.55,
    dustColor: 0xcfc6bb,
    mist: 0.08,
    mistColor: 0xc8beb0,
    smoke: 1.0,
    waterLevel: -20,
    waterColor: 0x3a3a2e,
    horizonColor: 0x3c3732,
    horizonTrees: 0.55,
  },

  terrain: {
    height(x, d, n) {
      const ax = Math.abs(x);
      const out = smoothstep(11, 30, ax);
      // Rolling ground everywhere — you run up and over the swells.
      const swell = Math.sin(d * 0.038) * 0.9 + Math.sin(d * 0.011 + 1.7) * 1.4 + n.fbm(x * 0.02, d * 0.02, 2) * 0.5;
      const roll = n.fbm(x * 0.009, d * 0.009, 3) * 7 + n.fbm(x * 0.04, d * 0.04, 2) * 1.0;
      const micro = n.value(x * 0.7, d * 0.7) * 0.08;
      return micro + swell + out * (roll + 1.5) - pocks(x, d, n) * out;
    },
    color(x, d, n, out) {
      const v = n.value(x * 0.09, d * 0.09);
      out.copy(TRAMPLED).lerp(GRASS, v * 0.6);
      out.lerp(MUD, smoothstep(0.5, 0.8, n.value(x * 0.04 + 7, d * 0.04)) * 0.8);
      out.lerp(SCORCH, pocks(x, d, n) * 1.2);
      // Wheel-rutted, trampled lane down the middle.
      out.lerp(MUD, (1 - smoothstep(2, 6, Math.abs(x))) * 0.35);
    },
    surface(x, d, n) {
      return n.value(x * 0.04 + 7, d * 0.04) > 0.62 ? 'mud' : 'dirt';
    },
  },

  ambience: { wind: 0.35, birds: 0, insects: 0.05, frogs: 0, water: 0, trees: 0.1, battle: 1, fire: 0.5, drone: 0.7, dronePitch: 41 },

  decorate(ctx: DecorationContext) {
    const { rng, d0, d1, corridor } = ctx;
    const mid = (d0 + d1) / 2;
    const w = ctx.weight(mid);

    // ---- Smoke on the horizon is the first sign of the battle ------------
    if (rng.chance(0.18 * Math.min(1, w * 3 + 0.1))) {
      ctx.feature('smokeColumn', rng.sign() * rng.range(90, 190), rng.range(d0, d1), { size: rng.range(0.7, 1.4) });
    }
    if (w < 0.05) return;

    // ---- Entering the field: a burning farm by the road, both flags in view ----
    if (ctx.mapStart >= d0 - 5 && ctx.mapStart < d1 - 5) {
      const gd = ctx.mapStart + 12;
      ctx.place('burntHouse', -corridor - 9, gd, { rotY: 0.3 });
      ctx.feature('fire', -corridor - 9, gd, { radius: 2.6, intensity: 1.3 });
      ctx.feature('smokeColumn', -corridor - 9, gd, { size: 0.9 });
      ctx.feature('flag', corridor + 22, gd + 30, { army: 0, height: 3.6 });
      ctx.feature('flag', -corridor - 26, gd + 34, { army: 1, height: 3.6 });
    }

    // ---- The armies ------------------------------------------------------
    // Confederates hold the left flank, the Union the right; the runner crosses
    // the ground between them. Firing lines, reserves marching up, charges
    // across the field, and the dead of earlier assaults everywhere.
    for (const side of [-1, 1] as const) {
      const army = side > 0 ? 0 : 1;
      if (rng.chance(0.75 * w)) {
        const x = side * rng.range(17, 32);
        ctx.feature('firingLine', x, rng.range(d0 + 8, d1 - 8), { army, count: rng.int(10, 16), facing: -side });
        if (rng.chance(0.6)) ctx.feature('flag', x + side * 3, rng.range(d0, d1), { army, height: 3.6 });
      }
      if (rng.chance(0.18 * w)) {
        ctx.feature('formation', side * rng.range(45, 85), rng.range(d0, d1), { army, rows: rng.int(3, 4), cols: rng.int(6, 8), dirZ: rng.chance(0.5) ? -1 : 1, marching: rng.chance(0.7) ? 1 : 0 });
      }
      if (rng.chance(0.3 * w)) {
        ctx.feature('cannonBattery', side * rng.range(70, 120), rng.range(d0 + 8, d1 - 8), { count: rng.int(2, 4), facing: -side, interval: rng.range(3.5, 7) });
      }
      // Trench works along the flank: a parapet of gabions and logs.
      if (rng.chance(0.45 * w)) {
        const x = side * rng.range(14, 16.5);
        for (let d = d0 + rng.range(0, 3); d < d1; d += rng.range(1.2, 1.6)) {
          if (rng.chance(0.85)) ctx.place(rng.chance(0.7) ? 'gabion' : 'log', x + rng.range(-0.3, 0.3), d, { scale: rng.range(0.9, 1.1), rotY: Math.PI / 2 + rng.range(-0.1, 0.1) });
        }
      }
      // Camps behind the lines.
      if (rng.chance(0.18 * w)) {
        const x = side * rng.range(110, 170);
        const d = rng.range(d0, d1);
        for (let i = 0; i < rng.int(4, 9); i++) ctx.place('tent', x + rng.range(-14, 14), d + rng.range(-14, 14), { rotY: rng.chance(0.5) ? 0 : Math.PI / 2, scale: rng.range(0.9, 1.1) });
      }
    }
    // A charge across the field, well ahead.
    if (rng.chance(0.28 * w)) {
      const dir = rng.sign();
      ctx.feature('charge', -dir * rng.range(40, 55), rng.range(d0 + 10, d1 - 10), { army: dir > 0 ? 1 : 0, count: rng.int(14, 24), dirX: dir, speed: rng.range(3, 4) });
    }
    // The fallen.
    if (w > 0.3) {
      ctx.feature('corpses', -rng.range(12, 30), rng.range(d0 + 6, d1 - 6), { count: rng.int(4, 8), spread: 9 });
      ctx.feature('corpses', rng.range(12, 30), rng.range(d0 + 6, d1 - 6), { count: rng.int(4, 8), spread: 9 });
      ctx.feature('corpses', rng.range(-6, 6), rng.range(d0 + 6, d1 - 6), { count: rng.int(1, 4), spread: 5 });
    }

    // ---- Burning farmhouses ----------------------------------------------
    if (rng.chance(0.14 * w)) {
      const x = rng.sign() * rng.range(30, 80);
      const d = rng.range(d0 + 6, d1 - 6);
      ctx.place('burntHouse', x, d, { rotY: rng.range(0, Math.PI * 2) });
      ctx.feature('fire', x, d, { radius: 2.4, intensity: 1.2 });
      ctx.feature('smokeColumn', x, d, { size: 0.7 });
    }

    // ---- Shelled woods: dead trees, stumps --------------------------------
    for (let i = 0; i < 9; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(corridor + 3, 160);
      if (rng.chance(0.55)) ctx.place('deadTree', x, d, { scale: rng.range(0.8, 1.3), tilt: rng.range(-0.25, 0.25) });
      else if (rng.chance(0.6)) ctx.place('stump', x, d, { scale: rng.range(0.8, 1.6) });
      else ctx.place('oak', x, d, { scale: rng.range(0.8, 1.1), tint: 0x8a8a70 });
    }

    // ---- Debris of battle near the corridor ------------------------------
    for (let i = 0; i < 6; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(corridor + 1, 30);
      const k = rng.next();
      if (k < 0.35) ctx.place('wheel', x, d);
      else if (k < 0.6) ctx.place('railFence', x, d, { rotY: rng.range(0, Math.PI), tilt: rng.range(-0.3, 0.3) });
      else if (k < 0.8) ctx.place('rock', x, d, { scale: rng.range(0.4, 0.8) });
      else ctx.place('cannon', x, d, { rotY: rng.range(0, Math.PI * 2), tilt: rng.range(-0.2, 0.2) }); // abandoned gun
    }

    // ---- Trampled grass -----------------------------------------------------
    for (let i = 0; i < 70; i++) {
      const d = rng.range(d0, d1);
      if (rng.next() > ctx.weight(d)) continue;
      const x = rng.sign() * rng.range(2, 60);
      if (Math.abs(x) < corridor && (!ctx.isClear(x, d, 1.2) || rng.chance(0.5))) continue;
      ctx.place('dryGrass', x, d, { scale: rng.range(0.6, 1.2), tint: 0x9a9070 });
    }
  },
};

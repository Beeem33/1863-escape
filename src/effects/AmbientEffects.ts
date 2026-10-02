import * as THREE from 'three';
import type { AtmosphereSettings } from '../maps/MapDefinition';
import type { Particles } from './Particles';

/**
 * Atmosphere you can almost touch: floating dust / pollen (or fireflies in
 * the swamp, ash on the battlefield), low ground mist, and drifting banks of
 * powder smoke. Spawned around the camera; amounts come from the blended
 * atmosphere of the current map.
 */
export class AmbientEffects {
  private dustAcc = 0;
  private mistAcc = 0;
  private smokeAcc = 0;
  private readonly tmp = new THREE.Color();

  constructor(private readonly particles: Particles) {}

  update(dt: number, a: AtmosphereSettings, camX: number, camY: number, camZ: number, speed: number): void {
    // ---- Dust motes / fireflies / ash ------------------------------------
    this.dustAcc += dt * a.dust * 40;
    this.tmp.setHex(a.dustColor);
    const fireflies = a.mist > 0.45 && a.sunIntensity < 1.6;
    while (this.dustAcc > 1) {
      this.dustAcc -= 1;
      // Spawn ahead of the camera so the motes stream past.
      const ahead = 2 + Math.random() * (14 + speed);
      this.particles.spawnGlow({
        x: camX + (Math.random() - 0.5) * 16,
        y: fireflies ? 0.4 + Math.random() * 2.2 : camY + (Math.random() - 0.5) * 3,
        z: camZ - ahead,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.2,
        vz: (Math.random() - 0.5) * 0.4,
        life: fireflies ? 0.6 + Math.random() * 1.2 : 3 + Math.random() * 3,
        size: fireflies ? 0.07 : 0.035,
        alpha: fireflies ? 1 : 0.55,
        color: this.tmp,
        fadeIn: 0.3,
      });
    }

    // ---- Ground mist -------------------------------------------------------
    this.mistAcc += dt * a.mist * 10;
    this.tmp.setHex(a.mistColor);
    while (this.mistAcc > 1) {
      this.mistAcc -= 1;
      this.particles.spawnSmoke({
        x: camX + (Math.random() - 0.5) * 50,
        y: 0.2 + Math.random() * 1.0,
        z: camZ - 12 - Math.random() * 90,
        vx: 0.3 + Math.random() * 0.4,
        vy: 0.03,
        vz: (Math.random() - 0.5) * 0.3,
        life: 9 + Math.random() * 6,
        size: 5,
        endSize: 9,
        alpha: 0.2 * a.mist,
        color: this.tmp,
        drag: 0,
        fadeIn: 0.35,
      });
    }

    // ---- Banks of powder smoke drifting across the field ------------------
    this.smokeAcc += dt * a.smoke * 7;
    while (this.smokeAcc > 1) {
      this.smokeAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.spawnSmoke({
        x: camX + side * (6 + Math.random() * 40),
        y: 0.8 + Math.random() * 3.5,
        z: camZ - 18 - Math.random() * 120,
        vx: -side * (0.6 + Math.random() * 1.2),
        vy: 0.08,
        vz: (Math.random() - 0.5) * 0.5,
        life: 12 + Math.random() * 8,
        size: 6,
        endSize: 16,
        alpha: 0.32 * a.smoke,
        color: 0xb9b2a6,
        drag: 0.02,
        fadeIn: 0.3,
      });
    }
  }
}

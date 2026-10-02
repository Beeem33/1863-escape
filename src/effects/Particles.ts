import * as THREE from 'three';
import { Textures } from '../utils/TextureFactory';
import { ParticleSystem, type ParticleSpawn } from './ParticleSystem';

/**
 * The game's shared particle systems plus high-level effect helpers
 * (dust kick, splash, explosion…). Gameplay code calls these helpers and never
 * touches raw particles.
 */
export class Particles {
  /** Soft smoke / mist / dust clouds (normal blending). */
  readonly smoke: ParticleSystem;
  /** Fire, sparks, muzzle flashes, sun-lit motes (additive). */
  readonly glow: ParticleSystem;

  constructor(scene: THREE.Scene) {
    this.smoke = new ParticleSystem(2600, Textures.smoke(), THREE.NormalBlending, 20);
    this.glow = new ParticleSystem(1400, Textures.glow(), THREE.AdditiveBlending, 21);
    scene.add(this.smoke.mesh, this.glow.mesh);
  }

  update(dt: number): void {
    this.smoke.update(dt);
    this.glow.update(dt);
  }

  clear(): void {
    this.smoke.clear();
    this.glow.clear();
  }

  spawnSmoke(s: ParticleSpawn): void {
    this.smoke.spawn(s);
  }

  spawnGlow(s: ParticleSpawn): void {
    this.glow.spawn(s);
  }

  /** Dirt kicked up by a footfall or a collision. */
  dustKick(x: number, y: number, z: number, amount: number, color: number): void {
    const n = Math.ceil(3 * amount);
    for (let i = 0; i < n; i++) {
      this.smoke.spawn({
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + 0.1,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.4 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 1.5,
        life: 0.9 + Math.random() * 0.8,
        size: 0.3,
        endSize: 1.3 + amount,
        alpha: 0.35,
        color,
        drag: 1.6,
        lift: -0.2,
        fadeIn: 0.1,
      });
    }
  }

  splash(x: number, y: number, z: number, amount: number): void {
    for (let i = 0; i < 6 * amount; i++) {
      this.smoke.spawn({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + 0.05,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 1.8 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 2.2 - 1,
        life: 0.5 + Math.random() * 0.3,
        size: 0.12,
        endSize: 0.35,
        alpha: 0.55,
        color: 0xc8ccc0,
        lift: -9,
        fadeIn: 0.05,
      });
    }
  }

  /** Shell impact: fireball, dirt fountain, lingering smoke. */
  explosion(x: number, y: number, z: number, strength = 1): void {
    for (let i = 0; i < 14 * strength; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 4;
      this.glow.spawn({
        x,
        y: y + 0.6,
        z,
        vx: Math.cos(a) * s,
        vy: 2 + Math.random() * 5,
        vz: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.35,
        size: 1.6,
        endSize: 4.5,
        alpha: 0.9,
        color: 0xffa040,
        drag: 3,
        fadeIn: 0.05,
      });
    }
    for (let i = 0; i < 26 * strength; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 5;
      this.smoke.spawn({
        x,
        y: y + 0.3,
        z,
        vx: Math.cos(a) * s * 0.6,
        vy: 4 + Math.random() * 9,
        vz: Math.sin(a) * s * 0.6,
        life: 1.2 + Math.random() * 1.3,
        size: 0.6,
        endSize: 2.4,
        alpha: 0.85,
        color: 0x3b3026,
        drag: 1.2,
        lift: -11,
        fadeIn: 0.05,
      });
    }
    for (let i = 0; i < 12 * strength; i++) {
      this.smoke.spawn({
        x: x + (Math.random() - 0.5) * 3,
        y: y + 1 + Math.random() * 2,
        z: z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.6 + Math.random(),
        vz: (Math.random() - 0.5) * 1.5,
        life: 4 + Math.random() * 4,
        size: 2.5,
        endSize: 9,
        alpha: 0.5,
        color: 0x6b645a,
        drag: 0.4,
        fadeIn: 0.12,
      });
    }
    // Sparks.
    for (let i = 0; i < 16 * strength; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 7;
      this.glow.spawn({
        x,
        y: y + 0.5,
        z,
        vx: Math.cos(a) * s,
        vy: 4 + Math.random() * 8,
        vz: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.6,
        size: 0.12,
        endSize: 0.05,
        alpha: 1,
        color: 0xffc070,
        lift: -14,
        fadeIn: 0.02,
      });
    }
  }

  /** Musket / cannon muzzle flash with a puff of white powder smoke. */
  muzzle(x: number, y: number, z: number, dirX: number, dirZ: number, big: boolean): void {
    this.glow.spawn({ x, y, z, life: big ? 0.18 : 0.09, size: big ? 3.5 : 0.9, endSize: big ? 5 : 1.4, alpha: 1, color: 0xffd090, fadeIn: 0.01 });
    const n = big ? 10 : 3;
    for (let i = 0; i < n; i++) {
      const s = (big ? 7 : 3) * (0.4 + Math.random());
      this.smoke.spawn({
        x,
        y,
        z,
        vx: dirX * s + (Math.random() - 0.5),
        vy: 0.3 + Math.random() * 0.5,
        vz: dirZ * s + (Math.random() - 0.5),
        life: (big ? 7 : 4) + Math.random() * 3,
        size: big ? 1.5 : 0.6,
        endSize: big ? 9 : 3.5,
        alpha: big ? 0.75 : 0.55,
        color: 0xd9d6cf,
        drag: 1.1,
        lift: 0.15,
        fadeIn: 0.04,
      });
    }
  }

  /** Flames + embers + smoke from a burning object — call every frame with dt. */
  fire(x: number, y: number, z: number, radius: number, dt: number, intensity = 1): void {
    const rate = 22 * intensity * radius;
    const n = Math.floor(rate * dt + Math.random());
    for (let i = 0; i < n; i++) {
      this.glow.spawn({
        x: x + (Math.random() - 0.5) * radius * 1.6,
        y: y + Math.random() * 0.3,
        z: z + (Math.random() - 0.5) * radius * 1.6,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 1.2 + Math.random() * 1.4,
        vz: (Math.random() - 0.5) * 0.4,
        life: 0.5 + Math.random() * 0.5,
        size: 0.9 * radius,
        endSize: 0.2,
        alpha: 0.85,
        color: Math.random() < 0.3 ? 0xffd27a : 0xff7a26,
        spin: (Math.random() - 0.5) * 2,
        fadeIn: 0.15,
      });
    }
    if (Math.random() < dt * 5 * intensity) {
      this.glow.spawn({
        x: x + (Math.random() - 0.5) * radius,
        y: y + 0.5,
        z: z + (Math.random() - 0.5) * radius,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2 + Math.random() * 2.5,
        vz: (Math.random() - 0.5) * 1.5,
        life: 1.5 + Math.random(),
        size: 0.07,
        alpha: 1,
        color: 0xffb050,
        drag: 0.6,
        fadeIn: 0.05,
      });
    }
    if (Math.random() < dt * 4 * intensity) {
      this.smoke.spawn({
        x: x + (Math.random() - 0.5) * radius,
        y: y + 1.2 * radius,
        z: z + (Math.random() - 0.5) * radius,
        vx: 0.6 + Math.random() * 0.5,
        vy: 1.4 + Math.random(),
        vz: (Math.random() - 0.5) * 0.4,
        life: 5 + Math.random() * 3,
        size: 1.2 * radius,
        endSize: 6 * radius,
        alpha: 0.55,
        color: 0x2c2723,
        drag: 0.2,
        fadeIn: 0.1,
      });
    }
  }
}

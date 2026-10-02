import * as THREE from 'three';
import { Textures } from '../../utils/TextureFactory';
import type { Random } from '../../utils/Random';
import { Materials } from '../Materials';
import { buildCannon } from '../props/Structures';
import { Feature, type FeatureContext } from './Feature';

let cannonParts: ReturnType<typeof buildCannon> | null = null;

/**
 * A battery of field guns that fire in turn. params: count, facing (±1), interval
 */
export class CannonBattery extends Feature {
  private guns: THREE.Group[] = [];
  private facing = 1;
  private interval = 7;
  private timer = 0;
  private next = 0;
  private recoil: number[] = [];

  protected configure(params: Record<string, number>, rng: Random): void {
    cannonParts ??= buildCannon();
    const count = params.count ?? 3;
    this.facing = params.facing ?? 1;
    this.interval = params.interval ?? 6;
    while (this.guns.length < count) {
      const g = new THREE.Group();
      for (const part of cannonParts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = true;
        g.add(mesh);
      }
      this.guns.push(g);
      this.object.add(g);
    }
    this.recoil = [];
    for (let i = 0; i < this.guns.length; i++) {
      const g = this.guns[i];
      g.visible = i < count;
      g.position.set(0, 0, (i - (count - 1) / 2) * 7);
      g.rotation.y = this.facing > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.recoil.push(0);
    }
    this.timer = rng.range(0, this.interval);
    this.next = 0;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    for (let i = 0; i < this.guns.length; i++) {
      if (this.recoil[i] > 0) {
        this.recoil[i] = Math.max(0, this.recoil[i] - ctx.dt * 1.5);
        this.guns[i].position.x = -this.facing * Math.sin(this.recoil[i] * Math.PI) * 0.6;
      }
    }
    if (dist > 500) return;
    this.timer += ctx.dt;
    if (this.timer < this.interval / Math.max(1, this.guns.filter((g) => g.visible).length)) return;
    this.timer = 0;
    const visible = this.guns.filter((g) => g.visible);
    const gun = visible[this.next++ % visible.length];
    const i = this.guns.indexOf(gun);
    this.recoil[i] = 1;
    const muzzleX = this.x + this.facing * 1.6;
    ctx.particles.muzzle(muzzleX, this.y + 1.2, -(this.d - gun.position.z), this.facing, 0, true);
    ctx.bus.emit('battle:cannon', { distance: dist, pan: this.panFor(ctx) });
  }
}

/** A burning wreck or building. params: radius, intensity */
export class Fire extends Feature {
  private radius = 1;
  private intensity = 1;

  protected configure(params: Record<string, number>): void {
    this.radius = params.radius ?? 1;
    this.intensity = params.intensity ?? 1;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    if (dist > 260) return;
    // Fewer particles far away.
    const lod = dist < 80 ? 1 : dist < 160 ? 0.5 : 0.25;
    ctx.particles.fire(this.x, this.y, -this.d, this.radius, ctx.dt, this.intensity * lod);
  }
}

/** A regimental flag on a pole, rippling in the wind. params: army (0/1), height */
export class Flag extends Feature {
  private cloth: THREE.Mesh;
  private pole: THREE.Mesh;
  private base: Float32Array;
  private army = -1;

  constructor() {
    super();
    const geo = new THREE.PlaneGeometry(1.9, 1.2, 12, 6);
    geo.translate(0.95, 0, 0);
    this.base = (geo.getAttribute('position').array as Float32Array).slice();
    this.cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 }));
    this.cloth.castShadow = true;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 5).translate(0, 0.5, 0), Materials().painted);
    this.object.add(this.cloth, this.pole);
  }

  protected configure(params: Record<string, number>): void {
    const army = params.army ?? 0;
    const height = params.height ?? 3.2;
    if (army !== this.army) {
      const mat = this.cloth.material as THREE.MeshStandardMaterial;
      mat.map = army === 0 ? Textures.flagUnion() : Textures.flagConfederate();
      mat.needsUpdate = true;
      this.army = army;
      // Square battle flag vs. rectangular national flag.
      this.cloth.scale.set(army === 0 ? 1 : 0.75, army === 0 ? 1 : 1.2, 1);
    }
    this.pole.scale.set(1, height, 1);
    this.cloth.position.set(0, height - 0.7, 0);
  }

  update(ctx: FeatureContext): void {
    if (this.distanceTo(ctx) > 300) return;
    const pos = this.cloth.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3];
      const y = this.base[i * 3 + 1];
      const amp = x * 0.18;
      arr[i * 3 + 2] = Math.sin(ctx.time * 5 - x * 3 + y * 0.6) * amp;
      arr[i * 3 + 1] = y - x * 0.06 + Math.sin(ctx.time * 3.1 - x * 2) * amp * 0.25;
    }
    pos.needsUpdate = true;
    this.cloth.geometry.computeVertexNormals();
  }
}

/** A tall column of dark smoke on the horizon. params: size */
export class SmokeColumn extends Feature {
  private size = 1;
  private acc = 0;

  protected configure(params: Record<string, number>): void {
    this.size = params.size ?? 1;
    this.acc = 0;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    if (dist > 600) return;
    this.acc += ctx.dt * 3.5 * this.size;
    while (this.acc > 1) {
      this.acc -= 1;
      ctx.particles.spawnSmoke({
        x: this.x + (Math.random() - 0.5) * 4 * this.size,
        y: this.y + 2,
        z: -this.d + (Math.random() - 0.5) * 4 * this.size,
        vx: 1.2 + Math.random(),
        vy: 2.5 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 0.8,
        life: 14 + Math.random() * 6,
        size: 5 * this.size,
        endSize: 26 * this.size,
        alpha: 0.6,
        color: 0x2e2a26,
        drag: 0.05,
        fadeIn: 0.08,
      });
    }
  }
}

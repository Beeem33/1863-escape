import * as THREE from 'three';
import { Textures } from '../utils/TextureFactory';
import { Collectible } from './Collectible';

/**
 * Supplies found along the way. Shapes are simple, but every one is a thing a
 * person in 1863 might carry: a gourd canteen, cornbread in a cloth, a cast
 * horseshoe, a tin lantern.
 */

const mats = {
  gourd: new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.6 }),
  cork: new THREE.MeshStandardMaterial({ color: 0x5a3e24, roughness: 0.9 }),
  cord: new THREE.MeshStandardMaterial({ color: 0x8a7656, roughness: 1 }),
  bread: new THREE.MeshStandardMaterial({ color: 0xd8a650, roughness: 0.95 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.45, metalness: 0.8 }),
  tin: new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.5, metalness: 0.6 }),
  cloth: new THREE.MeshStandardMaterial({ map: Textures.cloth(), color: 0xcfc0a0, roughness: 1 }),
  flame: new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xffa040, emissiveIntensity: 3 }),
};

/** Water gourd — restores a lot of stamina. */
export class WaterGourd extends Collectible {
  readonly type = 'water' as const;

  constructor() {
    super(0xb0d8ff, 1.0);
  }

  protected build(): void {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const r = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * 0.17 + 0.02 : 0.05 + Math.sin(((t - 0.55) / 0.45) * Math.PI) * 0.07;
      pts.push(new THREE.Vector2(Math.max(0.01, r), t * 0.55));
    }
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), mats.gourd);
    body.position.y = -0.28;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 6), mats.cork);
    cork.position.y = 0.3;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 16), mats.cord);
    strap.position.y = -0.05;
    strap.rotation.x = Math.PI / 2;
    this.model.add(body, cork, strap);
  }
}

/** Cornbread wrapped in cloth — a little stamina. */
export class Food extends Collectible {
  readonly type = 'food' as const;

  constructor() {
    super(0xffd090, 0.9);
  }

  protected build(): void {
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), mats.cloth);
    cloth.rotation.y = 0.4;
    const bread = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.16), mats.bread);
    bread.position.y = 0.08;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mats.cloth);
    knot.position.set(0.1, 0.1, 0.1);
    this.model.add(cloth, bread, knot);
  }
}

/** A horseshoe — luck, and a burst of speed. */
export class Horseshoe extends Collectible {
  readonly type = 'horseshoe' as const;

  constructor() {
    super(0xfff0c0, 1.0);
  }

  protected build(): void {
    const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14, Math.PI * 1.4), mats.iron);
    shoe.rotation.z = -Math.PI * 0.2 - Math.PI / 2 + Math.PI;
    this.model.add(shoe);
  }
}

/** A tin lantern — pushes back the dark and the fog for a while. */
export class Lantern extends Collectible {
  readonly type = 'lantern' as const;

  constructor() {
    super(0xffb050, 1.6);
  }

  protected build(): void {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 8), mats.tin);
    base.position.y = -0.15;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8), mats.flame);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 8), mats.tin);
    cap.position.y = 0.18;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 4, 10, Math.PI), mats.tin);
    handle.position.y = 0.24;
    this.model.add(base, glass, cap, handle);
  }
}

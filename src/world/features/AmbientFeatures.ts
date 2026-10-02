import * as THREE from 'three';
import { Textures } from '../../utils/TextureFactory';
import type { Random } from '../../utils/Random';
import { Feature, type FeatureContext } from './Feature';

const birdGeo = (() => {
  const g = new THREE.BufferGeometry();
  // A simple "M" silhouette: two wings meeting at the body.
  const v = new Float32Array([-0.45, 0.05, 0, 0, 0, -0.08, 0, 0, 0.12, 0.45, 0.05, 0, 0, 0, -0.08, 0, 0, 0.12]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();
const birdMat = new THREE.MeshBasicMaterial({ color: 0x15120f, side: THREE.DoubleSide });

/** A loose flock of crows wheeling over the fields. params: count, radius, height */
export class Birds extends Feature {
  private birds: THREE.Mesh[] = [];
  private params: { r: number; speed: number; phase: number; h: number }[] = [];

  protected configure(params: Record<string, number>, rng: Random): void {
    const count = params.count ?? 7;
    const radius = params.radius ?? 18;
    const height = params.height ?? 22;
    while (this.birds.length < count) {
      const b = new THREE.Mesh(birdGeo, birdMat);
      this.birds.push(b);
      this.object.add(b);
    }
    this.params = [];
    for (let i = 0; i < this.birds.length; i++) {
      this.birds[i].visible = i < count;
      this.params.push({ r: radius * rng.range(0.5, 1.2), speed: rng.range(0.25, 0.45) * rng.sign(), phase: rng.range(0, Math.PI * 2), h: height + rng.range(-4, 4) });
    }
  }

  update(ctx: FeatureContext): void {
    if (this.distanceTo(ctx) > 350) return;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      if (!b.visible) continue;
      const p = this.params[i];
      const a = ctx.time * p.speed + p.phase;
      b.position.set(Math.cos(a) * p.r, p.h + Math.sin(a * 2.3) * 1.5, Math.sin(a) * p.r);
      b.rotation.set(0, -a + (p.speed > 0 ? Math.PI : 0), Math.sin(a * 1.7) * 0.3);
      b.scale.set(1.4, 1 + Math.sin(ctx.time * 9 + p.phase) * 1.4, 1.4); // flap
    }
  }
}

/**
 * A lantern hung in a tree — a quiet sign from someone who helps people
 * through these woods. params: height
 */
export class SignalLantern extends Feature {
  private glow: THREE.Sprite;
  private lamp: THREE.Mesh;
  private flicker = Math.random() * 10;

  constructor() {
    super();
    this.lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.32, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a221a, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.6 }),
    );
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: Textures.glow(), color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.scale.setScalar(2.6);
    this.object.add(this.lamp, this.glow);
  }

  protected configure(params: Record<string, number>): void {
    const h = params.height ?? 3;
    this.lamp.position.y = h;
    this.glow.position.y = h;
  }

  update(ctx: FeatureContext): void {
    this.flicker += ctx.dt;
    const f = 0.8 + Math.sin(this.flicker * 13) * 0.08 + Math.sin(this.flicker * 7.3) * 0.1;
    this.glow.material.opacity = f;
    this.lamp.rotation.z = Math.sin(this.flicker * 1.3) * 0.08;
  }
}

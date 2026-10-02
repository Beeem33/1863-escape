import * as THREE from 'three';
import { Textures } from '../utils/TextureFactory';
import type { CollectibleType } from './CollectibleTypes';

const glowMaterialCache = new Map<number, THREE.SpriteMaterial>();
function glowMaterial(color: number): THREE.SpriteMaterial {
  let m = glowMaterialCache.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: Textures.glow(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    glowMaterialCache.set(color, m);
  }
  return m;
}

/**
 * Base class for pickups. Each subclass builds its model once in `build()`;
 * instances are pooled by the CollectibleManager. They turn slowly and catch
 * the light with a soft glint so they read at a distance without looking like
 * arcade power-ups.
 */
export abstract class Collectible {
  abstract readonly type: CollectibleType;
  readonly object = new THREE.Group();
  protected readonly model = new THREE.Group();
  private readonly glint: THREE.Sprite;
  x = 0;
  d = 0;
  y = 0;
  collected = false;
  private phase = Math.random() * Math.PI * 2;
  private collectAge = 0;

  constructor(glintColor: number, glintSize = 1.1) {
    this.glint = new THREE.Sprite(glowMaterial(glintColor));
    this.glint.scale.setScalar(glintSize);
    this.object.add(this.model, this.glint);
  }

  /** Build the model into `this.model` (called once per instance). */
  protected abstract build(): void;

  private built = false;

  spawn(x: number, d: number, y: number): void {
    if (!this.built) {
      this.build();
      this.model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.built = true;
    }
    this.x = x;
    this.d = d;
    this.y = y;
    this.collected = false;
    this.collectAge = 0;
    this.object.visible = true;
    this.object.scale.setScalar(1);
    this.object.position.set(x, y, -d);
  }

  update(dt: number, time: number): void {
    if (this.collected) {
      // Lift toward the camera and fade out.
      this.collectAge += dt;
      const t = this.collectAge / 0.35;
      this.object.position.y += dt * 3;
      this.object.scale.setScalar(Math.max(0, 1 - t));
      if (t >= 1) this.object.visible = false;
      return;
    }
    this.model.rotation.y = time * 1.4 + this.phase;
    this.model.position.y = Math.sin(time * 2.2 + this.phase) * 0.06;
    this.glint.material.opacity = 0.35 + 0.25 * Math.sin(time * 3.1 + this.phase);
  }

  collect(): void {
    this.collected = true;
    this.collectAge = 0;
  }
}

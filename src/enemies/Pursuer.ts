import * as THREE from 'three';
import { Textures } from '../utils/TextureFactory';
import { dogGeometry, horseGeometry, riderGeometry } from '../world/props/Figures';
import { Materials } from '../world/Materials';

let geo: { horse: ReturnType<typeof horseGeometry>; rider: THREE.BufferGeometry; dog: ReturnType<typeof dogGeometry> } | null = null;
const geometry = () => (geo ??= { horse: horseGeometry(), rider: riderGeometry(), dog: dogGeometry() });

/**
 * One pursuer figure — a rider on horseback or a tracking hound — with a
 * gallop/run cycle. Kept deliberately as a dark silhouette: seen in glimpses,
 * through dust and fog, never up close in detail.
 */
export class Pursuer {
  readonly object = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private phase = Math.random() * 10;
  private readonly lantern: THREE.Sprite | null = null;
  private body: THREE.Group = new THREE.Group();

  constructor(readonly kind: 'rider' | 'dog') {
    const g = geometry();
    const mat = Materials().silhouette;
    this.object.add(this.body);
    if (kind === 'rider') {
      const h = g.horse;
      this.body.add(new THREE.Mesh(h.body, mat));
      const rider = new THREE.Mesh(g.rider, mat);
      rider.position.y = h.saddleHeight + 0.35;
      this.body.add(rider);
      for (const [x, z] of h.legAnchors) {
        const leg = new THREE.Mesh(h.leg, mat);
        leg.position.set(x, h.legHeight + 0.15, z);
        this.legs.push(leg);
        this.object.add(leg);
      }
      // A lantern carried at night / in the swamp.
      this.lantern = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: Textures.glow(), color: 0xffa850, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.lantern.position.set(0.45, h.saddleHeight + 0.75, -0.3);
      this.lantern.scale.setScalar(1.6);
      this.body.add(this.lantern);
    } else {
      const dg = g.dog;
      this.body.add(new THREE.Mesh(dg.body, mat));
      for (const [x, z] of [
        [-0.08, -0.25],
        [0.08, -0.25],
        [-0.08, 0.25],
        [0.08, 0.25],
      ]) {
        const leg = new THREE.Mesh(dg.leg, mat);
        leg.position.set(x, dg.legHeight, z);
        this.legs.push(leg);
        this.object.add(leg);
      }
    }
    this.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Show / hide the carried lantern (dark maps). */
  setLantern(amount: number): void {
    if (!this.lantern) return;
    this.lantern.visible = amount > 0.05;
    this.lantern.material.opacity = amount;
  }

  /** Animate the gait. `speed` in m/s. */
  animate(dt: number, speed: number): void {
    const cadence = this.kind === 'rider' ? 1.9 + speed * 0.06 : 3 + speed * 0.12;
    this.phase += dt * cadence * Math.PI * 2 * Math.min(1, speed / 3 + 0.1);
    const swing = Math.min(1, speed / 6) * (this.kind === 'rider' ? 0.7 : 0.8);
    // Gallop: front pair and back pair alternate with a slight offset.
    const offsets = [0, 0.25, Math.PI, Math.PI + 0.25];
    this.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(this.phase + offsets[i]) * swing));
    this.body.position.y = Math.abs(Math.sin(this.phase)) * (this.kind === 'rider' ? 0.12 : 0.05) * swing;
    this.body.rotation.x = Math.sin(this.phase) * 0.04 * swing;
  }
}

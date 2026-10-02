import type * as THREE from 'three';
import { HumanCrowd } from './HumanCrowd';
import { HORSE, HOUND, QuadrupedCrowd } from './Quadruped';

/** Every living (and dead) figure in the world: people, horses, hounds. */
export class Characters {
  readonly humans: HumanCrowd;
  readonly horses: QuadrupedCrowd;
  readonly hounds: QuadrupedCrowd;

  constructor(scene: THREE.Scene) {
    this.humans = new HumanCrowd(scene, 420);
    this.horses = new QuadrupedCrowd(scene, HORSE, 'horse', 14);
    this.hounds = new QuadrupedCrowd(scene, HOUND, 'hound', 8);
  }

  update(dt: number, camera: THREE.Vector3): void {
    this.horses.update(dt);
    this.hounds.update(dt);
    this.humans.update(camera);
  }

  clear(): void {
    this.humans.clear();
    this.horses.clear();
    this.hounds.clear();
  }
}

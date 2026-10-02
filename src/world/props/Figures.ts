import * as THREE from 'three';
import { box, limb, merge, prep } from './GeometryUtils';

/**
 * Human and animal figures. They are seen at a distance — through dust, fog
 * and powder smoke — so they are built as readable silhouettes with a few
 * moving parts (legs pivot at the hip) rather than detailed models.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface FigureGeometry {
  body: THREE.BufferGeometry;
  /** One leg; pivot at the hip (y = 0), extends downward. */
  leg: THREE.BufferGeometry;
  hipHeight: number;
}

/** Infantryman with kepi and shouldered musket. Faces −Z. */
export function soldierGeometry(uniform: number, trousers: number): FigureGeometry {
  const skin = 0x5a4232;
  const parts = [
    prep(box(0.42, 0.62, 0.26, 0, 0.95), uniform), // torso
    prep(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.72, 0), skin),
    prep(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 8).translate(0, 1.84, -0.01), uniform), // kepi
    prep(box(0.2, 0.03, 0.12, 0, 1.78, -0.1), 0x1a1a1a), // visor
    prep(limb(V(-0.24, 1.52, 0), V(-0.3, 1.0, -0.12), 0.06, 0.05, 5), uniform), // arms
    prep(limb(V(0.24, 1.52, 0), V(0.28, 1.12, -0.2), 0.06, 0.05, 5), uniform),
    prep(limb(V(0.3, 0.9, -0.15), V(0.18, 2.2, 0.15), 0.025, 0.02, 4), 0x3a2a1c), // musket
    prep(box(0.44, 0.08, 0.28, 0, 0.92), 0x1c1712), // belt
  ];
  const leg = merge([prep(limb(V(0, 0, 0), V(0, -0.88, 0), 0.08, 0.065, 5), trousers), prep(box(0.12, 0.08, 0.24, 0, -0.95, -0.05), 0x15110d)]);
  return { body: merge(parts), leg, hipHeight: 0.95 };
}

/** Rider with a broad hat (the pursuers). Faces −Z. Sits at y = 0 relative to the saddle. */
export function riderGeometry(): THREE.BufferGeometry {
  const coat = 0x2b241d;
  return merge([
    prep(box(0.46, 0.7, 0.3, 0, 0), coat),
    prep(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.86, 0), 0x8a6a52),
    prep(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 10).translate(0, 0.98, 0), 0x1a1612), // brim
    prep(new THREE.CylinderGeometry(0.15, 0.17, 0.18, 8).translate(0, 1.07, 0), 0x1a1612), // crown
    prep(limb(V(-0.25, 0.6, 0), V(-0.22, 0.25, -0.35), 0.06, 0.05, 5), coat),
    prep(limb(V(0.25, 0.6, 0), V(0.22, 0.25, -0.35), 0.06, 0.05, 5), coat),
    prep(limb(V(-0.2, 0.05, 0), V(-0.32, -0.55, -0.15), 0.08, 0.06, 5), 0x1f1a15),
    prep(limb(V(0.2, 0.05, 0), V(0.32, -0.55, -0.15), 0.08, 0.06, 5), 0x1f1a15),
  ]);
}

export interface HorseGeometry {
  body: THREE.BufferGeometry;
  /** A leg; pivot at the top (y = 0). */
  leg: THREE.BufferGeometry;
  legHeight: number;
  /** Leg attachment points (x, z) relative to the body. */
  legAnchors: [number, number][];
  saddleHeight: number;
}

export function horseGeometry(color = 0x3a2a1e): HorseGeometry {
  const legHeight = 1.0;
  const body = merge([
    prep(new THREE.CapsuleGeometry(0.42, 1.3, 4, 10).rotateX(Math.PI / 2).translate(0, legHeight + 0.35, 0), color),
    prep(limb(V(0, legHeight + 0.5, -0.75), V(0, legHeight + 1.25, -1.15), 0.22, 0.17, 7), color), // neck
    prep(box(0.24, 0.26, 0.62, 0, legHeight + 1.1, -1.35).rotateX(0.0), color), // head
    prep(limb(V(0, legHeight + 0.55, 0.85), V(0, legHeight - 0.1, 1.1), 0.08, 0.03, 5), 0x1a1410), // tail
    prep(box(0.1, 0.35, 0.5, 0, legHeight + 1.15, -0.9), 0x1a1410), // mane
  ]);
  const leg = merge([prep(limb(V(0, 0, 0), V(0, -legHeight, 0), 0.09, 0.06, 6), color), prep(box(0.14, 0.1, 0.16, 0, -legHeight - 0.05), 0x1a1410)]);
  return {
    body,
    leg,
    legHeight,
    legAnchors: [
      [-0.22, -0.6],
      [0.22, -0.6],
      [-0.22, 0.62],
      [0.22, 0.62],
    ],
    saddleHeight: legHeight + 0.85,
  };
}

/** Tracking hound. Faces −Z. */
export function dogGeometry(): { body: THREE.BufferGeometry; leg: THREE.BufferGeometry; legHeight: number } {
  const c = 0x5a4430;
  const legHeight = 0.36;
  return {
    body: merge([
      prep(new THREE.CapsuleGeometry(0.15, 0.55, 3, 8).rotateX(Math.PI / 2).translate(0, legHeight + 0.12, 0), c),
      prep(box(0.16, 0.16, 0.3, 0, legHeight + 0.3, -0.45), c),
      prep(box(0.05, 0.14, 0.08, -0.07, legHeight + 0.22, -0.4), 0x3a2a1e), // ears
      prep(box(0.05, 0.14, 0.08, 0.07, legHeight + 0.22, -0.4), 0x3a2a1e),
      prep(limb(V(0, legHeight + 0.2, 0.38), V(0, legHeight + 0.42, 0.6), 0.03, 0.015, 4), c),
    ]),
    leg: prep(limb(V(0, 0, 0), V(0, -legHeight, 0), 0.04, 0.03, 4), c),
    legHeight,
  };
}

import * as THREE from 'three';
import { Random } from '../utils/Random';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep, rock } from '../world/props/GeometryUtils';

/**
 * Unit-sized geometries shared by every obstacle; obstacles scale them per
 * part. Created once, reused forever.
 */
const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

export const Geo = {
  /** 1×1×1 box resting on y = 0. */
  box: () => cached('box', () => prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff)),
  /** 1×1×1 centred box. */
  boxC: () => cached('boxC', () => prep(new THREE.BoxGeometry(1, 1, 1), 0xffffff)),
  /** Plank with tinted variation. */
  plank: (shade: number) => cached(`plank${shade}`, () => prep(new THREE.BoxGeometry(1, 1, 1), shade)),
  /** Radius 1, length 1 along X, centred. */
  logX: () => cached('logX', () => prep(new THREE.CylinderGeometry(1, 1, 1, 10, 1).rotateZ(Math.PI / 2), 0xffffff)),
  /** Radius 1, height 1 along Y, resting on y = 0. */
  cylinder: (segments = 10) => cached(`cyl${segments}`, () => prep(new THREE.CylinderGeometry(1, 1, 1, segments).translate(0, 0.5, 0), 0xffffff)),
  barrel: () =>
    cached('barrel', () => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector2(0.3 + Math.sin(t * Math.PI) * 0.06, t * 0.9));
      }
      const body = new THREE.LatheGeometry(pts, 14);
      const g = prep(body, 0xffffff);
      return g;
    }),
  hoop: () => cached('hoop', () => prep(new THREE.TorusGeometry(1, 0.06, 4, 16).rotateX(Math.PI / 2), 0x3a3530)),
  wheel: () =>
    cached('wheel', () => {
      const geos = [prep(new THREE.TorusGeometry(1, 0.08, 5, 18), 0xffffff)];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        geos.push(prep(new THREE.BoxGeometry(2, 0.06, 0.05).rotateZ(a), 0xffffff));
      }
      geos.push(prep(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8).rotateX(Math.PI / 2), 0xffffff));
      return mergeAll(geos);
    }),
  /** Arched canvas wagon cover (half cylinder), radius 1 length 1 along Z. */
  cover: () => cached('cover', () => prep(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0xffffff)),
  rock: (variant: number) => cached(`rock${variant}`, () => rock(new Random(500 + variant), 1, 0xffffff)),
  sphere: () => cached('sphere', () => prep(new THREE.IcosahedronGeometry(1, 1), 0xffffff)),
  cone: () => cached('cone', () => prep(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), 0xffffff)),
  /** A flat disc for puddles / crater floors, radius 1 at y = 0. */
  disc: () => cached('disc', () => prep(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), 0xffffff)),
  plane: () => cached('plane', () => prep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0xffffff)),
};

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(geos, false)!;
}

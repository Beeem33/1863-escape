import * as THREE from 'three';
import { Random } from '../../utils/Random';
import { Materials } from '../Materials';
import { box, limb, merge, prep } from './GeometryUtils';
import type { PropPart } from './Vegetation';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Triangular prism roof spanning `w` (x) by `d` (z), ridge height `h`, sitting at `y`. */
function gableRoof(w: number, d: number, h: number, y: number, overhang = 0.4): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0);
  shape.lineTo(w / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: false });
  g.translate(0, y, -d / 2 - overhang);
  return g;
}

/** The big house: Greek-revival plantation mansion, seen from afar. */
export function buildPlantationHouse(): PropPart[] {
  const M = Materials();
  const white = 0xe8e2d4;
  const geos: THREE.BufferGeometry[] = [];
  geos.push(prep(box(24, 9.5, 14), white));
  geos.push(prep(box(25, 0.6, 15, 0, 9.5), 0xd6cfbf)); // cornice
  // Hipped roof as a 4-sided cone, flattened.
  const roof = new THREE.ConeGeometry(17, 5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.62).translate(0, 10.1 + 2.5, 0);
  geos.push(prep(roof, 0x4a4844));
  // Chimneys.
  geos.push(prep(box(1.2, 4, 1.2, -8, 11), 0x8a4a36), prep(box(1.2, 4, 1.2, 8, 11), 0x8a4a36));
  // Portico: floor, pediment and columns.
  geos.push(prep(box(18, 0.7, 4.5, 0, 0, 9.2), 0xcfc8b8));
  geos.push(prep(box(18, 0.9, 4.6, 0, 9.3, 9.2), white));
  for (let i = 0; i < 8; i++) {
    const x = -8 + (i / 7) * 16;
    geos.push(prep(new THREE.CylinderGeometry(0.35, 0.42, 8.6, 10).translate(x, 0.7 + 4.3, 11), 0xf2eee4));
  }
  // Windows with dark shutters: two storeys on the front face.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      const x = -10 + i * 4;
      if (Math.abs(x) < 2) continue;
      const y = 1.6 + row * 4.2;
      geos.push(prep(box(1.3, 2.2, 0.1, x, y, 7.02), 0x1d1c1a));
      geos.push(prep(box(0.5, 2.3, 0.08, x - 0.95, y - 0.05, 7.05), 0x2c3b2c));
      geos.push(prep(box(0.5, 2.3, 0.08, x + 0.95, y - 0.05, 7.05), 0x2c3b2c));
    }
  }
  geos.push(prep(box(1.8, 3, 0.1, 0, 0.7, 7.02), 0x2a1d14)); // door
  return [{ geometry: merge(geos), material: M.painted, castShadow: true }];
}

/** Small plank cabin with a stone chimney (the quarters). */
export function buildCabin(): PropPart[] {
  const M = Materials();
  const walls = prep(box(5.5, 2.5, 4.2), 0x8d7458);
  const roof = prep(gableRoof(5.5, 4.2, 1.7, 2.5).rotateY(Math.PI / 2), 0x5d4d3c);
  const door = prep(box(0.9, 1.8, 0.06, 0.6, 0, 2.12), 0x2a2018);
  const chimney = prep(box(0.9, 4.6, 0.9, -2.9, 0), 0x7a6d60);
  return [
    { geometry: merge([walls, roof, door]), material: M.wood, castShadow: true },
    { geometry: chimney, material: M.stone, castShadow: true },
  ];
}

export function buildBarn(): PropPart[] {
  const M = Materials();
  const walls = prep(box(10, 5, 14), 0x6e4636);
  const roof = prep(gableRoof(10, 14, 3.4, 5, 0.6), 0x4c3a30);
  const door = prep(box(3.6, 3.8, 0.08, 0, 0, 7.02), 0x3b2a20);
  return [{ geometry: merge([walls, roof, door]), material: M.wood, castShadow: true }];
}

/** Zig-zag split-rail ("worm") fence — about 12 m long along local X. */
export function buildRailFence(): PropPart[] {
  const rng = new Random(9101);
  const geos: THREE.BufferGeometry[] = [];
  const segs = 4;
  const segLen = 3;
  for (let s = 0; s < segs; s++) {
    const x0 = -6 + s * segLen;
    const z0 = s % 2 === 0 ? -0.35 : 0.35;
    const z1 = -z0;
    for (let r = 0; r < 4; r++) {
      const y = 0.25 + r * 0.28;
      geos.push(prep(limb(V(x0 - 0.25, y, z0), V(x0 + segLen + 0.25, y + 0.05, z1), 0.06, 0.055, 5), 0x7d6650, 0.1, rng));
    }
  }
  return [{ geometry: merge(geos), material: Materials().wood, castShadow: true }];
}

export function buildHaystack(): PropPart[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(Math.sin(Math.min(1, (1 - t) * 1.35) * Math.PI * 0.5) * 2.1 + 0.05, t * 3.6));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5).translate(0, 4, 0);
  return [{ geometry: merge([prep(g, 0xc9a764, 0.08, new Random(5)), prep(pole, 0x5a4634)]), material: Materials().hay, castShadow: true }];
}

/** Canvas wedge tent. */
export function buildTent(): PropPart[] {
  const g = gableRoof(2.6, 3.2, 2.2, 0, 0).rotateY(Math.PI / 2);
  return [{ geometry: prep(g, 0xd8d0bc), material: Materials().cloth, castShadow: true }];
}

function wheelGeometry(radius: number, color: number): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [prep(new THREE.TorusGeometry(radius, 0.06, 5, 16), color)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    geos.push(prep(limb(V(0, 0, 0), V(Math.cos(a) * radius, Math.sin(a) * radius, 0), 0.03, 0.03, 4), color));
  }
  geos.push(prep(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8).rotateX(Math.PI / 2), color));
  return merge(geos);
}

/** Field gun on its carriage (Napoleon 12-pounder silhouette). */
export function buildCannon(): PropPart[] {
  const M = Materials();
  const barrel = new THREE.CylinderGeometry(0.16, 0.24, 2.0, 10).rotateX(Math.PI / 2 - 0.08).translate(0, 1.15, -0.4);
  const trail = box(0.35, 0.3, 2.6, 0, 0.35, 0.9).rotateX(-0.25);
  const wheels = [wheelGeometry(0.7, 0x4a3b2c).translate(-0.75, 0.7, -0.2), wheelGeometry(0.7, 0x4a3b2c).translate(0.75, 0.7, -0.2)];
  const axle = limb(V(-0.75, 0.7, -0.2), V(0.75, 0.7, -0.2), 0.06, 0.06, 5);
  return [
    { geometry: prep(barrel, 0x3c4434), material: M.iron, castShadow: true },
    { geometry: merge([prep(trail, 0x5a4a38), ...wheels.map((w) => w), prep(axle, 0x3a3028)]), material: M.wood, castShadow: true },
  ];
}

/** Woven earth-filled basket used in fieldworks. */
export function buildGabion(): PropPart[] {
  const g = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10, 1).translate(0, 0.55, 0);
  return [{ geometry: prep(g, 0x7a6448), material: Materials().wood, castShadow: true }];
}

/** A broken wagon wheel lying in the dirt. */
export function buildWheel(): PropPart[] {
  const g = wheelGeometry(0.75, 0x5a4836).rotateX(Math.PI / 2 - 0.15).translate(0, 0.12, 0);
  return [{ geometry: g, material: Materials().wood, castShadow: true }];
}

/** A burned farmhouse: blackened frame around a lone standing chimney. */
export function buildBurntHouse(): PropPart[] {
  const rng = new Random(9601);
  const geos: THREE.BufferGeometry[] = [];
  const posts: [number, number, number][] = [
    [-4, 0, -3],
    [4, 0, -3],
    [-4, 0, 3],
    [4, 0, 3],
    [0, 0, 3],
    [-4, 0, 0],
  ];
  for (const [x, , z] of posts) {
    const h = rng.range(1.2, 4.2);
    geos.push(prep(box(0.25, h, 0.25, x, 0, z).rotateZ(rng.range(-0.15, 0.15)), 0x1d1814));
  }
  geos.push(prep(box(8.4, rng.range(0.6, 1.4), 0.2, 0, 0, -3), 0x241c16));
  geos.push(prep(box(0.2, 2.2, 3.5, 4, 0, -1.2).rotateX(0.1), 0x221a14));
  // Fallen beams.
  for (let i = 0; i < 6; i++) {
    const g = box(0.2, 0.2, rng.range(2.5, 5), rng.range(-3, 3), 0.1, rng.range(-2, 2));
    g.rotateY(rng.range(0, Math.PI));
    geos.push(prep(g, 0x16120f));
  }
  const chimney = prep(box(1.4, 7.5, 1.4, -4.6, 0, 0), 0x6f5a4c);
  return [
    { geometry: merge(geos), material: Materials().wood, castShadow: true },
    { geometry: chimney, material: Materials().stone, castShadow: true },
  ];
}

import * as THREE from 'three';
import { Random } from '../../utils/Random';
import { Materials } from '../Materials';
import { crossedCards, foliageClump, limb, merge, prep, rock } from './GeometryUtils';

export interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Hanging strands of Spanish moss from a list of branch points. */
function mossStrands(rng: Random, anchors: THREE.Vector3[], length: [number, number]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const a of anchors) {
    const len = rng.range(length[0], length[1]);
    const w = len * rng.range(0.35, 0.55);
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(w, len).translate(0, -len / 2, 0);
      g.rotateY(rng.range(0, Math.PI) + k * Math.PI * 0.5);
      g.translate(a.x + rng.range(-0.3, 0.3), a.y, a.z + rng.range(-0.3, 0.3));
      geos.push(prep(g, 0xffffff));
    }
  }
  return merge(geos);
}

/** Southern live oak: short thick trunk, huge spreading limbs. */
export function buildOak(withMoss: boolean): PropPart[] {
  const rng = new Random(withMoss ? 1201 : 1101);
  const M = Materials();
  const wood: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const mossAnchors: THREE.Vector3[] = [];

  const trunkTop = V(0, 3.2, 0);
  wood.push(prep(limb(V(0, -0.4, 0), trunkTop, 0.75, 0.55, 9), 0x6b5a48));
  const limbs = 6;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const reach = rng.range(4.5, 7.5);
    const mid = V(Math.cos(a) * reach * 0.5, trunkTop.y + rng.range(1.2, 2.4), Math.sin(a) * reach * 0.5);
    const end = V(Math.cos(a) * reach, trunkTop.y + rng.range(2.2, 4.8), Math.sin(a) * reach);
    wood.push(prep(limb(trunkTop, mid, 0.42, 0.28, 6), 0x66563f));
    wood.push(prep(limb(mid, end, 0.28, 0.12, 5), 0x66563f));
    leaves.push(foliageClump(rng, end.clone().add(V(0, 0.8, 0)), V(3.0, 1.7, 3.0), 16, 3.0, 0x6f8a4a));
    leaves.push(foliageClump(rng, mid.clone().add(V(0, 1.6, 0)), V(2.4, 1.4, 2.4), 9, 2.6, 0x5f7a40));
    mossAnchors.push(mid.clone(), end.clone().lerp(mid, 0.3));
  }
  leaves.push(foliageClump(rng, V(0, trunkTop.y + 4.6, 0), V(3.6, 1.8, 3.6), 18, 3.2, 0x75904d));

  const parts: PropPart[] = [
    { geometry: merge(wood), material: M.bark, castShadow: true },
    { geometry: merge(leaves), material: M.leaves, castShadow: true },
  ];
  if (withMoss) parts.push({ geometry: mossStrands(rng, mossAnchors, [1.8, 3.4]), material: M.moss });
  return parts;
}

/** Bald cypress: tall flared trunk, flat layered crown, draped in moss. */
export function buildCypress(): PropPart[] {
  const rng = new Random(2201);
  const M = Materials();
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const y = t * 15 - 0.6;
    const r = 0.32 + 1.05 * Math.pow(1 - Math.min(1, t * 3.2), 2.2);
    profile.push(new THREE.Vector2(r * (1 - t * 0.55), y));
  }
  const trunk = new THREE.LatheGeometry(profile, 9);
  const wood: THREE.BufferGeometry[] = [prep(trunk, 0x6e6152)];
  const leaves: THREE.BufferGeometry[] = [];
  const mossAnchors: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    const y = rng.range(9, 14);
    const reach = rng.range(1.8, 3.6);
    const end = V(Math.cos(a) * reach, y + rng.range(0.4, 1.4), Math.sin(a) * reach);
    wood.push(prep(limb(V(0, y, 0), end, 0.16, 0.07, 5), 0x6e6152));
    leaves.push(foliageClump(rng, end, V(2.2, 0.8, 2.2), 8, 2.2, 0x5b6e3c));
    mossAnchors.push(end.clone().lerp(V(0, y, 0), 0.4), end.clone());
  }
  leaves.push(foliageClump(rng, V(0, 15, 0), V(2.6, 1.1, 2.6), 12, 2.6, 0x617444));
  // Cypress "knees" poking out of the water around the base.
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(1.2, 2.6);
    const h = rng.range(0.25, 0.7);
    wood.push(prep(new THREE.ConeGeometry(0.13, h, 5).translate(Math.cos(a) * r, h / 2 - 0.15, Math.sin(a) * r), 0x5e5244));
  }
  return [
    { geometry: merge(wood), material: M.bark, castShadow: true },
    { geometry: merge(leaves), material: M.leaves, castShadow: true },
    { geometry: mossStrands(rng, mossAnchors, [2.2, 4.2]), material: M.moss },
  ];
}

/** Longleaf pine: tall straight trunk, tufted crown. */
export function buildPine(): PropPart[] {
  const rng = new Random(3301);
  const M = Materials();
  const wood: THREE.BufferGeometry[] = [prep(limb(V(0, -0.3, 0), V(0, 16, 0), 0.38, 0.14, 7), 0x7a5a42)];
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2);
    const y = rng.range(11, 16);
    const end = V(Math.cos(a) * rng.range(1.2, 2.6), y + 0.6, Math.sin(a) * rng.range(1.2, 2.6));
    wood.push(prep(limb(V(0, y, 0), end, 0.1, 0.05, 4), 0x6a4f3a));
    leaves.push(foliageClump(rng, end, V(1.5, 1.0, 1.5), 7, 1.9, 0x52683a));
  }
  return [
    { geometry: merge(wood), material: M.bark, castShadow: true },
    { geometry: merge(leaves), material: M.leaves, castShadow: true },
  ];
}

/** Dead, shattered tree (swamp snags, shelled battlefield woods). */
export function buildDeadTree(): PropPart[] {
  const rng = new Random(4401);
  const M = Materials();
  const wood: THREE.BufferGeometry[] = [prep(limb(V(0, -0.3, 0), V(0.3, 9, 0.1), 0.42, 0.12, 7), 0x4a4038)];
  for (let i = 0; i < 6; i++) {
    const y = rng.range(3.5, 8);
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(1.4, 3.4);
    const start = V(0.3 * (y / 9), y, 0.1 * (y / 9));
    const end = start.clone().add(V(Math.cos(a) * len, rng.range(0.6, 2), Math.sin(a) * len));
    wood.push(prep(limb(start, end, 0.12, 0.03, 4), 0x463c34));
  }
  return [{ geometry: merge(wood), material: M.bark, castShadow: true }];
}

export function buildShrub(): PropPart[] {
  const rng = new Random(5501);
  return [
    {
      geometry: merge([
        foliageClump(rng, V(0, 0.7, 0), V(1.2, 0.75, 1.2), 10, 1.4, 0x5c7240),
        foliageClump(rng, V(0.6, 0.5, 0.3), V(0.8, 0.5, 0.8), 6, 1.1, 0x657a45),
      ]),
      material: Materials().leaves,
    },
  ];
}

export function buildFern(): PropPart[] {
  const rng = new Random(5601);
  return [{ geometry: crossedCards(1.4, 0.9, 3, rng, 0x5d7a3d), material: Materials().grass }];
}

export function buildGrassTuft(dry: boolean): PropPart[] {
  const rng = new Random(dry ? 6602 : 6601);
  return [{ geometry: crossedCards(1.1, dry ? 0.75 : 0.6, 3, rng, dry ? 0x9c8558 : 0x6a7444), material: Materials().grass }];
}

export function buildReeds(): PropPart[] {
  const rng = new Random(6701);
  return [{ geometry: crossedCards(1.6, 1.8, 3, rng, 0x8a9a5a), material: Materials().reeds }];
}

/** Cotton plant: painted crossed cards + a few 3D bolls for volume up close. */
export function buildCottonPlant(): PropPart[] {
  const rng = new Random(7701);
  const M = Materials();
  const bolls: THREE.BufferGeometry[] = [];
  // A tall plant — a little over head height — with bolls all the way up.
  for (let i = 0; i < 8; i++) {
    const g = new THREE.OctahedronGeometry(rng.range(0.045, 0.07), 0);
    g.translate(rng.range(-0.3, 0.3), rng.range(0.7, 1.95), rng.range(-0.3, 0.3));
    bolls.push(prep(g, 0xffffff));
  }
  return [
    { geometry: crossedCards(1.1, 2.0, 3, rng), material: M.cotton },
    { geometry: merge(bolls), material: M.cottonBoll },
  ];
}

export function buildLilyPads(): PropPart[] {
  const rng = new Random(7801);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const r = rng.range(0.18, 0.38);
    const g = new THREE.CircleGeometry(r, 8, 0.3, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
    g.translate(rng.range(-1.6, 1.6), 0.01, rng.range(-1.6, 1.6));
    geos.push(prep(g, rng.chance(0.2) ? 0x7a8a40 : 0x4f6a32));
  }
  return [{ geometry: merge(geos), material: Materials().painted }];
}

export function buildRock(): PropPart[] {
  const rng = new Random(8801);
  return [{ geometry: rock(rng, 0.9, 0x7d766b), material: Materials().stone, castShadow: true }];
}

export function buildStump(): PropPart[] {
  const g = new THREE.CylinderGeometry(0.42, 0.55, 0.7, 9).translate(0, 0.3, 0);
  const top = new THREE.CircleGeometry(0.42, 9).rotateX(-Math.PI / 2).translate(0, 0.651, 0);
  return [{ geometry: merge([prep(g, 0x6b5848), prep(top, 0xa58a68)]), material: Materials().bark, castShadow: true }];
}

export function buildLog(): PropPart[] {
  const g = new THREE.CylinderGeometry(0.38, 0.45, 6, 9).rotateZ(Math.PI / 2).translate(0, 0.36, 0);
  return [{ geometry: prep(g, 0x5d5044), material: Materials().bark, castShadow: true }];
}

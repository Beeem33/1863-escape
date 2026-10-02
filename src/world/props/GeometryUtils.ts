import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Random } from '../../utils/Random';

/**
 * Helpers for building props out of primitive shapes. Props are merged into a
 * single BufferGeometry with per-vertex colours so each prop part is ONE draw
 * call (or one instanced draw call for all copies of it).
 */

const tmpColor = new THREE.Color();

/** Normalise a geometry so it can be merged: non-indexed, with uv + color. */
export function prep(geo: THREE.BufferGeometry, color: number | THREE.Color = 0xffffff, jitter = 0, rng?: Random): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  tmpColor.set(color);
  // Jitter per triangle so faces vary slightly.
  for (let t = 0; t < count; t += 3) {
    const j = jitter > 0 && rng ? 1 + (rng.next() * 2 - 1) * jitter : 1;
    for (let k = 0; k < 3 && t + k < count; k++) {
      colors[(t + k) * 3] = tmpColor.r * j;
      colors[(t + k) * 3 + 1] = tmpColor.g * j;
      colors[(t + k) * 3 + 2] = tmpColor.b * j;
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Drop any attributes mergeGeometries would choke on.
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  return g;
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error('mergeGeometries failed — attribute mismatch');
  for (const g of geos) g.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** A box resting on y=0 by default. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** Cylinder from (x0,y0,z0) to (x1,y1,z1). Great for branches, posts, spokes. */
export function limb(
  from: THREE.Vector3,
  to: THREE.Vector3,
  r0: number,
  r1: number,
  segments = 6,
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, segments, 1, true);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  geo.applyQuaternion(q);
  geo.translate(from.x, from.y, from.z);
  // Scale UVs so bark texture repeats along the length.
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 0.5);
  return geo;
}

/**
 * Foliage cards: randomly oriented quads scattered in an ellipsoid. Their
 * normals point outward from the clump centre, so the clump shades like a
 * soft round volume instead of flat flickering planes.
 */
export function foliageClump(
  rng: Random,
  center: THREE.Vector3,
  radius: THREE.Vector3,
  cards: number,
  cardSize: number,
  color: number,
  colorJitter = 0.15,
): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    const s = cardSize * rng.range(0.75, 1.25);
    const g = new THREE.PlaneGeometry(s, s);
    g.rotateX(rng.range(-1.2, 1.2));
    g.rotateY(rng.range(0, Math.PI));
    g.rotateZ(rng.range(-0.6, 0.6));
    up.set(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize();
    const r = Math.cbrt(rng.next()) * 0.85;
    g.translate(center.x + up.x * radius.x * r, center.y + up.y * radius.y * r, center.z + up.z * radius.z * r);
    const c = new THREE.Color(color).multiplyScalar(1 + (rng.next() * 2 - 1) * colorJitter);
    const pg = prep(g, c);
    // Spherical normals.
    const pos = pg.getAttribute('position') as THREE.BufferAttribute;
    const nor = pg.getAttribute('normal') as THREE.BufferAttribute;
    const n = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      n.set(
        (pos.getX(k) - center.x) / radius.x,
        (pos.getY(k) - center.y) / radius.y + 0.35,
        (pos.getZ(k) - center.z) / radius.z,
      ).normalize();
      nor.setXYZ(k, n.x, n.y, n.z);
    }
    geos.push(pg);
  }
  return merge(geos);
}

/** Crossed vertical cards (grass, reeds, cotton) rooted at y = 0. */
export function crossedCards(width: number, height: number, planes = 3, rng?: Random, color = 0xffffff): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < planes; i++) {
    const g = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
    g.rotateY((i / planes) * Math.PI + (rng ? rng.range(-0.2, 0.2) : 0));
    const pg = prep(g, color);
    // Normals point up-ish so the card catches sky light like a grass tuft would.
    const nor = pg.getAttribute('normal') as THREE.BufferAttribute;
    for (let k = 0; k < nor.count; k++) {
      const v = new THREE.Vector3(nor.getX(k) * 0.8, 0.7, nor.getZ(k) * 0.8).normalize();
      nor.setXYZ(k, v.x, v.y, v.z);
    }
    geos.push(pg);
  }
  return merge(geos);
}

/** Lumpy rock (deformed icosahedron), resting on the ground. */
export function rock(rng: Random, size: number, color: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = rng.range(0.75, 1.2)));
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.62, pos.getZ(i) * k);
  }
  g.translate(0, size * 0.32, 0);
  g.computeVertexNormals();
  return prep(g, color, 0.12, rng);
}

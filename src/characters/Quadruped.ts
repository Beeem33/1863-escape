import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { capsule, ellipsoid, polygonize, union } from './SdfMesh';

/**
 * Horses and hounds: the same jointed four-legged rig at two sizes. Each
 * kind is drawn with a handful of instanced meshes (body, neck+head, upper
 * legs, lower legs, tail, tack), posed per frame with a rotary gallop.
 * Faces −Z. Root = point on the ground under the middle of the body.
 */

export interface QuadDims {
  /** Height of the shoulder / hip joints above the ground. */
  legTop: number;
  upperLeg: number;
  lowerLeg: number;
  /** Leg anchors (x, z) relative to the root: front pair z < 0. */
  front: number;
  hind: number;
  hipWidth: number;
  /** Where the neck joint sits (y, z). */
  neckY: number;
  neckZ: number;
  tailY: number;
  tailZ: number;
  /** Top of the back (for a rider's saddle). */
  saddleY: number;
}

const finish = (g: THREE.BufferGeometry, shade = 1) => {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.computeVertexNormals();
  const n = geo.getAttribute('position').count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
};
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!;

export const HORSE: QuadDims = {
  legTop: 1.0,
  upperLeg: 0.5,
  lowerLeg: 0.52,
  front: -0.58,
  hind: 0.58,
  hipWidth: 0.17,
  neckY: 1.32,
  neckZ: -0.72,
  tailY: 1.3,
  tailZ: 0.86,
  saddleY: 1.66,
};

export const HOUND: QuadDims = {
  legTop: 0.36,
  upperLeg: 0.19,
  lowerLeg: 0.2,
  front: -0.24,
  hind: 0.24,
  hipWidth: 0.07,
  neckY: 0.5,
  neckZ: -0.3,
  tailY: 0.5,
  tailZ: 0.33,
  saddleY: 0.5,
};

/**
 * Horse: one seamless SDF body (barrel, chest, haunches, withers, arched
 * neck, head with jaw and muzzle, ears, mane and tail) plus jointed legs.
 */
function horseGeometry(): Record<'body' | 'upper' | 'lower' | 'tack', THREE.BufferGeometry> {
  const body = union(
    0.12,
    ellipsoid([0, 1.26, 0.05], [0.29, 0.34, 0.72]),
    ellipsoid([0, 1.24, -0.5], [0.27, 0.36, 0.32]),
    ellipsoid([0, 1.32, 0.6], [0.3, 0.34, 0.34]),
    ellipsoid([0, 1.5, -0.42], [0.12, 0.14, 0.26]),
    capsule([0, 1.4, -0.6], [0, 1.92, -0.98], 0.23, 0.13),
    capsule([0, 2.0, -1.02], [0, 1.66, -1.38], 0.11, 0.075),
    ellipsoid([0, 1.88, -1.1], [0.095, 0.12, 0.13]),
    capsule([0.055, 2.06, -1.0], [0.07, 2.2, -0.98], 0.03, 0.008),
    capsule([-0.055, 2.06, -1.0], [-0.07, 2.2, -0.98], 0.03, 0.008),
    capsule([0, 1.66, -0.5], [0, 2.06, -0.94], 0.05, 0.035), // mane crest
    capsule([0, 1.42, 0.92], [0, 0.78, 1.12], 0.075, 0.035), // tail
  );
  const bodyGeo = polygonize(body, [-0.42, 0.68, -1.5], [0.42, 2.3, 1.25], 0.035, (x, y, z) => {
    // Darker mane, tail and muzzle.
    if (z > 0.86 && y < 1.4) return 0.35;
    if (y > 1.62 && z < -0.45 && z > -1.0 && Math.abs(x) < 0.06 && y > 1.4 + (-z - 0.45) * 0.9) return 0.35;
    if (z < -1.28) return 0.55;
    return 1;
  });
  const upper = polygonize(
    union(0.05, capsule([0, 0.08, 0], [0, -0.48, 0.02], 0.12, 0.06), ellipsoid([0, -0.1, 0.0], [0.1, 0.18, 0.11])),
    [-0.16, -0.6, -0.16],
    [0.16, 0.25, 0.16],
    0.025,
  );
  const lower = polygonize(
    union(
      0.03,
      capsule([0, 0.02, 0], [0, -0.36, 0], 0.055, 0.042),
      ellipsoid([0, -0.38, 0.01], [0.055, 0.05, 0.06]),
      capsule([0, -0.4, 0.01], [0, -0.47, -0.02], 0.045, 0.05),
      capsule([0, -0.48, -0.02], [0, -0.52, -0.03], 0.068, 0.07),
    ),
    [-0.1, -0.6, -0.12],
    [0.1, 0.1, 0.12],
    0.018,
    (_x, y) => (y < -0.47 ? 0.2 : 1),
  );
  const saddle = new THREE.CylinderGeometry(0.27, 0.29, 0.08, 18, 1).scale(0.9, 1, 1.3).translate(0, 1.63, 0.02);
  const blanket = new THREE.BoxGeometry(0.72, 0.025, 0.62).translate(0, 1.6, 0.02);
  const tack = merge([plain(saddle, 0.6), plain(blanket, 0.85)]);
  return { body: bodyGeo, upper, lower, tack };
}

/** Tracking hound: deep chest, tucked belly, long muzzle, hanging ears, tail up. */
function houndGeometry(): Record<'body' | 'upper' | 'lower', THREE.BufferGeometry> {
  const body = union(
    0.05,
    ellipsoid([0, 0.48, -0.12], [0.11, 0.14, 0.2]),
    ellipsoid([0, 0.5, 0.15], [0.09, 0.1, 0.18]),
    capsule([0, 0.52, -0.25], [0, 0.66, -0.36], 0.07, 0.055),
    ellipsoid([0, 0.68, -0.4], [0.065, 0.07, 0.08]),
    capsule([0, 0.67, -0.42], [0, 0.63, -0.56], 0.045, 0.03),
    ellipsoid([0.06, 0.62, -0.37], [0.018, 0.07, 0.045]),
    ellipsoid([-0.06, 0.62, -0.37], [0.018, 0.07, 0.045]),
    capsule([0, 0.55, 0.3], [0, 0.72, 0.46], 0.025, 0.012),
  );
  const bodyGeo = polygonize(body, [-0.16, 0.3, -0.62], [0.16, 0.8, 0.5], 0.016, (x, y, z) => {
    if (Math.abs(x) > 0.045 && y < 0.68 && z < -0.3) return 0.45; // ears
    if (z < -0.52) return 0.4; // nose
    return 1;
  });
  const upper = polygonize(capsule([0, 0.03, 0], [0, -0.19, 0], 0.04, 0.025), [-0.06, -0.24, -0.06], [0.06, 0.09, 0.06], 0.012);
  const lower = polygonize(
    union(0.02, capsule([0, 0.0, 0], [0, -0.18, 0.0], 0.022, 0.018), ellipsoid([0, -0.2, -0.015], [0.025, 0.02, 0.035])),
    [-0.05, -0.25, -0.06],
    [0.05, 0.04, 0.05],
    0.01,
  );
  return { body: bodyGeo, upper, lower };
}

function plain(g: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  return finish(g, shade);
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Animal {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** Gait phase (radians) and speed (m/s) — set speed, the crowd advances the phase. */
  phase = Math.random() * 10;
  speed = 0;
  /** Bounce/pitch of the back this frame (read by a rider). */
  bob = 0;
  sway = 0;
  /** @internal */ slots: { part: string; index: number; leg: number }[] = [];
  constructor(readonly dims: QuadDims) {}

  /** World position of the saddle (rider's pelvis). */
  saddle(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, this.y + this.dims.saddleY + this.bob, this.z);
  }
}

/** Instanced renderer for one kind of four-legged animal. */
export class QuadrupedCrowd {
  private readonly meshes = new Map<string, { mesh: THREE.InstancedMesh; free: number[]; high: number }>();
  private readonly animals = new Set<Animal>();
  private readonly m = new THREE.Matrix4();
  private readonly m2 = new THREE.Matrix4();
  private readonly m3 = new THREE.Matrix4();
  private readonly root = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    readonly dims: QuadDims,
    kind: 'horse' | 'hound',
    readonly capacity: number,
  ) {
    const geo = kind === 'horse' ? horseGeometry() : houndGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'horse' ? 0.55 : 0.8 });
    for (const [name, g] of Object.entries(geo)) {
      const per = name === 'upper' || name === 'lower' ? 4 : 1;
      const mesh = new THREE.InstancedMesh(g, mat, capacity * per);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.color.set(1, 1, 1));
      mesh.name = `${kind}:${name}`;
      const free: number[] = [];
      for (let i = capacity * per - 1; i >= 0; i--) free.push(i);
      this.meshes.set(name, { mesh, free, high: 0 });
      scene.add(mesh);
    }
  }

  spawn(coat: number, tack = 0x3a2a1c): Animal | null {
    if (this.animals.size >= this.capacity) return null;
    const a = new Animal(this.dims);
    for (const [name, p] of this.meshes) {
      const n = name === 'upper' || name === 'lower' ? 4 : 1;
      for (let leg = 0; leg < n; leg++) {
        const i = p.free.pop();
        if (i === undefined) continue;
        p.mesh.setColorAt(i, this.color.setHex(name === 'tack' ? tack : coat));
        p.mesh.instanceColor!.needsUpdate = true;
        if (i + 1 > p.high) p.mesh.count = p.high = i + 1;
        a.slots.push({ part: name, index: i, leg });
      }
    }
    this.animals.add(a);
    return a;
  }

  remove(a: Animal | null | undefined): void {
    if (!a || !this.animals.delete(a)) return;
    for (const s of a.slots) {
      const p = this.meshes.get(s.part)!;
      p.mesh.setMatrixAt(s.index, ZERO);
      p.free.push(s.index);
    }
    a.slots = [];
  }

  clear(): void {
    for (const a of [...this.animals]) this.remove(a);
  }

  update(dt: number): void {
    const D = this.dims;
    for (const a of this.animals) {
      // Gait: faster cadence at speed; a rotary gallop above a trot.
      const cadence = 1.6 + a.speed * 0.11;
      a.phase += dt * cadence * Math.PI * 2 * Math.min(1, a.speed / 2 + 0.05);
      const k = Math.min(1, a.speed / 7);
      a.bob = Math.abs(Math.sin(a.phase)) * 0.12 * k;
      const pitch = Math.sin(a.phase) * 0.07 * k;
      this.m.makeRotationY(a.yaw);
      this.root.makeTranslation(a.x, a.y + a.bob, a.z).multiply(this.m).multiply(this.m2.makeRotationX(pitch));
      const legs: [number, number, number][] = [
        [-D.hipWidth, D.front, 0],
        [D.hipWidth, D.front, 0.35],
        [-D.hipWidth, D.hind, Math.PI],
        [D.hipWidth, D.hind, Math.PI + 0.35],
      ];
      for (const s of a.slots) {
        const p = this.meshes.get(s.part)!;
        switch (s.part) {
          case 'body':
          case 'tack':
            p.mesh.setMatrixAt(s.index, this.root);
            break;
          case 'upper':
          case 'lower': {
            const [lx, lz, off] = legs[s.leg];
            const ph = a.phase + off;
            const front = lz < 0;
            const swing = Math.sin(ph) * 0.65 * k;
            // Front knees fold back as the leg lifts; hocks fold forward.
            const fold = Math.max(0, Math.sin(ph + (front ? 1.2 : -0.6))) * (front ? -1.3 : 1.0) * k;
            this.m.copy(this.root).multiply(this.m2.makeTranslation(lx, D.legTop, lz)).multiply(this.m3.makeRotationX(swing));
            if (s.part === 'lower') this.m.multiply(this.m2.makeTranslation(0, -D.upperLeg, 0)).multiply(this.m3.makeRotationX(fold));
            p.mesh.setMatrixAt(s.index, this.m);
            break;
          }
        }
      }
    }
    for (const p of this.meshes.values()) p.mesh.instanceMatrix.needsUpdate = true;
  }
}

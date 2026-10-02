import * as THREE from 'three';
import { BODY, HumanGeometry, withDetail } from './HumanGeometry';
import { newPose, type HumanPose } from './HumanPose';
import type { HumanStyle } from './Styles';

type PartName = 'pelvis' | 'torso' | 'head' | 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot' | 'kepi' | 'slouch' | 'rifle' | 'pack';

/** How many instances of each part one figure uses. */
const PER_FIGURE: Record<PartName, number> = {
  pelvis: 1,
  torso: 1,
  head: 1,
  upperArm: 2,
  forearm: 2,
  hand: 2,
  thigh: 2,
  shin: 2,
  foot: 2,
  kepi: 1,
  slouch: 1,
  rifle: 1,
  pack: 1,
};

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class PartPool {
  readonly mesh: THREE.InstancedMesh;
  private free: number[] = [];
  private high = 0;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  alloc(color: THREE.Color): number {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor!.needsUpdate = true;
    if (i + 1 > this.high) this.mesh.count = this.high = i + 1;
    return i;
  }

  release(i: number): void {
    this.mesh.setMatrixAt(i, ZERO);
    this.free.push(i);
  }
}

/** One figure in the crowd. Change `pose` and the crowd poses its parts. */
export class Human {
  readonly pose: HumanPose = newPose();
  /** Static figures (corpses) are only re-posed when `dirty` is set. */
  isStatic = false;
  dirty = true;
  alive = true;
  /** Level of detail in use: 0 = near (detailed), 1 = far (light). */
  lod = 0;
  /** @internal LOD the matrices were last written for (-1 = never). */
  lodApplied = -1;
  /** Seconds of animation time, free for the owner to use. */
  t = 0;
  /** @internal one slot per part instance: indices into the near and far pools. */ slots: { part: PartName; index: [number, number]; side: number }[] = [];
  constructor(readonly style: HumanStyle) {}
}

/**
 * Renders every human figure in the game with one instanced draw call per
 * body part (≈13 total), posing them with simple forward kinematics each
 * frame. Armies of hundreds cost about as much as a few individual models.
 */
export class HumanCrowd {
  /** Two pools per part: [near detail, far detail]. */
  private readonly pools = new Map<PartName, [PartPool, PartPool]>();
  /** Figures closer than this use the detailed meshes (with hysteresis). */
  private static readonly NEAR = 38;
  private readonly figures = new Set<Human>();
  private readonly group = new THREE.Group();
  private readonly m = {
    root: new THREE.Matrix4(),
    spine: new THREE.Matrix4(),
    head: new THREE.Matrix4(),
    a: new THREE.Matrix4(),
    b: new THREE.Matrix4(),
    c: new THREE.Matrix4(),
    t: new THREE.Matrix4(),
    r: new THREE.Matrix4(),
  };
  private readonly e = new THREE.Euler();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private frame = 0;

  constructor(scene: THREE.Scene, readonly capacity = 420) {
    const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const gear = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
    const G = HumanGeometry;
    const make = (name: PartName, build: () => THREE.BufferGeometry, mat: THREE.Material) => {
      // Near: fine SDF surface. Far: the same shape polygonised much coarser.
      const near = new PartPool(withDetail(1.7, build), mat, capacity * PER_FIGURE[name]);
      const far = new PartPool(withDetail(5, build), mat, capacity * PER_FIGURE[name]);
      far.mesh.castShadow = false; // distant figures: skip the shadow pass
      near.mesh.name = `human:${name}`;
      far.mesh.name = `human:${name}:far`;
      this.pools.set(name, [near, far]);
      this.group.add(near.mesh, far.mesh);
    };
    make('pelvis', () => G.pelvis(), cloth);
    make('torso', () => G.torso(), cloth);
    make('head', () => G.head(), skin);
    make('upperArm', () => G.upperArm(), cloth);
    make('forearm', () => G.forearm(), cloth);
    make('hand', () => G.hand(), skin);
    make('thigh', () => G.thigh(), cloth);
    make('shin', () => G.shin(), cloth);
    make('foot', () => G.foot(), gear);
    make('kepi', () => G.kepi(), cloth);
    make('slouch', () => G.slouchHat(), cloth);
    make('rifle', () => G.rifle(), gear);
    make('pack', () => G.pack(), cloth);
    this.group.name = 'humans';
    scene.add(this.group);
  }

  get count(): number {
    return this.figures.size;
  }

  spawn(style: HumanStyle): Human | null {
    if (this.figures.size >= this.capacity) return null;
    const h = new Human(style);
    const add = (part: PartName, color: number, side = 0) => {
      const [near, far] = this.pools.get(part)!;
      this.color.setHex(color);
      const a = near.alloc(this.color);
      const b = far.alloc(this.color);
      if (a >= 0 && b >= 0) h.slots.push({ part, index: [a, b], side });
      else {
        if (a >= 0) near.release(a);
        if (b >= 0) far.release(b);
      }
    };
    add('pelvis', style.trousers);
    add('torso', style.coat);
    add('head', style.skin);
    for (const side of [-1, 1]) {
      add('upperArm', style.sleeves, side);
      add('forearm', style.sleeves, side);
      add('hand', style.skin, side);
      add('thigh', style.trousers, side);
      add('shin', style.trousers, side);
      add('foot', style.feet, side);
    }
    if (style.hat === 'kepi') add('kepi', style.hatColor);
    if (style.hat === 'slouch') add('slouch', style.hatColor);
    if (style.rifle) add('rifle', 0xffffff);
    if (style.pack) add('pack', 0x6a5a44);
    this.figures.add(h);
    return h;
  }

  remove(h: Human | null | undefined): void {
    if (!h || !this.figures.delete(h)) return;
    for (const s of h.slots) {
      const [near, far] = this.pools.get(s.part)!;
      near.release(s.index[0]);
      far.release(s.index[1]);
    }
    h.slots = [];
    h.alive = false;
  }

  clear(): void {
    for (const h of [...this.figures]) this.remove(h);
  }

  /** Pose every figure (distant ones at a reduced rate) and upload. */
  update(camera: THREE.Vector3): void {
    this.frame++;
    for (const h of this.figures) {
      const dist = Math.hypot(h.pose.x - camera.x, h.pose.z - camera.z);
      // Hysteresis so figures don't flicker between detail levels.
      const lod = dist < HumanCrowd.NEAR - (h.lod === 0 ? -4 : 0) ? 0 : 1;
      if (lod !== h.lod) {
        h.lod = lod;
        h.dirty = true;
      }
      if (h.isStatic && !h.dirty) continue;
      if (dist > 160 && !h.dirty && (this.frame + (h.slots[0]?.index[0] ?? 0)) % 3 !== 0) continue;
      this.pose(h);
      h.dirty = false;
    }
    for (const [near, far] of this.pools.values()) {
      near.mesh.instanceMatrix.needsUpdate = true;
      far.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private rot(out: THREE.Matrix4, x: number, y: number, z: number, order: THREE.EulerOrder = 'YXZ'): THREE.Matrix4 {
    this.e.set(x, y, z, order);
    return out.makeRotationFromEuler(this.e);
  }

  private set(part: PartName, h: Human, side: number, m: THREE.Matrix4): void {
    for (const s of h.slots) {
      if (s.part === part && s.side === side) {
        const pools = this.pools.get(part)!;
        pools[h.lod].mesh.setMatrixAt(s.index[h.lod], m);
        // Switched detail level: clear the other copy.
        if (h.lodApplied !== h.lod) pools[1 - h.lod].mesh.setMatrixAt(s.index[1 - h.lod], ZERO);
        return;
      }
    }
  }

  private pose(h: Human): void {
    const p = h.pose;
    const M = this.m;
    const k = h.style.build;
    // Root: pelvis position and orientation.
    this.e.set(p.pitch, p.yaw, p.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    M.root.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(k, k, k));
    this.set('pelvis', h, 0, M.root);

    // Spine → torso, head, pack.
    M.spine.copy(M.root).multiply(M.t.makeTranslation(0, BODY.spineOffset, 0)).multiply(this.rot(M.r, p.spinePitch, p.spineYaw, p.spineRoll));
    this.set('torso', h, 0, M.spine);
    this.set('pack', h, 0, M.spine);
    M.head.copy(M.spine).multiply(M.t.makeTranslation(0, BODY.neckHeight, 0)).multiply(this.rot(M.r, p.headPitch, p.headYaw, p.headRoll));
    this.set('head', h, 0, M.head);
    this.set('kepi', h, 0, M.head);
    this.set('slouch', h, 0, M.head);

    // Arms.
    for (const side of [-1, 1]) {
      const [swing, abduct, bend] = side < 0 ? p.lArm : p.rArm;
      M.a.copy(M.spine)
        .multiply(M.t.makeTranslation(side * BODY.shoulderWidth, BODY.shoulderHeight, 0))
        .multiply(M.r.makeRotationZ(side * abduct))
        .multiply(M.c.makeRotationX(swing));
      this.set('upperArm', h, side, M.a);
      M.b.copy(M.a).multiply(M.t.makeTranslation(0, -BODY.upperArm, 0)).multiply(M.r.makeRotationX(bend));
      this.set('forearm', h, side, M.b);
      M.c.copy(M.b).multiply(M.t.makeTranslation(0, -BODY.forearm, 0));
      this.set('hand', h, side, M.c);
    }

    // Legs.
    for (const side of [-1, 1]) {
      const [swing, abduct, bend] = side < 0 ? p.lLeg : p.rLeg;
      M.a.copy(M.root)
        .multiply(M.t.makeTranslation(side * BODY.hipWidth, 0, 0))
        .multiply(M.r.makeRotationZ(side * abduct))
        .multiply(M.c.makeRotationX(swing));
      this.set('thigh', h, side, M.a);
      M.b.copy(M.a).multiply(M.t.makeTranslation(0, -BODY.thigh, 0)).multiply(M.r.makeRotationX(-bend));
      this.set('shin', h, side, M.b);
      M.c.copy(M.b).multiply(M.t.makeTranslation(0, -BODY.shin, 0)).multiply(M.r.makeRotationX(-p.ankle + bend * 0.3));
      this.set('foot', h, side, M.c);
    }

    // Rifle, by how it is held.
    if (h.style.rifle) {
      switch (p.rifle) {
        case 'aim':
          M.a.copy(M.spine).multiply(M.t.makeTranslation(0.13, 0.4, -0.36)).multiply(this.rot(M.r, 0.02, -0.12, 0));
          break;
        case 'port':
          M.a.copy(M.spine).multiply(M.t.makeTranslation(0.02, 0.28, -0.24)).multiply(this.rot(M.r, 0, -Math.PI / 2, 2.2, 'ZYX'));
          break;
        case 'hand':
          M.a.copy(M.spine).multiply(M.t.makeTranslation(0.3, 0.18, -0.12)).multiply(this.rot(M.r, Math.PI / 2 - 0.25, 0, 0));
          break;
        case 'slung':
          M.a.copy(M.spine).multiply(M.t.makeTranslation(0, 0.3, 0.18)).multiply(this.rot(M.r, 0, -Math.PI / 2, 2.2, 'ZYX'));
          break;
        default:
          M.a.copy(ZERO);
      }
      this.set('rifle', h, 0, M.a);
    }
    h.lodApplied = h.lod;
  }

  /** World position of the muzzle for a figure aiming its rifle (for flashes). */
  muzzle(h: Human, out: THREE.Vector3): THREE.Vector3 {
    const p = h.pose;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    return out.set(p.x + fx * 1.15 + Math.cos(p.yaw) * 0.15, p.y + BODY.spineOffset + 0.45, p.z + fz * 1.15 - Math.sin(p.yaw) * 0.15);
  }
}

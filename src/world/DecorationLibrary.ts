import * as THREE from 'three';
import type { DecorKind } from './DecorKinds';
import type { PropPart } from './props/Vegetation';
import * as Veg from './props/Vegetation';
import * as Str from './props/Structures';

interface DecorDef {
  build: () => PropPart[];
  /** Max simultaneous instances (across all live chunks). */
  capacity: number;
  /** Receive shadows from the sun (cheap); casting is set per part. */
  receiveShadow?: boolean;
  /** Skip shadow casting for this kind entirely (dense small plants). */
  noShadow?: boolean;
}

/**
 * Registry of every instanced decoration. To add a new decoration:
 *   1. Add its id to `DecorKind` in DecorKinds.ts
 *   2. Write a builder returning PropPart[] (see props/)
 *   3. Register it here with a capacity
 *   4. Place it from a map's decorate() with ctx.place('yourKind', x, d)
 */
const DEFS: Record<DecorKind, DecorDef> = {
  cottonPlant: { build: Veg.buildCottonPlant, capacity: 17000, receiveShadow: true, noShadow: true },
  grassTuft: { build: () => Veg.buildGrassTuft(false), capacity: 7000, noShadow: true },
  dryGrass: { build: () => Veg.buildGrassTuft(true), capacity: 7000, noShadow: true },
  shrub: { build: Veg.buildShrub, capacity: 1400, receiveShadow: true },
  oak: { build: () => Veg.buildOak(false), capacity: 260 },
  oakMoss: { build: () => Veg.buildOak(true), capacity: 380 },
  pine: { build: Veg.buildPine, capacity: 360 },
  cypress: { build: Veg.buildCypress, capacity: 620 },
  deadTree: { build: Veg.buildDeadTree, capacity: 420 },
  stump: { build: Veg.buildStump, capacity: 420, receiveShadow: true },
  reeds: { build: Veg.buildReeds, capacity: 2600, noShadow: true },
  lilyPads: { build: Veg.buildLilyPads, capacity: 700, noShadow: true },
  fern: { build: Veg.buildFern, capacity: 2400, noShadow: true },
  rock: { build: Veg.buildRock, capacity: 700, receiveShadow: true },
  log: { build: Veg.buildLog, capacity: 260, receiveShadow: true },
  railFence: { build: Str.buildRailFence, capacity: 420, receiveShadow: true },
  cabin: { build: Str.buildCabin, capacity: 70, receiveShadow: true },
  plantationHouse: { build: Str.buildPlantationHouse, capacity: 6, receiveShadow: true },
  barn: { build: Str.buildBarn, capacity: 20, receiveShadow: true },
  haystack: { build: Str.buildHaystack, capacity: 90, receiveShadow: true },
  tent: { build: Str.buildTent, capacity: 160, receiveShadow: true },
  cannon: { build: Str.buildCannon, capacity: 80, receiveShadow: true },
  gabion: { build: Str.buildGabion, capacity: 360, receiveShadow: true },
  wheel: { build: Str.buildWheel, capacity: 120, receiveShadow: true },
  burntHouse: { build: Str.buildBurntHouse, capacity: 16, receiveShadow: true },
};

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** A fixed-capacity set of InstancedMeshes (one per prop part) sharing slot indices. */
class InstancedPool {
  readonly meshes: THREE.InstancedMesh[] = [];
  private free: number[] = [];
  private highWater = 0;
  private dirty = false;
  private colorDirty = false;

  constructor(
    readonly kind: DecorKind,
    parts: PropPart[],
    readonly capacity: number,
    def: DecorDef,
  ) {
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.name = `decor:${kind}`;
      mesh.frustumCulled = false; // instances span many chunks; culling the whole set is wrong
      mesh.castShadow = !def.noShadow && !!part.castShadow;
      mesh.receiveShadow = !!def.receiveShadow;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes.push(mesh);
    }
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  alloc(matrix: THREE.Matrix4, color: THREE.Color): number {
    const index = this.free.pop();
    if (index === undefined) return -1;
    for (const m of this.meshes) {
      m.setMatrixAt(index, matrix);
      m.setColorAt(index, color);
    }
    if (index + 1 > this.highWater) {
      this.highWater = index + 1;
      for (const m of this.meshes) m.count = this.highWater;
    }
    this.dirty = this.colorDirty = true;
    return index;
  }

  release(index: number): void {
    for (const m of this.meshes) m.setMatrixAt(index, ZERO);
    this.free.push(index);
    this.dirty = true;
  }

  get used(): number {
    return this.capacity - this.free.length;
  }

  flush(): void {
    if (this.dirty) for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    if (this.colorDirty) for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.dirty = this.colorDirty = false;
  }
}

export interface DecorHandle {
  pool: InstancedPool;
  index: number;
}

export class DecorationLibrary {
  private pools = new Map<DecorKind, InstancedPool>();
  readonly group = new THREE.Group();
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.group.name = 'decorations';
    scene.add(this.group);
  }

  /** Build every pool up front so there are no hitches mid-run. */
  warmUp(): void {
    for (const kind of Object.keys(DEFS) as DecorKind[]) this.pool(kind);
  }

  private pool(kind: DecorKind): InstancedPool {
    let p = this.pools.get(kind);
    if (!p) {
      const def = DEFS[kind];
      p = new InstancedPool(kind, def.build(), def.capacity, def);
      for (const m of p.meshes) this.group.add(m);
      this.pools.set(kind, p);
    }
    return p;
  }

  place(
    kind: DecorKind,
    x: number,
    y: number,
    z: number,
    rotY: number,
    scale: number,
    scaleY: number,
    tilt: number,
    tint: number,
  ): DecorHandle | null {
    const pool = this.pool(kind);
    this.tmpEuler.set(tilt, rotY, tilt * 0.6, 'YXZ');
    this.tmpQuat.setFromEuler(this.tmpEuler);
    this.tmpMatrix.compose(this.tmpPos.set(x, y, z), this.tmpQuat, this.tmpScale.set(scale, scale * scaleY, scale));
    this.tmpColor.setHex(tint);
    const index = pool.alloc(this.tmpMatrix, this.tmpColor);
    return index < 0 ? null : { pool, index };
  }

  release(h: DecorHandle): void {
    h.pool.release(h.index);
  }

  /** Upload changed instance buffers to the GPU (once per frame). */
  flush(): void {
    for (const p of this.pools.values()) p.flush();
  }

  stats(): { kind: string; used: number; capacity: number }[] {
    return [...this.pools.values()].map((p) => ({ kind: p.kind, used: p.used, capacity: p.capacity }));
  }
}

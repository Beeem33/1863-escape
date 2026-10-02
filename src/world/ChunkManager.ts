import { PlayerConfig, WorldConfig } from '../config/GameConfig';
import type { MapDefinition } from '../maps/MapDefinition';
import type { Random } from '../utils/Random';
import type { DecorationLibrary, DecorHandle } from './DecorationLibrary';
import type { DecorKind, FeatureKind } from './DecorKinds';
import type { DecorationContext, PlaceOptions } from './DecorationContext';
import type { Feature } from './features/Feature';
import type { FeatureManager } from './features/FeatureManager';
import { GroundMesh } from './GroundMesh';
import type { MapManager } from './MapManager';
import type { ChunkLayout, ProceduralGenerator } from './ProceduralGenerator';
import type { Terrain } from './Terrain';
import type * as THREE from 'three';

/** Kinds that are thinned out on lower graphics quality. */
const DENSE_KINDS = new Set<DecorKind>(['cottonPlant', 'grassTuft', 'dryGrass', 'reeds', 'fern', 'lilyPads']);

/** One slice of the world: ground strip, decorations, set pieces and gameplay objects. */
export class Chunk {
  layout!: ChunkLayout;
  readonly decor: DecorHandle[] = [];
  readonly features: Feature[] = [];
  /** Gameplay objects owned by other managers (obstacles, collectibles). */
  readonly owned: { release(): void }[] = [];

  constructor(
    public index: number,
    readonly ground: GroundMesh,
  ) {}

  get d0(): number {
    return this.layout.d0;
  }
  get d1(): number {
    return this.layout.d1;
  }
}

/**
 * Keeps a window of chunks around the player: builds new ones ahead, recycles
 * old ones behind. Everything is pooled — ground meshes, instance slots,
 * features, obstacles — so a run of any length uses constant memory.
 */
export class ChunkManager {
  readonly chunks = new Map<number, Chunk>();
  private groundPool: GroundMesh[] = [];
  /** Called after a chunk's layout + ground exist, to spawn obstacles/collectibles. */
  onPopulate: ((chunk: Chunk) => void) | null = null;
  /** 0..1 thinning of dense foliage (graphics quality). */
  density = 1;
  builtThisRun = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly generator: ProceduralGenerator,
    private readonly terrain: Terrain,
    private readonly maps: MapManager,
    private readonly decor: DecorationLibrary,
    private readonly features: FeatureManager,
  ) {}

  reset(): void {
    for (const c of [...this.chunks.values()]) this.release(c);
    this.chunks.clear();
    this.builtThisRun = 0;
  }

  /**
   * Ensure chunks around `playerD` exist. `budget` limits how many are built
   * this frame (spreads the cost so there are no hitches).
   */
  update(playerD: number, budget = 1): void {
    const L = WorldConfig.chunkLength;
    const current = Math.floor(playerD / L);
    const first = current - WorldConfig.chunksBehind;
    const last = current + WorldConfig.chunksAhead;

    for (const [i, c] of this.chunks) if (i < first || i > last) this.release(c);

    // Build nearest-first so the space right in front of the player is never missing.
    for (let i = current; i <= last && budget > 0; i++) {
      if (!this.chunks.has(i)) {
        this.build(i);
        budget--;
      }
    }
    for (let i = current - 1; i >= first && budget > 0; i--) {
      if (!this.chunks.has(i)) {
        this.build(i);
        budget--;
      }
    }
  }

  /** Build everything in range at once (start of a run). */
  fill(playerD: number): void {
    this.update(playerD, 1000);
  }

  chunkAt(d: number): Chunk | undefined {
    return this.chunks.get(Math.floor(d / WorldConfig.chunkLength));
  }

  /** Walkable ground height including craters, ponds and bridges. */
  groundHeight(x: number, d: number): number {
    let h = this.terrain.baseHeight(x, d);
    const c = this.chunkAt(d);
    if (c) for (const def of c.layout.deformations) h += def.height(x, d, true);
    return h;
  }

  private build(index: number): void {
    // Chunks must be generated in order so the safe route stays continuous.
    // Behind-the-start chunks (index < 0) have no gameplay content, so order doesn't matter there.
    const layout = this.generator.generate(index);
    const ground = this.groundPool.pop() ?? new GroundMesh();
    const chunk = new Chunk(index, ground);
    chunk.layout = layout;
    ground.build(layout.d0, this.terrain, layout.deformations);
    this.scene.add(ground.mesh);
    this.chunks.set(index, chunk);
    this.onPopulate?.(chunk);
    this.decorateChunk(chunk);
    this.builtThisRun++;
  }

  private release(chunk: Chunk): void {
    this.scene.remove(chunk.ground.mesh);
    this.groundPool.push(chunk.ground);
    for (const h of chunk.decor) this.decor.release(h);
    for (const f of chunk.features) this.features.release(f);
    for (const o of chunk.owned) o.release();
    chunk.decor.length = chunk.features.length = chunk.owned.length = 0;
    this.chunks.delete(chunk.index);
  }

  private decorateChunk(chunk: Chunk): void {
    const { d0, d1 } = chunk.layout;
    const present = new Set<MapDefinition>();
    for (const d of [d0, (d0 + d1) / 2, d1]) {
      const b = this.terrain.blendAt(d);
      if (b.t < 1) present.add(b.a);
      if (b.t > 0) present.add(b.b);
    }
    let salt = 0;
    for (const map of present) {
      const rng = this.generator.chunkRandom(chunk.index, 0x5eed + salt++ * 7919 + map.id.length);
      map.decorate(this.makeContext(chunk, map, rng));
    }
  }

  private makeContext(chunk: Chunk, map: MapDefinition, rng: Random): DecorationContext {
    const corridor = PlayerConfig.corridorHalfWidth;
    const obstacles = chunk.layout.obstacles;
    const midD = (chunk.layout.d0 + chunk.layout.d1) / 2;
    return {
      chunkIndex: chunk.index,
      d0: chunk.layout.d0,
      d1: chunk.layout.d1,
      rng,
      noise: this.terrain.noise,
      corridor,
      mapStart: this.maps.startOf(map.id, midD),
      level: this.maps.levelAt(midD),
      weight: (d) => this.maps.weightOf(map.id, d),
      groundHeight: (x, d) => this.groundHeight(x, d),
      isClear: (x, d, r, ahead = 0) => {
        for (const o of obstacles) {
          if (Math.abs(x - o.x) >= o.width / 2 + r) continue;
          if (d < o.d + o.depth / 2 + r && d > o.d - o.depth / 2 - r - ahead) return false;
        }
        return true;
      },
      place: (kind: DecorKind, x: number, d: number, opts: PlaceOptions = {}) => {
        if (this.density < 1 && DENSE_KINDS.has(kind) && rng.next() > this.density) return;
        const y = this.groundHeight(x, d) + (opts.y ?? 0);
        const h = this.decor.place(
          kind,
          x,
          y,
          -d,
          opts.rotY ?? rng.range(0, Math.PI * 2),
          opts.scale ?? 1,
          opts.scaleY ?? 1,
          opts.tilt ?? 0,
          opts.tint ?? 0xffffff,
        );
        if (h) chunk.decor.push(h);
      },
      feature: (kind: FeatureKind, x: number, d: number, params: Record<string, number> = {}) => {
        const f = this.features.spawn(kind, x, this.groundHeight(x, d), d, params, rng);
        chunk.features.push(f);
      },
    };
  }
}

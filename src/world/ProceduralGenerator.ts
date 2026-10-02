import { CollectibleConfig, DifficultyConfig, PlayerConfig, WorldConfig } from '../config/GameConfig';
import { Difficulty } from '../core/Difficulty';
import type { CollectibleType } from '../collectibles/CollectibleTypes';
import type { MapId } from '../maps/MapDefinition';
import { OBSTACLE_SPECS } from '../obstacles/ObstacleCatalog';
import type { ObstacleKind } from '../obstacles/ObstacleKinds';
import { clamp, lerp } from '../utils/MathUtils';
import { Random, hash32 } from '../utils/Random';
import { Deformation } from './Deformation';
import type { MapManager } from './MapManager';

export interface ObstacleSpawn {
  kind: ObstacleKind;
  x: number;
  d: number;
  width: number;
  depth: number;
  /** Per-obstacle seed so its look is deterministic. */
  seed: number;
  map: MapId;
  /** Stream bridges: where the deck is and whether it is broken. */
  bridge?: { x: number; width: number; gap: number };
}

export interface CollectibleSpawn {
  type: CollectibleType;
  x: number;
  d: number;
  /** Height above the ground. */
  y: number;
}

export interface ChunkLayout {
  index: number;
  d0: number;
  d1: number;
  obstacles: ObstacleSpawn[];
  collectibles: CollectibleSpawn[];
  deformations: Deformation[];
  /** The guaranteed route through this chunk (for debugging / pursuer glimpses). */
  route: { d: number; x: number }[];
}

interface Interval {
  min: number;
  max: number;
}

/**
 * Generates obstacle rows chunk by chunk.
 *
 * Core guarantee — there is ALWAYS a playable route:
 *  1. Each row has a "safe gap" of `safePathWidth` meters.
 *  2. The gap moves between rows by at most the distance the player can
 *     strafe in the time it takes to run from one row to the next (with a
 *     safety margin), so it is always reachable.
 *  3. `solid` obstacles are never placed in the gap. `vault` and `ground`
 *     obstacles may cross it — jumping them is part of the game.
 *  4. Rows are always at least `rowSpacingHard` apart, so after vaulting one
 *     row there is room to land and react before the next.
 *
 * Rows are generated sequentially (so the route is continuous) slightly ahead
 * of the chunk being built; spawns are handed to the chunk they fall in.
 */
export class ProceduralGenerator {
  private seed = 1;
  private rng = new Random(1);
  private nextRowD = 0;
  private pathX = 0;
  private pendingObstacles: ObstacleSpawn[] = [];
  private pendingCollectibles: CollectibleSpawn[] = [];
  private pendingDeformations: Deformation[] = [];
  private pendingRoute: { d: number; x: number }[] = [];
  private lastFullWidthD = -1000;
  /** The previous row forced a vault on the route — don't demand two in a row. */
  private lastRowBlocked = false;

  constructor(private readonly maps: MapManager) {}

  reset(seed: number): void {
    this.seed = seed;
    this.rng = new Random(hash32(seed, 0xc0ffee));
    this.nextRowD = DifficultyConfig.graceDistance;
    this.pathX = 0;
    this.pendingObstacles = [];
    this.pendingCollectibles = [];
    this.pendingDeformations = [];
    this.pendingRoute = [];
    this.lastFullWidthD = -1000;
    this.lastRowBlocked = false;
  }

  /** Per-chunk RNG for decorations — independent of generation order. */
  chunkRandom(index: number, salt: number): Random {
    return new Random(hash32(this.seed, index, salt));
  }

  get runSeed(): number {
    return this.seed;
  }

  generate(index: number): ChunkLayout {
    const L = WorldConfig.chunkLength;
    const d0 = index * L;
    const d1 = d0 + L;
    const layout: ChunkLayout = { index, d0, d1, obstacles: [], collectibles: [], deformations: [], route: [] };
    if (index < 0) return layout;

    // Generate rows a little past this chunk so pre-row collectible trails land correctly.
    while (this.nextRowD < d1 + 14) this.generateRow();

    const take = <T extends { d: number }>(list: T[], out: T[]): T[] => {
      const keep: T[] = [];
      for (const item of list) (item.d < d1 ? out : keep).push(item);
      return keep;
    };
    this.pendingObstacles = take(this.pendingObstacles, layout.obstacles);
    this.pendingCollectibles = take(this.pendingCollectibles, layout.collectibles);
    this.pendingDeformations = take(this.pendingDeformations, layout.deformations);
    this.pendingRoute = take(this.pendingRoute, layout.route);
    return layout;
  }

  private generateRow(): void {
    const rng = this.rng;
    const d = this.nextRowD;
    const spacing = Difficulty.rowSpacing(d);
    const difficulty = Difficulty.at(d);

    // ---- 1. Move the safe route (bounded by how far the player can strafe) ----
    const speed = Difficulty.runSpeed(d) * PlayerConfig.sprintMultiplier; // worst case: sprinting
    const timeBetweenRows = spacing / speed;
    const maxShift = PlayerConfig.strafeSpeed * timeBetweenRows * DifficultyConfig.routeShiftSafety;
    const safeWidth = Difficulty.safePathWidth(d);
    const limit = PlayerConfig.corridorHalfWidth - safeWidth / 2 - 0.3;
    // Bias back toward the middle when near the walls.
    const drift = rng.range(-maxShift, maxShift) - this.pathX * 0.15;
    this.pathX = clamp(this.pathX + drift, -limit, limit);
    const safe: Interval = { min: this.pathX - safeWidth / 2, max: this.pathX + safeWidth / 2 };
    this.pendingRoute.push({ d, x: this.pathX });

    // ---- 2. Pick which map this row belongs to (mixes during transitions) ----
    const blend = this.maps.blendAt(d);
    const map = rng.next() < blend.t ? blend.b : blend.a;
    const tuning = map.tuning;

    // ---- 3. Fill the row ----
    const occupied: Interval[] = [];
    const count = Math.floor(Difficulty.obstaclesPerRow(d) * tuning.density + rng.next());
    const vaultOnPathChance = lerp(0.3, 0.75, difficulty);
    // Never demand a vault on the route two rows running — always time to land and recover.
    let pathBlocked = this.lastRowBlocked;
    const blockedByPrevious = pathBlocked;
    let rowHasFullWidth = false;

    for (let n = 0; n < count && !rowHasFullWidth; n++) {
      const kind = rng.weighted(tuning.obstacles);
      if (!kind || kind === 'open') continue;
      const spec = OBSTACLE_SPECS[kind];
      const seed = Math.floor(rng.next() * 1e9);
      const rowD = d + rng.range(-0.8, 0.8);

      if (kind === 'narrows') {
        if (occupied.length > 0) continue;
        const depth = rng.range(spec.depth[0], spec.depth[1]);
        const edge = PlayerConfig.corridorHalfWidth + 1.5;
        if (safe.min > -edge + 1) {
          const w = safe.min - -edge;
          this.pendingObstacles.push({ kind, x: -edge + w / 2, d: rowD, width: w, depth, seed, map: map.id });
        }
        if (safe.max < edge - 1) {
          const w = edge - safe.max;
          this.pendingObstacles.push({ kind, x: safe.max + w / 2, d: rowD, width: w, depth, seed: seed + 1, map: map.id });
        }
        rowHasFullWidth = true;
        continue;
      }

      if (spec.fullWidth) {
        if (occupied.length > 0 || d - this.lastFullWidthD < 60) continue;
        const depth = rng.range(spec.depth[0], spec.depth[1]);
        const deform = this.makeDeformation(kind, 0, rowD, 13, depth / 2, rng, safe);
        if (!deform) continue;
        const bridge = deform.bridge ? { x: this.pathX, width: deform.bridge.maxX - deform.bridge.minX, gap: deform.bridge.gap } : undefined;
        this.pendingObstacles.push({ kind, x: 0, d: rowD, width: 26, depth, seed, map: map.id, bridge });
        this.pendingDeformations.push(deform);
        this.lastFullWidthD = d;
        rowHasFullWidth = true;
        continue;
      }

      const mayCrossPath = spec.collision !== 'solid' && !pathBlocked && rng.next() < (spec.collision === 'slow' ? 0.6 : vaultOnPathChance);

      // Try a few positions until one fits.
      for (let attempt = 0; attempt < 8; attempt++) {
        const width = rng.range(spec.width[0], spec.width[1]);
        const depth = spec.width[0] === spec.depth[0] && spec.width[1] === spec.depth[1] ? width : rng.range(spec.depth[0], spec.depth[1]);
        const halfSpan = PlayerConfig.corridorHalfWidth + 0.5 - width / 2;
        const x = mayCrossPath && attempt < 3 ? clamp(this.pathX + rng.range(-1, 1), -halfSpan, halfSpan) : rng.range(-halfSpan, halfSpan);
        const iv: Interval = { min: x - width / 2, max: x + width / 2 };
        if (occupied.some((o) => iv.min < o.max + 0.9 && iv.max > o.min - 0.9)) continue;
        const crossesPath = iv.min < safe.max && iv.max > safe.min;
        if (crossesPath && (!mayCrossPath || spec.collision === 'solid')) continue;

        let deform: Deformation | null = null;
        if (spec.deformation) {
          deform = this.makeDeformation(kind, x, rowD, width / 2, depth / 2, rng, null);
          if (!deform) continue;
        }
        occupied.push(iv);
        if (crossesPath && spec.collision !== 'slow') pathBlocked = true;
        this.pendingObstacles.push({ kind, x, d: rowD, width, depth, seed, map: map.id });
        if (deform) this.pendingDeformations.push(deform);
        break;
      }
    }

    // ---- 4. Collectibles ----
    const blockedHere = pathBlocked && !blockedByPrevious;
    this.placeCollectibles(d, spacing, map.tuning.collectibles, blockedHere);
    this.lastRowBlocked = blockedHere;

    this.nextRowD += spacing * rng.range(0.9, 1.2);
  }

  /** Build a ground deformation that stays inside its chunk (so meshes join cleanly). */
  private makeDeformation(
    kind: ObstacleKind,
    x: number,
    d: number,
    rx: number,
    rd: number,
    rng: Random,
    safe: Interval | null,
  ): Deformation | null {
    const spec = OBSTACLE_SPECS[kind];
    const L = WorldConfig.chunkLength;
    const chunkStart = Math.floor(d / L) * L;
    const pad = spec.deformation === 'crater' ? 1.8 : 0.8;
    if (d - rd - pad < chunkStart + 0.3 || d + rd + pad > chunkStart + L - 0.3) return null;
    switch (spec.deformation) {
      case 'crater':
        return new Deformation('crater', x, d, rx, rd, rng.range(0.7, 1.1));
      case 'mud':
        return new Deformation('mud', x, d, rx, rd, 0.14);
      case 'pond':
        return new Deformation('pond', x, d, rx, rd, 0.5);
      case 'ditch':
        return new Deformation('ditch', x, d, rx, rd, 0.75);
      case 'trench':
        return new Deformation('trench', x, d, rx, rd, 1.25);
      case 'stream': {
        const bw = 2.4;
        const gap = rng.chance(0.35) ? 1.4 : 0;
        const bx = safe ? (safe.min + safe.max) / 2 : 0;
        return new Deformation('stream', 0, d, 30, rd, 0.55, { minX: bx - bw / 2, maxX: bx + bw / 2, gap });
      }
      default:
        return null;
    }
  }

  private placeCollectibles(
    d: number,
    spacing: number,
    mapWeights: Partial<Record<CollectibleType, number>>,
    pathBlocked: boolean,
  ): void {
    const rng = this.rng;
    if (d < DifficultyConfig.graceDistance + 10 || !rng.chance(CollectibleConfig.chancePerRow)) return;

    const weights: Partial<Record<CollectibleType, number>> = {};
    for (const [k, v] of Object.entries(CollectibleConfig.weights) as [CollectibleType, number][]) {
      weights[k] = v * (mapWeights[k] ?? 1);
    }
    const type = rng.weighted(weights) ?? 'mapPiece';

    if (type === 'mapPiece') {
      // A short trail leading into the safe gap (and over it if the row must be vaulted).
      const [minLen, maxLen] = CollectibleConfig.mapPieceTrailLength;
      const len = rng.int(minLen, maxLen);
      // Keep the whole trail clear of the previous row (rows are >= 0.9 × spacing apart).
      const step = Math.min(2.2, (spacing * 0.8 - 4) / len);
      for (let i = 0; i < len; i++) {
        const pd = d - 2 - (len - 1 - i) * step;
        this.pendingCollectibles.push({ type, x: this.pathX, d: pd, y: 1.0 });
      }
      if (pathBlocked) this.pendingCollectibles.push({ type, x: this.pathX, d: d, y: 2.1 });
    } else {
      // Single item a few meters past the row, inside the gap (reachable by definition).
      const offset = rng.range(3, Math.max(3.5, spacing * 0.4));
      this.pendingCollectibles.push({ type, x: this.pathX + rng.range(-0.8, 0.8), d: d + offset, y: 1.0 });
    }
  }
}

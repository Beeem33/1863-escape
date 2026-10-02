import * as THREE from 'three';
import { CollectibleConfig, StaminaConfig } from '../config/GameConfig';
import type { EventBus } from '../core/EventBus';
import type { Player } from '../player/Player';
import type { Chunk } from '../world/ChunkManager';
import type { Collectible } from './Collectible';
import type { CollectibleType } from './CollectibleTypes';
import { MapPiece } from './MapPiece';
import { Food, Horseshoe, Lantern, WaterGourd } from './Supplies';

/**
 * Registry of collectible classes. To add a new collectible:
 *   1. Add its id to CollectibleType (CollectibleTypes.ts)
 *   2. Subclass Collectible and register it here
 *   3. Give it a weight in CollectibleConfig.weights (GameConfig.ts)
 *   4. Handle its effect in `applyEffect()` below
 */
const REGISTRY: Record<CollectibleType, () => Collectible> = {
  mapPiece: () => new MapPiece(),
  water: () => new WaterGourd(),
  food: () => new Food(),
  horseshoe: () => new Horseshoe(),
  lantern: () => new Lantern(),
};

export class CollectibleManager {
  readonly group = new THREE.Group();
  private pools = new Map<CollectibleType, Collectible[]>();
  readonly active = new Set<Collectible>();

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus,
  ) {
    this.group.name = 'collectibles';
    scene.add(this.group);
  }

  populate(chunk: Chunk, groundHeight: (x: number, d: number) => number): void {
    for (const s of chunk.layout.collectibles) {
      const pool = this.pools.get(s.type) ?? [];
      this.pools.set(s.type, pool);
      const c = pool.pop() ?? REGISTRY[s.type]();
      c.spawn(s.x, s.d, groundHeight(s.x, s.d) + s.y);
      this.group.add(c.object);
      this.active.add(c);
      chunk.owned.push({ release: () => this.release(c) });
    }
  }

  private release(c: Collectible): void {
    if (!this.active.delete(c)) return;
    this.group.remove(c.object);
    this.pools.get(c.type)!.push(c);
  }

  update(dt: number, time: number): void {
    for (const c of this.active) c.update(dt, time);
  }

  /** Check pickups and apply their effects. */
  collect(p: Player): void {
    const R = CollectibleConfig.pickupRadius;
    const chest = p.y + 1.0;
    for (const c of this.active) {
      if (c.collected) continue;
      if (Math.abs(c.d - p.d) > R || Math.abs(c.x - p.x) > R) continue;
      if (Math.abs(c.y - chest) > 1.3) continue;
      c.collect();
      this.applyEffect(c.type, p);
      this.bus.emit('collectible:pickup', { type: c.type, x: c.x, z: -c.d });
    }
  }

  private applyEffect(type: CollectibleType, p: Player): void {
    const C = CollectibleConfig;
    switch (type) {
      case 'water':
        p.stamina = Math.min(StaminaConfig.max, p.stamina + C.waterStamina);
        break;
      case 'food':
        p.stamina = Math.min(StaminaConfig.max, p.stamina + C.foodStamina);
        break;
      case 'horseshoe':
        p.boostTimer = C.horseshoeDuration;
        break;
      case 'lantern':
        p.lanternTimer = C.lanternDuration;
        break;
      case 'mapPiece':
        break; // counted by the game (score)
    }
  }

  clear(): void {
    for (const c of [...this.active]) this.release(c);
  }
}

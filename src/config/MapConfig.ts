/**
 * ============================================================================
 *  MAP SEQUENCE & SPAWN TABLES
 * ============================================================================
 *  Spawn weights are relative: within one map, an obstacle with weight 20 is
 *  twice as likely as one with weight 10. `open` is the weight of leaving a
 *  slot empty — raise it to make a map sparser.
 * ============================================================================
 */
import type { ObstacleKind } from '../obstacles/ObstacleKinds';
import type { CollectibleType } from '../collectibles/CollectibleTypes';
import type { MapId } from '../maps/MapDefinition';

export interface MapTuning {
  /** Length of the map before the next one begins (m). */
  length: number;
  /** ± random variation applied to `length` each run (fraction). */
  lengthJitter: number;
  /** Obstacle spawn weights. `open` = an intentionally empty slot. */
  obstacles: Partial<Record<ObstacleKind | 'open', number>>;
  /** Multiplies the global obstacles-per-row value. */
  density: number;
  /** Multiplies the base collectible weights from GameConfig. */
  collectibles: Partial<Record<CollectibleType, number>>;
  /** Enables artillery strikes and other battle hazards. */
  battleHazards: boolean;
}

/** The order maps appear in. After the last map the journey loops (harder each lap). */
export const MAP_SEQUENCE: MapId[] = ['cotton', 'swamp', 'battlefield'];

export const MAP_TUNING: Record<MapId, MapTuning> = {
  cotton: {
    length: 1100,
    lengthJitter: 0.12,
    obstacles: {
      fence: 20,
      barrel: 11,
      wagon: 8,
      hayBale: 12,
      branch: 13,
      rock: 6,
      plow: 5,
      ditch: 6,
      open: 30,
    },
    density: 1,
    collectibles: { lantern: 0.2 },
    battleHazards: false,
  },

  swamp: {
    length: 1300,
    lengthJitter: 0.12,
    obstacles: {
      fallenTree: 22,
      mudPit: 12,
      water: 10,
      roots: 12,
      branch: 10,
      rock: 7,
      narrows: 9,
      stream: 7,
      stump: 8,
      open: 26,
    },
    density: 1.05,
    collectibles: { lantern: 2.2, water: 0.7 },
    battleHazards: false,
  },

  battlefield: {
    length: 1500,
    lengthJitter: 0.12,
    obstacles: {
      crater: 16,
      trench: 8,
      barricade: 14,
      brokenWagon: 10,
      debris: 14,
      fallenTree: 6,
      burningDebris: 7,
      mudPit: 5,
      open: 24,
    },
    density: 1.1,
    collectibles: { lantern: 1.0, food: 1.3 },
    battleHazards: true,
  },
};

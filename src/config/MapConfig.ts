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
  /** Obstacle spawn weights. `open` = an intentionally empty slot. */
  obstacles: Partial<Record<ObstacleKind | 'open', number>>;
  /** Multiplies the global obstacles-per-row value. */
  density: number;
  /** Multiplies the base collectible weights from GameConfig. */
  collectibles: Partial<Record<CollectibleType, number>>;
  /** Enables artillery strikes and other battle hazards. */
  battleHazards: boolean;
}

/**
 * ============================================================================
 *  LEVELS
 * ============================================================================
 *  The journey is three levels run back to back without stopping. Reaching
 *  the end of a level unlocks the next one (saved locally) so it can be
 *  chosen as a starting point from the menu. The last level never ends.
 */
export interface LevelDef {
  map: MapId;
  /** Meters of this level before the next begins (Infinity = endless). */
  length: number;
  /** Shown on the level card. */
  title: string;
}

export const LEVELS: LevelDef[] = [
  { map: 'cotton', length: 2000, title: 'Level 1' },
  { map: 'swamp', length: 2000, title: 'Level 2' },
  { map: 'battlefield', length: Infinity, title: 'Level 3' },
];

/** Obstacle-free stretch around each level boundary (m before, m after) — a breather for the title card. */
export const LEVEL_BREATHER: [number, number] = [90, 50];

export const MAP_TUNING: Record<MapId, MapTuning> = {
  cotton: {
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

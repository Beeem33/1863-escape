import type { DeformationKind } from '../world/Deformation';
import type { CollisionKind, ObstacleKind } from './ObstacleKinds';

/**
 * ============================================================================
 *  OBSTACLE SPECS
 * ============================================================================
 *  The procedural generator reads these to size and place obstacles and to
 *  guarantee a route: `solid` obstacles are never placed on the safe route;
 *  `vault` / `ground` obstacles may cross it (the player can jump them).
 *
 *  damage   — meters of pursuit gap lost on collision
 *  knockback — sideways shove on collision (m/s)
 * ============================================================================
 */
export interface ObstacleSpec {
  collision: CollisionKind;
  /** Width across the corridor (m) — random in [min, max]. */
  width: [number, number];
  /** Depth along the run (m) — random in [min, max]. */
  depth: [number, number];
  /** Collision height (m). Vault obstacles must be below ~1.2 m. */
  height: number;
  damage: number;
  knockback: number;
  /** Ground deformation created by this obstacle, if any. */
  deformation?: DeformationKind;
  /** Spans the full corridor (handled specially by the generator). */
  fullWidth?: boolean;
}

export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  // ---- Cotton field --------------------------------------------------------
  fence: { collision: 'vault', width: [4, 11], depth: [0.3, 0.3], height: 1.05, damage: 9, knockback: 3 },
  barrel: { collision: 'vault', width: [0.8, 2.4], depth: [0.8, 0.9], height: 0.95, damage: 8, knockback: 4 },
  wagon: { collision: 'solid', width: [2, 4.4], depth: [2, 4.4], height: 2.6, damage: 14, knockback: 5 },
  hayBale: { collision: 'vault', width: [1.3, 3], depth: [1.1, 1.2], height: 1.0, damage: 7, knockback: 3 },
  branch: { collision: 'vault', width: [3, 6.5], depth: [0.7, 0.9], height: 0.6, damage: 7, knockback: 2 },
  rock: { collision: 'solid', width: [1.4, 2.4], depth: [1.2, 2], height: 1.4, damage: 12, knockback: 5 },
  plow: { collision: 'vault', width: [1.8, 2.2], depth: [1.6, 1.8], height: 0.95, damage: 9, knockback: 3 },
  ditch: { collision: 'ground', width: [5, 13], depth: [1.5, 1.8], height: 0, damage: 8, knockback: 0, deformation: 'ditch' },

  // ---- Swamp ---------------------------------------------------------------
  fallenTree: { collision: 'vault', width: [8, 17], depth: [1.0, 1.1], height: 1.0, damage: 10, knockback: 3 },
  mudPit: { collision: 'slow', width: [3, 7], depth: [3, 6], height: 0, damage: 0, knockback: 0, deformation: 'mud' },
  water: { collision: 'slow', width: [4, 9], depth: [4, 8], height: 0, damage: 0, knockback: 0, deformation: 'pond' },
  roots: { collision: 'vault', width: [2.5, 5], depth: [1.2, 1.5], height: 0.55, damage: 7, knockback: 2 },
  narrows: { collision: 'solid', width: [0, 0], depth: [1.6, 2.2], height: 3, damage: 12, knockback: 5 },
  stream: { collision: 'slow', width: [24, 24], depth: [4, 6], height: 0, damage: 0, knockback: 0, deformation: 'stream', fullWidth: true },
  stump: { collision: 'vault', width: [0.9, 1.2], depth: [0.9, 1.2], height: 0.75, damage: 9, knockback: 3 },

  // ---- Battlefield ---------------------------------------------------------
  crater: { collision: 'ground', width: [3.4, 5.6], depth: [3.4, 5.6], height: 0, damage: 9, knockback: 0, deformation: 'crater' },
  trench: { collision: 'ground', width: [8, 18], depth: [2.0, 2.3], height: 0, damage: 10, knockback: 0, deformation: 'trench' },
  barricade: { collision: 'solid', width: [3, 7.5], depth: [1.2, 1.6], height: 1.6, damage: 12, knockback: 5 },
  brokenWagon: { collision: 'solid', width: [3, 3.8], depth: [1.8, 2.4], height: 1.9, damage: 13, knockback: 5 },
  debris: { collision: 'vault', width: [2, 4], depth: [1, 1.6], height: 0.7, damage: 8, knockback: 3 },
  burningDebris: { collision: 'solid', width: [2, 3.4], depth: [1.4, 2], height: 2, damage: 12, knockback: 4 },
  // Telegraph-wire entanglement strung between stakes (as at Fort Sanders, Nov. 1863) — vault it or trip.
  wire: { collision: 'vault', width: [4, 10], depth: [0.9, 1.2], height: 0.75, damage: 9, knockback: 1 },
};

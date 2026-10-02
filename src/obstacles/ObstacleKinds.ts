/** Every obstacle id the procedural generator can spawn. */
export type ObstacleKind =
  // Cotton field
  | 'fence'
  | 'barrel'
  | 'wagon'
  | 'hayBale'
  | 'branch'
  | 'rock'
  | 'plow'
  | 'ditch'
  // Swamp
  | 'fallenTree'
  | 'mudPit'
  | 'water'
  | 'roots'
  | 'narrows'
  | 'stream'
  | 'stump'
  // Battlefield
  | 'crater'
  | 'trench'
  | 'barricade'
  | 'brokenWagon'
  | 'debris'
  | 'burningDebris'
  | 'wire';

/**
 * How an obstacle interacts with the runner.
 * - `solid`    — must be avoided (too tall to vault).
 * - `vault`    — low enough to jump over (Space), otherwise a collision.
 * - `ground`   — a hole/ditch: only hurts if your feet are on the ground; jump across it.
 * - `slow`     — mud or water: never a collision, but slows you while inside.
 */
export type CollisionKind = 'solid' | 'vault' | 'ground' | 'slow';

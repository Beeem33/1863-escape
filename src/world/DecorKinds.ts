/**
 * Static, instanced decorations (rendered with GPU instancing — thousands are cheap).
 * Each kind is registered with its geometry in `DecorationLibrary.ts`.
 */
export type DecorKind =
  | 'cottonPlant'
  | 'grassTuft'
  | 'dryGrass'
  | 'shrub'
  | 'oak'
  | 'oakMoss'
  | 'pine'
  | 'cypress'
  | 'deadTree'
  | 'stump'
  | 'reeds'
  | 'lilyPads'
  | 'fern'
  | 'rock'
  | 'log'
  | 'railFence'
  | 'cabin'
  | 'plantationHouse'
  | 'barn'
  | 'haystack'
  | 'tent'
  | 'cannon'
  | 'gabion'
  | 'wheel'
  | 'burntHouse';

/**
 * Animated set pieces (soldiers, fires, flags…). Each one is a small object
 * with its own update(); see `world/features/`.
 */
export type FeatureKind =
  | 'firingLine'
  | 'charge'
  | 'formation'
  | 'corpses'
  | 'hangingTree'
  | 'cannonBattery'
  | 'fire'
  | 'flag'
  | 'smokeColumn'
  | 'signalLantern'
  | 'birds';

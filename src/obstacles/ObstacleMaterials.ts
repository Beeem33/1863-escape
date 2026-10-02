import * as THREE from 'three';
import { Materials } from '../world/Materials';

/** Tinted variants of the shared materials, created once. */
function make() {
  const M = Materials();
  const tint = (base: THREE.MeshStandardMaterial, color: number) => {
    const m = base.clone();
    m.color.setHex(color);
    return m;
  };
  return {
    wood: M.wood,
    woodDark: tint(M.wood, 0x8a7a68),
    woodWeathered: tint(M.wood, 0xb8b0a2),
    woodRed: tint(M.wood, 0xa86a50),
    charred: tint(M.wood, 0x2c2622),
    bark: M.bark,
    barkDark: tint(M.bark, 0x8a8076),
    cloth: M.cloth,
    clothDirty: tint(M.cloth, 0xb0a48a),
    iron: M.iron,
    stone: M.stone,
    hay: M.hay,
    painted: M.painted,
    mud: M.mud,
    earth: tint(M.ground, 0x5a4434),
    leaves: M.leaves,
  };
}

let instance: ReturnType<typeof make> | null = null;
export const ObstacleMaterials = (): ReturnType<typeof make> => (instance ??= make());

import * as THREE from 'three';
import { Textures } from '../utils/TextureFactory';

/**
 * Shared materials. Everything that looks alike uses the SAME material
 * instance — fewer shader programs, fewer state changes, faster frames.
 */

/** Uniforms shared by every wind-animated material. Updated once per frame. */
export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
};

/**
 * Patch a material so its vertices sway in the wind, more at the top than the
 * bottom. Works with instanced meshes (each instance gets its own phase).
 */
function addWind(mat: THREE.Material, strength: number, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec2 basePos = vec2(0.0);
          #ifdef USE_INSTANCING
            basePos = instanceMatrix[3].xz;
          #endif
          float phase = dot(basePos, vec2(0.21, 0.13));
          float h = max(transformed.y, 0.0);
          float sway = sin(uTime * 1.6 + phase) * 0.6 + sin(uTime * 3.7 + phase * 2.3) * 0.25;
          transformed.x += sway * h * ${strength.toFixed(4)} * uWindStrength;
          transformed.z += cos(uTime * 1.3 + phase) * h * ${(strength * 0.5).toFixed(4)} * uWindStrength;
        }`,
      );
  };
  mat.customProgramCacheKey = () => key;
}

function make(): {
  ground: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  leaves: THREE.MeshStandardMaterial;
  moss: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  reeds: THREE.MeshStandardMaterial;
  cotton: THREE.MeshStandardMaterial;
  cottonBoll: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  painted: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  hay: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  mud: THREE.MeshStandardMaterial;
  silhouette: THREE.MeshStandardMaterial;
} {
  const ground = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: Textures.ground(),
    bumpMap: Textures.ground(),
    bumpScale: 1.2,
    roughness: 0.96,
    metalness: 0,
  });

  const bark = new THREE.MeshStandardMaterial({ map: Textures.bark(), vertexColors: true, roughness: 0.95 });
  addWind(bark, 0.0025, 'wind-bark');

  const leaves = new THREE.MeshStandardMaterial({
    map: Textures.leaves(),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.85,
  });
  addWind(leaves, 0.012, 'wind-leaves');

  const moss = new THREE.MeshStandardMaterial({
    map: Textures.moss(),
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    color: 0x9aa48a,
    roughness: 1,
  });
  addWind(moss, 0.02, 'wind-moss');

  const grass = new THREE.MeshStandardMaterial({
    map: Textures.grass(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  addWind(grass, 0.12, 'wind-grass');

  const reeds = new THREE.MeshStandardMaterial({
    map: Textures.reeds(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  addWind(reeds, 0.06, 'wind-reeds');

  const cotton = new THREE.MeshStandardMaterial({
    map: Textures.cotton(),
    color: 0xd8d2c8,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  addWind(cotton, 0.07, 'wind-cotton');

  const cottonBoll = new THREE.MeshStandardMaterial({ color: 0xcfc9bc, roughness: 1 });
  addWind(cottonBoll, 0.07, 'wind-cotton');

  const wood = new THREE.MeshStandardMaterial({ map: Textures.wood(), vertexColors: true, roughness: 0.92 });
  const cloth = new THREE.MeshStandardMaterial({
    map: Textures.cloth(),
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9a9a9a, roughness: 0.55, metalness: 0.7 });
  const hay = new THREE.MeshStandardMaterial({ map: Textures.grass(), vertexColors: true, roughness: 1 });
  hay.map = Textures.ground();

  const waterNormal = Textures.waterNormal();
  waterNormal.repeat.set(70, 80);
  const water = new THREE.MeshStandardMaterial({
    color: 0x3a3d2c,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.08,
    metalness: 0.0,
    envMapIntensity: 0.45,
    transparent: true,
    opacity: 0.9,
  });

  const mud = new THREE.MeshStandardMaterial({ color: 0x3b2c1e, roughness: 0.35, metalness: 0 });

  /** Distant figures: dark, matte, read as silhouettes through fog and smoke. */
  const silhouette = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  return { ground, bark, leaves, moss, grass, reeds, cotton, cottonBoll, wood, cloth, painted, stone, iron, hay, water, mud, silhouette };
}

let instance: ReturnType<typeof make> | null = null;

/** Lazily created so textures are painted after the page has loaded. */
export function Materials(): ReturnType<typeof make> {
  return (instance ??= make());
}

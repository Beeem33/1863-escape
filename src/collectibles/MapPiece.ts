import * as THREE from 'three';
import { Textures } from '../utils/TextureFactory';
import { Collectible } from './Collectible';

let geo: THREE.BufferGeometry | null = null;
let mat: THREE.MeshStandardMaterial | null = null;

/**
 * A torn scrap of a hand-drawn route north. Collect enough and a fragment of
 * the route is revealed. These are the run's main collectible (◆ counter).
 */
export class MapPiece extends Collectible {
  readonly type = 'mapPiece' as const;

  constructor() {
    super(0xffe2a0, 0.9);
  }

  protected build(): void {
    if (!geo) {
      // A slightly curled sheet of paper.
      geo = new THREE.PlaneGeometry(0.42, 0.32, 6, 1);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.42) * Math.PI) * 0.04);
      geo.computeVertexNormals();
      mat = new THREE.MeshStandardMaterial({
        map: Textures.parchment(),
        side: THREE.DoubleSide,
        roughness: 0.9,
        emissive: 0x3a2a10,
        emissiveIntensity: 0.6,
      });
    }
    const sheet = new THREE.Mesh(geo, mat!);
    sheet.rotation.x = -0.25;
    this.model.add(sheet);
  }
}

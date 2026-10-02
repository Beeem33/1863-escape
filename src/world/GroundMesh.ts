import * as THREE from 'three';
import { PlayerConfig, WorldConfig } from '../config/GameConfig';
import { Materials } from './Materials';
import type { Deformation } from './Deformation';
import type { Terrain } from './Terrain';

/** Column x-positions: dense near the corridor, sparser toward the horizon. */
function buildColumns(): number[] {
  const half = WorldConfig.groundWidth / 2;
  const inner = PlayerConfig.corridorHalfWidth + 4;
  const cols: number[] = [];
  for (let x = -inner; x <= inner + 1e-6; x += 0.8) cols.push(x);
  let step = 1;
  let x = inner;
  const outer: number[] = [];
  while (x < half) {
    x = Math.min(half, x + step);
    outer.push(x);
    step *= 1.2;
  }
  return [...outer.map((v) => -v).reverse(), ...cols, ...outer];
}

const COLUMNS = buildColumns();
const ROW_STEP = 1;
const ROWS = Math.round(WorldConfig.chunkLength / ROW_STEP) + 1;

/**
 * One chunk's strip of ground. The mesh is pooled: on reuse only the vertex
 * data is rewritten, the GPU buffers are reused.
 */
export class GroundMesh {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly heights: Float32Array;
  private readonly tmpColor = new THREE.Color();
  private readonly stain = new THREE.Color();

  constructor() {
    const cols = COLUMNS.length;
    const count = cols * ROWS;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const index: number[] = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const cc = a + cols;
        const dd = cc + 1;
        // Counter-clockwise seen from above (row r+1 is further along −Z).
        index.push(a, b, cc, b, dd, cc);
      }
    }
    geo.setIndex(index);
    this.geometry = geo;
    // Heights with a one-sample border for normals.
    this.heights = new Float32Array((cols + 2) * (ROWS + 2));
    this.mesh = new THREE.Mesh(geo, Materials().ground);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'ground';
    this.mesh.matrixAutoUpdate = false;
  }

  build(d0: number, terrain: Terrain, deformations: Deformation[]): void {
    const cols = COLUMNS.length;
    const W = cols + 2;
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const col = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const uv = this.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const colX = (c: number) => (c < 0 ? 2 * COLUMNS[0] - COLUMNS[1] : c >= cols ? 2 * COLUMNS[cols - 1] - COLUMNS[cols - 2] : COLUMNS[c]);

    // Heights (with border).
    for (let r = -1; r <= ROWS; r++) {
      const d = d0 + r * ROW_STEP;
      const blend = terrain.blendAt(d);
      for (let c = -1; c <= cols; c++) {
        const x = colX(c);
        let h = terrain.baseHeight(x, d, blend);
        for (const def of deformations) h += def.height(x, d, false);
        this.heights[(r + 1) * W + (c + 1)] = h;
      }
    }

    // UV origin restarts every 1000 m (a multiple of the texture period) to keep float precision.
    const uvBase = Math.floor(d0 / 1000) * 1000;
    for (let r = 0; r < ROWS; r++) {
      const d = d0 + r * ROW_STEP;
      const blend = terrain.blendAt(d);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = COLUMNS[c];
        const h = this.heights[(r + 1) * W + (c + 1)];
        // Position is local to the chunk; the mesh sits at z = -d0.
        pos.setXYZ(i, x, h, -(d - d0));

        // Central-difference normal.
        const hl = this.heights[(r + 1) * W + c];
        const hr = this.heights[(r + 1) * W + c + 2];
        const hb = this.heights[r * W + (c + 1)];
        const hf = this.heights[(r + 2) * W + (c + 1)];
        const dx = colX(c + 1) - colX(c - 1);
        const nx = -(hr - hl) / dx;
        const nz = (hf - hb) / (2 * ROW_STEP); // +d is −z
        const len = Math.hypot(nx, 1, nz);
        nor.setXYZ(i, nx / len, 1 / len, nz / len);

        terrain.color(x, d, this.tmpColor, blend);
        for (const def of deformations) {
          const s = def.stain(x, d);
          if (s > 0) this.tmpColor.lerp(this.stain.setHex(def.stainColor), s * 0.85);
        }
        col.setXYZ(i, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
        uv.setXY(i, x / 5, (d - uvBase) / 5);
      }
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = uv.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.position.set(0, 0, -d0);
    this.mesh.updateMatrix();
  }
}

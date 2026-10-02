import * as THREE from 'three';
import { Textures } from '../../utils/TextureFactory';
import type { Random } from '../../utils/Random';
import { Materials } from '../Materials';
import { soldierGeometry, type FigureGeometry } from '../props/Figures';
import { buildCannon } from '../props/Structures';
import { Feature, type FeatureContext } from './Feature';

const UNION = { uniform: 0x2a3350, trousers: 0x55607a };
const CONFEDERATE = { uniform: 0x6e6a5e, trousers: 0x7a6a50 };

let figureCache: { union: FigureGeometry; confederate: FigureGeometry } | null = null;
function figures(): { union: FigureGeometry; confederate: FigureGeometry } {
  return (figureCache ??= {
    union: soldierGeometry(UNION.uniform, UNION.trousers),
    confederate: soldierGeometry(CONFEDERATE.uniform, CONFEDERATE.trousers),
  });
}

const MAX_SOLDIERS = 18;

/**
 * A line of infantry seen across the field. Modes:
 *   0 = firing line (stands, fires ragged volleys toward the corridor)
 *   1 = advancing at a walk, 2 = running.
 * params: army (0 Union / 1 Confederate), count, mode, facing (±1 = toward +x / −x)
 */
export class SoldierLine extends Feature {
  private body!: THREE.InstancedMesh;
  private legL!: THREE.InstancedMesh;
  private legR!: THREE.InstancedMesh;
  private army = -1;
  private count = 0;
  private mode = 0;
  private facing = 1;
  private phase: number[] = [];
  private spacing: number[] = [];
  private nextVolley = 0;
  private walk = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);

  private build(army: number): void {
    if (this.army === army) return;
    if (this.body) this.object.remove(this.body, this.legL, this.legR);
    const g = army === 0 ? figures().union : figures().confederate;
    const mat = Materials().silhouette;
    this.body = new THREE.InstancedMesh(g.body, mat, MAX_SOLDIERS);
    this.legL = new THREE.InstancedMesh(g.leg, mat, MAX_SOLDIERS);
    this.legR = new THREE.InstancedMesh(g.leg, mat, MAX_SOLDIERS);
    for (const im of [this.body, this.legL, this.legR]) {
      im.frustumCulled = false;
      im.castShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.object.add(this.body, this.legL, this.legR);
    this.army = army;
  }

  protected configure(params: Record<string, number>, rng: Random): void {
    this.build(params.army ?? 0);
    this.count = Math.min(MAX_SOLDIERS, params.count ?? 12);
    this.mode = params.mode ?? 0;
    this.facing = params.facing ?? 1;
    this.phase = Array.from({ length: this.count }, () => rng.range(0, Math.PI * 2));
    let acc = 0;
    this.spacing = Array.from({ length: this.count }, () => (acc += rng.range(1.1, 1.8)));
    for (const im of [this.body, this.legL, this.legR]) im.count = this.count;
    this.nextVolley = rng.range(1, 5);
    this.walk = 0;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    if (dist > 420) return;
    const speed = this.mode === 0 ? 0 : this.mode === 1 ? 1.3 : 3.6;
    // Advancing lines stop after 25 m so they never wander into the corridor.
    this.walk = Math.min(this.mode === 1 ? 25 : 400, this.walk + ctx.dt * speed);
    const column = this.mode === 2; // a column running parallel to the corridor
    const yaw = column ? 0 : this.facing > 0 ? -Math.PI / 2 : Math.PI / 2;
    const halfLen = (this.spacing[this.count - 1] ?? 0) / 2;

    for (let i = 0; i < this.count; i++) {
      // Lines stand along the run direction (local z); columns run toward −z in threes.
      const lz = column ? Math.floor(i / 3) * 1.4 - this.walk : this.spacing[i] - halfLen;
      const lx = column ? (i % 3) * 1.1 : this.facing * this.walk + Math.sin(this.phase[i] * 3.1) * 0.25;
      const stride = this.mode === 0 ? 0 : Math.sin(ctx.time * (speed * 2.6) + this.phase[i]);
      const bob = Math.abs(stride) * 0.05;
      this.p.set(lx, bob, lz);
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p, this.q, this.s);
      this.body.setMatrixAt(i, this.m);
      for (const [leg, sign] of [
        [this.legL, 1],
        [this.legR, -1],
      ] as const) {
        this.e.set(stride * 0.55 * sign, yaw, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        const side = sign * 0.11;
        this.p.set(lx + Math.cos(yaw) * side, 0.95 + bob, lz - Math.sin(yaw) * side);
        this.m.compose(this.p, this.q, this.s);
        leg.setMatrixAt(i, this.m);
      }
    }
    this.e.set(0, 0, 0, 'XYZ');
    this.body.instanceMatrix.needsUpdate = this.legL.instanceMatrix.needsUpdate = this.legR.instanceMatrix.needsUpdate = true;

    // Ragged volleys from firing lines.
    if (this.mode === 0) {
      this.nextVolley -= ctx.dt;
      if (this.nextVolley <= 0) {
        this.nextVolley = 4 + Math.random() * 6;
        const shots = Math.min(this.count, 4 + Math.floor(Math.random() * this.count));
        for (let k = 0; k < shots; k++) {
          const i = Math.floor(Math.random() * this.count);
          const lz = this.spacing[i] - halfLen;
          ctx.particles.muzzle(this.x + this.facing * (this.walk + 0.6), this.y + 1.45, -(this.d - lz), this.facing, 0, false);
        }
        ctx.bus.emit('battle:volley', { distance: dist, pan: this.panFor(ctx), count: shots });
      }
    }
  }
}

let cannonParts: ReturnType<typeof buildCannon> | null = null;

/**
 * A battery of field guns that fire in turn. params: count, facing (±1), interval
 */
export class CannonBattery extends Feature {
  private guns: THREE.Group[] = [];
  private facing = 1;
  private interval = 7;
  private timer = 0;
  private next = 0;
  private recoil: number[] = [];

  protected configure(params: Record<string, number>, rng: Random): void {
    cannonParts ??= buildCannon();
    const count = params.count ?? 3;
    this.facing = params.facing ?? 1;
    this.interval = params.interval ?? 6;
    while (this.guns.length < count) {
      const g = new THREE.Group();
      for (const part of cannonParts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = true;
        g.add(mesh);
      }
      this.guns.push(g);
      this.object.add(g);
    }
    this.recoil = [];
    for (let i = 0; i < this.guns.length; i++) {
      const g = this.guns[i];
      g.visible = i < count;
      g.position.set(0, 0, (i - (count - 1) / 2) * 7);
      g.rotation.y = this.facing > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.recoil.push(0);
    }
    this.timer = rng.range(0, this.interval);
    this.next = 0;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    for (let i = 0; i < this.guns.length; i++) {
      if (this.recoil[i] > 0) {
        this.recoil[i] = Math.max(0, this.recoil[i] - ctx.dt * 1.5);
        this.guns[i].position.x = -this.facing * Math.sin(this.recoil[i] * Math.PI) * 0.6;
      }
    }
    if (dist > 500) return;
    this.timer += ctx.dt;
    if (this.timer < this.interval / Math.max(1, this.guns.filter((g) => g.visible).length)) return;
    this.timer = 0;
    const visible = this.guns.filter((g) => g.visible);
    const gun = visible[this.next++ % visible.length];
    const i = this.guns.indexOf(gun);
    this.recoil[i] = 1;
    const muzzleX = this.x + this.facing * 1.6;
    ctx.particles.muzzle(muzzleX, this.y + 1.2, -(this.d - gun.position.z), this.facing, 0, true);
    ctx.bus.emit('battle:cannon', { distance: dist, pan: this.panFor(ctx) });
  }
}

/** A burning wreck or building. params: radius, intensity */
export class Fire extends Feature {
  private radius = 1;
  private intensity = 1;

  protected configure(params: Record<string, number>): void {
    this.radius = params.radius ?? 1;
    this.intensity = params.intensity ?? 1;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    if (dist > 260) return;
    // Fewer particles far away.
    const lod = dist < 80 ? 1 : dist < 160 ? 0.5 : 0.25;
    ctx.particles.fire(this.x, this.y, -this.d, this.radius, ctx.dt, this.intensity * lod);
  }
}

/** A regimental flag on a pole, rippling in the wind. params: army (0/1), height */
export class Flag extends Feature {
  private cloth: THREE.Mesh;
  private pole: THREE.Mesh;
  private base: Float32Array;
  private army = -1;

  constructor() {
    super();
    const geo = new THREE.PlaneGeometry(1.9, 1.2, 12, 6);
    geo.translate(0.95, 0, 0);
    this.base = (geo.getAttribute('position').array as Float32Array).slice();
    this.cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 }));
    this.cloth.castShadow = true;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 5).translate(0, 0.5, 0), Materials().painted);
    this.object.add(this.cloth, this.pole);
  }

  protected configure(params: Record<string, number>): void {
    const army = params.army ?? 0;
    const height = params.height ?? 3.2;
    if (army !== this.army) {
      const mat = this.cloth.material as THREE.MeshStandardMaterial;
      mat.map = army === 0 ? Textures.flagUnion() : Textures.flagConfederate();
      mat.needsUpdate = true;
      this.army = army;
      // Square battle flag vs. rectangular national flag.
      this.cloth.scale.set(army === 0 ? 1 : 0.75, army === 0 ? 1 : 1.2, 1);
    }
    this.pole.scale.set(1, height, 1);
    this.cloth.position.set(0, height - 0.7, 0);
  }

  update(ctx: FeatureContext): void {
    if (this.distanceTo(ctx) > 300) return;
    const pos = this.cloth.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3];
      const y = this.base[i * 3 + 1];
      const amp = x * 0.18;
      arr[i * 3 + 2] = Math.sin(ctx.time * 5 - x * 3 + y * 0.6) * amp;
      arr[i * 3 + 1] = y - x * 0.06 + Math.sin(ctx.time * 3.1 - x * 2) * amp * 0.25;
    }
    pos.needsUpdate = true;
    this.cloth.geometry.computeVertexNormals();
  }
}

/** A tall column of dark smoke on the horizon. params: size */
export class SmokeColumn extends Feature {
  private size = 1;
  private acc = 0;

  protected configure(params: Record<string, number>): void {
    this.size = params.size ?? 1;
    this.acc = 0;
  }

  update(ctx: FeatureContext): void {
    const dist = this.distanceTo(ctx);
    if (dist > 600) return;
    this.acc += ctx.dt * 3.5 * this.size;
    while (this.acc > 1) {
      this.acc -= 1;
      ctx.particles.spawnSmoke({
        x: this.x + (Math.random() - 0.5) * 4 * this.size,
        y: this.y + 2,
        z: -this.d + (Math.random() - 0.5) * 4 * this.size,
        vx: 1.2 + Math.random(),
        vy: 2.5 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 0.8,
        life: 14 + Math.random() * 6,
        size: 5 * this.size,
        endSize: 26 * this.size,
        alpha: 0.6,
        color: 0x2e2a26,
        drag: 0.05,
        fadeIn: 0.08,
      });
    }
  }
}

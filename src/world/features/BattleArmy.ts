import * as THREE from 'three';
import { BODY } from '../../characters/HumanGeometry';
import type { Human } from '../../characters/HumanCrowd';
import { Anim, LYING_HEIGHT, copyPose, lerpPose, newPose, type HumanPose } from '../../characters/HumanPose';
import { Styles } from '../../characters/Styles';
import type { Characters } from '../../characters/Characters';
import type { Random } from '../../utils/Random';
import { Feature, type FeatureContext } from './Feature';

/**
 * The armies, built from the instanced character crowd. Every soldier is a
 * fully articulated figure; a feature owns its soldiers and frees them when
 * its chunk is recycled. Nothing here is graphic — men fall and lie still.
 */

interface Soldier {
  h: Human;
  /** Local offset within the unit (x across, z along the run). */
  ox: number;
  oz: number;
  phase: number;
  /** Seconds since this soldier was hit (< 0 = standing). */
  down: number;
  variant: number;
  recoil: number;
  /** Pose at the moment he was hit (falls from here). */
  from: HumanPose | null;
}

const lying = newPose();
const muzzle = new THREE.Vector3();

abstract class Unit extends Feature {
  protected soldiers: Soldier[] = [];
  protected army = 0;

  protected spawnSoldiers(ctx: { characters: Characters }, n: number, rng: Random, place: (i: number) => [number, number]): void {
    for (let i = 0; i < n; i++) {
      const style = this.army === 0 ? Styles.union(rng.next()) : Styles.confederate(rng.next());
      const h = ctx.characters.humans.spawn(style);
      if (!h) break;
      const [ox, oz] = place(i);
      this.soldiers.push({ h, ox, oz, phase: rng.range(0, Math.PI * 2), down: -1, variant: rng.int(0, 3), recoil: 0, from: null });
    }
  }

  override dispose(ctx: { characters: Characters }): void {
    for (const s of this.soldiers) ctx.characters.humans.remove(s.h);
    this.soldiers = [];
  }

  /**
   * Soldiers only exist while the unit is near enough to matter: spawned
   * within `spawnRange` ahead, freed once well behind the runner.
   * Returns false when the unit should skip its update.
   */
  protected inRange(ctx: FeatureContext, spawnRange = 210): boolean {
    const ahead = this.d - ctx.playerD;
    if (ahead < -40) {
      if (this.soldiers.length) this.dispose(ctx);
      return false;
    }
    return Math.hypot(this.x - ctx.playerX, ahead) < spawnRange;
  }

  /** Blend a falling soldier from the pose he was hit in to lying still. */
  protected fall(s: Soldier, dt: number, yaw: number, x: number, y: number, z: number): void {
    s.from ??= copyPose(s.h.pose, newPose());
    s.down += dt;
    const k = Math.min(1, s.down / 0.7);
    Anim.lying(lying, s.variant);
    lying.y = y - BODY.hipHeight + LYING_HEIGHT;
    s.from.y = y;
    lerpPose(s.from, lying, k * k, s.h.pose);
    s.h.pose.x = x;
    s.h.pose.z = z;
    s.h.pose.yaw = yaw;
    if (k >= 1) s.h.isStatic = true;
  }
}

/**
 * A firing line: two ranks, rifles levelled toward the enemy flank, ragged
 * volleys, men going down. params: army, count, facing (±1 toward +x / −x)
 */
export class FiringLine extends Unit {
  private facing = 1;
  private volley = 2;
  private casualtyTimer = 4;
  private needsSpawn = 0;
  private rng!: Random;

  protected configure(params: Record<string, number>, rng: Random): void {
    this.army = params.army ?? 0;
    this.facing = params.facing ?? 1;
    this.needsSpawn = Math.round(params.count ?? 14);
    this.rng = rng;
    this.volley = rng.range(1, 5);
    this.casualtyTimer = rng.range(3, 9);
  }

  update(ctx: FeatureContext): void {
    if (!this.inRange(ctx)) return;
    if (this.needsSpawn > 0) {
      const n = this.needsSpawn;
      this.needsSpawn = 0;
      this.spawnSoldiers(ctx, n, this.rng, (i) => [(i % 2) * -this.facing * 1.1, (Math.floor(i / 2) - n / 4) * 1.15]);
    }
    const dist = this.distanceTo(ctx);
    const yaw = this.facing > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const s of this.soldiers) {
      const x = this.x + s.ox;
      const d = this.d + s.oz;
      const y = ctx.groundHeight(x, d) + BODY.hipHeight;
      if (s.down >= 0) {
        if (!s.h.isStatic) this.fall(s, ctx.dt, yaw, x, y, -d);
        continue;
      }
      s.recoil = Math.max(0, s.recoil - ctx.dt * 3);
      // Rear rank reloads (stands), front rank aims.
      if (s.ox === 0 || Math.sin(ctx.time * 0.4 + s.phase) > 0) Anim.aim(s.h.pose, s.recoil);
      else Anim.stand(s.h.pose, ctx.time + s.phase);
      s.h.pose.x = x;
      s.h.pose.y = y;
      s.h.pose.z = -d;
      s.h.pose.yaw = yaw;
    }
    if (dist > 450) return;
    this.volley -= ctx.dt;
    if (this.volley <= 0) {
      this.volley = 3.5 + Math.random() * 5;
      let shots = 0;
      for (const s of this.soldiers) {
        if (s.down >= 0 || Math.random() < 0.35) continue;
        s.recoil = 1;
        ctx.characters.humans.muzzle(s.h, muzzle);
        ctx.particles.muzzle(muzzle.x, muzzle.y, muzzle.z, this.facing, 0, false);
        shots++;
      }
      if (shots) ctx.bus.emit('battle:volley', { distance: dist, pan: this.panFor(ctx), count: shots });
    }
    // Casualties.
    this.casualtyTimer -= ctx.dt;
    if (this.casualtyTimer <= 0) {
      this.casualtyTimer = 2 + Math.random() * 6;
      const standing = this.soldiers.filter((s) => s.down < 0);
      if (standing.length > 3) standing[Math.floor(Math.random() * standing.length)].down = 0;
    }
  }
}

/**
 * A charge across the field: a loose mass running with rifles at port arms,
 * men falling as they come. params: army, count, dirX (±1), speed
 */
export class Charge extends Unit {
  private dir = 1;
  private speed = 4.5;
  private travel = 0;
  private needsSpawn = 0;
  private rng!: Random;

  protected configure(params: Record<string, number>, rng: Random): void {
    this.army = params.army ?? 1;
    this.dir = params.dirX ?? 1;
    this.speed = params.speed ?? 4.5;
    this.needsSpawn = Math.round(params.count ?? 18);
    this.travel = 0;
    this.rng = rng;
  }

  update(ctx: FeatureContext): void {
    if (!this.inRange(ctx, 240)) return;
    if (this.needsSpawn > 0) {
      const n = this.needsSpawn;
      this.needsSpawn = 0;
      const rng = this.rng;
      this.spawnSoldiers(ctx, n, rng, () => [rng.range(-6, 6), rng.range(-12, 12)]);
    }
    const dist = this.distanceTo(ctx);
    if (dist > 400) return;
    this.travel += this.speed * ctx.dt;
    const yaw = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const s of this.soldiers) {
      const x = this.x + s.ox + this.dir * this.travel * (0.9 + 0.2 * Math.sin(s.phase));
      const d = this.d + s.oz;
      const gy = ctx.groundHeight(x, d);
      if (s.down >= 0) {
        if (!s.h.isStatic) this.fall(s, ctx.dt, yaw, x, gy + BODY.hipHeight, -d);
        continue;
      }
      s.phase += ctx.dt * (this.speed * 1.6);
      const bob = Anim.run(s.h.pose, s.phase, 0.9, true);
      s.h.pose.x = x;
      s.h.pose.y = gy + BODY.hipHeight + bob;
      s.h.pose.z = -d;
      s.h.pose.yaw = yaw;
      if (Math.random() < ctx.dt * 0.05) s.down = 0; // cut down mid-stride
    }
  }
}

/**
 * Massed troops in the distance — a column or a block marching in step.
 * params: army, rows, cols, dirZ (±1 = along the run), marching (0/1)
 */
export class Formation extends Unit {
  private rows = 4;
  private cols = 8;
  private dirZ = -1;
  private marching = 1;
  private travel = 0;
  private needsSpawn = 0;
  private rng!: Random;

  protected configure(params: Record<string, number>, rng: Random): void {
    this.army = params.army ?? 0;
    this.rows = params.rows ?? 4;
    this.cols = params.cols ?? 8;
    this.dirZ = params.dirZ ?? -1;
    this.marching = params.marching ?? 1;
    this.needsSpawn = this.rows * this.cols;
    this.travel = 0;
    this.rng = rng;
  }

  update(ctx: FeatureContext): void {
    if (!this.inRange(ctx, 260)) return;
    if (this.needsSpawn > 0) {
      const n = this.needsSpawn;
      this.needsSpawn = 0;
      this.spawnSoldiers(ctx, n, this.rng, (i) => [(i % this.cols) * 0.9 - this.cols * 0.45, Math.floor(i / this.cols) * 1.2]);
    }
    if (this.distanceTo(ctx) > 600) return;
    const speed = this.marching ? 1.4 : 0;
    this.travel += speed * ctx.dt;
    const yaw = this.dirZ < 0 ? 0 : Math.PI;
    for (const s of this.soldiers) {
      const x = this.x + s.ox;
      const d = this.d + s.oz - this.dirZ * this.travel;
      const phase = ctx.time * 2.2 + (s.oz > 0 ? 0 : 0); // marching in step
      const bob = this.marching ? Anim.run(s.h.pose, phase, 0.35, false) : 0;
      if (!this.marching) Anim.stand(s.h.pose, ctx.time + s.phase);
      s.h.pose.rifle = 'slung';
      s.h.pose.x = x;
      s.h.pose.y = ctx.groundHeight(x, d) + BODY.hipHeight + bob;
      s.h.pose.z = -d;
      s.h.pose.yaw = yaw;
    }
  }
}

/** The fallen, scattered across the field. params: count, spread */
export class Corpses extends Unit {
  private needsSpawn = 0;
  private spread = 10;
  private rng!: Random;

  protected configure(params: Record<string, number>, rng: Random): void {
    this.needsSpawn = Math.round(params.count ?? 5);
    this.spread = params.spread ?? 10;
    this.rng = rng;
  }

  update(ctx: FeatureContext): void {
    if (!this.inRange(ctx, 170)) return;
    if (this.needsSpawn <= 0) return;
    const n = this.needsSpawn;
    this.needsSpawn = 0;
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      this.army = rng.chance(0.5) ? 0 : 1;
      const style = this.army === 0 ? Styles.union(rng.next()) : Styles.confederate(rng.next());
      const h = ctx.characters.humans.spawn({ ...style, rifle: false });
      if (!h) break;
      const x = this.x + rng.range(-this.spread, this.spread);
      const d = this.d + rng.range(-this.spread, this.spread);
      Anim.lying(h.pose, rng.int(0, 3));
      h.pose.x = x;
      h.pose.z = -d;
      h.pose.y = ctx.groundHeight(x, d) + LYING_HEIGHT;
      h.pose.yaw = rng.range(0, Math.PI * 2);
      h.isStatic = true;
      h.dirty = true;
      this.soldiers.push({ h, ox: 0, oz: 0, phase: 0, down: 1, variant: 0, recoil: 0, from: null });
    }
  }
}

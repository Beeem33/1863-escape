import * as THREE from 'three';
import { BODY } from '../characters/HumanGeometry';
import type { Human } from '../characters/HumanCrowd';
import { Anim, LYING_HEIGHT, copyPose, lerpPose, newPose, type HumanPose } from '../characters/HumanPose';
import type { Animal } from '../characters/Quadruped';
import { Styles } from '../characters/Styles';
import type { Characters } from '../characters/Characters';
import type { EventBus } from '../core/EventBus';
import type { Particles } from '../effects/Particles';
import type { Player } from '../player/Player';
import type { Random } from '../utils/Random';

/**
 * Scenes that play out ahead of the runner, across his path. Someone else is
 * running too:
 *
 *  - "shot":   a man breaks from the cover on one side and sprints across;
 *              soldiers burst out after him, stop, fire — he falls and lies
 *              still in the distance ahead of you.
 *  - "chase":  a man runs across with a rider on horseback right behind him;
 *              they race on until they are out of sight.
 *
 * Shown at a distance and without gore. Tuning in `StoryConfig` below.
 */
export const StoryConfig = {
  /** Seconds into a run before the first scene can be set up [min, max]. */
  first: [10, 18] as [number, number],
  /** Seconds between scenes [min, max]. */
  interval: [32, 52] as [number, number],
  /** How far ahead of you (m) the man is when he reaches your trail. */
  viewDistance: 24,
  /** Where he breaks cover, sideways from the trail (m). */
  startX: 24,
  /** His running speed (m/s); the soldiers and rider are a touch slower / faster. */
  runnerSpeed: 7,
  /** Chance a scene is the soldiers' shooting rather than the rider's chase. */
  shotChance: 0.5,
};

/** A scene that has been placed ahead but has not started yet. */
interface Pending {
  kind: 'shot' | 'chase';
  d: number;
  dir: number;
}

interface Scene {
  kind: 'shot' | 'chase';
  d: number;
  dir: number;
  t: number;
  runner: Human;
  runnerX: number;
  runnerDown: number;
  fallFrom: HumanPose | null;
  soldiers: { h: Human; x: number; oz: number; aiming: boolean; fired: boolean }[];
  horse: Animal | null;
  rider: Human | null;
  riderX: number;
}

const lying = newPose();
const muzzle = new THREE.Vector3();

export class StoryEvents {
  private scene: Scene | null = null;
  private pending: Pending | null = null;
  private timer = 40;

  constructor(
    private readonly characters: Characters,
    private readonly particles: Particles,
    private readonly bus: EventBus,
  ) {}

  reset(rng: Random): void {
    this.end();
    this.pending = null;
    this.timer = rng.range(...StoryConfig.first);
  }

  /** Distance ahead of the crossing (m) at which a pending scene starts, so he reaches the trail `viewDistance` ahead of you. */
  private triggerAhead(p: Player): number {
    const C = StoryConfig;
    return Math.max(p.speed, 4) * (C.startX / C.runnerSpeed) + C.viewDistance;
  }

  private end(): void {
    const s = this.scene;
    if (!s) return;
    const C = this.characters;
    C.humans.remove(s.runner);
    for (const so of s.soldiers) C.humans.remove(so.h);
    C.humans.remove(s.rider);
    C.horses.remove(s.horse);
    this.scene = null;
  }

  /**
   * @param allowed false during level-boundary breathers / title cards
   * @param snapD moves a scene's crossing point onto open ground (e.g. a cart
   *              lane through the tall cotton) so it can be seen
   */
  update(
    dt: number,
    p: Player,
    rng: Random,
    groundHeight: (x: number, d: number) => number,
    allowed: boolean,
    time: number,
    snapD: (d: number) => number = (d) => d,
  ): void {
    if (this.scene) {
      this.play(dt, p, groundHeight, time);
      // Done once the scene is well behind the runner.
      if (this.scene && p.d > this.scene.d + 25) this.end();
      return;
    }
    if (this.pending) {
      // Waiting for the runner to come up on the crossing point.
      const ahead = this.pending.d - p.d;
      if (!allowed || ahead < StoryConfig.viewDistance) this.pending = null;
      else if (ahead <= this.triggerAhead(p)) {
        this.begin(this.pending, rng);
        this.pending = null;
      }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0 || !allowed) return;
    this.timer = rng.range(...StoryConfig.interval);
    const d = snapD(p.d + this.triggerAhead(p) + 25);
    this.pending = { kind: rng.chance(StoryConfig.shotChance) ? 'shot' : 'chase', d, dir: rng.sign() };
  }

  private begin(at: Pending, rng: Random): void {
    const C = this.characters;
    const runner = C.humans.spawn(Styles.runner(rng.next()));
    if (!runner) return;
    const { kind, dir } = at;
    const s: Scene = {
      kind,
      d: at.d,
      dir,
      t: 0,
      runner,
      runnerX: -dir * StoryConfig.startX,
      runnerDown: -1,
      fallFrom: null,
      soldiers: [],
      horse: null,
      rider: null,
      riderX: -dir * (StoryConfig.startX + 15),
    };
    if (kind === 'shot') {
      for (let i = 0; i < 3; i++) {
        const h = C.humans.spawn(Styles.confederate(rng.next()));
        if (h) s.soldiers.push({ h, x: -dir * (StoryConfig.startX + 12 + i * 2.5), oz: (i - 1) * 2.2, aiming: false, fired: false });
      }
    } else {
      s.horse = C.horses.spawn(0x3a2a1e);
      s.rider = C.humans.spawn(Styles.catcher(rng.next()));
    }
    this.scene = s;
    // A shout from where they broke cover — look that way.
    this.bus.emit('pursuit:cue', { kind: kind === 'shot' ? 'shout' : 'horse', distance: 30, pan: -dir * 0.6 });
  }

  private play(dt: number, p: Player, ground: (x: number, d: number) => number, time: number): void {
    const s = this.scene!;
    s.t += dt;
    const runYaw = s.dir > 0 ? -Math.PI / 2 : Math.PI / 2;

    // ---- The runner ------------------------------------------------------
    if (s.runnerDown < 0) {
      s.runnerX += s.dir * StoryConfig.runnerSpeed * dt;
      const bob = Anim.run(s.runner.pose, (time * StoryConfig.runnerSpeed * Math.PI) / 1.9, 1, false);
      const gy = ground(s.runnerX, s.d);
      s.runner.pose.x = s.runnerX;
      s.runner.pose.y = gy + BODY.hipHeight + bob;
      s.runner.pose.z = -s.d;
      s.runner.pose.yaw = runYaw;
    } else if (!s.runner.isStatic) {
      // Shot: he pitches forward and lies still.
      s.fallFrom ??= copyPose(s.runner.pose, newPose());
      s.runnerDown += dt;
      const k = Math.min(1, s.runnerDown / 0.6);
      s.runnerX += s.dir * 3 * dt * (1 - k);
      const gy = ground(s.runnerX, s.d);
      Anim.lying(lying, 0);
      lying.y = gy + LYING_HEIGHT;
      s.fallFrom.y = gy + BODY.hipHeight;
      lerpPose(s.fallFrom, lying, k * k, s.runner.pose);
      s.runner.pose.x = s.runnerX;
      s.runner.pose.z = -s.d;
      s.runner.pose.yaw = runYaw;
      if (k >= 1) s.runner.isStatic = true;
    }

    if (s.kind === 'shot') this.playShot(s, dt, p, ground, time, runYaw);
    else this.playChase(s, dt, ground, time, runYaw);
  }

  private playShot(s: Scene, dt: number, p: Player, ground: (x: number, d: number) => number, time: number, yaw: number): void {
    // Soldiers chase him out of cover, stop as he reaches your trail, and fire.
    const C = StoryConfig;
    const aimAt = (C.startX - 2) / C.runnerSpeed;
    const fireAt = aimAt + 0.75;
    for (const so of s.soldiers) {
      const d = s.d + so.oz;
      const gy = ground(so.x, d);
      if (s.t < aimAt) {
        const speed = C.runnerSpeed * 0.92;
        so.x += s.dir * speed * dt;
        const bob = Anim.run(so.h.pose, (time * speed * Math.PI) / 1.8 + so.oz, 1, true);
        so.h.pose.y = gy + BODY.hipHeight + bob;
      } else {
        Anim.aim(so.h.pose, so.fired ? Math.max(0, 1 - (s.t - fireAt) * 3) : 0);
        so.h.pose.y = gy + BODY.hipHeight;
      }
      so.h.pose.x = so.x;
      so.h.pose.z = -d;
      so.h.pose.yaw = yaw;
      if (!so.fired && s.t >= fireAt + so.oz * 0.05) {
        so.fired = true;
        this.characters.humans.muzzle(so.h, muzzle);
        this.particles.muzzle(muzzle.x, muzzle.y, muzzle.z, s.dir, 0, false);
      }
    }
    if (s.t >= fireAt && s.runnerDown < 0) {
      s.runnerDown = 0;
      this.bus.emit('battle:volley', { distance: Math.max(20, s.d - p.d), pan: 0, count: s.soldiers.length });
      this.bus.emit('pursuit:cue', { kind: 'shout', distance: Math.max(20, s.d - p.d), pan: -s.dir * 0.5 });
    }
  }

  private playChase(s: Scene, dt: number, ground: (x: number, d: number) => number, time: number, yaw: number): void {
    if (!s.horse || !s.rider) return;
    s.riderX += s.dir * 9 * dt;
    // The rider closes but they race on, out of sight.
    if (Math.abs(s.riderX - s.runnerX) < 5) s.riderX = s.runnerX - s.dir * 5;
    const d = s.d + 1.5;
    const h = s.horse;
    h.x = s.riderX;
    h.z = -d;
    h.y = ground(s.riderX, d);
    h.yaw = yaw;
    h.speed = 9;
    Anim.ride(s.rider.pose, time, false);
    s.rider.pose.rArm = [1.6, 0.3, 0.6]; // reaching out
    s.rider.pose.x = h.x;
    s.rider.pose.z = h.z;
    s.rider.pose.y = h.y + h.dims.saddleY + h.bob;
    s.rider.pose.yaw = yaw;
    if (s.t > 2 && Math.abs(s.runnerX) > 140) this.end();
  }
}

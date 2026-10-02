import * as THREE from 'three';
import { FallConfig, PlayerConfig } from '../config/GameConfig';
import { clamp, damp, lerp, smoothstep } from '../utils/MathUtils';
import { ARM_POSE_KEYS, ArmRig, type ArmPose } from './ArmModel';
import type { Player } from './Player';

/** Where the shoulders sit relative to the eyes (body space, metres). */
const SHOULDER = new THREE.Vector3(0.23, -0.235, 0.1);

const pose = (p: Partial<ArmPose>): ArmPose => ({ swing: 0, abduct: 0.1, twist: 0, elbow: 0.3, wristFlex: 0, pronate: 0, curl: 1, thumb: 0.6, spread: 0, ...p });

/** Reference poses used by the fall sequence. */
const BRACE = pose({ swing: 1.4, abduct: 0.45, twist: -0.2, elbow: 0.45, wristFlex: -0.6, pronate: 1.25, curl: 0.15, thumb: 0, spread: 1 });
const PLANTED = pose({ swing: 1.15, abduct: 0.65, twist: -0.35, elbow: 1.45, wristFlex: -0.35, pronate: 1.4, curl: 0.25, thumb: 0.1, spread: 0.8 });
const PUSHED = pose({ swing: 0.95, abduct: 0.4, twist: -0.25, elbow: 0.3, wristFlex: -0.5, pronate: 1.4, curl: 0.2, thumb: 0.1, spread: 0.7 });
const HANGING = pose({ swing: 0.15, abduct: 0.08, elbow: 0.5, curl: 0.7, thumb: 0.4 });
const AIR = pose({ swing: 0.95, abduct: 0.42, twist: 0.1, elbow: 1.15, curl: 0.55, thumb: 0.3, spread: 0.3 });

function mix(a: ArmPose, b: ArmPose, t: number, out: ArmPose): ArmPose {
  for (const k of ARM_POSE_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

/**
 * The runner's own arms, seen in first person. They hang from the camera's
 * "body" anchor (so they bob and fall with you but stay put when you look
 * around), pump in time with the stride, fly out for balance in a jump, and
 * play the whole face-plant: brace, hit the dirt, push back up.
 */
export class FirstPersonArms {
  readonly root = new THREE.Group();
  private readonly right = new ArmRig();
  private readonly left = new ArmRig();
  private readonly current = { right: pose({}), left: pose({}) };
  private readonly targetR = pose({});
  private readonly targetL = pose({});
  private readonly tmpA = pose({});
  private airBlend = 0;

  constructor() {
    this.right.root.position.copy(SHOULDER);
    this.left.root.position.set(-SHOULDER.x, SHOULDER.y, SHOULDER.z);
    this.left.root.scale.x = -1; // mirror image of the right arm
    this.root.add(this.right.root, this.left.root);
    this.root.name = 'first-person-arms';
  }

  update(dt: number, p: Player): void {
    // ---- Running pump, one full arm cycle per two steps ------------------
    const speedK = clamp(p.speed / PlayerConfig.baseRunSpeed, 0, 1.4);
    const amp = speedK * (p.sprinting ? 1.25 : 1) * (p.exhausted ? 0.8 : 1);
    const phase = p.stride * Math.PI;
    for (const [target, s] of [
      [this.targetR, Math.sin(phase)],
      [this.targetL, -Math.sin(phase)],
    ] as const) {
      const fwd = Math.max(0, s);
      target.swing = 0.2 + 0.55 * amp * s;
      target.abduct = 0.12 + 0.04 * amp;
      target.twist = 0.1 * fwd * amp;
      target.elbow = 1.25 + 0.28 * fwd * amp - 0.15 * Math.max(0, -s) * amp;
      target.wristFlex = 0.1;
      target.pronate = 0;
      target.curl = 1.05;
      target.thumb = 0.7;
      target.spread = 0;
      // Barely moving: let the arms hang.
      if (speedK < 0.3) mix(HANGING, target, speedK / 0.3, target);
    }

    // ---- In the air: arms out for balance --------------------------------
    const airborne = !p.grounded && p.airTime > 0.06;
    this.airBlend = damp(this.airBlend, airborne ? 1 : 0, airborne ? 10 : 7, dt);
    if (this.airBlend > 0.001) {
      mix(this.targetR, AIR, this.airBlend, this.targetR);
      mix(this.targetL, AIR, this.airBlend, this.targetL);
    }

    // ---- The face-plant sequence -----------------------------------------
    let snappy = 22;
    if (p.falling) {
      const impact = p.fallBody.impactAt >= 0 ? p.fallBody.impactAt : FallConfig.impactAt;
      const fall = this.fallPose(p.fallTime, impact);
      if (fall) {
        Object.assign(this.targetR, fall);
        // The off-hand lands a beat later and a little wider.
        const lag = this.fallPose(Math.max(0, p.fallTime - 0.08), impact);
        if (lag) Object.assign(this.targetL, lag);
        this.targetL.abduct += 0.08;
        snappy = p.fallTime < impact ? 18 : 10;
      }
    }

    // Knocked flat by a shell: arms thrown out.
    if (p.knockedDown > 0) {
      const k = Math.min(1, p.knockedDown);
      mix(this.targetR, BRACE, k, this.targetR);
      mix(this.targetL, BRACE, k, this.targetL);
    }

    // ---- Smooth toward the targets and apply -----------------------------
    for (const k of ARM_POSE_KEYS) {
      this.current.right[k] = damp(this.current.right[k], this.targetR[k], snappy, dt);
      this.current.left[k] = damp(this.current.left[k], this.targetL[k], snappy, dt);
    }
    this.right.apply(this.current.right);
    this.left.apply(this.current.left);
  }

  /** Arm pose at time t into the fall, or null once he is running again. */
  private fallPose(t: number, impact: number): ArmPose | null {
    const F = FallConfig;
    if (t < impact) {
      // Throw the hands out to catch himself.
      return mix(HANGING, BRACE, smoothstep(0, F.impactAt * 0.6, t), this.tmpA);
    }
    if (t < F.pushUpAt) {
      // Elbows buckle; palms flat in the dirt beside his head.
      const k = smoothstep(impact - 0.05, impact + 0.25, t);
      mix(BRACE, PLANTED, k, this.tmpA);
      this.tmpA.curl += Math.sin(t * 5.5) * 0.04; // fingers digging in as he breathes
      return this.tmpA;
    }
    if (t < F.kneelAt) {
      // Push the ground away.
      return mix(PLANTED, PUSHED, smoothstep(F.pushUpAt, F.kneelAt, t), this.tmpA);
    }
    if (t < F.standAt + 0.3) {
      // Hands come off the ground as he rises.
      return mix(PUSHED, HANGING, smoothstep(F.kneelAt, F.standAt + 0.3, t), this.tmpA);
    }
    return null;
  }
}

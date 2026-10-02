import { BODY } from './HumanGeometry';

/**
 * A full-body pose. Angles in radians.
 *   limbs: [swing (+ forward), abduct (+ outward), bend (+ elbow forward / + knee back)]
 *   root: pelvis position (world) and orientation (yaw about Y, pitch + leans forward, roll)
 */
export interface HumanPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  spinePitch: number;
  spineYaw: number;
  spineRoll: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  lArm: [number, number, number];
  rArm: [number, number, number];
  lLeg: [number, number, number];
  rLeg: [number, number, number];
  /** Ankle flex (+ toes down). */
  ankle: number;
  /** How the rifle is carried. */
  rifle: RifleHold;
}

export type RifleHold = 'none' | 'hand' | 'aim' | 'port' | 'slung';

export function newPose(): HumanPose {
  return {
    x: 0,
    y: BODY.hipHeight,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    spinePitch: 0,
    spineYaw: 0,
    spineRoll: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    lArm: [0, 0.08, 0.15],
    rArm: [0, 0.08, 0.15],
    lLeg: [0, 0.02, 0.05],
    rLeg: [0, 0.02, 0.05],
    ankle: 0,
    rifle: 'none',
  };
}

const NUM_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'spinePitch', 'spineYaw', 'spineRoll', 'headPitch', 'headYaw', 'headRoll', 'ankle'] as const;
const LIMBS = ['lArm', 'rArm', 'lLeg', 'rLeg'] as const;

export function lerpPose(a: HumanPose, b: HumanPose, t: number, out: HumanPose): HumanPose {
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of LIMBS) for (let i = 0; i < 3; i++) out[k][i] = a[k][i] + (b[k][i] - a[k][i]) * t;
  out.rifle = t < 0.5 ? a.rifle : b.rifle;
  return out;
}

export function copyPose(src: HumanPose, out: HumanPose): HumanPose {
  return lerpPose(src, src, 0, out);
}

/**
 * Animation library. Every function writes the joint angles of `out`
 * (root position/yaw are left to the caller unless stated).
 */
export const Anim = {
  stand(out: HumanPose, t: number): HumanPose {
    const breathe = Math.sin(t * 1.6) * 0.015;
    out.pitch = 0;
    out.roll = 0;
    out.spinePitch = 0.03 + breathe;
    out.spineYaw = 0;
    out.spineRoll = 0;
    out.headPitch = 0;
    out.headYaw = Math.sin(t * 0.3) * 0.2;
    out.headRoll = 0;
    out.lArm = [0.05, 0.1, 0.2];
    out.rArm = [0.05, 0.1, 0.2];
    out.lLeg = [0.02, 0.05, 0.04];
    out.rLeg = [-0.02, 0.05, 0.04];
    out.ankle = 0;
    return out;
  },

  /**
   * Running (or walking with intensity < 0.5). `phase` advances one full
   * cycle (2π) per two steps. Returns the vertical bob for the root.
   */
  run(out: HumanPose, phase: number, intensity: number, carryRifle = false): number {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const k = intensity;
    out.pitch = 0.1 * k;
    out.roll = s * 0.03 * k;
    out.spinePitch = 0.08 * k;
    out.spineYaw = -s * 0.18 * k;
    out.spineRoll = 0;
    out.headPitch = -0.12 * k;
    out.headYaw = s * 0.12 * k;
    out.headRoll = 0;
    // Legs: the swinging leg lifts its knee; the back leg kicks its heel up.
    out.lLeg = [s * 0.75 * k, 0.03, (0.25 + Math.max(0, -c) * 1.35 + Math.max(0, s) * 0.5) * k];
    out.rLeg = [-s * 0.75 * k, 0.03, (0.25 + Math.max(0, c) * 1.35 + Math.max(0, -s) * 0.5) * k];
    out.ankle = 0.2 * k;
    if (carryRifle) {
      // Rifle held across the body at port arms.
      out.rArm = [0.55, 0.15, 1.35];
      out.lArm = [0.75, 0.1, 1.1];
      out.rifle = 'port';
    } else {
      out.lArm = [-s * 0.8 * k, 0.12, (0.6 + Math.max(0, -s) * 0.9) * k + 0.3];
      out.rArm = [s * 0.8 * k, 0.12, (0.6 + Math.max(0, s) * 0.9) * k + 0.3];
    }
    return Math.abs(c) * 0.06 * k;
  },

  /** Rifle shouldered and aimed along −Z. `recoil` 0..1 kicks the body back. */
  aim(out: HumanPose, recoil = 0): HumanPose {
    out.pitch = 0.05 - recoil * 0.1;
    out.roll = 0;
    out.spinePitch = 0.12 - recoil * 0.15;
    out.spineYaw = 0.35;
    out.spineRoll = 0;
    out.headPitch = 0.05;
    out.headYaw = -0.32;
    out.headRoll = 0.15;
    out.rArm = [1.25, 0.55, 1.75];
    out.lArm = [1.45, -0.05, 0.35];
    out.lLeg = [0.35, 0.12, 0.25];
    out.rLeg = [-0.25, 0.14, 0.12];
    out.ankle = 0;
    out.rifle = 'aim';
    return out;
  },

  /** Seated in the saddle; `bounce` comes from the horse's gait. */
  ride(out: HumanPose, t: number, holdRifle: boolean): HumanPose {
    out.pitch = 0.12 + Math.sin(t * 9) * 0.03;
    out.roll = 0;
    out.spinePitch = 0.08;
    out.spineYaw = 0;
    out.spineRoll = 0;
    out.headPitch = -0.08;
    out.headYaw = 0;
    out.headRoll = 0;
    out.lLeg = [1.2, 0.5, 1.5];
    out.rLeg = [1.2, 0.5, 1.5];
    out.ankle = 0.1;
    out.lArm = [0.75, 0.05, 1.2];
    out.rArm = holdRifle ? [0.7, 0.2, 1.4] : [0.75, 0.05, 1.2];
    out.rifle = holdRifle ? 'hand' : 'none';
    return out;
  },

  /** Lying dead on the ground. `variant` picks one of several natural sprawls. */
  lying(out: HumanPose, variant: number): HumanPose {
    const v = Math.abs(Math.floor(variant)) % 4;
    const faceDown = v % 2 === 0;
    out.pitch = faceDown ? -Math.PI / 2 : Math.PI / 2;
    out.roll = (v === 2 ? 0.3 : v === 3 ? -0.25 : 0.05) * (faceDown ? 1 : -1);
    out.spinePitch = faceDown ? -0.05 : 0.05;
    out.spineYaw = v === 1 ? 0.25 : -0.1;
    out.spineRoll = 0.1;
    out.headPitch = faceDown ? -0.3 : 0.25;
    out.headYaw = v === 2 ? 0.9 : -0.6;
    out.headRoll = 0;
    out.lArm = v === 0 ? [2.6, 0.35, 0.4] : v === 1 ? [0.4, 1.2, 0.6] : [1.2, 0.5, 1.6];
    out.rArm = v === 0 ? [0.3, 0.6, 0.3] : v === 1 ? [2.2, 0.4, 0.2] : [0.1, 0.25, 0.4];
    out.lLeg = v === 3 ? [0.9, 0.2, 1.4] : [0.1, 0.18, 0.2];
    out.rLeg = v === 2 ? [0.6, 0.1, 1.2] : [-0.05, 0.12, 0.35];
    out.ankle = 0.5;
    out.rifle = 'none';
    return out;
  },

  /** A body hanging from a rope: limp, head fallen forward to one side, slowly turning. */
  hang(out: HumanPose, t: number, seed: number): HumanPose {
    out.pitch = Math.sin(t * 0.7 + seed) * 0.02;
    out.roll = Math.sin(t * 0.5 + seed * 2) * 0.025;
    out.spinePitch = 0.06;
    out.spineYaw = 0;
    out.spineRoll = 0.04;
    out.headPitch = 0.55;
    out.headYaw = 0.1;
    out.headRoll = 0.45;
    out.lArm = [0.04, 0.06, 0.12];
    out.rArm = [0.02, 0.05, 0.1];
    out.lLeg = [0.04, 0.02, 0.12];
    out.rLeg = [0.0, 0.03, 0.18];
    out.ankle = 0.9;
    out.rifle = 'none';
    return out;
  },
};

/** Pelvis height above the ground for a pose type. */
export const LYING_HEIGHT = 0.13;

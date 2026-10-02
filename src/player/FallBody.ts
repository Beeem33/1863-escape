import { FallConfig, PlayerConfig } from '../config/GameConfig';
import { clamp, lerp, smoothstep } from '../utils/MathUtils';

/** Feet → eyes (m): the body pivots about the feet as it topples. */
const L = PlayerConfig.eyeHeight;
/** A touch above real gravity — falls read heavier in first person. */
const G = 11;
/** Eye height lying face down with the chest on the ground. */
const LIE_EYE = 0.34;
/** Eye height at which the outstretched hands reach the ground. */
const HANDS_EYE = 0.7;
const THETA_GROUND = Math.acos(LIE_EYE / L);

/** Get-up keyframes: [time, eye height, body pitch θ, head pitch (neck), share of the fall distance still ahead of the feet]. */
type Key = [number, number, number, number, number];

/** Spring step (semi-implicit Euler). Returns the new velocity; caller integrates. */
function spring(x: number, v: number, target: number, k: number, c: number, dt: number): number {
  return v + (k * (target - x) - c * v) * dt;
}

/**
 * The runner's body through a trip, simulated rather than keyframed, so the
 * first-person view falls with real weight:
 *
 *  1. Topple: the feet are caught and decelerate, the body rotates about them
 *     as a rigid rod under gravity (θ'' = 3/2L · (g sinθ − a_feet cosθ)).
 *  2. Hands hit the ground and absorb some of the rotation; then the chest
 *     lands. Contact bounces with low restitution, the head whips down on the
 *     neck and the shoulders roll onto one side — all damped springs.
 *  3. Lying still, breathing, lifting the head to find the trail.
 *  4. Getting back up is a deliberate movement (push up, knee, stand), driven
 *     by keyframes through springs so it keeps its weight.
 *
 * Purely the body's pose: PlayerMovement steps it, PlayerCamera and the arms read it.
 */
export class FallBody {
  /** Body pitch from vertical (rad, + = forward). */
  theta = 0;
  omega = 0;
  /** Head pitch relative to the body (rad, + = lifting the head). */
  neck = 0;
  private neckVel = 0;
  /** Shoulder roll and torso twist (rad). */
  roll = 0;
  private rollVel = 0;
  twist = 0;
  private twistVel = 0;
  /** Eye height above the ground under the head. */
  eye = L;
  private eyeVel = 0;
  /** How far the head is ahead of the feet (m). */
  reach = 0;
  /** Fall time at which the chest hit the ground (−1 until it has). */
  impactAt = -1;
  /** Whether the hands have reached the ground. */
  handsDown = false;
  /** Ground height under the head minus ground under the feet. */
  groundOffset = 0;
  private side = 1;
  private reachAtRest = 0;

  begin(side: number): void {
    this.side = side;
    this.theta = 0.14; // running lean
    this.omega = 0.7;
    this.neck = 0;
    this.neckVel = 0.6;
    this.roll = 0;
    this.rollVel = side * 0.35;
    this.twist = 0;
    this.twistVel = side * 0.15;
    this.eye = L * Math.cos(this.theta);
    this.eyeVel = 0;
    this.reach = 0;
    this.impactAt = -1;
    this.handsDown = false;
    this.reachAtRest = 0;
  }

  /**
   * Advance the body. `feetDecel` is how hard the feet are being slowed (m/s²).
   * Returns how much the feet should move forward this step as the body gets
   * up (the runner steps under himself, so the head stays put), and whether
   * the chest hit the ground this step.
   */
  step(t: number, dt: number, feetDecel: number): { impact: boolean; feetAdvance: number } {
    const F = FallConfig;
    const s = this.side;
    let impact = false;
    let feetAdvance = 0;

    if (t < F.pushUpAt) {
      // ---- Physics: topple, catch, land, lie ------------------------------
      const alpha = (3 / (2 * L)) * (G * Math.sin(this.theta) + feetDecel * Math.cos(this.theta));
      this.omega += alpha * dt;
      if (!this.handsDown && L * Math.cos(this.theta) < HANDS_EYE && this.impactAt < 0) {
        this.handsDown = true;
        this.omega *= 0.72; // arms take the first of it
      }
      if (this.handsDown && this.impactAt < 0) this.omega *= Math.exp(-2.2 * dt); // elbows give way
      this.theta += this.omega * dt;
      if (this.theta >= THETA_GROUND) {
        this.theta = THETA_GROUND;
        if (this.omega > 0) {
          if (this.impactAt < 0) {
            this.impactAt = t;
            impact = true;
            this.neckVel -= 1.6 + this.omega * 0.3; // head whips toward the dirt
            this.rollVel += s * (0.8 + this.omega * 0.15);
            this.twistVel += s * 0.6;
          }
          this.omega = this.omega > 0.35 ? -this.omega * 0.18 : 0;
        }
      }
      this.eye = L * Math.cos(this.theta) + Math.max(0, this.neck) * 0.05;
      this.reach = L * Math.sin(this.theta) * 0.92;
      this.eyeVel = 0;

      // Head: up and braced while falling; after the landing, lie still, then
      // lift it to look for the trail, breathing hard.
      const lying = this.impactAt >= 0;
      const lift = lying ? smoothstep(this.impactAt + 0.5, F.pushUpAt, t) : 0;
      const neckTarget = lying ? lerp(0.16, 0.72, lift) + Math.sin(t * 5.2) * 0.02 : 0.28;
      this.neckVel = spring(this.neck, this.neckVel, neckTarget, 110, 11, dt);
      this.neck += this.neckVel * dt;

      const rollTarget = s * (lying ? 0.18 : 0.08);
      this.rollVel = spring(this.roll, this.rollVel, rollTarget, 38, 6.5, dt);
      this.roll += this.rollVel * dt;
      const twistTarget = s * (lying ? 0.16 : 0.04);
      this.twistVel = spring(this.twist, this.twistVel, twistTarget, 30, 6, dt);
      this.twist += this.twistVel * dt;
      this.reachAtRest = this.reach;
      return { impact, feetAdvance };
    }

    // ---- Getting up: keyframes through springs ----------------------------
    const pu = F.pushUpAt;
    const kn = F.kneelAt;
    const st = F.standAt;
    const keys: Key[] = [
      [pu, LIE_EYE, THETA_GROUND, 0.72, 1],
      [pu + 0.55, 0.6, 1.05, 0.45, 1], // arms straight, chest off the ground
      [kn, 0.9, 0.62, 0.25, 0.45], // knees drawn under
      [kn + 0.3, 1.05, 0.48, 0.15, 0.3], // one foot planted
      [st, L, 0.12, 0.02, 0], // up
      [st + 0.5, L, 0.06, 0, 0],
    ];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const k = smoothstep(a[0], b[0], t);
    const eyeT = lerp(a[1], b[1], k);
    const thetaT = lerp(a[2], b[2], k);
    const neckT = lerp(a[3], b[3], k);
    const reachT = lerp(a[4], b[4], k) * this.reachAtRest;

    this.eyeVel = spring(this.eye, this.eyeVel, eyeT, 120, 17, dt);
    this.eye += this.eyeVel * dt;
    this.omega = spring(this.theta, this.omega, thetaT, 110, 17, dt);
    this.theta += this.omega * dt;
    this.neckVel = spring(this.neck, this.neckVel, neckT, 90, 14, dt);
    this.neck += this.neckVel * dt;
    // The feet come forward under the body; the head itself stays put.
    if (reachT < this.reach) {
      feetAdvance = this.reach - reachT;
      this.reach = reachT;
    }
    const up = smoothstep(pu, st, t);
    this.rollVel = spring(this.roll, this.rollVel, s * 0.18 * (1 - up), 40, 9, dt);
    this.roll += this.rollVel * dt;
    this.twistVel = spring(this.twist, this.twistVel, s * 0.16 * (1 - up), 30, 8, dt);
    this.twist += this.twistVel * dt;
    this.eye = clamp(this.eye, LIE_EYE * 0.9, L + 0.05);
    return { impact, feetAdvance };
  }
}

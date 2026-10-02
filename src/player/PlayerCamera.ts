import * as THREE from 'three';
import { CameraConfig, PlayerConfig } from '../config/GameConfig';
import type { Settings } from '../core/Settings';
import { clamp, damp } from '../utils/MathUtils';
import type { Player } from './Player';

/**
 * First-person view: head bob synced to the stride, sway, strafe roll, sprint
 * FOV, landing dip, impact shake, mouse look and the over-the-shoulder glance.
 * Purely visual — never feeds back into movement.
 */
export class PlayerCamera {
  private yaw = 0;
  private pitch = 0;
  private lookBackBlend = 0;
  private idleTime = 0;
  private roll = 0;
  private fovBoost = 0;
  /** Landing / stumble dip, as a damped spring. */
  private dip = 0;
  private dipVelocity = 0;
  /** Shake "trauma" 0..1 (shake = trauma²). */
  private trauma = 0;
  private time = 0;
  private bobAmount = 0;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  /**
   * The torso: follows the head (position, bob, falls) but NOT mouse look or
   * the glance back — the first-person arms hang from this.
   */
  readonly body = new THREE.Object3D();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly settings: Settings,
  ) {}

  reset(): void {
    this.yaw = this.pitch = this.lookBackBlend = this.roll = this.fovBoost = 0;
    this.dip = this.dipVelocity = this.trauma = 0;
  }

  /** How far the head is turned from the body (radians) — arms hide when looking back. */
  get headTurn(): number {
    return Math.abs(this.yaw) + this.lookBackBlend * CameraConfig.lookBackYaw;
  }

  /** Add camera shake (0..1). */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Kick the head downward (landings, stumbles). */
  kick(amount: number): void {
    this.dipVelocity -= amount;
  }

  applyMouse(dx: number, dy: number): void {
    const s = this.settings.data;
    if (!s.mouseLook) return;
    const sens = 0.0022 * s.mouseSensitivity;
    this.yaw = clamp(this.yaw - dx * sens, -CameraConfig.maxYaw, CameraConfig.maxYaw);
    this.pitch = clamp(this.pitch - dy * sens * (s.invertY ? -1 : 1), -CameraConfig.maxPitch, CameraConfig.maxPitch);
    if (dx !== 0 || dy !== 0) this.idleTime = 0;
  }

  update(p: Player, lookBack: boolean, dt: number): void {
    const C = CameraConfig;
    const s = this.settings.data;
    this.time += dt;
    this.idleTime += dt;

    // Slowly re-centre mouse look once the mouse has been idle a while.
    if (this.idleTime > 1.5) {
      this.yaw = damp(this.yaw, 0, C.recenterSpeed, dt);
      this.pitch = damp(this.pitch, 0, C.recenterSpeed, dt);
    }

    // --- Head bob, synced to footsteps -------------------------------------
    const running = p.grounded && !p.downed ? clamp(p.speed / PlayerConfig.baseRunSpeed, 0, 1.5) : 0;
    this.bobAmount = damp(this.bobAmount, running, 8, dt);
    const sprintBob = p.sprinting ? 1.35 : 1;
    const bobScale = this.bobAmount * s.headBob * sprintBob;
    const phase = p.stride * Math.PI; // one full bob per step
    const bobY = -Math.abs(Math.sin(phase)) * C.bobAmplitude * 2 * bobScale + C.bobAmplitude * bobScale;
    // One side-to-side sway per two steps (weight shifting foot to foot).
    const sway = Math.cos(p.stride * Math.PI) * C.swayAmplitude * bobScale;

    // --- Landing / stumble spring ------------------------------------------
    const k = 90;
    const c = 14;
    this.dipVelocity += (-k * this.dip - c * this.dipVelocity) * dt;
    this.dip += this.dipVelocity * dt;

    // --- Roll into strafes, plus gentle sway roll --------------------------
    const targetRoll = -(p.vx / PlayerConfig.strafeSpeed) * C.strafeRoll + sway * 0.25;
    this.roll = damp(this.roll, targetRoll, 7, dt);

    // --- Sprint FOV ---------------------------------------------------------
    this.fovBoost = damp(this.fovBoost, p.sprinting || p.boostTimer > 0 ? C.sprintFovBoost : 0, 4, dt);
    const fov = s.fov + this.fovBoost;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // --- Glance back --------------------------------------------------------
    this.lookBackBlend = damp(this.lookBackBlend, lookBack ? 1 : 0, 7, dt);

    // --- Shake --------------------------------------------------------------
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const sh = this.trauma * this.trauma;
    const t = this.time * 31;
    const shakeYaw = sh * 0.05 * Math.sin(t * 1.1 + 1.7) * Math.cos(t * 0.37);
    const shakePitch = sh * 0.05 * Math.sin(t * 0.9 + 0.3) * Math.cos(t * 0.53 + 2);
    const shakeRoll = sh * 0.06 * Math.sin(t * 0.7 + 4.1);

    // Knocked down: the view drops toward the ground.
    const down = p.knockedDown > 0 ? Math.min(1, p.knockedDown) : 0;

    // Tripped: the view rides the simulated body (see FallBody).
    const fall = p.falling ? p.fallBody : null;

    // --- Compose ------------------------------------------------------------
    const eye = (fall ? fall.eye + fall.groundOffset : PlayerConfig.eyeHeight) - down * 1.1;
    this.camera.position.set(p.x + sway, p.y + eye + bobY + this.dip, p.z - (fall ? fall.reach : 0));

    // Look slightly toward the strafe direction; pitch dips a touch with the stride.
    const strafeYaw = -(p.vx / PlayerConfig.strafeSpeed) * 0.04 + (fall ? fall.twist : 0);
    const stridePitch = Math.sin(phase * 2) * 0.004 * bobScale;
    const bodyPitch = stridePitch + this.dip * 0.25 - down * 0.5 - (fall ? fall.theta : 0);
    const headPitch = fall ? fall.neck : 0;
    const bodyRoll = this.roll + down * 0.4 + (fall ? fall.roll : 0);
    const yaw = this.yaw + strafeYaw + this.lookBackBlend * C.lookBackYaw * (this.yaw >= 0 ? 1 : -1) + shakeYaw;
    const pitch = this.pitch + bodyPitch + headPitch + shakePitch;
    this.euler.set(pitch, yaw, bodyRoll + shakeRoll);
    this.camera.quaternion.setFromEuler(this.euler);

    this.body.position.copy(this.camera.position);
    // The arms hang from the head-and-shoulders, so they follow the head's pitch in a fall.
    this.euler.set(bodyPitch + headPitch + shakePitch * 0.5, strafeYaw + shakeYaw * 0.5, bodyRoll + shakeRoll * 0.5);
    this.body.quaternion.setFromEuler(this.euler);
  }
}

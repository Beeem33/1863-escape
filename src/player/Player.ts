import { FallConfig, HealthConfig, PlayerConfig, StaminaConfig } from '../config/GameConfig';
import type { Surface } from '../core/EventBus';
import { FallBody } from './FallBody';

/**
 * Pure player state. Movement rules live in PlayerMovement, input mapping in
 * PlayerController, and the view in PlayerCamera — so any one of them can be
 * changed without touching the others.
 *
 * Coordinates: `x` is lateral (+ right), `d` is distance travelled forward.
 * World position is (x, y, -d) because the run heads down the −Z axis.
 */
export class Player {
  x = 0;
  d = 0;
  /** Height of the feet in world space. */
  y = 0;

  /** Lateral velocity (m/s). */
  vx = 0;
  /** Forward speed (m/s). */
  speed = 0;
  /** Vertical velocity (m/s). */
  vy = 0;

  grounded = true;
  groundHeight = 0;
  /** Time since the feet last touched the ground. */
  airTime = 0;
  /** Accumulated stride count; fractional part is the phase within a step. */
  stride = 0;

  stamina = StaminaConfig.max;
  health = HealthConfig.max;
  /** Seconds since last wounded. */
  sinceHit = 99;
  sprinting = false;
  exhausted = false;

  /** Seconds left of the post-collision stumble. */
  stumbleTimer = 0;
  /** Seconds of invulnerability left after a hit. */
  invulnerableTimer = 0;
  /** Seconds left on the horseshoe speed boost. */
  boostTimer = 0;
  /** Seconds left on the lantern effect. */
  lanternTimer = 0;
  /** Speed multiplier from mud / water this frame (1 = none). */
  terrainSlow = 1;
  /** True while wading through standing water. */
  inWater = false;
  surface: Surface = 'dirt';

  /** Set while the player is knocked down by a blast or caught. */
  knockedDown = 0;
  /** Seconds since tripping flat on his face; < 0 when not falling. See FallConfig. */
  fallTime = -1;
  /** -1 / 1 — which way the fall twists (keeps each fall a little different). */
  fallSide = 1;
  /** The simulated body through a fall (what the camera and arms follow). */
  readonly fallBody = new FallBody();

  reset(): void {
    this.x = 0;
    this.d = 0;
    this.y = 0;
    this.vx = 0;
    this.speed = PlayerConfig.baseRunSpeed * 0.6;
    this.vy = 0;
    this.grounded = true;
    this.groundHeight = 0;
    this.airTime = 0;
    this.stride = 0;
    this.stamina = StaminaConfig.max;
    this.health = HealthConfig.max;
    this.sinceHit = 99;
    this.sprinting = false;
    this.exhausted = false;
    this.stumbleTimer = 0;
    this.invulnerableTimer = 0;
    this.boostTimer = 0;
    this.lanternTimer = 0;
    this.terrainSlow = 1;
    this.inWater = false;
    this.surface = 'dirt';
    this.knockedDown = 0;
    this.fallTime = -1;
  }

  get falling(): boolean {
    return this.fallTime >= 0;
  }

  /** Movement control is lost from the trip until he is back on his feet. */
  get downed(): boolean {
    return this.fallTime >= 0 && this.fallTime < FallConfig.standAt;
  }

  get z(): number {
    return -this.d;
  }

  get staminaFraction(): number {
    return this.stamina / StaminaConfig.max;
  }
}

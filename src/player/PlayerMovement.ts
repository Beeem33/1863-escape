import { CollectibleConfig, PlayerConfig, StaminaConfig } from '../config/GameConfig';
import type { EventBus, Surface } from '../core/EventBus';
import { approach, clamp } from '../utils/MathUtils';
import type { Player } from './Player';
import type { MovementIntent } from './PlayerController';

/** World queries the movement code needs, supplied by the WorldManager. */
export interface GroundQuery {
  height(x: number, d: number): number;
  surface(x: number, d: number): Surface;
  waterLevel(d: number): number;
}

/**
 * Movement physics: forward running, free lateral movement inside the
 * corridor, jumping, stamina and stride timing (which drives footsteps and
 * head bob).
 */
export class PlayerMovement {
  private jumpBufferTimer = 0;
  private wasSprinting = false;

  constructor(private readonly bus: EventBus) {}

  /**
   * @param baseSpeed  the expected running speed at the current difficulty
   */
  update(p: Player, intent: MovementIntent, baseSpeed: number, ground: GroundQuery, dt: number): void {
    this.updateStamina(p, intent, dt);
    this.updateForward(p, intent, baseSpeed, dt);
    this.updateLateral(p, intent, dt);
    this.updateVertical(p, intent, ground, dt);
    this.updateStride(p, dt);

    p.stumbleTimer = Math.max(0, p.stumbleTimer - dt);
    p.invulnerableTimer = Math.max(0, p.invulnerableTimer - dt);
    p.boostTimer = Math.max(0, p.boostTimer - dt);
    p.lanternTimer = Math.max(0, p.lanternTimer - dt);
    p.knockedDown = Math.max(0, p.knockedDown - dt);
  }

  private updateStamina(p: Player, intent: MovementIntent, dt: number): void {
    const S = StaminaConfig;
    const boosted = p.boostTimer > 0;
    const canStartSprint = p.stamina > S.sprintMinimum && !p.exhausted;
    p.sprinting = intent.sprint && !intent.ease && (p.sprinting ? p.stamina > 0 && !p.exhausted : canStartSprint);

    if (boosted) {
      // Horseshoe: free running, no drain.
    } else if (p.sprinting) {
      p.stamina -= S.sprintDrain * dt;
    } else if (intent.ease) {
      p.stamina += S.easeRegen * dt;
    } else if (p.exhausted) {
      p.stamina += S.exhaustedRegen * dt;
    } else {
      p.stamina -= S.runDrain * dt;
    }
    p.stamina = clamp(p.stamina, 0, S.max);

    if (!p.exhausted && p.stamina <= 0) {
      p.exhausted = true;
      p.sprinting = false;
      this.bus.emit('player:exhausted', { exhausted: true });
    } else if (p.exhausted && p.stamina >= S.exhaustedRecover) {
      p.exhausted = false;
      this.bus.emit('player:exhausted', { exhausted: false });
    }

    if (p.sprinting !== this.wasSprinting) {
      this.wasSprinting = p.sprinting;
      this.bus.emit('player:sprint', { active: p.sprinting });
    }
  }

  private updateForward(p: Player, intent: MovementIntent, baseSpeed: number, dt: number): void {
    const C = PlayerConfig;
    let target = baseSpeed;
    if (intent.push) target *= C.pushMultiplier;
    if (intent.ease) target *= C.easeMultiplier;
    if (p.sprinting) target *= C.sprintMultiplier;
    if (p.exhausted) target *= C.exhaustedMultiplier;
    if (p.boostTimer > 0) target *= CollectibleConfig.horseshoeMultiplier;
    target *= p.terrainSlow;
    if (p.stumbleTimer > 0) {
      // Recover from the stumble gradually.
      const k = p.stumbleTimer / C.stumbleDuration;
      target *= 1 - (1 - C.stumbleSpeedMultiplier) * k;
    }
    if (p.knockedDown > 0) target = 0;

    const rate = target > p.speed ? C.forwardAcceleration : C.forwardDeceleration;
    // Airborne: keep momentum (no acceleration in the air).
    if (p.grounded || target < p.speed) p.speed = approach(p.speed, target, rate * dt);
    p.d += p.speed * dt;
  }

  private updateLateral(p: Player, intent: MovementIntent, dt: number): void {
    const C = PlayerConfig;
    const control = p.grounded ? 1 : 0.6; // a little less control mid-air
    const knocked = p.knockedDown > 0 ? 0 : 1;
    const target = intent.strafe * C.strafeSpeed * knocked;
    const accelerating = intent.strafe !== 0 && Math.sign(target) === Math.sign(p.vx || target);
    const rate = (accelerating ? C.strafeAcceleration : C.strafeDeceleration) * control;
    p.vx = approach(p.vx, target, rate * dt);

    p.x += p.vx * dt;
    const limit = C.corridorHalfWidth - C.radius;
    if (p.x > limit) {
      p.x = limit;
      p.vx = Math.min(p.vx, 0);
    } else if (p.x < -limit) {
      p.x = -limit;
      p.vx = Math.max(p.vx, 0);
    }
  }

  private updateVertical(p: Player, intent: MovementIntent, ground: GroundQuery, dt: number): void {
    const C = PlayerConfig;
    const gh = ground.height(p.x, p.d);
    p.groundHeight = gh;

    if (intent.jump) this.jumpBufferTimer = C.jumpBuffer;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    const canJump = (p.grounded || p.airTime < C.coyoteTime) && p.vy <= 0 && p.knockedDown <= 0;
    if (this.jumpBufferTimer > 0 && canJump) {
      this.jumpBufferTimer = 0;
      p.vy = C.jumpVelocity;
      p.grounded = false;
      p.airTime = C.coyoteTime; // consume coyote time
      this.bus.emit('player:jump');
    }

    if (p.grounded) {
      // Follow the terrain; walk off a drop → start falling.
      if (p.y - gh > 0.35) {
        p.grounded = false;
      } else {
        p.y = gh;
        p.vy = 0;
        p.airTime = 0;
      }
    }

    if (!p.grounded) {
      p.vy -= C.gravity * dt;
      p.y += p.vy * dt;
      p.airTime += dt;
      if (p.y <= gh) {
        const impact = Math.min(1, -p.vy / 10);
        p.y = gh;
        p.vy = 0;
        p.grounded = true;
        p.airTime = 0;
        this.bus.emit('player:land', { impact, surface: p.surface });
      }
    }

    // Water / mud detection and footstep surface.
    const water = ground.waterLevel(p.d);
    p.inWater = p.grounded && gh < water - 0.08;
    p.surface = p.inWater ? 'water' : ground.surface(p.x, p.d);
  }

  private updateStride(p: Player, dt: number): void {
    if (!p.grounded || p.speed < 0.5) return;
    // Longer strides at higher speed; cadence ≈ 3.2–3.8 steps/s.
    const stepLength = 1.15 + p.speed * 0.17;
    const before = Math.floor(p.stride);
    p.stride += (p.speed / stepLength) * dt;
    if (Math.floor(p.stride) !== before) {
      const intensity = clamp(p.speed / 14, 0.3, 1.2);
      this.bus.emit('player:footstep', { intensity, surface: p.surface });
      if (p.inWater) this.bus.emit('player:splash', { intensity });
    }
  }
}

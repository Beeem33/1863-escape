import { WEATHER_PRESETS, WeatherConfig, type WeatherKind, type WeatherPreset } from '../config/WeatherConfig';
import type { EventBus } from '../core/EventBus';
import { lerp, smoothstep } from '../utils/MathUtils';
import type { Random } from '../utils/Random';

const KEYS = Object.keys(WEATHER_PRESETS.clear) as (keyof WeatherPreset)[];

/**
 * Randomised, changing weather. Picks a starting weather per run (seeded),
 * then rolls a new one every `WeatherConfig.duration` seconds and blends to
 * it over `transition` seconds. Lightning strikes are scheduled here; the
 * Environment, rain renderer and audio read `state` and `flash`.
 */
export class WeatherSystem {
  kind: WeatherKind = 'clear';
  private from: WeatherKind = 'clear';
  /** Current blended modifiers. */
  readonly state: WeatherPreset = { ...WEATHER_PRESETS.clear };
  /** 0..1 lightning brightness this frame. */
  flash = 0;
  /** 0..1 progress of the current transition. */
  blend = 1;
  private timer = 60;
  private lightningTimer = 5;
  private flashQueue: number[] = [];
  private flashStrength = 1;
  private rng!: Random;

  reset(rng: Random): void {
    this.rng = rng;
    this.kind = this.from = this.pick(null);
    this.blend = 1;
    this.timer = rng.range(...WeatherConfig.duration);
    this.flash = 0;
    this.flashQueue = [];
    this.apply();
  }

  private pick(not: WeatherKind | null): WeatherKind {
    const weights = { ...WeatherConfig.weights };
    if (not) weights[not] = 0;
    return this.rng.weighted(weights) ?? 'clear';
  }

  /** Change weather now (debug F6), or roll a random new one. */
  change(next?: WeatherKind, bus?: EventBus): void {
    this.from = this.kind;
    this.kind = next ?? this.pick(this.kind);
    this.blend = 0;
    this.timer = this.rng.range(...WeatherConfig.duration);
    bus?.emit('weather:change', { kind: this.kind });
  }

  /** Cycle to the next kind in order (debug). */
  cycle(bus: EventBus): void {
    const kinds = Object.keys(WEATHER_PRESETS) as WeatherKind[];
    this.change(kinds[(kinds.indexOf(this.kind) + 1) % kinds.length], bus);
    this.blend = 0.85; // nearly instant so you can see it
  }

  update(dt: number, bus: EventBus): void {
    if (!this.rng) return;
    this.timer -= dt;
    if (this.timer <= 0) this.change(undefined, bus);
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / WeatherConfig.transition);
    this.apply();

    // ---- Lightning ------------------------------------------------------
    const perMinute = this.state.lightning;
    if (perMinute > 0.05) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = (this.rng.range(0.4, 1.6) * 60) / perMinute;
        const distance = this.rng.range(0.2, 1); // 0 = overhead, 1 = far
        const strength = 1 - distance * 0.6;
        // A strike is a flicker of two or three flashes.
        this.flashQueue.push(0, 0.09, ...(this.rng.chance(0.5) ? [0.22] : []));
        this.flashStrength = strength;
        bus.emit('weather:thunder', { delay: 0.3 + distance * 4, strength });
      }
    }
    this.flash = Math.max(0, this.flash - dt * 7);
    for (let i = this.flashQueue.length - 1; i >= 0; i--) {
      this.flashQueue[i] -= dt;
      if (this.flashQueue[i] <= 0) {
        this.flash = Math.max(this.flash, this.flashStrength * (0.7 + Math.random() * 0.3));
        this.flashQueue.splice(i, 1);
      }
    }
  }

  private apply(): void {
    const a = WEATHER_PRESETS[this.from];
    const b = WEATHER_PRESETS[this.kind];
    const t = smoothstep(0, 1, this.blend);
    for (const k of KEYS) this.state[k] = lerp(a[k], b[k], t);
  }

  /** Label for the debug overlay. */
  get label(): string {
    return this.blend < 1 ? `${this.from} → ${this.kind} ${(this.blend * 100).toFixed(0)}%` : this.kind;
  }
}

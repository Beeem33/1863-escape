import { HazardConfig } from '../config/GameConfig';
import type { EventBus } from '../core/EventBus';
import type { Settings } from '../core/Settings';
import type { Player } from '../player/Player';
import { clamp, lerp } from '../utils/MathUtils';
import type { MapBlend } from '../world/MapManager';
import type { WeatherPreset } from '../config/WeatherConfig';
import { Ambience } from './Ambience';
import type { AmbienceProfile } from './AmbienceProfile';
import * as Sounds from './Sounds';
import { Synth } from './Synth';

const SPEED_OF_SOUND = 343;

/**
 * All game audio. Systems never call this directly — it listens to the
 * EventBus (footsteps, hits, pickups, pursuit cues, battle events) and the
 * Game feeds it the player state and current map blend each frame.
 *
 * Routing:  sources → [pan / distance filter] → sfx / ambience bus → master
 *                                            ↘ reverb send ↗
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private s!: Synth;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambienceBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbReturn!: GainNode;
  private ambience!: Ambience;
  private muted = false;
  private breathTimer = 0;
  private inhale = true;
  private heartTimer = 0;
  private stepSide = 1;
  private readonly mixed: AmbienceProfile = { wind: 0, birds: 0, insects: 0, frogs: 0, water: 0, trees: 0, battle: 0, fire: 0, drone: 0, dronePitch: 55 };
  private danger = 0;
  /** Breathing / heartbeat only while actually running. */
  active = false;

  constructor(
    private readonly bus: EventBus,
    private readonly settings: Settings,
  ) {
    // Browsers only allow audio after a user gesture.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    settings.onChange(() => this.applyVolumes());
    if (new URLSearchParams(location.search).has('mute')) this.muted = true;
    this.wire();
  }

  private unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no audio support — the game is still playable
    }
    this.s = new Synth(this.ctx);
    this.master = this.s.gain(0);
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.sfx = this.s.gain(1);
    this.ambienceBus = this.s.gain(1);
    this.sfx.connect(this.master);
    this.ambienceBus.connect(this.master);
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.s.impulse(2.8, 2.6);
    this.reverbReturn = this.s.gain(0.5);
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
    this.ambience = new Ambience(this.s, this.ambienceBus, this.reverb);
    this.applyVolumes();
    this.master.gain.setTargetAtTime(this.targetMaster(), this.ctx.currentTime, 1.5);
  }

  private targetMaster(): number {
    return this.muted ? 0 : this.settings.data.masterVolume;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.targetMaster(), t, 0.1);
    this.ambienceBus.gain.setTargetAtTime(this.settings.data.ambienceVolume, t, 0.1);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  /** Pause: suspend everything. */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else if (!document.hidden) void this.ctx.resume();
  }

  /**
   * A spatialised input node: gain by distance, lowpass by distance, stereo
   * pan, optional delay (sound travels at 343 m/s), plus a reverb send that
   * grows with distance.
   */
  private spatial(distance: number, pan: number, gain = 1, useDelay = false): AudioNode {
    const s = this.s;
    const att = gain / (1 + distance / 18);
    const g = s.gain(att);
    const f = s.filter('lowpass', clamp(18000 / (1 + distance / 25), 500, 18000));
    const p = s.pan(pan);
    let head: AudioNode = g;
    if (useDelay && distance > 15) {
      const d = this.ctx!.createDelay(5);
      d.delayTime.value = Math.min(4.5, distance / SPEED_OF_SOUND);
      s.chain(d, g);
      head = d;
    }
    s.chain(g, f, p, this.sfx);
    const send = s.gain(clamp(distance / 120, 0.05, 0.8));
    p.connect(send);
    send.connect(this.reverb);
    return head;
  }

  private get t(): number {
    return this.ctx!.currentTime;
  }

  private wire(): void {
    const ok = () => this.ctx !== null && this.ctx.state === 'running';
    this.bus.on('player:footstep', (e) => {
      if (!ok()) return;
      this.stepSide = -this.stepSide;
      Sounds.footstep(this.s, this.spatial(0, this.stepSide * 0.15, 1), this.t, e.surface, e.intensity);
    });
    this.bus.on('player:land', (e) => {
      if (!ok()) return;
      Sounds.footstep(this.s, this.spatial(0, 0, 1.4), this.t, e.surface, 0.8 + e.impact);
      if (e.impact > 0.5) Sounds.breath(this.s, this.spatial(0, 0), this.t, false, 0.8, 0.3);
    });
    this.bus.on('player:jump', () => {
      if (!ok()) return;
      Sounds.breath(this.s, this.spatial(0, 0), this.t, true, 0.9, 0.22);
    });
    this.bus.on('player:hit', (e) => {
      if (!ok()) return;
      const wood = !['crater', 'trench', 'ditch', 'rock', 'artillery'].includes(e.obstacle);
      if (e.obstacle !== 'artillery') Sounds.impact(this.s, this.spatial(0, 0, 1), this.t, wood, Math.min(1, e.severity));
      Sounds.grunt(this.s, this.spatial(0, 0), this.t + 0.03, 120 + Math.random() * 30, Math.min(1, e.severity));
    });
    this.bus.on('player:fall', (e) => {
      if (!ok()) return;
      const out = this.spatial(0, 0, 1);
      if (e.stage === 'trip') Sounds.breath(this.s, out, this.t, true, 1, 0.35);
      else if (e.stage === 'impact') {
        Sounds.impact(this.s, out, this.t, false, 1);
        Sounds.footstep(this.s, out, this.t + 0.05, 'dirt', 1.6);
        Sounds.grunt(this.s, out, this.t + 0.04, 105, 1);
      } else {
        Sounds.grunt(this.s, out, this.t, 125, 0.8);
      }
    });
    this.bus.on('player:sprint', (e) => {
      if (!ok() || !e.active) return;
      Sounds.breath(this.s, this.spatial(0, 0), this.t, true, 1, 0.3);
    });
    this.bus.on('collectible:pickup', (e) => {
      if (!ok()) return;
      Sounds.pickup(this.s, this.spatial(0, 0, 1), this.t, e.type);
    });
    this.bus.on('pursuit:cue', (e) => {
      if (!ok()) return;
      // Behind the player: muffled a little more than the raw distance suggests.
      const out = this.spatial(e.distance * 1.2 + 5, e.pan, 1.6);
      switch (e.kind) {
        case 'shout':
          Sounds.shout(this.s, out, this.t);
          break;
        case 'dog':
          Sounds.dog(this.s, out, this.t);
          break;
        case 'horse':
          Sounds.hooves(this.s, out, this.t, 1.2 + Math.random());
          break;
        case 'gunshot':
          Sounds.gunshot(this.s, this.spatial(e.distance + 10, e.pan, 1.4, true), this.t, 1);
          break;
        case 'whistle':
          Sounds.whistle(this.s, out, this.t);
          break;
      }
    });
    this.bus.on('level:up', () => {
      if (!ok()) return;
      Sounds.sting(this.s, this.spatial(0, 0, 1), this.t);
    });
    this.bus.on('weather:thunder', (e) => {
      if (!ok()) return;
      Sounds.thunder(this.s, this.spatial(20 + (1 - e.strength) * 300, Math.random() * 1.6 - 0.8, 1.6), this.t + e.delay, e.strength);
    });
    this.bus.on('pursuit:danger', (e) => (this.danger = e.level));
    this.bus.on('battle:volley', (e) => {
      if (!ok()) return;
      if (e.distance < 8) {
        Sounds.whiz(this.s, this.spatial(2, e.pan, 1), this.t);
        return;
      }
      for (let i = 0; i < Math.min(e.count, 8); i++) {
        Sounds.gunshot(this.s, this.spatial(e.distance, e.pan, 1.2, true), this.t + Math.random() * 0.6, 0.6 + Math.random() * 0.4);
      }
    });
    this.bus.on('battle:cannon', (e) => {
      if (!ok()) return;
      Sounds.cannon(this.s, this.spatial(e.distance, e.pan, 1.8, true), this.t, 1);
    });
    this.bus.on('battle:artillery', (e) => {
      if (!ok() || !e.incoming) return;
      Sounds.shellWhistle(this.s, this.spatial(Math.max(5, e.distance * 0.5), 0, 1.2), this.t, HazardConfig.artilleryWarning);
    });
    this.bus.on('battle:explosion', (e) => {
      if (!ok()) return;
      Sounds.explosion(this.s, this.spatial(Math.max(4, e.distance), 0, 1.3, true), this.t, e.strength);
    });
  }

  /** Per-frame: blend the ambience to the current map, breathe, heartbeat. */
  update(dt: number, blend: MapBlend, player: Player, running: boolean, weather: WeatherPreset | null = null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const a = blend.a.ambience;
    const b = blend.b.ambience;
    const m = this.mixed as unknown as Record<string, number>;
    for (const k of Object.keys(m)) m[k] = lerp((a as unknown as Record<string, number>)[k], (b as unknown as Record<string, number>)[k], blend.t);
    this.ambience.setProfile(this.mixed, running ? this.danger : 0);
    this.ambience.setWeather(weather?.rain ?? 0, weather?.wind ?? 1);
    this.ambience.update(dt);
    // A swampier, wetter space has more reverb.
    this.reverbReturn.gain.setTargetAtTime(0.35 + this.mixed.frogs * 0.3 + this.mixed.battle * 0.25, this.t, 1);

    if (!running || !this.active) return;

    // Breathing: faster and harder with effort.
    const effort = player.sprinting ? 1 : player.exhausted ? 0.95 : clamp(0.25 + (1 - player.staminaFraction) * 0.5, 0, 0.8);
    this.breathTimer -= dt;
    if (this.breathTimer <= 0) {
      const period = lerp(1.15, 0.42, effort);
      this.breathTimer = period;
      Sounds.breath(this.s, this.spatial(0, 0, 1), this.t, this.inhale, effort, period * 0.85);
      this.inhale = !this.inhale;
    }

    // Heartbeat when the pursuers are close.
    if (this.danger > 0.3) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = lerp(0.95, 0.5, this.danger);
        Sounds.heartbeat(this.s, this.spatial(0, 0, 1), this.t, this.danger);
      }
    }
  }
}

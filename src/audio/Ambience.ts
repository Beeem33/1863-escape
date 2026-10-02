import type { AmbienceProfile } from './AmbienceProfile';
import * as Sounds from './Sounds';
import type { Synth } from './Synth';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * The bed of environmental sound. Continuous layers (wind, cicadas, water,
 * rustling leaves, the distant battle, fire, the tension drone) are always
 * running and simply cross-faded; sparse events (bird calls, crows, crickets,
 * frogs, creaking trunks, far-off gunfire) are scheduled randomly at a rate
 * set by the current map's AmbienceProfile.
 */
export class Ambience {
  private readonly layers: Record<string, GainNode> = {};
  private readonly droneVoices: { osc: OscillatorNode; mul: number }[] = [];
  private readonly wanderers: { param: AudioParam; min: number; max: number; period: number }[] = [];
  private readonly tensionGain: GainNode;
  private readonly tensionOsc: OscillatorNode;
  private profile: AmbienceProfile = { wind: 0, birds: 0, insects: 0, frogs: 0, water: 0, trees: 0, battle: 0, fire: 0, drone: 0, dronePitch: 55 };
  private timers: Record<string, number> = {};
  private danger = 0;

  constructor(
    private readonly s: Synth,
    private readonly out: AudioNode,
    private readonly reverb: AudioNode,
  ) {
    const now = s.now;
    // Wind: brown noise, slowly wandering lowpass.
    this.loop('wind', 'brown', [s.filter('lowpass', 420, 0.5)], 0.5, (f) => this.wander(f[0].frequency, 250, 700, 7));
    // Cicadas: high band of noise, amplitude-pulsed.
    const cic = this.loop('insects', 'white', [s.filter('bandpass', 4800, 6)], 0.25);
    const pulse = s.osc('sine', 38);
    const pg = s.gain(0.5);
    pulse.connect(pg);
    pg.connect(cic.gain);
    pulse.start(now);
    // Water: lapping, mid band.
    this.loop('water', 'pink', [s.filter('bandpass', 700, 0.8)], 0.5, (f) => this.wander(f[0].frequency, 450, 1100, 3));
    // Leaves: bright rustle with gusts.
    this.loop('trees', 'pink', [s.filter('highpass', 1800, 0.5)], 0.18);
    // Distant battle: low rolling rumble.
    this.loop('battle', 'brown', [s.filter('lowpass', 140, 0.7)], 1.1);
    // Fire: low roar.
    this.loop('fire', 'brown', [s.filter('bandpass', 300, 0.6)], 0.4);

    // Drone: two detuned voices a fifth apart through a soft filter.
    const droneOut = s.gain(0);
    const dlp = s.filter('lowpass', 380, 0.6);
    dlp.connect(droneOut);
    droneOut.connect(out);
    for (const [mul, det] of [
      [1, -6],
      [1, 5],
      [1.5, 3],
      [0.5, 0],
    ]) {
      const o = s.osc(mul === 0.5 ? 'sine' : 'sawtooth', 55 * mul);
      o.detune.value = det;
      const g = s.gain(mul === 0.5 ? 0.6 : 0.12);
      s.chain(o, g, dlp);
      o.start(now);
      this.droneVoices.push({ osc: o, mul });
    }
    this.layers.drone = droneOut;
    // Tension: a dissonant high voice that rises as the pursuers close in.
    this.tensionOsc = s.osc('triangle', 466);
    this.tensionGain = s.gain(0);
    s.chain(this.tensionOsc, s.filter('lowpass', 1200), this.tensionGain, out);
    this.tensionOsc.start(now);
  }

  private loop(name: string, color: 'white' | 'pink' | 'brown', filters: BiquadFilterNode[], trim: number, extra?: (f: BiquadFilterNode[]) => void): GainNode {
    const src = this.s.noise(color, true);
    const g = this.s.gain(0);
    const trimNode = this.s.gain(trim);
    this.s.chain(src, ...filters, trimNode, g, this.out);
    src.start(this.s.now);
    this.layers[name] = g;
    extra?.(filters);
    return trimNode;
  }

  /** Slowly sweep a parameter between min and max (re-targeted in update()). */
  private wander(param: AudioParam, min: number, max: number, period: number): void {
    this.wanderers.push({ param, min, max, period });
  }

  setProfile(p: AmbienceProfile, danger: number): void {
    this.profile = p;
    this.danger = danger;
  }

  update(dt: number): void {
    const s = this.s;
    const t = s.now;
    const p = this.profile;
    const smooth = 1.2;
    const gust = 0.75 + 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.13);
    this.layers.wind.gain.setTargetAtTime(p.wind * gust, t, smooth);
    this.layers.insects.gain.setTargetAtTime(p.insects * 0.6, t, smooth);
    this.layers.water.gain.setTargetAtTime(p.water * 0.7, t, smooth);
    this.layers.trees.gain.setTargetAtTime(p.trees * gust * 0.8, t, smooth);
    this.layers.battle.gain.setTargetAtTime(p.battle * (0.8 + 0.4 * Math.sin(t * 0.21)), t, smooth);
    this.layers.fire.gain.setTargetAtTime(p.fire * 0.4, t, smooth);
    this.layers.drone.gain.setTargetAtTime(p.drone * (0.12 + this.danger * 0.12), t, 2);
    for (const v of this.droneVoices) v.osc.frequency.setTargetAtTime(p.dronePitch * v.mul, t, 3);
    this.tensionGain.gain.setTargetAtTime(this.danger * this.danger * 0.05 * (0.6 + p.drone), t, 0.8);
    this.tensionOsc.frequency.setTargetAtTime(p.dronePitch * 8.47 + this.danger * 12, t, 1);

    for (const w of this.wanderers) {
      w.param.setTargetAtTime(w.min + (w.max - w.min) * (0.5 + 0.5 * Math.sin(t / w.period + w.min)), t, w.period / 3);
    }

    // ---- Sparse events ----------------------------------------------------
    this.every('bird', dt, p.birds, 0.9, 3.5, () => this.birdCall(t));
    this.every('crow', dt, p.birds * (p.battle > 0.2 ? 0 : 0.35), 5, 14, () => this.crow(t));
    this.every('cricket', dt, p.insects, 0.6, 2.5, () => this.cricket(t));
    this.every('frog', dt, p.frogs, 0.4, 2.2, () => this.frog(t));
    this.every('creak', dt, p.trees, 6, 16, () => this.creak(t));
    this.every('farGun', dt, p.battle, 0.25, 1.6, () => {
      const out = this.distant(rand(-0.9, 0.9), rand(0.08, 0.2), 1600);
      Sounds.gunshot(s, out, t + rand(0, 0.2), rand(0.4, 1));
    });
    this.every('farCannon', dt, p.battle, 2.5, 7, () => {
      const out = this.distant(rand(-1, 1), rand(0.25, 0.5), 500);
      Sounds.cannon(s, out, t, rand(0.6, 1));
    });
    this.every('crackle', dt, p.fire, 0.05, 0.25, () => {
      const out = this.distant(rand(-0.6, 0.6), 0.25, 4000);
      const n = s.noise('white');
      const g = s.gain(0);
      s.chain(n, s.filter('bandpass', rand(1500, 4000), 3), g, out);
      s.envelope(g.gain, t, 0.001, 0.02, rand(0.1, 0.4));
      n.start(t, Math.random());
      n.stop(t + 0.05);
    });
  }

  /** Fire `fn` at random intervals [min, max] seconds, scaled down by `level`. */
  private every(key: string, dt: number, level: number, min: number, max: number, fn: () => void): void {
    if (level <= 0.02) return;
    this.timers[key] = (this.timers[key] ?? rand(min, max)) - dt * level;
    if (this.timers[key] > 0) return;
    this.timers[key] = rand(min, max);
    fn();
  }

  /** A short spatial chain: pan → distance lowpass → gain → out (+ reverb send). */
  private distant(pan: number, gain: number, cutoff: number): AudioNode {
    const s = this.s;
    const g = s.gain(gain);
    const f = s.filter('lowpass', cutoff);
    const p = s.pan(pan);
    s.chain(g, f, p, this.out);
    const send = s.gain(0.5);
    p.connect(send);
    send.connect(this.reverb);
    return g;
  }

  private birdCall(t: number): void {
    const s = this.s;
    const out = this.distant(rand(-1, 1), rand(0.05, 0.13), 9000);
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = rand(2200, 4200);
    const style = Math.random();
    for (let i = 0; i < notes; i++) {
      const nt = t + i * rand(0.09, 0.16);
      const o = s.osc('sine', base);
      if (style < 0.5) {
        o.frequency.setValueAtTime(base * 1.3, nt);
        o.frequency.exponentialRampToValueAtTime(base * 0.75, nt + 0.08);
      } else {
        o.frequency.setValueAtTime(base * 0.8, nt);
        o.frequency.exponentialRampToValueAtTime(base * 1.25, nt + 0.06);
      }
      const g = s.gain(0);
      s.chain(o, g, out);
      s.envelope(g.gain, nt, 0.01, 0.08, 0.5);
      o.start(nt);
      o.stop(nt + 0.12);
    }
  }

  private crow(t: number): void {
    const s = this.s;
    const out = this.distant(rand(-1, 1), rand(0.06, 0.12), 3500);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const ct = t + i * rand(0.35, 0.5);
      const o = s.osc('sawtooth', rand(380, 460));
      o.frequency.exponentialRampToValueAtTime(300, ct + 0.25);
      const f = s.filter('bandpass', 1300, 3);
      const g = s.gain(0);
      s.chain(o, f, g, out);
      s.envelope(g.gain, ct, 0.02, 0.25, 0.6);
      o.start(ct);
      o.stop(ct + 0.32);
    }
  }

  private cricket(t: number): void {
    const s = this.s;
    const out = this.distant(rand(-1, 1), rand(0.02, 0.05), 9000);
    const f = rand(4200, 5200);
    for (let i = 0; i < 3; i++) {
      const ct = t + i * 0.05;
      const o = s.osc('sine', f);
      const g = s.gain(0);
      s.chain(o, g, out);
      s.envelope(g.gain, ct, 0.004, 0.03, 0.5);
      o.start(ct);
      o.stop(ct + 0.05);
    }
  }

  private frog(t: number): void {
    const s = this.s;
    if (Math.random() < 0.4) {
      // Bullfrog: low, buzzy "rumm".
      const out = this.distant(rand(-1, 1), rand(0.08, 0.16), 900);
      const o = s.osc('sawtooth', rand(95, 130));
      const am = s.osc('square', 26);
      const amg = s.gain(0.5);
      const g = s.gain(0);
      am.connect(amg);
      amg.connect(g.gain);
      s.chain(o, s.filter('lowpass', 500, 2), g, out);
      s.envelope(g.gain, t, 0.05, 0.5, 0.5);
      o.start(t);
      am.start(t);
      o.stop(t + 0.6);
      am.stop(t + 0.6);
    } else {
      // Peeper: a rising high chirp.
      const out = this.distant(rand(-1, 1), rand(0.02, 0.05), 8000);
      const o = s.osc('sine', 2600);
      o.frequency.setValueAtTime(2300, t);
      o.frequency.exponentialRampToValueAtTime(3100, t + 0.12);
      const g = s.gain(0);
      s.chain(o, g, out);
      s.envelope(g.gain, t, 0.02, 0.1, 0.5);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  private creak(t: number): void {
    const s = this.s;
    const out = this.distant(rand(-1, 1), rand(0.04, 0.08), 1500);
    const o = s.osc('sawtooth', rand(90, 160));
    o.frequency.linearRampToValueAtTime(rand(70, 200), t + 0.8);
    const f = s.filter('bandpass', 700, 8);
    const g = s.gain(0);
    s.chain(o, f, g, out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start(t);
    o.stop(t + 1);
  }
}

import type { Surface } from '../core/EventBus';
import type { Synth } from './Synth';

/**
 * One-shot sound recipes. Each takes a destination node (already spatialised
 * by the caller) and a start time, builds a tiny graph, and lets it be
 * garbage-collected when it finishes.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Footfall on a given surface. */
export function footstep(s: Synth, out: AudioNode, t: number, surface: Surface, intensity: number): void {
  const v = 0.35 * intensity;
  // Body: a low thump.
  const thump = s.osc('sine', surface === 'wood' ? rand(150, 190) : rand(70, 95));
  const tg = s.gain(0);
  thump.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  s.chain(thump, tg, out);
  s.envelope(tg.gain, t, 0.004, surface === 'wood' ? 0.16 : 0.09, v * (surface === 'wood' ? 0.9 : 0.7));
  thump.start(t);
  thump.stop(t + 0.25);

  // Texture: filtered noise burst shaped by the surface.
  const n = s.noise(surface === 'mud' || surface === 'water' ? 'brown' : 'white');
  const cfg: Record<Surface, [BiquadFilterType, number, number, number]> = {
    dirt: ['bandpass', 650, 0.9, 0.07],
    grass: ['highpass', 2400, 0.5, 0.09],
    mud: ['lowpass', 500, 2, 0.16],
    water: ['bandpass', 1400, 0.6, 0.22],
    wood: ['bandpass', 900, 2.5, 0.05],
  };
  const [type, freq, q, decay] = cfg[surface];
  const f = s.filter(type, freq * rand(0.85, 1.15), q);
  const g = s.gain(0);
  s.chain(n, f, g, out);
  s.envelope(g.gain, t, 0.005, decay, v * (surface === 'water' ? 1.3 : 0.9));
  n.start(t, Math.random() * 2);
  n.stop(t + decay + 0.1);
  if (surface === 'mud') {
    // Suction squelch.
    const sq = s.osc('sine', 220);
    const sg = s.gain(0);
    sq.frequency.setValueAtTime(140, t + 0.05);
    sq.frequency.exponentialRampToValueAtTime(420, t + 0.16);
    s.chain(sq, s.filter('lowpass', 600), sg, out);
    s.envelope(sg.gain, t + 0.05, 0.02, 0.1, v * 0.25);
    sq.start(t + 0.05);
    sq.stop(t + 0.3);
  }
}

/** One breath. Breathy "hhh" noise through a vocal-ish formant. */
export function breath(s: Synth, out: AudioNode, t: number, inhale: boolean, effort: number, length: number): void {
  const n = s.noise('pink');
  const f1 = s.filter('bandpass', inhale ? 1500 : 1000, 1.2);
  const f2 = s.filter('lowpass', 3200 + effort * 1500);
  const g = s.gain(0);
  s.chain(n, f1, f2, g, out);
  const peak = (inhale ? 0.16 : 0.24) * (0.35 + effort);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + length * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  n.start(t, Math.random() * 2);
  n.stop(t + length + 0.05);
}

/** A grunt of effort / pain (no words). */
export function grunt(s: Synth, out: AudioNode, t: number, pitch: number, strength: number): void {
  const o = s.osc('sawtooth', pitch);
  o.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + 0.22);
  const f1 = s.filter('bandpass', 700, 3);
  const f2 = s.filter('bandpass', 1150, 4);
  const mix = s.gain(1);
  const g = s.gain(0);
  o.connect(f1);
  o.connect(f2);
  f1.connect(mix);
  f2.connect(mix);
  s.chain(mix, s.filter('lowpass', 2200), g, out);
  s.envelope(g.gain, t, 0.015, 0.22, 0.16 * strength);
  o.start(t);
  o.stop(t + 0.35);
  breath(s, out, t, false, strength, 0.25);
}

/** Collision: heavy body impact + material crack. */
export function impact(s: Synth, out: AudioNode, t: number, wood: boolean, strength: number): void {
  const thud = s.osc('sine', 90);
  thud.frequency.exponentialRampToValueAtTime(35, t + 0.25);
  const tg = s.gain(0);
  s.chain(thud, tg, out);
  s.envelope(tg.gain, t, 0.003, 0.3, 0.9 * strength);
  thud.start(t);
  thud.stop(t + 0.4);
  const n = s.noise('white');
  const f = s.filter(wood ? 'bandpass' : 'lowpass', wood ? 1800 : 900, wood ? 1.5 : 0.7);
  const g = s.gain(0);
  s.chain(n, f, g, out);
  s.envelope(g.gain, t, 0.002, wood ? 0.12 : 0.2, 0.55 * strength);
  n.start(t);
  n.stop(t + 0.3);
  if (wood) {
    // Splintering crackle.
    for (let i = 0; i < 5; i++) {
      const c = s.noise('white');
      const cf = s.filter('bandpass', rand(2000, 4500), 4);
      const cg = s.gain(0);
      s.chain(c, cf, cg, out);
      const ct = t + 0.02 + i * rand(0.015, 0.04);
      s.envelope(cg.gain, ct, 0.001, 0.03, 0.25 * strength);
      c.start(ct, Math.random());
      c.stop(ct + 0.06);
    }
  }
}

/** Pickups — quiet, physical sounds rather than arcade chimes. */
export function pickup(s: Synth, out: AudioNode, t: number, kind: string): void {
  if (kind === 'mapPiece') {
    // Paper crinkle + a faint warm tone.
    for (let i = 0; i < 6; i++) {
      const n = s.noise('white');
      const f = s.filter('bandpass', rand(3000, 6000), 2);
      const g = s.gain(0);
      s.chain(n, f, g, out);
      const ct = t + i * rand(0.01, 0.03);
      s.envelope(g.gain, ct, 0.001, 0.025, 0.12);
      n.start(ct, Math.random());
      n.stop(ct + 0.05);
    }
    const tone = s.osc('sine', 392);
    const tg = s.gain(0);
    s.chain(tone, tg, out);
    s.envelope(tg.gain, t, 0.02, 0.5, 0.05);
    tone.start(t);
    tone.stop(t + 0.6);
  } else if (kind === 'water') {
    // Slosh.
    const n = s.noise('brown');
    const f = s.filter('bandpass', 700, 3);
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(1100, t + 0.15);
    f.frequency.linearRampToValueAtTime(500, t + 0.32);
    const g = s.gain(0);
    s.chain(n, f, g, out);
    s.envelope(g.gain, t, 0.03, 0.35, 0.5);
    n.start(t, Math.random());
    n.stop(t + 0.45);
    breath(s, out, t + 0.25, false, 0.6, 0.5); // relieved exhale
  } else if (kind === 'horseshoe') {
    // Iron clink: inharmonic partials.
    for (const [freq, amp] of [
      [1840, 0.08],
      [2950, 0.05],
      [4410, 0.03],
    ]) {
      const o = s.osc('sine', freq);
      const g = s.gain(0);
      s.chain(o, g, out);
      s.envelope(g.gain, t, 0.001, 0.6, amp);
      o.start(t);
      o.stop(t + 0.7);
    }
  } else if (kind === 'lantern') {
    const o = s.osc('sine', 2600);
    const g = s.gain(0);
    s.chain(o, g, out);
    s.envelope(g.gain, t, 0.001, 0.25, 0.05);
    o.start(t);
    o.stop(t + 0.3);
    const n = s.noise('pink');
    const ng = s.gain(0);
    s.chain(n, s.filter('lowpass', 900), ng, out);
    s.envelope(ng.gain, t + 0.05, 0.08, 0.4, 0.15); // flame catching
    n.start(t, Math.random());
    n.stop(t + 0.6);
  } else {
    // Cloth rustle.
    const n = s.noise('white');
    const g = s.gain(0);
    s.chain(n, s.filter('highpass', 2500), g, out);
    s.envelope(g.gain, t, 0.03, 0.18, 0.12);
    n.start(t, Math.random());
    n.stop(t + 0.3);
  }
}

/** A shouting voice in the distance — vowel formants, no words. */
export function shout(s: Synth, out: AudioNode, t: number): void {
  const syllables = Math.random() < 0.5 ? 1 : 2;
  for (let k = 0; k < syllables; k++) {
    const st = t + k * rand(0.35, 0.5);
    const pitch = rand(150, 230);
    const o = s.osc('sawtooth', pitch);
    o.frequency.setValueAtTime(pitch * 0.9, st);
    o.frequency.linearRampToValueAtTime(pitch * 1.12, st + 0.12);
    o.frequency.linearRampToValueAtTime(pitch * 0.85, st + 0.45);
    const vib = s.osc('sine', 6);
    const vg = s.gain(pitch * 0.02);
    vib.connect(vg);
    vg.connect(o.frequency);
    const [fa, fb] = Math.random() < 0.5 ? [750, 1150] : [550, 900];
    const f1 = s.filter('bandpass', fa, 5);
    const f2 = s.filter('bandpass', fb, 6);
    const mix = s.gain(1);
    o.connect(f1);
    o.connect(f2);
    f1.connect(mix);
    f2.connect(mix);
    const g = s.gain(0);
    s.chain(mix, g, out);
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(0.5, st + 0.05);
    g.gain.setValueAtTime(0.45, st + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.55);
    o.start(st);
    vib.start(st);
    o.stop(st + 0.6);
    vib.stop(st + 0.6);
  }
}

/** Hound: sharp barks or a long baying howl. */
export function dog(s: Synth, out: AudioNode, t: number): void {
  if (Math.random() < 0.35) {
    // Baying.
    const o = s.osc('sawtooth', 380);
    o.frequency.setValueAtTime(330, t);
    o.frequency.linearRampToValueAtTime(520, t + 0.35);
    o.frequency.linearRampToValueAtTime(400, t + 1.1);
    const f = s.filter('bandpass', 900, 3);
    const g = s.gain(0);
    s.chain(o, f, s.filter('lowpass', 2000), g, out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.15);
    g.gain.setValueAtTime(0.3, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.start(t);
    o.stop(t + 1.3);
    return;
  }
  const barks = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < barks; i++) {
    const bt = t + i * rand(0.18, 0.3);
    const o = s.osc('square', rand(420, 560));
    o.frequency.exponentialRampToValueAtTime(220, bt + 0.1);
    const f = s.filter('bandpass', 1100, 2);
    const g = s.gain(0);
    s.chain(o, f, g, out);
    s.envelope(g.gain, bt, 0.005, 0.11, 0.35);
    o.start(bt);
    o.stop(bt + 0.15);
    const n = s.noise('white');
    const ng = s.gain(0);
    s.chain(n, s.filter('bandpass', 1500, 1), ng, out);
    s.envelope(ng.gain, bt, 0.002, 0.06, 0.2);
    n.start(bt, Math.random());
    n.stop(bt + 0.1);
  }
}

/** Galloping hooves (+ sometimes a snort). */
export function hooves(s: Synth, out: AudioNode, t: number, seconds = 1.6): void {
  const stride = 0.36;
  for (let st = 0; st < seconds; st += stride) {
    for (const off of [0, 0.07, 0.15]) {
      const ht = t + st + off + rand(-0.01, 0.01);
      const n = s.noise('brown');
      const f = s.filter('lowpass', 380, 1);
      const g = s.gain(0);
      s.chain(n, f, g, out);
      s.envelope(g.gain, ht, 0.003, 0.08, 0.55);
      n.start(ht, Math.random());
      n.stop(ht + 0.12);
    }
  }
  if (Math.random() < 0.4) {
    const n = s.noise('pink');
    const g = s.gain(0);
    s.chain(n, s.filter('bandpass', 600, 1.5), g, out);
    s.envelope(g.gain, t + seconds * 0.5, 0.05, 0.3, 0.25);
    n.start(t + seconds * 0.5, Math.random());
    n.stop(t + seconds * 0.5 + 0.4);
  }
}

/** A human whistle signal. */
export function whistle(s: Synth, out: AudioNode, t: number): void {
  const o = s.osc('sine', 1900);
  o.frequency.setValueAtTime(1500, t);
  o.frequency.linearRampToValueAtTime(2300, t + 0.25);
  o.frequency.setValueAtTime(2300, t + 0.4);
  o.frequency.linearRampToValueAtTime(1700, t + 0.6);
  const g = s.gain(0);
  s.chain(o, g, out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.05);
  g.gain.setValueAtTime(0.1, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  o.start(t);
  o.stop(t + 0.7);
}

/** Musket / rifle shot. */
export function gunshot(s: Synth, out: AudioNode, t: number, strength = 1): void {
  const n = s.noise('white');
  const g = s.gain(0);
  s.chain(n, s.filter('lowpass', 5000), g, out);
  s.envelope(g.gain, t, 0.001, 0.18, 0.8 * strength);
  n.start(t, Math.random());
  n.stop(t + 0.3);
  const boom = s.osc('sine', 110);
  boom.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  const bg = s.gain(0);
  s.chain(boom, bg, out);
  s.envelope(bg.gain, t, 0.002, 0.25, 0.6 * strength);
  boom.start(t);
  boom.stop(t + 0.35);
  const tail = s.noise('brown');
  const tg = s.gain(0);
  s.chain(tail, s.filter('lowpass', 400), tg, out);
  s.envelope(tg.gain, t + 0.02, 0.05, 1.0, 0.25 * strength);
  tail.start(t, Math.random());
  tail.stop(t + 1.2);
}

/** Cannon: a deep concussive boom with a long rolling tail. */
export function cannon(s: Synth, out: AudioNode, t: number, strength = 1): void {
  const boom = s.osc('sine', 62);
  boom.frequency.exponentialRampToValueAtTime(28, t + 0.8);
  const bg = s.gain(0);
  s.chain(boom, bg, out);
  s.envelope(bg.gain, t, 0.005, 1.4, 1.0 * strength);
  boom.start(t);
  boom.stop(t + 1.6);
  const n = s.noise('brown');
  const ng = s.gain(0);
  s.chain(n, s.filter('lowpass', 260, 0.8), ng, out);
  s.envelope(ng.gain, t, 0.01, 2.6, 0.9 * strength);
  n.start(t, Math.random());
  n.stop(t + 2.8);
  const crack = s.noise('white');
  const cg = s.gain(0);
  s.chain(crack, s.filter('lowpass', 2500), cg, out);
  s.envelope(cg.gain, t, 0.001, 0.12, 0.6 * strength);
  crack.start(t, Math.random());
  crack.stop(t + 0.2);
}

/** Incoming shell: a falling whistle lasting `duration`. */
export function shellWhistle(s: Synth, out: AudioNode, t: number, duration: number): void {
  const o = s.osc('sine', 1900);
  o.frequency.setValueAtTime(1900, t);
  o.frequency.exponentialRampToValueAtTime(520, t + duration);
  const g = s.gain(0);
  s.chain(o, g, out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + duration * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.02);
  o.start(t);
  o.stop(t + duration + 0.05);
  const n = s.noise('white');
  const ng = s.gain(0);
  const f = s.filter('bandpass', 2000, 3);
  f.frequency.exponentialRampToValueAtTime(600, t + duration);
  s.chain(n, f, ng, out);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.12, t + duration);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.02);
  n.start(t, Math.random());
  n.stop(t + duration + 0.05);
}

/** Shell burst: cannon boom plus thrown dirt raining down. */
export function explosion(s: Synth, out: AudioNode, t: number, strength = 1): void {
  cannon(s, out, t, 1.2 * strength);
  for (let i = 0; i < 14; i++) {
    const dt = t + 0.25 + Math.random() * 1.1;
    const n = s.noise('white');
    const g = s.gain(0);
    s.chain(n, s.filter('bandpass', rand(800, 2500), 1.2), g, out);
    s.envelope(g.gain, dt, 0.002, 0.05, 0.12 * strength);
    n.start(dt, Math.random());
    n.stop(dt + 0.08);
  }
}

/** Musket ball passing close: a short descending zip. */
export function whiz(s: Synth, out: AudioNode, t: number): void {
  const n = s.noise('white');
  const f = s.filter('bandpass', 4000, 6);
  f.frequency.setValueAtTime(5500, t);
  f.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
  const g = s.gain(0);
  s.chain(n, f, g, out);
  s.envelope(g.gain, t, 0.03, 0.15, 0.35);
  n.start(t, Math.random());
  n.stop(t + 0.25);
  // Dirt kicked up.
  const d = s.noise('brown');
  const dg = s.gain(0);
  s.chain(d, s.filter('lowpass', 900), dg, out);
  s.envelope(dg.gain, t + 0.16, 0.002, 0.12, 0.35);
  d.start(t + 0.16, Math.random());
  d.stop(t + 0.35);
}

/** Heartbeat (lub-dub). */
export function heartbeat(s: Synth, out: AudioNode, t: number, strength: number): void {
  for (const [off, amp] of [
    [0, 1],
    [0.16, 0.7],
  ]) {
    const o = s.osc('sine', 52);
    o.frequency.exponentialRampToValueAtTime(34, t + off + 0.12);
    const g = s.gain(0);
    s.chain(o, s.filter('lowpass', 120), g, out);
    s.envelope(g.gain, t + off, 0.01, 0.16, 0.7 * amp * strength);
    o.start(t + off);
    o.stop(t + off + 0.25);
  }
}

/** Thunder: an optional sharp crack, then a long rolling rumble. */
export function thunder(s: Synth, out: AudioNode, t: number, strength: number): void {
  if (strength > 0.65) {
    const crack = s.noise('white');
    const cg = s.gain(0);
    s.chain(crack, s.filter('lowpass', 3000), cg, out);
    s.envelope(cg.gain, t, 0.005, 0.35, 0.6 * strength);
    crack.start(t, Math.random());
    crack.stop(t + 0.5);
  }
  const n = s.noise('brown');
  const f = s.filter('lowpass', 180, 0.7);
  const g = s.gain(0);
  s.chain(n, f, g, out);
  const len = 3 + strength * 3;
  g.gain.setValueAtTime(0.0001, t);
  // Rolling: several swells as the sound comes back off the clouds.
  let at = t;
  for (let i = 0; i < 4; i++) {
    const peak = (0.9 - i * 0.18) * strength;
    g.gain.linearRampToValueAtTime(Math.max(0.02, peak), at + 0.15 + Math.random() * 0.3);
    at += len / 4;
    g.gain.linearRampToValueAtTime(Math.max(0.01, peak * 0.4), at);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1);
  n.start(t, Math.random());
  n.stop(t + len + 1.2);
}

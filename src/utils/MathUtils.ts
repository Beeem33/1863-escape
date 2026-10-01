export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = invLerp(edge0, edge1, x);
  return t * t * (3 - 2 * t);
};

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is roughly "how many times per second the gap closes by ~63%".
 */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Move `current` toward `target` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
};

export const TAU = Math.PI * 2;

export const formatDistance = (meters: number): string => `${Math.floor(meters).toLocaleString('en-US')} m`;

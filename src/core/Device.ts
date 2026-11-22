/**
 * True on phones and tablets: the main input is a finger (no hover, coarse
 * pointer). A laptop with a touch screen and a mouse/trackpad is NOT a touch
 * device here, so desktop play is never affected.
 */
export const isTouchDevice: boolean =
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

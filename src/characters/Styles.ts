/**
 * Appearances (tints applied to the body-part masks). Colours are sRGB hex.
 * Add a new kind of person by adding a style here.
 */
export type HatKind = 'none' | 'kepi' | 'slouch';

export interface HumanStyle {
  skin: number;
  coat: number;
  sleeves: number;
  trousers: number;
  feet: number;
  hat: HatKind;
  hatColor: number;
  rifle: boolean;
  pack: boolean;
  /** Body proportions (1 = average). */
  build: number;
}

/** A spread of period-plausible skin tones. */
export const SKIN = {
  light: [0xe1bfa4, 0xd6ae90, 0xc99d7f, 0xe8c7ae],
  dark: [0x3d2519, 0x4a2c1d, 0x5a3624, 0x33201a],
};

const pick = <T>(list: T[], r: number): T => list[Math.floor(r * list.length) % list.length];

export const Styles = {
  /** Union infantry: dark blue sack coat, sky-blue trousers, kepi. Some are USCT soldiers. */
  union(r: number): HumanStyle {
    const usct = r < 0.22;
    return {
      skin: usct ? pick(SKIN.dark, r * 7) : pick(SKIN.light, r * 5),
      coat: 0x232c46,
      sleeves: 0x232c46,
      trousers: r > 0.85 ? 0x2a3350 : 0x6f7e9a,
      feet: 0x1b1714,
      hat: 'kepi',
      hatColor: 0x222a40,
      rifle: true,
      pack: r > 0.3,
      build: 0.95 + r * 0.1,
    };
  },

  /** Confederate infantry: grey or butternut, kepi or slouch hat, irregular. */
  confederate(r: number): HumanStyle {
    const butternut = r > 0.5;
    const coat = butternut ? 0x8a7350 : 0x6e6a60;
    return {
      skin: pick(SKIN.light, r * 9),
      coat,
      sleeves: coat,
      trousers: r > 0.7 ? 0x5c5244 : butternut ? 0x6e5c40 : 0x5e5a52,
      feet: r > 0.9 ? 0x6a4a30 : 0x1d1915,
      hat: r > 0.45 ? 'slouch' : 'kepi',
      hatColor: r > 0.45 ? 0x3a3128 : 0x5e5a52,
      rifle: true,
      pack: r > 0.6,
      build: 0.95 + r * 0.1,
    };
  },

  /** Slave catcher / patroller: dark frock coat, broad hat, long gun. */
  catcher(r: number): HumanStyle {
    return {
      skin: pick(SKIN.light, r * 3),
      coat: r > 0.5 ? 0x2b241d : 0x3a3024,
      sleeves: r > 0.5 ? 0x2b241d : 0x3a3024,
      trousers: 0x4a3c2c,
      feet: 0x1a1612,
      hat: 'slouch',
      hatColor: 0x1d1915,
      rifle: true,
      pack: false,
      build: 1.0 + r * 0.08,
    };
  },

  /** Someone else running for freedom: undyed osnaburg shirt, worn trousers, barefoot. */
  runner(r: number): HumanStyle {
    return {
      skin: pick(SKIN.dark, r * 4),
      coat: 0xb4a78b,
      sleeves: 0xb4a78b,
      trousers: r > 0.5 ? 0x5a4632 : 0x6b5e48,
      feet: pick(SKIN.dark, r * 4),
      hat: r > 0.7 ? 'slouch' : 'none',
      hatColor: 0x8a7a50,
      rifle: false,
      pack: false,
      build: 0.95 + r * 0.08,
    };
  },
};

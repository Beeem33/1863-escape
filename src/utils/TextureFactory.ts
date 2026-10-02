import * as THREE from 'three';
import { Random } from './Random';

/**
 * Procedurally painted textures. Generating them at startup keeps the
 * repository asset-free and lets every texture tile seamlessly.
 * Each texture is created once and cached.
 */

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: Random) => void;

const cache = new Map<string, THREE.Texture>();

function canvasTexture(
  key: string,
  w: number,
  h: number,
  paint: Painter,
  opts: { repeat?: boolean; srgb?: boolean; mipmaps?: boolean } = {},
): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  paint(ctx, w, h, new Random(key.length * 7919 + w * 31 + h));
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.repeat !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = opts.mipmaps !== false;
  cache.set(key, tex);
  return tex;
}

/** Tileable value noise (period = `period` lattice cells). */
function periodicNoise(rng: Random, period: number): (x: number, y: number) => number {
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const at = (ix: number, iy: number) => lattice[(((iy % period) + period) % period) * period + (((ix % period) + period) % period)];
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

function fbmField(rng: Random, w: number, h: number, baseCells: number, octaves: number): Float32Array {
  const out = new Float32Array(w * h);
  const layers = Array.from({ length: octaves }, (_, o) => periodicNoise(rng, baseCells << o));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      let amp = 1;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const cells = baseCells << o;
        v += layers[o]((x / w) * cells, (y / h) * cells) * amp;
        norm += amp;
        amp *= 0.5;
      }
      out[y * w + x] = v / norm;
    }
  }
  return out;
}

export const Textures = {
  /** Gritty grayscale detail for the ground (multiplies vertex colours). */
  ground(): THREE.Texture {
    return canvasTexture('ground', 256, 256, (ctx, w, h, rng) => {
      const field = fbmField(rng, w, h, 4, 5);
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        let v = 0.72 + field[i] * 0.42;
        if (rng.next() < 0.018) v *= 0.7 + rng.next() * 0.2; // pebbles / clods
        const c = Math.min(255, v * 235);
        img.data[i * 4] = c;
        img.data[i * 4 + 1] = c * 0.98;
        img.data[i * 4 + 2] = c * 0.95;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      // Faint drag marks / footprints.
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = '#000';
      for (let i = 0; i < 40; i++) {
        ctx.lineWidth = 0.5 + rng.next() * 1.5;
        ctx.beginPath();
        const x = rng.next() * w;
        const y = rng.next() * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x + rng.range(-6, 6), y + rng.range(8, 30));
        ctx.stroke();
      }
    });
  },

  /** Vertical bark furrows. */
  bark(): THREE.Texture {
    return canvasTexture('bark', 128, 256, (ctx, w, h, rng) => {
      const img = ctx.createImageData(w, h);
      const n = periodicNoise(rng, 16);
      const n2 = periodicNoise(rng, 8);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const furrow = Math.abs(Math.sin((u * 14 + n(u * 16, v * 3) * 1.6) * Math.PI));
          const grain = n2(u * 8, v * 8);
          const c = 70 + furrow * 90 + grain * 50;
          const i = (y * w + x) * 4;
          img.data[i] = c;
          img.data[i + 1] = c * 0.9;
          img.data[i + 2] = c * 0.8;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  },

  /** Weathered wooden planks (fences, wagons, barrels, cabins). */
  wood(): THREE.Texture {
    return canvasTexture('wood', 256, 256, (ctx, w, h, rng) => {
      const img = ctx.createImageData(w, h);
      const n = periodicNoise(rng, 32);
      const planks = 6;
      const plankShade = Array.from({ length: planks }, () => 0.8 + rng.next() * 0.35);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const p = Math.floor(v * planks);
          const inPlank = (v * planks) % 1;
          const seam = inPlank < 0.04 || inPlank > 0.96 ? 0.45 : 1;
          const grain = 0.75 + 0.25 * Math.sin((u * 40 + n(u * 32, v * 6 + p * 3) * 6) * Math.PI);
          const c = 150 * plankShade[p] * grain * seam;
          const i = (y * w + x) * 4;
          img.data[i] = c;
          img.data[i + 1] = c * 0.86;
          img.data[i + 2] = c * 0.7;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  },

  /** Rough canvas weave (wagon covers, tents). */
  cloth(): THREE.Texture {
    return canvasTexture('cloth', 128, 128, (ctx, w, h, rng) => {
      const img = ctx.createImageData(w, h);
      const n = periodicNoise(rng, 8);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const weave = ((x + y) % 2) * 0.06 + (x % 3 === 0 ? 0.04 : 0);
          const c = (0.78 + n((x / w) * 8, (y / h) * 8) * 0.25 - weave) * 230;
          const i = (y * w + x) * 4;
          img.data[i] = c;
          img.data[i + 1] = c * 0.95;
          img.data[i + 2] = c * 0.85;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  },

  /** Clusters of leaves with alpha — used on foliage "cards". White-ish so instances can tint it. */
  leaves(): THREE.Texture {
    return canvasTexture(
      'leaves',
      256,
      256,
      (ctx, w, h, rng) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 520; i++) {
          // Denser toward the middle so cards read as clumps.
          const r = Math.sqrt(rng.next()) * 0.47;
          const a = rng.next() * Math.PI * 2;
          const x = w / 2 + Math.cos(a) * r * w;
          const y = h / 2 + Math.sin(a) * r * h;
          const s = 5 + rng.next() * 9;
          const shade = 120 + rng.next() * 135;
          ctx.fillStyle = `rgb(${shade * 0.78},${shade},${shade * 0.62})`;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rng.next() * Math.PI * 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // Little twigs.
        ctx.strokeStyle = 'rgba(70,55,40,0.9)';
        for (let i = 0; i < 14; i++) {
          ctx.lineWidth = 1 + rng.next() * 1.5;
          ctx.beginPath();
          ctx.moveTo(w / 2, h / 2);
          ctx.lineTo(w / 2 + rng.range(-0.4, 0.4) * w, h / 2 + rng.range(-0.4, 0.4) * h);
          ctx.stroke();
        }
      },
      { repeat: false },
    );
  },

  /** Spanish moss — long grey-green hanging strands. */
  moss(): THREE.Texture {
    return canvasTexture(
      'moss',
      128,
      256,
      (ctx, w, h, rng) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 160; i++) {
          let x = rng.range(0.1, 0.9) * w;
          let y = rng.range(0, 0.12) * h;
          const len = rng.range(0.35, 0.95) * h;
          const shade = 150 + rng.next() * 90;
          ctx.strokeStyle = `rgba(${shade * 0.92},${shade},${shade * 0.86},${0.55 + rng.next() * 0.45})`;
          ctx.lineWidth = 0.8 + rng.next() * 1.6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          const steps = 10;
          for (let s = 0; s < steps; s++) {
            x += rng.range(-3, 3);
            y += len / steps;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      },
      { repeat: false },
    );
  },

  /** Grass blades with alpha. */
  grass(): THREE.Texture {
    return canvasTexture(
      'grass',
      128,
      128,
      (ctx, w, h, rng) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) {
          const x = rng.range(0.08, 0.92) * w;
          const top = rng.range(0.05, 0.6) * h;
          const lean = rng.range(-18, 18);
          const shade = 110 + rng.next() * 145;
          ctx.strokeStyle = `rgb(${shade * 0.85},${shade},${shade * 0.6})`;
          ctx.lineWidth = 1 + rng.next() * 2;
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top);
          ctx.stroke();
        }
      },
      { repeat: false },
    );
  },

  /** A cotton plant painted on a card: dry stems, a few leaves and open white bolls. */
  cotton(): THREE.Texture {
    return canvasTexture(
      'cotton-tall',
      128,
      256,
      (ctx, w, h, rng) => {
        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = 'round';
        // A tall, woody plant: a few main stalks with side branches carrying bolls.
        const tips: [number, number][] = [];
        for (let i = 0; i < 5; i++) {
          const x0 = w / 2 + rng.range(-5, 5);
          const x1 = w / 2 + rng.range(-0.3, 0.3) * w;
          const y1 = rng.range(0.03, 0.2) * h;
          ctx.strokeStyle = `rgb(${82 + rng.next() * 30},${56 + rng.next() * 20},${36})`;
          ctx.lineWidth = 2 + rng.next() * 1.5;
          ctx.beginPath();
          ctx.moveTo(x0, h);
          ctx.quadraticCurveTo((x0 + x1) / 2 + rng.range(-10, 10), (h + y1) / 2, x1, y1);
          ctx.stroke();
          tips.push([x1, y1]);
          // Side branches along the stalk.
          for (let b = 0; b < 4; b++) {
            const t = rng.range(0.2, 0.8);
            const bx = x0 + (x1 - x0) * t;
            const by = h + (y1 - h) * t;
            const ex = bx + rng.range(-0.3, 0.3) * w;
            const ey = by - rng.range(10, 34);
            ctx.lineWidth = 1 + rng.next();
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo((bx + ex) / 2, by - 4, ex, ey);
            ctx.stroke();
            tips.push([ex, ey]);
          }
        }
        // Dry, reddening leaves.
        for (let i = 0; i < 46; i++) {
          const [tx, ty] = tips[i % tips.length];
          const g = 60 + rng.next() * 50;
          ctx.fillStyle = rng.chance(0.4) ? `rgb(${g * 1.4},${g * 0.75},${g * 0.4})` : `rgb(${g * 0.7},${g},${g * 0.45})`;
          ctx.beginPath();
          ctx.ellipse(tx + rng.range(-10, 10), ty + rng.range(-4, 24), rng.range(3, 7), rng.range(2, 4), rng.next() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        // Open bolls.
        for (const [tx, ty] of tips) {
          if (!rng.chance(0.8)) continue;
          const r = rng.range(4, 6.5);
          for (let k = 0; k < 4; k++) {
            const shade = 225 + rng.next() * 30;
            ctx.fillStyle = `rgb(${shade},${shade},${shade * 0.97})`;
            ctx.beginPath();
            ctx.arc(tx + rng.range(-r * 0.6, r * 0.6), ty + rng.range(-r * 0.6, r * 0.6), r * rng.range(0.6, 0.9), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
      { repeat: false },
    );
  },

  /** Reeds / cattails. */
  reeds(): THREE.Texture {
    return canvasTexture(
      'reeds',
      128,
      256,
      (ctx, w, h, rng) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) {
          const x = rng.range(0.1, 0.9) * w;
          const top = rng.range(0.02, 0.4) * h;
          const lean = rng.range(-14, 14);
          const g = 90 + rng.next() * 90;
          ctx.strokeStyle = `rgb(${g * 0.85},${g},${g * 0.55})`;
          ctx.lineWidth = 1.5 + rng.next() * 2;
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.quadraticCurveTo(x + lean * 0.2, (h + top) / 2, x + lean, top);
          ctx.stroke();
          if (rng.chance(0.25)) {
            ctx.fillStyle = '#4a3020';
            ctx.fillRect(x + lean - 2.5, top + 6, 5, 22);
          }
        }
      },
      { repeat: false },
    );
  },

  /** Soft smoke puff (white, alpha). */
  smoke(): THREE.Texture {
    return canvasTexture(
      'smoke',
      128,
      128,
      (ctx, w, h, rng) => {
        const img = ctx.createImageData(w, h);
        const n = periodicNoise(rng, 6);
        const n2 = periodicNoise(rng, 12);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = (x / w - 0.5) * 2;
            const dy = (y / h - 0.5) * 2;
            const r = Math.sqrt(dx * dx + dy * dy);
            const fall = Math.max(0, 1 - r);
            const v = n((x / w) * 6, (y / h) * 6) * 0.65 + n2((x / w) * 12, (y / h) * 12) * 0.35;
            const a = Math.max(0, fall * fall * (0.45 + v * 1.1) - 0.08);
            const i = (y * w + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
            img.data[i + 3] = Math.min(255, a * 255);
          }
        }
        ctx.putImageData(img, 0, 0);
      },
      { repeat: false },
    );
  },

  /** Radial glow (fire, sparks, sun-lit dust). */
  glow(): THREE.Texture {
    return canvasTexture(
      'glow',
      64,
      64,
      (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      },
      { repeat: false },
    );
  },

  /** Aged parchment with faint ink lines (map pieces). */
  parchment(): THREE.Texture {
    return canvasTexture('parchment', 128, 128, (ctx, w, h, rng) => {
      const img = ctx.createImageData(w, h);
      const n = periodicNoise(rng, 8);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = n((x / w) * 8, (y / h) * 8);
          const i = (y * w + x) * 4;
          img.data[i] = 205 + v * 40;
          img.data[i + 1] = 180 + v * 35;
          img.data[i + 2] = 125 + v * 30;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = 'rgba(60,35,20,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, h - 20);
      for (let i = 1; i < 8; i++) ctx.lineTo(10 + i * 15, h - 20 - i * 12 + rng.range(-8, 8));
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(w - 15, 40);
      ctx.stroke();
      // The North Star.
      ctx.fillStyle = 'rgba(60,35,20,0.9)';
      ctx.font = '22px serif';
      ctx.fillText('✦', w - 32, 26);
    });
  },

  /** 1863 United States flag (35 stars), weathered. */
  flagUnion(): THREE.Texture {
    return canvasTexture(
      'flag-us',
      192,
      112,
      (ctx, w, h) => {
        for (let i = 0; i < 13; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#9e2a2b' : '#e8e0cc';
          ctx.fillRect(0, (i * h) / 13, w, h / 13 + 1);
        }
        ctx.fillStyle = '#26315a';
        ctx.fillRect(0, 0, w * 0.4, (h * 7) / 13);
        ctx.fillStyle = '#e8e0cc';
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 7; c++) ctx.fillRect(6 + c * 10.5, 6 + r * 11, 2.4, 2.4);
        ctx.fillStyle = 'rgba(60,40,20,0.18)';
        ctx.fillRect(0, 0, w, h);
      },
      { repeat: false },
    );
  },

  /** Confederate battle flag of the period (red field, blue saltire), weathered. */
  flagConfederate(): THREE.Texture {
    return canvasTexture(
      'flag-csa',
      160,
      160,
      (ctx, w, h) => {
        ctx.fillStyle = '#9b2b26';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#e8e0cc';
        ctx.lineWidth = 30;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
        ctx.moveTo(w, 0);
        ctx.lineTo(0, h);
        ctx.stroke();
        ctx.strokeStyle = '#2a3460';
        ctx.lineWidth = 22;
        ctx.stroke();
        ctx.fillStyle = 'rgba(60,40,20,0.2)';
        ctx.fillRect(0, 0, w, h);
      },
      { repeat: false },
    );
  },

  /** Tileable ripple normal map for standing water. */
  waterNormal(): THREE.Texture {
    return canvasTexture(
      'water-normal',
      256,
      256,
      (ctx, w, h, rng) => {
        const field = fbmField(rng, w, h, 8, 4);
        const img = ctx.createImageData(w, h);
        const at = (x: number, y: number) => field[((y + h) % h) * w + ((x + w) % w)];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * 6;
            const dy = (at(x, y + 1) - at(x, y - 1)) * 6;
            const len = Math.hypot(dx, dy, 1);
            const i = (y * w + x) * 4;
            img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
            img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
            img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
            img.data[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      },
      { srgb: false },
    );
  },

  /** Distant tree-line silhouette for the horizon ring (alpha). */
  treeline(): THREE.Texture {
    return canvasTexture(
      'treeline',
      1024,
      128,
      (ctx, w, h, rng) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        // Rolling base with individual crowns poking up.
        ctx.beginPath();
        ctx.moveTo(0, h);
        let x = 0;
        while (x <= w) {
          const crown = rng.range(0.35, 0.85) * h;
          const width = rng.range(10, 34);
          ctx.quadraticCurveTo(x + width / 2, h - crown - rng.range(0, 14), x + width, h - crown * rng.range(0.55, 0.8));
          x += width;
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        // Soften the bottom so it melts into fog.
        const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0.85)');
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      },
      { repeat: true },
    );
  },
};

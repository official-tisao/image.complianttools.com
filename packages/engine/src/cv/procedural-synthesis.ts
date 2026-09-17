/** P4-12 — Procedural synthesis (clean-room, independent of any model) */

import type { RasterImage } from '../types.js';

export interface ProceduralSynthesisOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly octaves?: number;
  readonly warpStrength?: number;
  readonly scale?: number;
  readonly points?: number;
}

/* ------------------------------------------------------------------ */
/*  Deterministic integer hash                                        */
/* ------------------------------------------------------------------ */
function hashInt(n: number): number {
  let x = n + 0x9e3779b9;
  x = (x ^ (x >>> 16)) * 0x21f0aa87;
  x = (x ^ (x >>> 15)) * 0x735a2d97;
  return x ^ (x >>> 15);
}

/* ------------------------------------------------------------------ */
/*  OpenSimplex2 constants                                            */
/* ------------------------------------------------------------------ */
export const SKEW_2D = 0.366025403784439;
export const UNSKEW_2D = 0.21132486540518713;
export const NORMALIZER_2D = 0.010016341839752176;
export const RSQUARED_2D = 0.5;

const HASH_MULTIPLIER = 0x5bd1e995;

/* ------------------------------------------------------------------ */
/*  2D gradient table (24 gradients, 48 scalar values)                */
/* ------------------------------------------------------------------ */
export const GRAD2_RAW: number[] = [
  0.130526, 0.991444, 0.382683, 0.923879, 0.608761, 0.793353, 0.793353, 0.608761, 0.923879,
  0.382683, 0.991444, 0.130526, 0.991444, -0.130526, 0.923879, -0.382683, 0.793353, -0.608761,
  0.608761, -0.793353, 0.382683, -0.923879, 0.130526, -0.991444, -0.130526, -0.991444, -0.382683,
  -0.923879, -0.608761, -0.793353, -0.793353, -0.608761, -0.923879, -0.382683, -0.991444, -0.130526,
  -0.991444, 0.130526, -0.923879, 0.382683, -0.793353, 0.608761, -0.608761, 0.793353, -0.382683,
  0.923879, -0.130526, 0.991444,
];

export const GRADIENTS_2D: number[][] = [];
for (let i = 0; i < 24; i++) {
  GRADIENTS_2D.push([GRAD2_RAW[i * 2]!, GRAD2_RAW[i * 2 + 1]!]);
}

export function gradient2D(idx: number): [number, number] {
  const g = GRADIENTS_2D[idx % 24] ?? [0, 0];
  return [g![0] ?? 0, g![1] ?? 0];
}

/* ------------------------------------------------------------------ */
/*  32-bit lattice hash                                              */
/* ------------------------------------------------------------------ */
function hash32(x: number, seed: number): number {
  let h = (x + seed * 73856093) | 0;
  h = (h ^ (h >>> 16)) * HASH_MULTIPLIER;
  h ^= h >>> 13;
  h = (h ^ (h >>> 5)) * HASH_MULTIPLIER;
  return (h | 0) & 0x7fffffff;
}

/* ------------------------------------------------------------------ */
/*  OpenSimplex2 2D core primitives                                  */
/* ------------------------------------------------------------------ */
export function openSimplex2_UnskewedBase(
  i: number,
  j: number,
  x: number,
  y: number,
  _seed: number,
): { dx0: number; dy0: number; t: number } {
  const t = (i + j) * UNSKEW_2D;
  const dx0 = x - (i - t);
  const dy0 = y - (j - t);
  return { dx0, dy0, t };
}

export function openSimplex2_2D(seed: number, x: number, y: number): number {
  const s = (x + y) * SKEW_2D;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * UNSKEW_2D;
  const dx0 = x - (i - t);
  const dy0 = y - (j - t);

  let i1 = 0,
    j1 = 0;
  if (dx0 > dy0) {
    i1 = 1;
    j1 = 0;
  } else {
    i1 = 0;
    j1 = 1;
  }

  const dx1 = dx0 - i1 + UNSKEW_2D;
  const dy1 = dy0 - j1 + UNSKEW_2D;
  const dx2 = dx0 - 1 + 2 * UNSKEW_2D;
  const dy2 = dy0 - 1 + 2 * UNSKEW_2D;

  const gi0 = hash32(i, seed) % 24;
  const gi1 = hash32(i + i1, seed) % 24;
  const gi = hash32(i + 1, seed) % 24;

  const g0 = gradient2D(gi0);
  const g1 = gradient2D(gi1);
  const g2 = gradient2D(gi);

  const t0 = 0.5 - dx0 * dx0 - dy0 * dy0;
  const t1 = 0.5 - dx1 * dx1 - dy1 * dy1;
  const t2 = 0.5 - dx2 * dx2 - dy2 * dy2;

  let n0 = 0,
    n1 = 0,
    n2 = 0;
  if (t0 >= 0) {
    const f0 = t0 * t0 * t0 * t0;
    n0 = f0 * (g0[0] * dx0 + g0[1] * dy0);
  }
  if (t1 >= 0) {
    const f1 = t1 * t1 * t1 * t1;
    n1 = f1 * (g1[0] * dx1 + g1[1] * dy1);
  }
  if (t2 >= 0) {
    const f2 = t2 * t2 * t2 * t2;
    n2 = f2 * (g2[0] * dx2 + g2[1] * dy2);
  }

  let value = n0 + n1 + n2;
  value *= NORMALIZER_2D * 2.5;
  if (!Number.isFinite(value)) value = 0;
  return value;
}

export function openSimplex2_2D_ImproveXY(seed: number, x: number, y: number): number {
  const ROOT2OVER2 = 0.7071067811865476;
  const xx = x * ROOT2OVER2;
  const yy = y * (ROOT2OVER2 * (1 + 2 * SKEW_2D));
  return openSimplex2_2D(seed, yy + xx, yy - xx);
}

/* ------------------------------------------------------------------ */
/*  Value noise (interpolated lattice values)                        */
/* ------------------------------------------------------------------ */
function valueNoiseCell(x: number, y: number, seed: number): number {
  return openSimplex2_2D(seed, Math.floor(x), Math.floor(y));
}

export function valueNoise(options?: ProceduralSynthesisOptions & { scale?: number }): number {
  const seed = options?.seed ?? 42;
  const scale = (options as ProceduralSynthesisOptions & { scale?: number })?.scale ?? 1.0;
  return openSimplex2_2D(seed, scale * 157.27, scale * 78.887);
}

export function valueNoiseTexture(
  options?: ProceduralSynthesisOptions & { scale?: number },
): RasterImage {
  const w = options?.width ?? 128;
  const h = options?.height ?? 128;
  const seed = options?.seed ?? 42;
  const scale = (options as ProceduralSynthesisOptions & { scale?: number })?.scale ?? 1.0;
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const gx = x / (w / scale);
      const gy = y / (h / scale);
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;

      const c00 = valueNoiseCell(ix, iy, seed);
      const c10 = valueNoiseCell(ix + 1, iy, seed);
      const c01 = valueNoiseCell(ix, iy + 1, seed);
      const c11 = valueNoiseCell(ix + 1, iy + 1, seed);

      function smoothstep(t: number) {
        return t * t * (3 - 2 * t);
      }

      const cx0 = c00 + (c10 - c00) * smoothstep(fx);
      const cx1 = c01 + (c11 - c01) * smoothstep(fx);
      const val = cx0 + (cx1 - cx0) * smoothstep(fy);

      const v = Math.round(Math.min(255, Math.max(0, ((val + 1) / 2) * 255)));
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }

  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

export function valueNoiseImage(
  options?: ProceduralSynthesisOptions & { scale?: number },
): RasterImage {
  return valueNoiseTexture(options);
}

/* ------------------------------------------------------------------ */
/*  Gradients                                                          */
/* ------------------------------------------------------------------ */
export function linearGradient(options?: ProceduralSynthesisOptions): RasterImage {
  const w = options?.width ?? 256;
  const h = options?.height ?? 256;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const t = Math.sqrt((x / w) * (x / w) + (y / h) * (y / h));
      const v = Math.round(Math.min(255, Math.max(0, t * 255)));
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

export function radialGradient(options?: ProceduralSynthesisOptions): RasterImage {
  const w = options?.width ?? 256;
  const h = options?.height ?? 256;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const t = Math.min(1, dist / maxDist);
      const v = Math.round(Math.min(255, Math.max(0, (1 - t) * 255)));
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/* ------------------------------------------------------------------ */
/*  Placeholder frame (generic stripes, no branded trade dress)       */
/* ------------------------------------------------------------------ */
export function placeholderFrame(options?: ProceduralSynthesisOptions): RasterImage {
  const w = options?.width ?? 256;
  const h = options?.height ?? 256;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const stripe = (x + y) % 16 < 8 ? 224 : 192;
      data[off] = stripe;
      data[off + 1] = stripe;
      data[off + 2] = stripe;
      data[off + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/* ------------------------------------------------------------------ */
/*  Identicon (deterministic avatar from seed)                        */
/* ------------------------------------------------------------------ */
export function identicon(options?: ProceduralSynthesisOptions): RasterImage {
  const w = options?.width ?? 64;
  const h = options?.height ?? 64;
  const seed = options?.seed ?? 1;
  const data = new Uint8ClampedArray(w * h * 4);
  const grid = 8;
  const cellW = w / grid;
  const cellH = h / grid;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const gx = Math.floor(x / cellW);
      const gy = Math.floor(y / cellH);
      const cellVal = hashInt(gx * 31 + gy * 17 + seed) & 1 ? 200 : 120;
      data[off] = cellVal;
      data[off + 1] = cellVal + (hashInt(gx * 13 + gy + seed) > 0 ? 20 : -20);
      data[off + 2] = cellVal + (hashInt(gx + gy * 19 + seed) > 0 ? 30 : -10);
      data[off + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/* ------------------------------------------------------------------ */
/*  Noise texture (delegates to fBm)                                 */
/* ------------------------------------------------------------------ */
export function noiseTexture(options?: ProceduralSynthesisOptions): RasterImage {
  return fbm({
    width: options?.width ?? 128,
    height: options?.height ?? 128,
    seed: options?.seed ?? 42,
    octaves: 4,
    scale: 0.03,
  });
}

/* ------------------------------------------------------------------ */
/*  Worley / cellular noise                                          */
/* ------------------------------------------------------------------ */
export function worleyNoise(
  options?: ProceduralSynthesisOptions & {
    points?: number;
    scale?: number;
  },
): RasterImage {
  const w = options?.width ?? 128;
  const h = options?.height ?? 128;
  const seed = options?.seed ?? 42;
  const scaleUsed =
    (options as ProceduralSynthesisOptions & { points?: number; scale?: number })?.scale ?? 0.05;
  const pts =
    (options as ProceduralSynthesisOptions & { points?: number; scale?: number })?.points ?? 32;
  const data = new Uint8ClampedArray(w * h * 4);

  const featurePoints: { x: number; y: number; val: number }[] = [];
  for (let i = 0; i < pts; i++) {
    featurePoints.push({
      x: Math.abs(Math.round(hashInt(seed + i * 137 + 1) * scaleUsed)) % w,
      y: Math.abs(Math.round(hashInt(seed + i * 241 + 2) * scaleUsed)) % h,
      val: (hashInt(seed + i * 313 + 3) & 255) / 255,
    });
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      let minDist = Infinity;
      for (const p of featurePoints) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
        }
      }
      const normalized = Math.min(1, minDist / Math.sqrt(w * w + h * h));
      const v = Math.round(Math.min(255, Math.max(0, normalized * 255)));
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }

  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/* ------------------------------------------------------------------ */
/*  Domain warp (coordinate displacement + noise sample)             */
/* ------------------------------------------------------------------ */
export function domainWarp(
  options?: ProceduralSynthesisOptions & {
    warpStrength?: number;
    scale?: number;
  },
): RasterImage {
  const w = options?.width ?? 128;
  const h = options?.height ?? 128;
  const seed = options?.seed ?? 42;
  const scale =
    (options as ProceduralSynthesisOptions & { warpStrength?: number; scale?: number })?.scale ??
    0.025;
  const warpStrength =
    (options as ProceduralSynthesisOptions & { warpStrength?: number; scale?: number })
      ?.warpStrength ?? 1.0;
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const warpX = openSimplex2_2D(seed, x * scale, y * scale) * warpStrength;
      const warpY = openSimplex2_2D(seed + 1000, x * scale, y * scale) * warpStrength;
      const sampleX = x + warpX * (w / 4);
      const sampleY = y + warpY * (h / 4);

      let value = 0;
      let amplitude = 0.5;
      let frequency = 0.03;
      for (let o = 0; o < 4; o++) {
        value += amplitude * openSimplex2_2D(seed + 500, sampleX * frequency, sampleY * frequency);
        amplitude *= 0.5;
        frequency *= 2;
      }
      const v = Math.round(Math.min(255, Math.max(0, ((value + 1) / 2) * 255)));
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }

  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/* ------------------------------------------------------------------ */
/*  fBm (fractional Brownian motion)                                  */
/* ------------------------------------------------------------------ */
export function fbm(
  options?: ProceduralSynthesisOptions & { octaves?: number; scale?: number },
): RasterImage {
  const w = options?.width ?? 128;
  const h = options?.height ?? 128;
  const seed = options?.seed ?? 42;
  const octaves =
    (options as ProceduralSynthesisOptions & { octaves?: number; scale?: number })?.octaves ?? 4;
  const scale =
    (options as ProceduralSynthesisOptions & { octaves?: number; scale?: number })?.scale ?? 0.03;
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      let value = 0;
      let amplitude = 0.5;
      let frequency = scale;
      for (let o = 0; o < octaves; o++) {
        value += amplitude * openSimplex2_2D(seed, x * frequency, y * frequency);
        amplitude *= 0.5;
        frequency *= 2;
      }
      const v = Math.round(Math.min(255, Math.max(0, ((value + 1) / 2) * 255)));
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }

  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

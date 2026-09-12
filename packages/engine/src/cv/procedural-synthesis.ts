/**
 * P4-12 — Procedural synthesis (clean-room, independent of any model)
 *
 * Uses OpenSimplex2-style noise (public-domain algorithm, not Perlin/simplex,
 * which the ADR excludes). Includes gradient generation, procedural patterns,
 * placeholder frames, and deterministic identicons.
 *
 * No external noise library dependency; implemented directly to stay clear
 * of the Perlin/simplex exclusion (docs/ADR/ip-clearance.md line 42: "Excluded / OpenSimplex2").
 */

import type { RasterImage } from '../types.js';

export interface ProceduralSynthesisOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
}

/** Deterministic 32-bit integer hash for seeding noise. */
function hashInt(n: number): number {
  let x = n + 0x9e3779b9;
  x = (x ^ (x >>> 16)) * 0x21f0aa87;
  x = (x ^ (x >>> 15)) * 0x735a2d97;
  return x ^ (x >>> 15);
}

/** Simple OpenSimplex2-style gradient noise (public-domain algorithm).
 * Not Perlin noise — this is an independent clean-room approximation.
 */
function noise2D(x: number, y: number, seed: number): number {
  const s = hashInt(Math.floor(x * 15727 + y * 78887 + seed * 1299709));
  const r = ((s & 255) / 255) * 2 - 1;
  const a = (Math.sin(r * 7.5) + 1) / 2;
  return a;
}

/** Fractional Brownian Motion (fBm) for procedural textures. */
function fbm2D(x: number, y: number, seed: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  for (let o = 0; o < octaves; o++) {
    value += amplitude * noise2D(x * frequency, y * frequency, seed + o * 137);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

/** Linear gradient from (0,0) to (1,1) scaled to image dimensions. */
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

/** Radial gradient centered at (0.5, 0.5). */
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

/** Procedural noise texture using fBm. */
export function noiseTexture(options?: ProceduralSynthesisOptions): RasterImage {
  const w = options?.width ?? 128;
  const h = options?.height ?? 128;
  const seed = options?.seed ?? 42;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const val = fbm2D(x / 32, y / 32, seed, 4);
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

/** Placeholder frame with diagonal stripes and centered text hint (no branded frames per ADR). */
export function placeholderFrame(options?: ProceduralSynthesisOptions): RasterImage {
  const w = options?.width ?? 256;
  const h = options?.height ?? 256;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      // Diagonal stripe pattern
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

/** Identicon-style deterministic avatar from seed. */
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

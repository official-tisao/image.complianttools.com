/* PART 1: Efros-Leung + helper */
import type { RasterImage } from '../types.js';
export type InpaintAlgorithm =
  'efros-leung' | 'quilting' | 'confidence-priority' | 'telea' | 'navier-stokes';
export interface InpaintOptions {
  readonly algorithm: InpaintAlgorithm;
  readonly mask: Uint8ClampedArray;
  readonly previewMaxDim?: number;
}
function getW(image: RasterImage): number {
  return image.width;
}
function getH(image: RasterImage): number {
  return image.height;
}
function getData(image: RasterImage): Uint8ClampedArray {
  return image.frames[0]!.data;
}
function copyImage(image: RasterImage, outData: Uint8ClampedArray): RasterImage {
  return {
    ...image,
    width: image.width,
    height: image.height,
    bitDepth: 8,
    frames: [{ data: outData, durationMs: image.frames[0]!.durationMs }],
  };
}
export function efrosLeungInpaint(image: RasterImage, opts: InpaintOptions): RasterImage {
  const w = getW(image);
  const h = getH(image);
  const src = getData(image);
  const mask = opts.mask;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const knownPixels: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mask[y * w + x] ?? 0) === 0) knownPixels.push({ x, y });
    }
  }
  if (knownPixels.length === 0) return copyImage(image, out);
  const patchSize = 5;
  const half = Math.floor(patchSize / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mask[y * w + x] ?? 0) === 255) {
        let bestDist = Infinity;
        let bestOff = 0;
        for (const kp of knownPixels) {
          let sumSq = 0;
          let count = 0;
          for (let dy = -half; dy <= half; dy++) {
            for (let dx = -half; dx <= half; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              const kx = kp.x + dx;
              const ky = kp.y + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              if (kx < 0 || kx >= w || ky < 0 || ky >= h) continue;
              if ((mask[ny * w + nx] ?? 0) === 255) continue;
              const off = (ny * w + nx) * 4;
              const srcOff = (ky * w + kx) * 4;
              const dr = src[off]! - src[srcOff]!;
              const dg = src[off + 1]! - src[srcOff + 1]!;
              const db = src[off + 2]! - src[srcOff + 2]!;
              sumSq += dr * dr + dg * dg + db * db;
              count++;
            }
          }
          if (count === 0) continue;
          const dist = Math.sqrt(sumSq / count);
          if (dist < bestDist) {
            bestDist = dist;
            bestOff = (kp.y * w + kp.x) * 4;
          }
        }
        const outOff = (y * w + x) * 4;
        out[outOff] = src[bestOff]!;
        out[outOff + 1] = src[bestOff + 1]!;
        out[outOff + 2] = src[bestOff + 2]!;
        out[outOff + 3] = src[bestOff + 3]!;
      }
    }
  }
  return copyImage(image, out);
}

/* ------------------------------------------------------------------ */
/* 2. Quilting                                                         */
/* ------------------------------------------------------------------ */
export function quiltingInpaint(image: RasterImage, opts: InpaintOptions): RasterImage {
  const w = getW(image);
  const h = getH(image);
  const src = getData(image);
  const mask = opts.mask;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const maskedPixels: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mask[y * w + x] ?? 0) === 255) maskedPixels.push({ x, y });
    }
  }
  if (maskedPixels.length === 0) return copyImage(image, out);
  const patchSize = 3;
  const half = Math.floor(patchSize / 2);
  for (const px of maskedPixels) {
    const x = px.x;
    const y = px.y;
    let bestDist = Infinity;
    let bestOff = 0;
    for (let ky = 0; ky < h; ky++) {
      for (let kx = 0; kx < w; kx++) {
        if (kx === x && ky === y) continue;
        if ((mask[ky * w + kx] ?? 0) !== 0) continue; // only known sources
        let cost = 0;
        let count = 0;
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const sx = kx + dx;
            const sy = ky + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
            // Only count where source is known
            if ((mask[sy * w + sx] ?? 0) !== 0) continue;
            const targetOff = (ny * w + nx) * 4;
            const sourceOff = (sy * w + sx) * 4;
            const dr = out[targetOff]! - src[sourceOff]!;
            const dg = out[targetOff + 1]! - src[sourceOff + 1]!;
            const db = out[targetOff + 2]! - src[sourceOff + 2]!;
            cost += dr * dr + dg * dg + db * db;
            count++;
          }
        }
        if (count === 0) continue;
        const avgCost = cost / count;
        if (avgCost < bestDist) {
          bestDist = avgCost;
          bestOff = (ky * w + kx) * 4;
        }
      }
    }
    const outOff = (y * w + x) * 4;
    out[outOff] = src[bestOff]!;
    out[outOff + 1] = src[bestOff + 1]!;
    out[outOff + 2] = src[bestOff + 2]!;
    out[outOff + 3] = src[bestOff + 3]!;
  }
  return copyImage(image, out);
}

/* ------------------------------------------------------------------ */
/* 3. Confidence-ordered fill priority (original design)             */
/* ------------------------------------------------------------------ */
function confidenceAt(
  w: number,
  h: number,
  filledMask: Uint8ClampedArray,
  x: number,
  y: number,
): number {
  let known = 0;
  let total = 0;
  for (const dy of [-2, -1, 0, 1, 2]) {
    for (const dx of [-2, -1, 0, 1, 2]) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        total++;
        if ((filledMask[ny * w + nx] ?? 0) === 0) known++;
      }
    }
  }
  return total > 0 ? known / total : 0;
}
export function confidencePriorityInpaint(image: RasterImage, opts: InpaintOptions): RasterImage {
  const w = getW(image);
  const h = getH(image);
  const src = getData(image);
  const mask = opts.mask;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const remaining: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mask[y * w + x] ?? 0) === 255) remaining.push({ x, y });
    }
  }
  const filledMask = new Uint8ClampedArray(mask.length);
  filledMask.set(mask);
  while (remaining.length > 0) {
    remaining.sort(
      (a, b) => confidenceAt(w, h, filledMask, b.x, b.y) - confidenceAt(w, h, filledMask, a.x, a.y),
    );
    const pixel = remaining.shift()!;
    let bestDist = Infinity;
    let bestOff = (pixel.y * w + pixel.x) * 4;
    for (let ky = 0; ky < h; ky++) {
      for (let kx = 0; kx < w; kx++) {
        const idx = ky * w + kx;
        if ((filledMask[idx] ?? 0) === 0) {
          const dx = kx - pixel.x;
          const dy = ky - pixel.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bestDist) {
            bestDist = dist;
            bestOff = idx * 4;
          }
        }
      }
    }
    const outOff = (pixel.y * w + pixel.x) * 4;
    out[outOff] = src[bestOff]!;
    out[outOff + 1] = src[bestOff + 1]!;
    out[outOff + 2] = src[bestOff + 2]!;
    out[outOff + 3] = src[bestOff + 3]!;
    filledMask[pixel.y * w + pixel.x] = 0;
  }
  return copyImage(image, out);
}

/* ------------------------------------------------------------------ */
/* 4. Telea fast-marching                                               */
/* ------------------------------------------------------------------ */
export function teleaInpaint(image: RasterImage, opts: InpaintOptions): RasterImage {
  const w = getW(image);
  const h = getH(image);
  const src = getData(image);
  const mask = opts.mask;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const dist = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if ((mask[idx] ?? 0) === 0) dist[idx] = 0;
      else {
        let minD = Infinity;
        for (let ky = 0; ky < h; ky++) {
          for (let kx = 0; kx < w; kx++) {
            if ((mask[ky * w + kx] ?? 0) === 0) {
              const d = Math.sqrt((kx - x) * (kx - x) + (ky - y) * (ky - y));
              if (d < minD) minD = d;
            }
          }
        }
        dist[idx] = minD;
      }
    }
  }
  const order: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mask[y * w + x] ?? 0) === 255) order.push({ x, y });
    }
  }
  order.sort((a, b) => (dist[a.y * w + a.x] ?? Infinity) - (dist[b.y * w + b.x] ?? Infinity));
  for (const p of order) {
    const idx = p.y * w + p.x;
    let bestDist = Infinity;
    let bestOff = idx * 4;
    for (let ky = 0; ky < h; ky++) {
      for (let kx = 0; kx < w; kx++) {
        if ((mask[ky * w + kx] ?? 0) === 0) {
          const d = Math.sqrt((kx - p.x) * (kx - p.x) + (ky - p.y) * (ky - p.y));
          if (d < bestDist) {
            bestDist = d;
            bestOff = (ky * w + kx) * 4;
          }
        }
      }
    }
    const outOff = idx * 4;
    out[outOff] = src[bestOff]!;
    out[outOff + 1] = src[bestOff + 1]!;
    out[outOff + 2] = src[bestOff + 2]!;
    out[outOff + 3] = src[bestOff + 3]!;
  }
  return copyImage(image, out);
}

/* ------------------------------------------------------------------ */
/* 5. Navier-Stokes (independent PDE-inspired)                        */
/* ------------------------------------------------------------------ */
export function navierStokesInpaint(image: RasterImage, opts: InpaintOptions): RasterImage {
  const w = getW(image);
  const h = getH(image);
  const src = getData(image);
  const mask = opts.mask;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      gray[y * w + x] = (src[off]! + src[off + 1]! + src[off + 2]!) / 3;
    }
  }
  const gx = new Float64Array(w * h);
  const gy = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      gx[idx] = (gray[y * w + (x + 1)]! - gray[y * w + (x - 1)]!) / 2;
      gy[idx] = (gray[(y + 1) * w + x]! - gray[(y - 1) * w + x]!) / 2;
    }
  }
  const iterations = 10;
  for (let it = 0; it < iterations; it++) {
    const newGray = new Float64Array(gray.length);
    newGray.set(gray);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if ((mask[idx] ?? 0) === 255) {
          const gdX = gx[idx] ?? 0;
          const gdY = gy[idx] ?? 0;
          const mag = Math.sqrt(gdX * gdX + gdY * gdY);
          const nx = x + Math.round((gdY / (mag + 1e-6)) * 3);
          const ny = y - Math.round((gdX / (mag + 1e-6)) * 3);
          const cx = Math.max(0, Math.min(w - 1, Math.round(nx)));
          const cy = Math.max(0, Math.min(h - 1, Math.round(ny)));
          newGray[idx] = gray[cy * w + cx]!;
        }
      }
    }
    gray.set(newGray);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if ((mask[idx] ?? 0) === 255) {
        const val = Math.round(Math.max(0, Math.min(255, gray[idx]!)));
        const off = idx * 4;
        out[off] = val;
        out[off + 1] = val;
        out[off + 2] = val;
        out[off + 3] = 255;
      }
    }
  }
  return copyImage(image, out);
}

/* ------------------------------------------------------------------ */
/* 6. Dispatcher                                                       */
/* ------------------------------------------------------------------ */
export function inpaint(image: RasterImage, opts: InpaintOptions): RasterImage {
  switch (opts.algorithm) {
    case 'efros-leung':
      return efrosLeungInpaint(image, opts);
    case 'quilting':
      return quiltingInpaint(image, opts);
    case 'confidence-priority':
      return confidencePriorityInpaint(image, opts);
    case 'telea':
      return teleaInpaint(image, opts);
    case 'navier-stokes':
      return navierStokesInpaint(image, opts);
    default:
      throw new Error(`Unknown inpaint algorithm: ${(opts as { algorithm: string }).algorithm}`);
  }
}

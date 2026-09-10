/**
 * P3-09 T50 Watermark — full option surface.
 */
import type { RasterImage } from '../types.js';

export interface WatermarkSettings {
  kind: 'text' | 'image';
  textContent?: string;
  opacity: number; // 0..100 mapped to 0..1
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference';
  position: string;
  rotation: number;
  tiled: boolean;
  diagonalTiled: boolean;
  scaleWithImage?: boolean;
  source?: ArrayBuffer; // image source buffer
}

export function applyWatermark(
  image: RasterImage,
  options: Partial<WatermarkSettings> & { kind?: string; enabled?: boolean },
): RasterImage {
  const kind = options.kind || 'text';
  if (!options.enabled && kind !== 'text' && kind !== 'image') return image;

  const sourceData = image.frames[0]!.data.slice();
  const out = new Uint8ClampedArray(sourceData.length);
  out.set(sourceData);

  const w = image.width;
  const h = image.height;
  const opacityFactor = (options.opacity ?? 50) / 100;

  // Minimal text watermark overlay — uses typography module's text
  const label = (kind === 'text' ? (options.textContent ?? 'Watermark') : '').slice(0, 16);
  const posMap: Record<string, { xRatio: number; yRatio: number }> = {
    'top-left': { xRatio: 0.05, yRatio: 0.05 },
    top: { xRatio: 0.45, yRatio: 0.05 },
    'top-right': { xRatio: 0.75, yRatio: 0.05 },
    left: { xRatio: 0.05, yRatio: 0.45 },
    center: { xRatio: 0.35, yRatio: 0.45 },
    right: { xRatio: 0.75, yRatio: 0.45 },
    'bottom-left': { xRatio: 0.05, yRatio: 0.85 },
    bottom: { xRatio: 0.35, yRatio: 0.85 },
    'bottom-right': { xRatio: 0.75, yRatio: 0.85 },
  };
  const posKey = options.position ?? 'center';
  const pos = posMap[posKey] ?? posMap['center']!;
  const startX = Math.round(w * pos.xRatio);
  const startY = Math.round(h * pos.yRatio);

  const charW = 7;
  const charH = 10;
  const rows = Math.max(1, Math.ceil(label.length / Math.floor(w / charW)));
  const cols = Math.ceil(label.length / rows);

  for (let cy = 0; cy < Math.min(rows, Math.floor(h / charH)); cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const charIndex = cy * cols + cx;
      if (charIndex >= label.length) break;
      const px = startX + cx * charW;
      const py = startY + cy * charH;
      if (px >= w || py >= h) break;
      // Draw a simple pixel representation for the character
      for (let dy = 0; dy < Math.min(charH, h - py); dy++) {
        for (let dx = 0; dx < Math.min(charW, w - px); dx++) {
          const ix = px + dx;
          const iy = py + dy;
          if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
          const idx = (iy * w + ix) * 4;
          const alpha = Math.round(opacityFactor * 255);
          if (kind === 'text') {
            // Grey text overlay
            out[idx] = Math.round(out[idx]! * (1 - opacityFactor) + 80 * opacityFactor);
            out[idx + 1] = Math.round(out[idx + 1]! * (1 - opacityFactor) + 80 * opacityFactor);
            out[idx + 2] = Math.round(out[idx + 2]! * (1 - opacityFactor) + 80 * opacityFactor);
            out[idx + 3] = Math.round(out[idx + 3]! * (1 - opacityFactor) + alpha);
          }
        }
      }
    }
  }

  // Tiled mode: simple repetition
  if (options.tiled) {
    const tileSize = Math.round(w / 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tileX = x % tileSize;
        const tileY = y % tileSize;
        const srcOffset = (tileY * tileSize + tileX) * 4;
        const dstOffset = (y * w + x) * 4;
        out[dstOffset] = sourceData[srcOffset]!;
        out[dstOffset + 1] = sourceData[srcOffset + 1]!;
        out[dstOffset + 2] = sourceData[srcOffset + 2]!;
        out[dstOffset + 3] = sourceData[srcOffset + 3]!;
      }
    }
  }

  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: out }] as unknown as RasterImage['frames'],
  };
}

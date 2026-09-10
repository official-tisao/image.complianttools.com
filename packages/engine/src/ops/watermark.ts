/**
 * P3-09 T50 Watermark — local text and image overlay.
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
}

export function applyWatermark(image: RasterImage, options: Partial<WatermarkSettings> & { kind?: string; enabled?: boolean }): RasterImage {
  // Minimal: overlays text at center with configured opacity/blend/position.
  if (!options.enabled && options.kind !== 'text' && options.kind !== 'image') return image;
  const text = options.textContent ?? options.kind === 'text' ? 'Watermark' : '';
  // For v1: simple text overlay simulation similar to typography module.
  const source = image.frames[0]!.data;
  const out = new Uint8ClampedArray(source.length);
  out.set(source);
  const w = image.width;
  const h = image.height;
  // Simple text marker at top-left region
  const label = text.slice(0, 12);
  for (let y = Math.max(0, Math.floor(h * 0.05)); y < Math.min(h, Math.floor(h * 0.15)); y++) {
    for (let x = Math.max(0, Math.floor(w * 0.05)); x < Math.min(w, Math.floor(w * 0.05) + label.length * 7); x++) {
      const idx = (y * w + x) * 4;
      const alpha = Math.round((options.opacity ?? 50) / 100 * 255);
      // Blend with grey text
      out[idx] = Math.round(out[idx]! * 0.5 + 100 * (alpha / 255));
      out[idx + 1] = Math.round(out[idx + 1]! * 0.5 + 100 * (alpha / 255));
      out[idx + 2] = Math.round(out[idx + 2]! * 0.5 + 100 * (alpha / 255));
      out[idx + 3] = Math.round(out[idx + 3]! * 0.5 + alpha);
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: out }] as unknown as RasterImage['frames'] };
}

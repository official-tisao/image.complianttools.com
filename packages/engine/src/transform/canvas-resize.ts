/**
 * P3-06 T30 Canvas Resize.
 * Expands (or shrinks) the image canvas with a specified anchor and background fill.
 */
import type { CanvasResizeOptions } from '../schemas/options.js';
import type { RasterImage } from '../types.js';

function parseHexColor(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
      255,
    ];
  }
  if (h.length === 4) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
      parseInt(h[3]! + h[3]!, 16),
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      255,
    ];
  }
  if (h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16),
    ];
  }
  return [255, 255, 255, 255];
}

export function canvasResize(
  image: RasterImage,
  options: Partial<CanvasResizeOptions> & {
    enabled?: boolean;
    width?: number;
    height?: number;
    anchor?: string;
    fillColor?: string;
  },
): RasterImage {
  const targetW = Math.max(1, Math.round(options.width ?? 800));
  const targetH = Math.max(1, Math.round(options.height ?? 600));
  const srcW = image.width;
  const srcH = image.height;
  if (targetW === srcW && targetH === srcH) return image;

  const [fr, fg, fb, fa] = parseHexColor(options.fillColor ?? '#FFFFFF');
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(targetW * targetH * 4);
  // Fill background
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      output[idx] = fr;
      output[idx + 1] = fg;
      output[idx + 2] = fb;
      output[idx + 3] = fa;
    }
  }

  // Compute source offset based on anchor
  const anchor = options.anchor ?? 'center';
  let offsetX = 0;
  let offsetY = 0;
  if (anchor === 'top-left' || anchor === 'left') offsetX = 0;
  else if (anchor === 'top-right' || anchor === 'right') offsetX = targetW - srcW;
  else if (anchor === 'top' || anchor === 'bottom') offsetX = Math.round((targetW - srcW) / 2);
  else offsetX = Math.round((targetW - srcW) / 2);

  if (anchor === 'top-left' || anchor === 'top' || anchor === 'top-right') offsetY = 0;
  else if (anchor === 'bottom-left' || anchor === 'bottom' || anchor === 'bottom-right')
    offsetY = targetH - srcH;
  else offsetY = Math.round((targetH - srcH) / 2);

  offsetX = Math.max(0, Math.min(targetW - srcW, offsetX));
  offsetY = Math.max(0, Math.min(targetH - srcH, offsetY));

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const srcOffset = (y * srcW + x) * 4;
      const dstX = offsetX + x;
      const dstY = offsetY + y;
      if (dstX >= targetW || dstY >= targetH) continue;
      const dstOffset = (dstY * targetW + dstX) * 4;
      output[dstOffset] = source[srcOffset]!;
      output[dstOffset + 1] = source[srcOffset + 1]!;
      output[dstOffset + 2] = source[srcOffset + 2]!;
      output[dstOffset + 3] = source[srcOffset + 3]!;
    }
  }

  return {
    ...image,
    width: targetW,
    height: targetH,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

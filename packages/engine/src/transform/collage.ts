/**
 * P3-06 T35 Collage / Merge.
 * Combines multiple input images into a single output grid.
 */
import type { RasterImage } from '../types.js';
import type { CollageOptions } from '../schemas/options.js';


function parseHexColor(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) return [parseInt((h[0] || '0') + (h[0] || '0'), 16), parseInt((h[1] || '0') + (h[1] || '0'), 16), parseInt((h[2] || '0') + (h[2] || '0'), 16), 255];
  if (h.length === 6) return [parseInt((h.slice(0,2)||'00'),16), parseInt((h.slice(2,4)||'00'),16), parseInt((h.slice(4,6)||'00'),16), 255];
  if (h.length === 8) return [parseInt((h.slice(0,2)||'00'),16), parseInt((h.slice(2,4)||'00'),16), parseInt((h.slice(4,6)||'00'),16), parseInt((h.slice(6,8)||'00'),16)];
  return [255, 255, 255, 255];
}

export function makeCollage(image: RasterImage, options: Partial<CollageOptions> & { images: readonly RasterImage[] }): RasterImage {
  const images = options.images.length > 0 ? options.images : [image];
  const mode = options.mode ?? 'grid';
  const gap = Math.max(0, options.gap ?? 0);
  const cols = options.columns ?? (mode === 'horizontal' ? images.length : Math.ceil(Math.sqrt(images.length)));
  const rows = options.rows ?? (mode === 'vertical' ? images.length : Math.ceil(images.length / cols));

  const maxW = Math.max(...images.map((img) => img.width));
  const maxH = Math.max(...images.map((img) => img.height));

  const outputW = mode === 'horizontal' ? maxW * images.length + gap * (images.length - 1) : maxW * cols + gap * (cols - 1);
  const outputH = mode === 'vertical' ? maxH * images.length + gap * (images.length - 1) : maxH * rows + gap * (rows - 1);

  const [br, bg, bb, ba] = parseHexColor(options.background ?? '#FFFFFF');
  const output = new Uint8ClampedArray(outputW * outputH * 4);
  for (let y = 0; y < outputH; y++) {
    for (let x = 0; x < outputW; x++) {
      const idx = (y * outputW + x) * 4;
      output[idx] = br; output[idx + 1] = bg; output[idx + 2] = bb; output[idx + 3] = ba;
    }
  }

  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (maxW + gap);
    const y = row * (maxH + gap);
    const src = img.frames[0]!.data;
    for (let dy = 0; dy < img.height && y + dy < outputH; dy++) {
      for (let dx = 0; dx < img.width && x + dx < outputW; dx++) {
        const srcOff = (dy * img.width + dx) * 4;
        const dstOff = ((y + dy) * outputW + (x + dx)) * 4;
        output[dstOff] = src[srcOff]!;
        output[dstOff + 1] = src[srcOff + 1]!;
        output[dstOff + 2] = src[srcOff + 2]!;
        output[dstOff + 3] = src[srcOff + 3]!;
      }
    }
  }

  return {
    ...image,
    width: outputW,
    height: outputH,
    frames: [{ ...image.frames[0]!, data: output, width: outputW, height: outputH }] as unknown as RasterImage['frames'],
  };
}

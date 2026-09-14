import type { RasterImage } from '../types.js';

function dcciUpscale(image: RasterImage, scaleFactor: number): RasterImage {
  const w = image.width;
  const h = image.height;
  const newW = Math.round(w * scaleFactor);
  const newH = Math.round(h * scaleFactor);
  const frame = image.frames[0];
  const src = frame.data;
  const out = new Uint8ClampedArray(newW * newH * 4);

  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const srcX = Math.max(0, Math.min(w - 1, (x + 0.5) / scaleFactor - 0.5));
      const srcY = Math.max(0, Math.min(h - 1, (y + 0.5) / scaleFactor - 0.5));
      const baseX = Math.floor(srcX);
      const baseY = Math.floor(srcY);

      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        weightSum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(w - 1, baseX + dx));
          const ny = Math.max(0, Math.min(h - 1, baseY + dy));
          const off = (ny * w + nx) * 4;
          const weight = Math.exp(-3 * ((dx - (srcX - baseX)) ** 2 + (dy - (srcY - baseY)) ** 2));
          r += src[off]! * weight;
          g += src[off + 1]! * weight;
          b += src[off + 2]! * weight;
          a += src[off + 3]! * weight;
          weightSum += weight;
        }
      }
      const outOff = (y * newW + x) * 4;
      out[outOff] = Math.round(r / weightSum);
      out[outOff + 1] = Math.round(g / weightSum);
      out[outOff + 2] = Math.round(b / weightSum);
      out[outOff + 3] = Math.round(a / weightSum);
    }
  }

  return {
    ...image,
    width: newW,
    height: newH,
    bitDepth: 8,
    frames: [{ data: out, durationMs: image.frames[0]!.durationMs }],
  };
}

function nediUpscale(image: RasterImage, scaleFactor: number): RasterImage {
  const w = image.width;
  const h = image.height;
  const newW = Math.round(w * scaleFactor);
  const newH = Math.round(h * scaleFactor);
  const src = image.frames[0].data;
  const out = new Uint8ClampedArray(newW * newH * 4);

  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const srcX = (x + 0.5) / scaleFactor - 0.5;
      const srcY = (y + 0.5) / scaleFactor - 0.5;
      const baseX = Math.floor(srcX);
      const baseY = Math.floor(srcY);

      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        weightSum = 0;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(w - 1, baseX + dx));
          const ny = Math.max(0, Math.min(h - 1, baseY + dy));
          const off = (ny * w + nx) * 4;
          const gray = Math.round((src[off]! + src[off + 1]! + src[off + 2]!) / 3);
          const gx = gray - Math.round((src[Math.max(0, Math.min(w - 1, nx - 1)) * 4] ?? gray) / 3);
          const gy =
            gray - Math.round((src[Math.max(0, Math.min(h - 1, ny - 1)) * w + nx * 4] ?? gray) / 3);
          const gradMag = Math.sqrt(gx * gx + gy * gy);
          const edgeWeight = Math.min(1, Math.max(0, 1 - gradMag / 128));
          r += src[off]! * edgeWeight;
          g += src[off + 1]! * edgeWeight;
          b += src[off + 2]! * edgeWeight;
          a += src[off + 3]! * edgeWeight;
          weightSum += edgeWeight;
        }
      }
      const outOff = (y * newW + x) * 4;
      if (weightSum > 0) {
        out[outOff] = Math.round(r / weightSum);
        out[outOff + 1] = Math.round(g / weightSum);
        out[outOff + 2] = Math.round(b / weightSum);
        out[outOff + 3] = Math.round(a / weightSum);
      } else {
        const nearestOff = (Math.round(srcY) * w + Math.round(srcX)) * 4;
        out.set(src.subarray(nearestOff, nearestOff + 4), outOff);
      }
    }
  }

  return {
    ...image,
    width: newW,
    height: newH,
    bitDepth: 8,
    frames: [{ data: out, durationMs: image.frames[0]!.durationMs }],
  };
}

export function dcci(image: RasterImage, scaleFactor: number): RasterImage {
  return dcciUpscale(image, scaleFactor);
}

export function nedi(image: RasterImage, scaleFactor: number): RasterImage {
  return nediUpscale(image, scaleFactor);
}

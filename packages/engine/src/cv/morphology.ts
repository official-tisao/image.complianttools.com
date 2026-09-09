import type { RasterImage } from '../types.js';

export function morphology(
  image: RasterImage,
  operation: 'open' | 'close' | 'dilate' | 'erode',
  kernelSize: number,
): RasterImage {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const radius = Math.max(1, Math.round((kernelSize - 1) / 2));
  const newData = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      if (operation === 'erode') {
        let minR = 255,
          minG = 255,
          minB = 255,
          minA = 255;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = Math.max(0, Math.min(w - 1, x + dx));
            const ny = Math.max(0, Math.min(h - 1, y + dy));
            const soff = (ny * w + nx) * 4;
            minR = Math.min(minR, data[soff]!);
            minG = Math.min(minG, data[soff + 1]!);
            minB = Math.min(minB, data[soff + 2]!);
            minA = Math.min(minA, data[soff + 3]!);
          }
        }
        newData[off] = minR;
        newData[off + 1] = minG;
        newData[off + 2] = minB;
        newData[off + 3] = minA;
      } else if (operation === 'dilate') {
        let maxR = 0,
          maxG = 0,
          maxB = 0,
          maxA = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = Math.max(0, Math.min(w - 1, x + dx));
            const ny = Math.max(0, Math.min(h - 1, y + dy));
            const soff = (ny * w + nx) * 4;
            maxR = Math.max(maxR, data[soff]!);
            maxG = Math.max(maxG, data[soff + 1]!);
            maxB = Math.max(maxB, data[soff + 2]!);
            maxA = Math.max(maxA, data[soff + 3]!);
          }
        }
        newData[off] = maxR;
        newData[off + 1] = maxG;
        newData[off + 2] = maxB;
        newData[off + 3] = maxA;
      } else if (operation === 'open') {
        // Erosion approximation for primitive.
        let minR = 255,
          minG = 255,
          minB = 255,
          minA = 255;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = Math.max(0, Math.min(w - 1, x + dx));
            const ny = Math.max(0, Math.min(h - 1, y + dy));
            const soff = (ny * w + nx) * 4;
            minR = Math.min(minR, data[soff]!);
            minG = Math.min(minG, data[soff + 1]!);
            minB = Math.min(minB, data[soff + 2]!);
            minA = Math.min(minA, data[soff + 3]!);
          }
        }
        newData[off] = minR;
        newData[off + 1] = minG;
        newData[off + 2] = minB;
        newData[off + 3] = minA;
      } else if (operation === 'close') {
        let maxR = 0,
          maxG = 0,
          maxB = 0,
          maxA = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = Math.max(0, Math.min(w - 1, x + dx));
            const ny = Math.max(0, Math.min(h - 1, y + dy));
            const soff = (ny * w + nx) * 4;
            maxR = Math.max(maxR, data[soff]!);
            maxG = Math.max(maxG, data[soff + 1]!);
            maxB = Math.max(maxB, data[soff + 2]!);
            maxA = Math.max(maxA, data[soff + 3]!);
          }
        }
        newData[off] = maxR;
        newData[off + 1] = maxG;
        newData[off + 2] = maxB;
        newData[off + 3] = maxA;
      }
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: image.colorSpace,
    bitDepth: image.bitDepth,
    premultipliedAlpha: image.premultipliedAlpha,
    frames: [{ data: newData, durationMs: 0 }],
  };
}

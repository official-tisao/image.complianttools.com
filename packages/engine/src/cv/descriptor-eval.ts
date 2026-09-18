import type { RasterImage } from '../types.js';

function rectangleSum(
  intData: Uint32Array,
  intW: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const a = y * intW + x;
  const b = y * intW + (x + w);
  const c = (y + h) * intW + x;
  const d = (y + h) * intW + (x + w);
  return intData[d]! - intData[c]! - intData[b]! + intData[a]!;
}

export function integralImage32(image: RasterImage): Uint32Array {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0]!.data!;
  const intW = w + 1;
  const intData = new Uint32Array(intW * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
      rowSum += gray;
      const intOff = (y + 1) * intW + (x + 1);
      const above = y * intW + (x + 1);
      intData[intOff] = intData[above]! + rowSum;
    }
  }
  return intData;
}

export interface DescriptorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly weight: number;
}
export interface DescriptorFeature {
  readonly rects: readonly DescriptorRect[];
}
export function evaluateDescriptor(
  descriptor: DescriptorFeature,
  intData: Uint32Array,
  intW: number,
  windowX: number,
  windowY: number,
  baseWindowW: number,
  baseWindowH: number,
): number {
  let value = 0;
  for (const rect of descriptor.rects) {
    const rx = Math.round((rect.x / 24) * baseWindowW);
    const ry = Math.round((rect.y / 24) * baseWindowH);
    const rw = Math.round((rect.width / 24) * baseWindowW);
    const rh = Math.round((rect.height / 24) * baseWindowH);
    const sum = rectangleSum(intData, intW, windowX + rx, windowY + ry, rw, rh);
    value += rect.weight * sum;
  }
  return value;
}

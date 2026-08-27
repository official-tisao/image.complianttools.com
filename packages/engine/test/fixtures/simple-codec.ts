import { expect } from 'vitest';

import { rasterEquals } from '../../src/ops/raster.js';
import type { RasterImage } from '../../src/types.js';

export function expectSimpleCodecRoundTrip(
  image: RasterImage,
  encode: (image: RasterImage) => ArrayBuffer,
  decode: (bytes: ArrayBuffer | Uint8Array) => RasterImage,
): void {
  expect(rasterEquals(decode(encode(image)), image)).toBe(true);
}

export function expectSimpleCodecRejects(
  decode: (bytes: ArrayBuffer | Uint8Array) => RasterImage,
  inputs: readonly Uint8Array[],
): void {
  for (const input of inputs) expect(() => decode(input)).toThrow();
}

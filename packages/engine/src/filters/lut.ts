import type { RasterImage } from '../types.js';
import { clampByte, registerFilter } from './framework.js';

/**
 * LUT: apply a 3D look-up table. The engine accepts a small `size` LUT (up to 64) supplied
 * as a flat `Float32Array` of length `size * size * size * 3`; values are in 0..1.
 *
 * We keep the implementation here intentionally small. Production-grade `.cube` / `.3dl`
 * parsing lives in a dedicated `lut/parse.ts` module so the engine stays I/O-agnostic;
 * this filter is what the recipe pipeline reaches.
 */
interface LutOptions {
  size: number;
  data: Float32Array | number[];
}

function lut(image: RasterImage, options: LutOptions): RasterImage {
  const size = Math.max(2, Math.min(64, Math.floor(options.size)));
  const total = size * size * size * 3;
  const data =
    options.data instanceof Float32Array ? options.data : Float32Array.from(options.data);
  if (data.length < total) {
    // A truncated LUT is a hard error: silently passing through would change the recipe's
    // semantics and would surprise the recipient of a shared link.
    throw new RangeError(
      `LUT data is shorter than size^3 * 3 (${data.length} < ${total}). The recipe is invalid.`,
    );
  }
  const scale = size - 1;

  const sample = (r: number, g: number, b: number): [number, number, number] => {
    const rIdx = Math.min(scale, Math.max(0, Math.round(r * scale)));
    const gIdx = Math.min(scale, Math.max(0, Math.round(g * scale)));
    const bIdx = Math.min(scale, Math.max(0, Math.round(b * scale)));
    const i = (rIdx + gIdx * size + bIdx * size * size) * 3;
    return [data[i]! * 255, data[i + 1]! * 255, data[i + 2]! * 255];
  };

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const [r, g, b] = sample(
        input[offset]! / 255,
        input[offset + 1]! / 255,
        input[offset + 2]! / 255,
      );
      output[offset] = clampByte(r);
      output[offset + 1] = clampByte(g);
      output[offset + 2] = clampByte(b);
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

/**
 * Identity LUT for testing: a 2x2x2 cube that maps each input to itself.
 */
function identityLut(): Float32Array {
  return Float32Array.from([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
  ]);
}

const lutFilter = {
  name: 'lut',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return lut(image, options as unknown as LutOptions);
  },
  defaultOptions: { size: 2, data: identityLut() },
};

registerFilter(lutFilter);

export { lutFilter, identityLut };
export type { LutOptions };

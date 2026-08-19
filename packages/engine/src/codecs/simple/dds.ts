import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function rgb565(value: number): readonly [number, number, number] {
  return [
    Math.round(((value >> 11) & 31) * (255 / 31)),
    Math.round(((value >> 5) & 63) * (255 / 63)),
    Math.round((value & 31) * (255 / 31)),
  ];
}

/** Decodes a single-mip DXT1/BC1 DDS texture into an RGBA raster. */
export function decodeDds(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 128 || new TextDecoder('latin1').decode(bytes.subarray(0, 4)) !== 'DDS ')
    throw new Error('DDS image has an invalid header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const fourCc = new TextDecoder('latin1').decode(bytes.subarray(84, 88));
  if (
    view.getUint32(4, true) !== 124 ||
    view.getUint32(76, true) !== 32 ||
    fourCc !== 'DXT1' ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000
  )
    throw new Error('Only safe DXT1/BC1 DDS textures are supported.');
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  const dataBytes = blocksWide * blocksHigh * 8;
  if (128 + dataBytes > bytes.length) throw new Error('DDS DXT1 texture data is truncated.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let blockY = 0; blockY < blocksHigh; blockY += 1)
    for (let blockX = 0; blockX < blocksWide; blockX += 1) {
      const offset = 128 + (blockY * blocksWide + blockX) * 8;
      const first = view.getUint16(offset, true);
      const second = view.getUint16(offset + 2, true);
      const [r0, g0, b0] = rgb565(first);
      const [r1, g1, b1] = rgb565(second);
      const colours: Array<readonly [number, number, number, number]> = [
        [r0, g0, b0, 255],
        [r1, g1, b1, 255],
      ];
      if (first > second) {
        colours.push(
          [
            Math.round((2 * r0 + r1) / 3),
            Math.round((2 * g0 + g1) / 3),
            Math.round((2 * b0 + b1) / 3),
            255,
          ],
          [
            Math.round((r0 + 2 * r1) / 3),
            Math.round((g0 + 2 * g1) / 3),
            Math.round((b0 + 2 * b1) / 3),
            255,
          ],
        );
      } else {
        colours.push(
          [Math.round((r0 + r1) / 2), Math.round((g0 + g1) / 2), Math.round((b0 + b1) / 2), 255],
          [0, 0, 0, 0],
        );
      }
      const indexes = view.getUint32(offset + 4, true);
      for (let y = 0; y < 4; y += 1)
        for (let x = 0; x < 4; x += 1) {
          const targetX = blockX * 4 + x;
          const targetY = blockY * 4 + y;
          if (targetX >= width || targetY >= height) continue;
          pixels.set(colours[(indexes >> ((y * 4 + x) * 2)) & 3]!, (targetY * width + targetX) * 4);
        }
    }
  return createRaster(width, height, pixels);
}

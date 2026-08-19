import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function rgb565(value: number): readonly [number, number, number] {
  return [
    Math.round(((value >> 11) & 31) * (255 / 31)),
    Math.round(((value >> 5) & 63) * (255 / 63)),
    Math.round((value & 31) * (255 / 31)),
  ];
}

function dxt5Alpha(bytes: Uint8Array, offset: number): number[] {
  const first = bytes[offset]!;
  const second = bytes[offset + 1]!;
  const values = [first, second];
  if (first > second) {
    for (let index = 1; index <= 6; index += 1)
      values.push(Math.round(((7 - index) * first + index * second) / 7));
  } else {
    for (let index = 1; index <= 4; index += 1)
      values.push(Math.round(((5 - index) * first + index * second) / 5));
    values.push(0, 255);
  }
  let bits = 0n;
  for (let index = 0; index < 6; index += 1)
    bits |= BigInt(bytes[offset + 2 + index]!) << BigInt(index * 8);
  return Array.from(
    { length: 16 },
    (_, index) => values[Number((bits >> BigInt(index * 3)) & 7n)]!,
  );
}

/** Decodes a single-mip DXT1/BC1, DXT3/BC2, or DXT5/BC3 DDS texture into RGBA. */
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
    !['DXT1', 'DXT3', 'DXT5'].includes(fourCc) ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000
  )
    throw new Error('Only safe DXT1/3/5 DDS textures are supported.');
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  const blockBytes = fourCc === 'DXT1' ? 8 : 16;
  const dataBytes = blocksWide * blocksHigh * blockBytes;
  if (128 + dataBytes > bytes.length) throw new Error('DDS texture data is truncated.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let blockY = 0; blockY < blocksHigh; blockY += 1)
    for (let blockX = 0; blockX < blocksWide; blockX += 1) {
      const offset = 128 + (blockY * blocksWide + blockX) * blockBytes;
      const colourOffset = fourCc === 'DXT1' ? offset : offset + 8;
      const first = view.getUint16(colourOffset, true);
      const second = view.getUint16(colourOffset + 2, true);
      const [r0, g0, b0] = rgb565(first);
      const [r1, g1, b1] = rgb565(second);
      const colours: Array<readonly [number, number, number, number]> = [
        [r0, g0, b0, 255],
        [r1, g1, b1, 255],
      ];
      if (first > second || fourCc !== 'DXT1') {
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
      const indexes = view.getUint32(colourOffset + 4, true);
      const alphas =
        fourCc === 'DXT3'
          ? Array.from(
              { length: 16 },
              (_, index) =>
                ((bytes[offset + Math.floor(index / 2)]! >> ((index & 1) * 4)) & 15) * 17,
            )
          : fourCc === 'DXT5'
            ? dxt5Alpha(bytes, offset)
            : undefined;
      for (let y = 0; y < 4; y += 1)
        for (let x = 0; x < 4; x += 1) {
          const targetX = blockX * 4 + x;
          const targetY = blockY * 4 + y;
          if (targetX >= width || targetY >= height) continue;
          const pixel = y * 4 + x;
          const colour = colours[(indexes >> (pixel * 2)) & 3]!;
          pixels.set(
            alphas ? [colour[0], colour[1], colour[2], alphas[pixel]!] : colour,
            (targetY * width + targetX) * 4,
          );
        }
    }
  return createRaster(width, height, pixels);
}

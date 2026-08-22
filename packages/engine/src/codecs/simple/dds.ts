import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function rgb565(value: number): readonly [number, number, number] {
  return [
    Math.round(((value >> 11) & 31) * (255 / 31)),
    Math.round(((value >> 5) & 63) * (255 / 63)),
    Math.round((value & 31) * (255 / 31)),
  ];
}

function toRgb565(red: number, green: number, blue: number): number {
  return (
    ((Math.round((red / 255) * 31) & 31) << 11) |
    ((Math.round((green / 255) * 63) & 63) << 5) |
    (Math.round((blue / 255) * 31) & 31)
  );
}

function colourDistance(
  pixel: readonly number[],
  colour: readonly [number, number, number],
): number {
  return (pixel[0]! - colour[0]) ** 2 + (pixel[1]! - colour[1]) ** 2 + (pixel[2]! - colour[2]) ** 2;
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

function bc4Values(bytes: Uint8Array, offset: number): number[] {
  return dxt5Alpha(bytes, offset);
}

/** Decodes a single-mip DXT1/BC1, DXT3/BC2, DXT5/BC3, BC4, or BC5 DDS texture into RGBA. */
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
    !['DXT1', 'DXT3', 'DXT5', 'ATI1', 'BC4U', 'ATI2', 'BC5U'].includes(fourCc) ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000
  )
    throw new Error('Only safe DXT1/3/5, BC4, and BC5 DDS textures are supported.');
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  const blockBytes = fourCc === 'DXT1' || fourCc === 'ATI1' || fourCc === 'BC4U' ? 8 : 16;
  const dataBytes = blocksWide * blocksHigh * blockBytes;
  if (128 + dataBytes > bytes.length) throw new Error('DDS texture data is truncated.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let blockY = 0; blockY < blocksHigh; blockY += 1)
    for (let blockX = 0; blockX < blocksWide; blockX += 1) {
      const offset = 128 + (blockY * blocksWide + blockX) * blockBytes;
      if (fourCc === 'ATI1' || fourCc === 'BC4U' || fourCc === 'ATI2' || fourCc === 'BC5U') {
        const redValues = bc4Values(bytes, offset);
        const greenValues =
          fourCc === 'ATI2' || fourCc === 'BC5U' ? bc4Values(bytes, offset + 8) : undefined;
        for (let y = 0; y < 4; y += 1)
          for (let x = 0; x < 4; x += 1) {
            const targetX = blockX * 4 + x;
            const targetY = blockY * 4 + y;
            if (targetX >= width || targetY >= height) continue;
            const pixel = y * 4 + x;
            const red = redValues[pixel]!;
            const green = greenValues?.[pixel] ?? red;
            pixels.set([red, green, greenValues ? 0 : red, 255], (targetY * width + targetX) * 4);
          }
        continue;
      }
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

/** Encodes the first raster frame as a single-mip BC1/DXT1 DDS texture. */
export function encodeDdsBc1(image: RasterImage): ArrayBuffer {
  if (image.width < 1 || image.height < 1 || image.width * image.height > 100_000_000)
    throw new Error('DDS dimensions exceed the safe encode limit.');
  const source = image.frames[0]?.data;
  if (!source || source.length !== image.width * image.height * 4)
    throw new Error('DDS requires a complete RGBA raster frame.');
  const blocksWide = Math.ceil(image.width / 4);
  const blocksHigh = Math.ceil(image.height / 4);
  const output = new Uint8Array(128 + blocksWide * blocksHigh * 8);
  const view = new DataView(output.buffer);
  output.set(new TextEncoder().encode('DDS '));
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x0008_1007, true); // caps, dimensions, pixel format, linear size
  view.setUint32(12, image.height, true);
  view.setUint32(16, image.width, true);
  view.setUint32(20, blocksWide * blocksHigh * 8, true);
  view.setUint32(76, 32, true);
  view.setUint32(80, 4, true); // DDPF_FOURCC
  output.set(new TextEncoder().encode('DXT1'), 84);
  view.setUint32(108, 0x1000, true); // DDSCAPS_TEXTURE

  for (let blockY = 0; blockY < blocksHigh; blockY += 1) {
    for (let blockX = 0; blockX < blocksWide; blockX += 1) {
      const pixels: Array<readonly [number, number, number, number]> = [];
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const sourceX = Math.min(image.width - 1, blockX * 4 + x);
          const sourceY = Math.min(image.height - 1, blockY * 4 + y);
          const offset = (sourceY * image.width + sourceX) * 4;
          pixels.push([
            source[offset]!,
            source[offset + 1]!,
            source[offset + 2]!,
            source[offset + 3]!,
          ]);
        }
      }
      const opaque = pixels.filter((pixel) => pixel[3] >= 128);
      const candidates = opaque.length > 0 ? opaque : pixels;
      let darkest = candidates[0]!;
      let lightest = candidates[0]!;
      for (const pixel of candidates) {
        const luminance = pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114;
        const darkLuminance = darkest[0] * 299 + darkest[1] * 587 + darkest[2] * 114;
        const lightLuminance = lightest[0] * 299 + lightest[1] * 587 + lightest[2] * 114;
        if (luminance < darkLuminance) darkest = pixel;
        if (luminance > lightLuminance) lightest = pixel;
      }
      let first = toRgb565(lightest[0], lightest[1], lightest[2]);
      let second = toRgb565(darkest[0], darkest[1], darkest[2]);
      const hasTransparency = pixels.some((pixel) => pixel[3] < 128);
      if (hasTransparency) {
        if (first > second) [first, second] = [second, first];
      } else if (first <= second) {
        if (second < 0xffff) first = second + 1;
        else second = first - 1;
      }
      const [r0, g0, b0] = rgb565(first);
      const [r1, g1, b1] = rgb565(second);
      const palette: Array<readonly [number, number, number]> = [
        [r0, g0, b0],
        [r1, g1, b1],
      ];
      if (first > second)
        palette.push(
          [
            Math.round((2 * r0 + r1) / 3),
            Math.round((2 * g0 + g1) / 3),
            Math.round((2 * b0 + b1) / 3),
          ],
          [
            Math.round((r0 + 2 * r1) / 3),
            Math.round((g0 + 2 * g1) / 3),
            Math.round((b0 + 2 * b1) / 3),
          ],
        );
      else
        palette.push([
          Math.round((r0 + r1) / 2),
          Math.round((g0 + g1) / 2),
          Math.round((b0 + b1) / 2),
        ]);
      let indexes = 0;
      for (let index = 0; index < pixels.length; index += 1) {
        const pixel = pixels[index]!;
        let selected = hasTransparency && pixel[3] < 128 ? 3 : 0;
        if (selected !== 3) {
          let distance = Number.POSITIVE_INFINITY;
          for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex += 1) {
            const candidate = colourDistance(pixel, palette[paletteIndex]!);
            if (candidate < distance) {
              distance = candidate;
              selected = paletteIndex;
            }
          }
        }
        indexes |= selected << (index * 2);
      }
      const offset = 128 + (blockY * blocksWide + blockX) * 8;
      view.setUint16(offset, first, true);
      view.setUint16(offset + 2, second, true);
      view.setUint32(offset + 4, indexes >>> 0, true);
    }
  }
  return output.buffer;
}

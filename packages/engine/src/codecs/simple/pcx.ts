import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

/** Decodes the common 8-bit, one-plane PCX variant with its trailing 256-colour palette. */
export function decodePcx(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length < 897 ||
    bytes[0] !== 0x0a ||
    bytes[2] !== 1 ||
    bytes[3] !== 8 ||
    bytes[65] !== 1
  )
    throw new Error('Unsupported or malformed PCX image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = u16(view, 8) - u16(view, 4) + 1;
  const height = u16(view, 10) - u16(view, 6) + 1;
  const bytesPerLine = u16(view, 66);
  if (width < 1 || height < 1 || bytesPerLine < width)
    throw new Error('Unsupported or malformed PCX dimensions.');
  const paletteOffset = bytes.length - 769;
  if (bytes[paletteOffset] !== 12) throw new Error('PCX is missing its 256-colour palette.');
  const indices = new Uint8Array(bytesPerLine * height);
  let source = 128;
  let target = 0;
  while (target < indices.length && source < paletteOffset) {
    const value = bytes[source++]!;
    const count = (value & 0xc0) === 0xc0 ? value & 0x3f : 1;
    const sample = count === 1 ? value : bytes[source++]!;
    if (target + count > indices.length)
      throw new Error('PCX RLE data exceeds its declared dimensions.');
    indices.fill(sample!, target, target + count);
    target += count;
  }
  if (target !== indices.length) throw new Error('Truncated PCX RLE data.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = indices[y * bytesPerLine + x]!;
      const pixel = (y * width + x) * 4;
      const palette = paletteOffset + 1 + index * 3;
      rgba.set([bytes[palette]!, bytes[palette + 1]!, bytes[palette + 2]!, 255], pixel);
    }
  }
  return createRaster(width, height, rgba);
}

/** Encodes an opaque raster as a 256-colour PCX, preserving up to 256 exact colours. */
export function encodePcx(image: RasterImage): ArrayBuffer {
  if (image.width > 65_536 || image.height > 65_536)
    throw new Error('PCX dimensions must not exceed 65536 pixels.');
  const frame = image.frames[0];
  if (!frame) throw new Error('Cannot encode an image without a frame.');
  const palette = new Map<number, number>();
  const colours: number[] = [];
  const indices = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const offset = pixel * 4;
    if (frame.data[offset + 3] !== 255) throw new Error('PCX does not support alpha transparency.');
    const colour =
      (frame.data[offset]! << 16) | (frame.data[offset + 1]! << 8) | frame.data[offset + 2]!;
    let index = palette.get(colour);
    if (index === undefined) {
      if (colours.length === 256)
        throw new Error('PCX encoding supports at most 256 exact colours.');
      index = colours.length;
      palette.set(colour, index);
      colours.push(colour);
    }
    indices[pixel] = index;
  }
  const bytesPerLine = image.width % 2 === 0 ? image.width : image.width + 1;
  const rle: number[] = [];
  for (let y = 0; y < image.height; y += 1) {
    const row = new Uint8Array(bytesPerLine);
    row.set(indices.subarray(y * image.width, (y + 1) * image.width));
    for (let offset = 0; offset < row.length;) {
      const value = row[offset]!;
      let count = 1;
      while (count < 63 && offset + count < row.length && row[offset + count] === value) count += 1;
      if (count > 1 || value >= 0xc0) rle.push(0xc0 | count);
      rle.push(value);
      offset += count;
    }
  }
  const output = new Uint8Array(128 + rle.length + 769);
  const view = new DataView(output.buffer);
  output.set([0x0a, 5, 1, 8]);
  view.setUint16(8, image.width - 1, true);
  view.setUint16(10, image.height - 1, true);
  output[65] = 1;
  view.setUint16(66, bytesPerLine, true);
  output.set(rle, 128);
  const paletteOffset = 128 + rle.length;
  output[paletteOffset] = 12;
  for (let index = 0; index < colours.length; index += 1) {
    const colour = colours[index]!;
    output[paletteOffset + 1 + index * 3] = colour >> 16;
    output[paletteOffset + 2 + index * 3] = (colour >> 8) & 0xff;
    output[paletteOffset + 3 + index * 3] = colour & 0xff;
  }
  return output.buffer;
}

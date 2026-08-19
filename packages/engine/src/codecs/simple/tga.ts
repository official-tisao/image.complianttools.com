import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

export function decodeTga(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 18 || bytes[1] !== 0 || ![2, 10].includes(bytes[2]!))
    throw new Error('Unsupported TGA encoding.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(12, true),
    height = view.getUint16(14, true),
    depth = bytes[16]!;
  if (width === 0 || height === 0 || ![24, 32].includes(depth))
    throw new Error('Invalid TGA header.');
  const offset = 18 + bytes[0]!,
    pixelBytes = depth / 8;
  const output = new Uint8ClampedArray(width * height * 4),
    topOrigin = (bytes[17]! & 0x20) !== 0;
  let source = offset;
  const writePixel = (pixel: number, bgr: Uint8Array) => {
    const y = Math.floor(pixel / width),
      x = pixel % width;
    const target = ((topOrigin ? y : height - 1 - y) * width + x) * 4;
    output[target] = bgr[2]!;
    output[target + 1] = bgr[1]!;
    output[target + 2] = bgr[0]!;
    output[target + 3] = depth === 32 ? bgr[3]! : 255;
  };
  const readPixel = () => {
    if (source + pixelBytes > bytes.length) throw new Error('Truncated TGA image.');
    const pixel = bytes.subarray(source, source + pixelBytes);
    source += pixelBytes;
    return pixel;
  };
  for (let pixel = 0; pixel < width * height;) {
    if (bytes[2] === 2) {
      writePixel(pixel, readPixel());
      pixel += 1;
      continue;
    }
    if (source >= bytes.length) throw new Error('Truncated TGA RLE data.');
    const header = bytes[source++]!;
    const count = (header & 0x7f) + 1;
    if (pixel + count > width * height)
      throw new Error('TGA RLE data exceeds declared dimensions.');
    if ((header & 0x80) !== 0) {
      const value = readPixel();
      for (let index = 0; index < count; index += 1) writePixel(pixel + index, value);
    } else {
      for (let index = 0; index < count; index += 1) writePixel(pixel + index, readPixel());
    }
    pixel += count;
  }
  return createRaster(width, height, output);
}

export function encodeTga(image: RasterImage): ArrayBuffer {
  const output = new Uint8Array(18 + image.width * image.height * 4),
    pixels = image.frames[0].data;
  output[2] = 2;
  output[12] = image.width & 255;
  output[13] = image.width >> 8;
  output[14] = image.height & 255;
  output[15] = image.height >> 8;
  output[16] = 32;
  output[17] = 0x28;
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const source = pixel * 4,
      target = 18 + source;
    output[target] = pixels[source + 2]!;
    output[target + 1] = pixels[source + 1]!;
    output[target + 2] = pixels[source]!;
    output[target + 3] = pixels[source + 3]!;
  }
  return output.buffer;
}

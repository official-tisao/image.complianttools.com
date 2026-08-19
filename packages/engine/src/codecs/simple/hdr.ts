import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function headerEnd(bytes: Uint8Array): number {
  const marker = new TextEncoder().encode('\n\n');
  for (let index = 0; index + marker.length <= bytes.length; index += 1) {
    if (bytes[index] === marker[0] && bytes[index + 1] === marker[1]) return index + marker.length;
  }
  throw new Error('Malformed Radiance HDR header.');
}

function rgbEToSdr(red: number, green: number, blue: number, exponent: number): readonly number[] {
  if (exponent === 0) return [0, 0, 0];
  const factor = 2 ** (exponent - 136);
  // Reinhard tone map gives deterministic SDR output without silently clipping highlights.
  return [red, green, blue].map((value) => {
    const linear = value * factor;
    return Math.round((linear / (1 + linear)) * 255);
  });
}

/** Decodes the non-RLE RGBE Radiance HDR variant into tone-mapped SDR pixels. */
export function decodeHdr(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const signature = new TextDecoder().decode(bytes.subarray(0, 10));
  if (!['#?RADIANCE', '#?RGBE'].some((value) => signature.startsWith(value)))
    throw new Error('Invalid Radiance HDR signature.');
  const payloadStart = headerEnd(bytes);
  const resolutionEnd = bytes.indexOf(10, payloadStart);
  if (resolutionEnd === -1) throw new Error('Malformed Radiance HDR resolution line.');
  const resolution = new TextDecoder().decode(bytes.subarray(payloadStart, resolutionEnd));
  const match = /^-Y (\d+) \+X (\d+)$/u.exec(resolution);
  if (!match) throw new Error('Unsupported Radiance HDR orientation.');
  const height = Number(match[1]);
  const width = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000
  )
    throw new Error('Unsupported or malformed Radiance HDR dimensions.');
  const dataStart = resolutionEnd + 1;
  const expectedBytes = width * height * 4;
  if (dataStart + expectedBytes !== bytes.length)
    throw new Error('RLE Radiance HDR is not supported or pixel data is truncated.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const source = dataStart + index * 4;
    const [red, green, blue] = rgbEToSdr(
      bytes[source]!,
      bytes[source + 1]!,
      bytes[source + 2]!,
      bytes[source + 3]!,
    );
    pixels.set([red!, green!, blue!, 255], index * 4);
  }
  return createRaster(width, height, pixels);
}

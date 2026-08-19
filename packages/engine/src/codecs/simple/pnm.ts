import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function tokens(bytes: Uint8Array): string[] {
  return new TextDecoder()
    .decode(bytes)
    .replace(/#[^\r\n]*/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function decodePnm(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const header = tokens(bytes);
  const magic = header[0];
  const width = Number(header[1]);
  const height = Number(header[2]);
  const max = magic === 'P1' || magic === 'P4' ? 1 : Number(header[3]);
  if (
    !['P1', 'P2', 'P3'].includes(magic ?? '') ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    max < 1 ||
    max > 65535
  )
    throw new Error('Unsupported or malformed PNM image.');
  const samples = header.slice(magic === 'P1' ? 3 : 4).map(Number);
  const channels = magic === 'P3' ? 3 : 1;
  if (
    samples.length !== width * height * channels ||
    samples.some((sample) => !Number.isInteger(sample) || sample < 0 || sample > max)
  )
    throw new Error('Truncated or invalid PNM pixel data.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    const scale = (value: number) => Math.round((value / max) * 255);
    rgba[target] = scale(samples[source]!);
    rgba[target + 1] = scale(samples[source + (channels === 1 ? 0 : 1)]!);
    rgba[target + 2] = scale(samples[source + (channels === 1 ? 0 : 2)]!);
    rgba[target + 3] = 255;
  }
  return createRaster(width, height, rgba);
}

export function encodePpm(image: RasterImage): ArrayBuffer {
  const header = new TextEncoder().encode(`P3\n${image.width} ${image.height}\n255\n`);
  const values: string[] = [];
  for (let offset = 0; offset < image.frames[0].data.length; offset += 4) {
    const data = image.frames[0].data;
    values.push(String(data[offset]!), String(data[offset + 1]!), String(data[offset + 2]!));
  }
  const payload = new TextEncoder().encode(values.join(' '));
  const output = new Uint8Array(header.length + payload.length);
  output.set(header);
  output.set(payload, header.length);
  return output.buffer;
}

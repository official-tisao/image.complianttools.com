import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function readToken(bytes: Uint8Array, start: number): { value: string; next: number } {
  let offset = start;
  while (offset < bytes.length && /\s/u.test(String.fromCharCode(bytes[offset]!))) offset += 1;
  if (bytes[offset] === 35) {
    while (offset < bytes.length && bytes[offset] !== 10 && bytes[offset] !== 13) offset += 1;
    return readToken(bytes, offset);
  }
  const begin = offset;
  while (offset < bytes.length && !/\s/u.test(String.fromCharCode(bytes[offset]!))) offset += 1;
  return { value: new TextDecoder().decode(bytes.subarray(begin, offset)), next: offset };
}

export function decodePnm(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const magicToken = readToken(bytes, 0);
  const widthToken = readToken(bytes, magicToken.next);
  const heightToken = readToken(bytes, widthToken.next);
  const maxToken = ['P1', 'P4'].includes(magicToken.value)
    ? undefined
    : readToken(bytes, heightToken.next);
  const magic = magicToken.value;
  const width = Number(widthToken.value);
  const height = Number(heightToken.value);
  const max = maxToken ? Number(maxToken.value) : 1;
  if (
    !['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].includes(magic) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    max < 1 ||
    max > 65535
  )
    throw new Error('Unsupported or malformed PNM image.');
  const binary = ['P4', 'P5', 'P6'].includes(magic);
  const channels = magic === 'P3' || magic === 'P6' ? 3 : 1;
  const headerEnd = (maxToken ?? heightToken).next;
  if (!/\s/u.test(String.fromCharCode(bytes[headerEnd] ?? 0)))
    throw new Error('Malformed PNM header separator.');
  const start =
    bytes[headerEnd] === 13 && bytes[headerEnd + 1] === 10 ? headerEnd + 2 : headerEnd + 1;
  const samples: number[] = [];
  if (binary) {
    if (magic === 'P4') {
      const rowBytes = Math.ceil(width / 8);
      if (start + rowBytes * height !== bytes.length)
        throw new Error('Truncated or invalid PNM pixel data.');
      for (let pixel = 0; pixel < width * height; pixel += 1)
        samples.push(
          (bytes[start + Math.floor(pixel / width) * rowBytes + Math.floor((pixel % width) / 8)]! >>
            (7 - (pixel % 8))) &
            1,
        );
    } else {
      const sampleBytes = max > 255 ? 2 : 1;
      const count = width * height * channels;
      if (start + count * sampleBytes !== bytes.length)
        throw new Error('Truncated or invalid PNM pixel data.');
      for (let index = 0; index < count; index += 1)
        samples.push(
          sampleBytes === 1
            ? bytes[start + index]!
            : (bytes[start + index * 2]! << 8) | bytes[start + index * 2 + 1]!,
        );
    }
  } else {
    const body = new TextDecoder()
      .decode(bytes.subarray(start))
      .replace(/#[^\r\n]*/g, '')
      .trim();
    samples.push(...(body ? body.split(/\s+/).map(Number) : []));
  }
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

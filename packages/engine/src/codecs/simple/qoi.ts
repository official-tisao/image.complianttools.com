import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

const endMarker = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 1]);
const hash = (r: number, g: number, b: number, a: number) => (r * 3 + g * 5 + b * 7 + a * 11) % 64;

export function decodeQoi(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'qoif')
    throw new Error('Invalid QOI header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  if (width === 0 || height === 0 || bytes[12] !== 4) throw new Error('Unsupported QOI image.');
  const output = new Uint8ClampedArray(width * height * 4);
  const index = new Uint8Array(64 * 4);
  let offset = 14,
    pixel = 0,
    r = 0,
    g = 0,
    b = 0,
    a = 255,
    run = 0;
  while (pixel < width * height) {
    if (run > 0) run -= 1;
    else {
      const tag = bytes[offset++];
      if (tag === undefined) throw new Error('Truncated QOI image.');
      if (tag === 0xfe) {
        r = bytes[offset++]!;
        g = bytes[offset++]!;
        b = bytes[offset++]!;
      } else if (tag === 0xff) {
        r = bytes[offset++]!;
        g = bytes[offset++]!;
        b = bytes[offset++]!;
        a = bytes[offset++]!;
      } else if ((tag & 0xc0) === 0x00) {
        const i = tag * 4;
        r = index[i]!;
        g = index[i + 1]!;
        b = index[i + 2]!;
        a = index[i + 3]!;
      } else if ((tag & 0xc0) === 0x40) {
        r = (r + (((tag >> 4) & 3) - 2) + 256) % 256;
        g = (g + (((tag >> 2) & 3) - 2) + 256) % 256;
        b = (b + ((tag & 3) - 2) + 256) % 256;
      } else if ((tag & 0xc0) === 0x80) {
        const next = bytes[offset++]!;
        const dg = (tag & 63) - 32;
        r = (r + dg + ((next >> 4) - 8) + 512) % 256;
        g = (g + dg + 256) % 256;
        b = (b + dg + ((next & 15) - 8) + 512) % 256;
      } else run = tag & 63;
      const i = hash(r, g, b, a) * 4;
      index.set([r, g, b, a], i);
    }
    output.set([r, g, b, a], pixel * 4);
    pixel += 1;
  }
  return createRaster(width, height, output);
}

export function encodeQoi(image: RasterImage): ArrayBuffer {
  const output: number[] = [...new TextEncoder().encode('qoif')];
  for (const value of [image.width, image.height])
    output.push(value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  output.push(4, 0);
  const index = new Uint8Array(64 * 4);
  const data = image.frames[0].data;
  let r = 0,
    g = 0,
    b = 0,
    a = 255,
    run = 0;
  const flush = () => {
    if (run) {
      output.push(0xc0 | (run - 1));
      run = 0;
    }
  };
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const at = pixel * 4,
      nr = data[at]!,
      ng = data[at + 1]!,
      nb = data[at + 2]!,
      na = data[at + 3]!;
    if (nr === r && ng === g && nb === b && na === a) {
      run += 1;
      if (run === 62 || pixel === image.width * image.height - 1) flush();
      continue;
    }
    flush();
    const slot = hash(nr, ng, nb, na) * 4;
    if (
      index[slot] === nr &&
      index[slot + 1] === ng &&
      index[slot + 2] === nb &&
      index[slot + 3] === na
    )
      output.push(slot / 4);
    else if (na === a) {
      const dr = nr - r,
        dg = ng - g,
        db = nb - b;
      if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2)
        output.push(0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2));
      else if (dg > -33 && dg < 32 && dr - dg > -9 && dr - dg < 8 && db - dg > -9 && db - dg < 8)
        output.push(0x80 | (dg + 32), ((dr - dg + 8) << 4) | (db - dg + 8));
      else output.push(0xfe, nr, ng, nb);
    } else output.push(0xff, nr, ng, nb, na);
    index.set([nr, ng, nb, na], slot);
    r = nr;
    g = ng;
    b = nb;
    a = na;
  }
  output.push(...endMarker);
  return Uint8Array.from(output).buffer;
}

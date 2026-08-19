import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

const CARD_BYTES = 80;
const BLOCK_BYTES = 2880;

function cardValue(header: Uint8Array, name: string): string | undefined {
  for (let offset = 0; offset + CARD_BYTES <= header.length; offset += CARD_BYTES) {
    const card = new TextDecoder().decode(header.subarray(offset, offset + CARD_BYTES));
    if (card.slice(0, 8).trim() !== name) continue;
    const equals = card.indexOf('=');
    return equals === -1
      ? undefined
      : card
          .slice(equals + 1)
          .split('/')[0]
          ?.trim();
  }
  return undefined;
}

/** Decodes a two-dimensional primary FITS image into an 8-bit grayscale raster. */
export function decodeFits(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let headerEnd = -1;
  for (let offset = 0; offset + CARD_BYTES <= bytes.length; offset += CARD_BYTES) {
    if (new TextDecoder().decode(bytes.subarray(offset, offset + 8)).trim() === 'END') {
      headerEnd = Math.ceil((offset + CARD_BYTES) / BLOCK_BYTES) * BLOCK_BYTES;
      break;
    }
  }
  if (headerEnd < 0 || headerEnd > bytes.length) throw new Error('Malformed FITS header.');
  const simple = cardValue(bytes.subarray(0, headerEnd), 'SIMPLE');
  const bitpix = Number(cardValue(bytes.subarray(0, headerEnd), 'BITPIX'));
  const naxis = Number(cardValue(bytes.subarray(0, headerEnd), 'NAXIS'));
  const width = Number(cardValue(bytes.subarray(0, headerEnd), 'NAXIS1'));
  const height = Number(cardValue(bytes.subarray(0, headerEnd), 'NAXIS2'));
  const bscale = Number(cardValue(bytes.subarray(0, headerEnd), 'BSCALE') ?? '1');
  const bzero = Number(cardValue(bytes.subarray(0, headerEnd), 'BZERO') ?? '0');
  if (
    simple !== 'T' ||
    naxis !== 2 ||
    ![8, 16].includes(bitpix) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000 ||
    !Number.isFinite(bscale) ||
    !Number.isFinite(bzero)
  )
    throw new Error('Unsupported or malformed FITS image.');
  const sampleBytes = bitpix / 8;
  const payloadBytes = width * height * sampleBytes;
  if (headerEnd + payloadBytes > bytes.byteLength) throw new Error('Truncated FITS pixel data.');
  const view = new DataView(bytes.buffer, bytes.byteOffset + headerEnd, payloadBytes);
  const sampleAt = (index: number) =>
    (bitpix === 8 ? view.getUint8(index) : view.getInt16(index * 2, false)) * bscale + bzero;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < width * height; index += 1) {
    const sample = sampleAt(index);
    minimum = Math.min(minimum, sample);
    maximum = Math.max(maximum, sample);
  }
  const range = maximum - minimum || 1;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = Math.round(((sampleAt(index) - minimum) / range) * 255);
    pixels.set([value, value, value, 255], index * 4);
  }
  return { ...createRaster(width, height, pixels), colorSpace: 'gray' };
}

function card(name: string, value: string): string {
  return `${name.padEnd(8, ' ')}= ${value.padStart(20, ' ')}`.padEnd(CARD_BYTES, ' ');
}

/** Encodes the first raster frame as an 8-bit, two-dimensional FITS primary image. */
export function encodeFits(image: RasterImage): ArrayBuffer {
  if (image.width < 1 || image.height < 1 || image.width * image.height > 100_000_000)
    throw new Error('FITS dimensions are unsafe.');
  const frame = image.frames[0];
  if (!frame) throw new Error('Cannot encode an image without a frame.');
  const headerText = [
    card('SIMPLE', 'T'),
    card('BITPIX', '8'),
    card('NAXIS', '2'),
    card('NAXIS1', String(image.width)),
    card('NAXIS2', String(image.height)),
    'END'.padEnd(CARD_BYTES, ' '),
  ].join('');
  const headerBytes = Math.ceil(headerText.length / BLOCK_BYTES) * BLOCK_BYTES;
  const payloadBytes = image.width * image.height;
  const output = new Uint8Array(headerBytes + Math.ceil(payloadBytes / BLOCK_BYTES) * BLOCK_BYTES);
  output.set(new TextEncoder().encode(headerText));
  for (let pixel = 0; pixel < payloadBytes; pixel += 1) {
    const offset = pixel * 4;
    const alpha = frame.data[offset + 3]! / 255;
    output[headerBytes + pixel] = Math.round(
      (frame.data[offset]! * 0.2126 +
        frame.data[offset + 1]! * 0.7152 +
        frame.data[offset + 2]! * 0.0722) *
        alpha,
    );
  }
  return output.buffer;
}

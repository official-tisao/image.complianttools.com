import { rasterEquals } from '../ops/raster.js';
import type { RasterImage } from '../types.js';
import { decodeJpegToRaster } from './jsquash.js';

export interface LosslessJpegOptimizationResult {
  readonly bytes: ArrayBuffer;
  readonly changed: boolean;
  readonly originalBytes: number;
  readonly optimizedBytes: number;
}

/**
 * Removes JPEG metadata markers without touching entropy-coded image data.
 * APP0 (JFIF) and APP14 (Adobe transform) remain because they can affect rendering.
 */
export function stripJpegMetadataMarkers(input: ArrayBuffer | Uint8Array): Uint8Array {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8)
    throw new Error('JPEG has an invalid start-of-image marker.');
  const chunks: Uint8Array[] = [source.subarray(0, 2)];
  let offset = 2;
  while (offset < source.length) {
    const markerStart = offset;
    if (source[offset++] !== 0xff) throw new Error('JPEG marker stream is malformed.');
    while (source[offset] === 0xff) offset += 1;
    if (offset >= source.length) throw new Error('JPEG marker stream is truncated.');
    const marker = source[offset++]!;
    if (marker === 0xd9) {
      chunks.push(source.subarray(markerStart, offset));
      if (offset !== source.length) throw new Error('JPEG contains bytes after end-of-image.');
      break;
    }
    if (marker === 0xda) {
      if (offset + 2 > source.length) throw new Error('JPEG scan header is truncated.');
      const length = (source[offset]! << 8) | source[offset + 1]!;
      if (length < 2 || offset + length > source.length)
        throw new Error('JPEG scan header has an invalid length.');
      chunks.push(source.subarray(markerStart));
      offset = source.length;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(source.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > source.length) throw new Error('JPEG segment header is truncated.');
    const length = (source[offset]! << 8) | source[offset + 1]!;
    if (length < 2 || offset + length > source.length)
      throw new Error('JPEG segment has an invalid length.');
    const end = offset + length;
    const removable = marker === 0xfe || (marker >= 0xe1 && marker <= 0xed) || marker === 0xef;
    if (!removable) chunks.push(source.subarray(markerStart, end));
    offset = end;
  }
  if (offset !== source.length) throw new Error('JPEG marker stream is truncated.');
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let target = 0;
  for (const chunk of chunks) {
    output.set(chunk, target);
    target += chunk.length;
  }
  return output;
}

/** Returns changed JPEG bytes only after an independent MozJPEG pixel comparison. */
export async function optimizeJpegLossless(
  input: ArrayBuffer | Uint8Array,
  decoder: (input: ArrayBuffer) => Promise<RasterImage> = decodeJpegToRaster,
): Promise<LosslessJpegOptimizationResult> {
  const source = input instanceof Uint8Array ? input.slice() : new Uint8Array(input.slice(0));
  const candidate = stripJpegMetadataMarkers(source);
  let best = source;
  if (candidate.byteLength < source.byteLength) {
    const sourceBuffer = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ) as ArrayBuffer;
    const candidateBuffer = candidate.buffer.slice(
      candidate.byteOffset,
      candidate.byteOffset + candidate.byteLength,
    ) as ArrayBuffer;
    try {
      if (rasterEquals(await decoder(sourceBuffer), await decoder(candidateBuffer)))
        best = candidate;
    } catch {
      // Failed verification preserves the original bytes.
    }
  }
  return {
    bytes: best.buffer.slice(best.byteOffset, best.byteOffset + best.byteLength),
    changed: best.byteLength < source.byteLength,
    originalBytes: source.byteLength,
    optimizedBytes: best.byteLength,
  };
}

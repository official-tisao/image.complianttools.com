import { decompressFrames, parseGIF } from 'gifuct-js';

import type { RasterImage } from '../../types.js';

export function decodeGif(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const parsed = parseGIF(buffer);
  const decoded = decompressFrames(parsed, true);
  if (decoded.length === 0) throw new Error('GIF contains no image frames.');
  const canvas = new Uint8ClampedArray(parsed.lsd.width * parsed.lsd.height * 4);
  const frames = decoded.map((frame) => {
    for (let y = 0; y < frame.dims.height; y += 1) {
      const source = y * frame.dims.width * 4;
      const target = ((frame.dims.top + y) * parsed.lsd.width + frame.dims.left) * 4;
      canvas.set(frame.patch.subarray(source, source + frame.dims.width * 4), target);
    }
    return { data: canvas.slice(), durationMs: Math.max(10, frame.delay * 10) };
  });
  return {
    width: parsed.lsd.width,
    height: parsed.lsd.height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: frames as unknown as RasterImage['frames'],
  };
}

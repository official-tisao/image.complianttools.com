import { describe, expect, it } from 'vitest';
import { createRaster, decodeGif, encodeGif, optimiseGifFrames } from '../src/index.js';

describe('GIF encoder', () => {
  it('encodes an animated GIF that decodes to its original frame count', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    const animated = {
      ...image,
      frames: [image.frames[0], { data: image.frames[0].data.slice(), durationMs: 40 }],
    } as typeof image;
    expect(decodeGif(encodeGif(animated)).frames).toHaveLength(2);
  });

  it('uses dictionary LZW compression for repeated pixels', () => {
    const image = createRaster(
      100,
      1,
      new Uint8ClampedArray(Array.from({ length: 100 }, () => [12, 34, 56, 255]).flat()),
    );
    const encoded = encodeGif(image);
    expect(new Uint8Array(encoded).byteLength).toBeLessThan(850);
    expect(decodeGif(encoded).frames[0].data).toHaveLength(400);
  });

  it('losslessly merges consecutive identical frames before encoding', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 255]));
    const result = optimiseGifFrames({
      ...image,
      frames: [
        { data: image.frames[0].data, durationMs: 20 },
        { data: image.frames[0].data.slice(), durationMs: 30 },
      ],
    } as typeof image);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].durationMs).toBe(50);
  });
});

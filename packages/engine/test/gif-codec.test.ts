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

  it('preserves transparent GIF pixels with a reserved palette index', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([0, 0, 0, 0]));
    expect(decodeGif(encodeGif(image)).frames[0].data[3]).toBe(0);
  });

  it('uses transparent frame differences without changing composited pixels', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    const changed = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const animated = {
      ...image,
      frames: [image.frames[0], { data: changed, durationMs: 40 }],
    } as typeof image;
    const decoded = decodeGif(encodeGif(animated, 0, { optimizeLevel: 2 }));
    expect(decoded.frames).toHaveLength(2);
    expect(decoded.frames[1].data[0]).toBeGreaterThan(200);
    expect(decoded.frames[1].data[6]).toBeGreaterThan(200);
  });

  it('offers deterministic lossy palette reduction within the documented range', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([31, 95, 159, 255, 201, 99, 11, 255]));
    const zero = new Uint8Array(encodeGif(image, 0, { lossy: 0 }));
    const high = new Uint8Array(encodeGif(image, 0, { lossy: 200 }));
    expect(high).not.toEqual(zero);
    expect(() => encodeGif(image, 0, { lossy: 999 })).not.toThrow();
  });
});

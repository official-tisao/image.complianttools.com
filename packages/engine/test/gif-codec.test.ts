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

  it('writes a smaller changed-pixel rectangle at optimization level 2', () => {
    const image = createRaster(20, 20, new Uint8ClampedArray(20 * 20 * 4).fill(255));
    const changed = image.frames[0].data.slice();
    changed.set([0, 0, 0, 255], (10 * 20 + 10) * 4);
    const animated = {
      ...image,
      frames: [image.frames[0], { data: changed, durationMs: 40 }],
    } as typeof image;
    expect(encodeGif(animated, 0, { optimizeLevel: 2 }).byteLength).toBeLessThan(
      encodeGif(animated, 0, { optimizeLevel: 1 }).byteLength,
    );
  });

  it('offers deterministic lossy palette reduction within the documented range', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([31, 95, 159, 255, 201, 99, 11, 255]));
    const zero = new Uint8Array(encodeGif(image, 0, { lossy: 0 }));
    const high = new Uint8Array(encodeGif(image, 0, { lossy: 200 }));
    expect(high).not.toEqual(zero);
    expect(() => encodeGif(image, 0, { lossy: 999 })).not.toThrow();
  });

  it('uses a weighted median-cut palette that preserves exact small palettes', () => {
    const pixels = new Uint8ClampedArray([250, 10, 130, 255, 7, 201, 33, 255, 250, 10, 130, 255]);
    const image = createRaster(3, 1, pixels);
    const encoded = encodeGif(image, 0, { quantizer: 'median-cut' });
    expect(decodeGif(encoded).frames[0].data).toEqual(pixels);
    expect(new Uint8Array(encodeGif(image, 0, { quantizer: 'median-cut' }))).toEqual(
      new Uint8Array(encoded),
    );
  });

  it('uses a deterministic weighted octree palette', () => {
    const pixels = new Uint8ClampedArray(300 * 4);
    for (let pixel = 0; pixel < 300; pixel += 1)
      pixels.set([(pixel * 47) & 255, (pixel * 89) & 255, (pixel * 131) & 255, 255], pixel * 4);
    const image = createRaster(300, 1, pixels);
    const octree = new Uint8Array(encodeGif(image, 0, { quantizer: 'octree' }));
    expect(octree).not.toEqual(new Uint8Array(encodeGif(image, 0, { quantizer: 'fixed-332' })));
    expect(new Uint8Array(encodeGif(image, 0, { quantizer: 'octree' }))).toEqual(octree);
    expect(decodeGif(octree)).toMatchObject({ width: 300, height: 1 });
  });

  it('uses deterministic Wu variance partitioning', () => {
    const pixels = new Uint8ClampedArray(512 * 4);
    for (let pixel = 0; pixel < 512; pixel += 1)
      pixels.set([(pixel * 29) & 255, (pixel * 61) & 255, (pixel * 113) & 255, 255], pixel * 4);
    const image = createRaster(512, 1, pixels);
    const wu = new Uint8Array(encodeGif(image, 0, { quantizer: 'wu' }));
    expect(wu).not.toEqual(new Uint8Array(encodeGif(image, 0, { quantizer: 'fixed-332' })));
    expect(new Uint8Array(encodeGif(image, 0, { quantizer: 'wu' }))).toEqual(wu);
    expect(decodeGif(wu)).toMatchObject({ width: 512, height: 1 });
  });

  it('offers deterministic Floyd-Steinberg palette-error diffusion', () => {
    const pixels = new Uint8ClampedArray(32 * 4);
    for (let pixel = 0; pixel < 32; pixel += 1) {
      pixels[pixel * 4] = 128;
      pixels[pixel * 4 + 1] = 128;
      pixels[pixel * 4 + 2] = 128;
      pixels[pixel * 4 + 3] = 255;
    }
    const image = createRaster(32, 1, pixels);
    const plain = new Uint8Array(encodeGif(image, 0, { dither: 'none' }));
    const dithered = new Uint8Array(encodeGif(image, 0, { dither: 'floyd-steinberg' }));
    expect(dithered).not.toEqual(plain);
    expect(new Uint8Array(encodeGif(image, 0, { dither: 'floyd-steinberg' }))).toEqual(dithered);
    expect(decodeGif(dithered)).toMatchObject({ width: 32, height: 1 });
  });

  it('offers deterministic ordered palette dithering', () => {
    const pixels = new Uint8ClampedArray(32 * 4);
    for (let pixel = 0; pixel < 32; pixel += 1) pixels.set([128, 128, 128, 255], pixel * 4);
    const image = createRaster(8, 4, pixels);
    const plain = new Uint8Array(encodeGif(image, 0, { dither: 'none' }));
    const ordered = new Uint8Array(encodeGif(image, 0, { dither: 'ordered' }));
    expect(ordered).not.toEqual(plain);
    expect(new Uint8Array(encodeGif(image, 0, { dither: 'ordered' }))).toEqual(ordered);
  });

  it.each([
    ['keep', 1],
    ['background', 2],
    ['previous', 3],
  ] as const)(
    'writes the %s disposal method into the graphic control extension',
    (disposal, code) => {
      const encoded = new Uint8Array(encodeGif(createRaster(1, 1), 0, { disposal }));
      const extension = encoded.findIndex(
        (value, index) => value === 0x21 && encoded[index + 1] === 0xf9 && encoded[index + 2] === 4,
      );
      expect(extension).toBeGreaterThan(0);
      expect((encoded[extension + 3]! >> 2) & 7).toBe(code);
    },
  );

  it('honors background disposal while compositing decoded animation frames', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 255]));
    const animated = {
      ...image,
      frames: [image.frames[0], { data: new Uint8ClampedArray(4), durationMs: 40 }],
    } as typeof image;
    const decoded = decodeGif(encodeGif(animated, 0, { disposal: 'background' }));
    expect(decoded.frames[0].data[0]).toBeGreaterThan(200);
    expect(decoded.frames[0].data[3]).toBe(255);
    expect(decoded.frames[1].data).toEqual(new Uint8ClampedArray(4));
  });
});

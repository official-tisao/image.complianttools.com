import { describe, expect, it } from 'vitest';
import {
  createRaster,
  decodeGif,
  encodeGif,
  generateGifFrames,
  optimiseGifFrames,
  optimizeGifLossless,
  readGifLoopCount,
  readContainerMetadata,
  restoreContainerMetadata,
} from '../src/index.js';

describe('GIF encoder', () => {
  it('preserves readable GIF comments through decode and re-encode by default', () => {
    const encoded = new Uint8Array(
      encodeGif(createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 255]))),
    );
    const comment = new Uint8Array([0x21, 0xfe, 4, 0x6c, 0x6f, 0x63, 0x61, 0]);
    const tagged = restoreContainerMetadata(encoded, { format: 'gif', blocks: [comment] });
    const reencoded = encodeGif(decodeGif(tagged));
    expect(readContainerMetadata(reencoded).tags).toEqual(readContainerMetadata(tagged).tags);
  });
  it('generates reverse, bounce, and crossfade animation sequences', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([0, 0, 0, 255]));
    const animated = {
      ...image,
      frames: [
        { data: new Uint8ClampedArray([0, 0, 0, 255]), durationMs: 100 },
        { data: new Uint8ClampedArray([120, 60, 30, 255]), durationMs: 100 },
        { data: new Uint8ClampedArray([240, 120, 60, 255]), durationMs: 100 },
      ],
    } as typeof image;
    expect(generateGifFrames(animated, 'reverse').frames[0].data[0]).toBe(240);
    expect(generateGifFrames(animated, 'bounce').frames.map((frame) => frame.data[0])).toEqual([
      0, 120, 240, 120,
    ]);
    const crossfade = generateGifFrames(animated, 'crossfade', 1);
    expect(crossfade.frames).toHaveLength(5);
    expect([...crossfade.frames[1].data]).toEqual([60, 30, 15, 255]);
    expect([...crossfade.frames[3].data]).toEqual([180, 90, 45, 255]);
    expect(decodeGif(encodeGif(crossfade)).frames).toHaveLength(5);
  });

  it('writes loop count and validates animation timing ranges', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 255]));
    const encoded = new Uint8Array(encodeGif(image, 513));
    const signature = new TextEncoder().encode('NETSCAPE2.0');
    const netscape = encoded.findIndex((_, index) =>
      signature.every((value, offset) => encoded[index + offset] === value),
    );
    expect(netscape).toBeGreaterThan(0);
    expect(encoded[netscape + 13]).toBe(1);
    expect(encoded[netscape + 14]).toBe(2);
    expect(() => encodeGif(image, 65_536)).toThrow(/loop count/u);
    const invalid = {
      ...image,
      frames: [{ ...image.frames[0], durationMs: 700_000 }],
    } as typeof image;
    expect(() => encodeGif(invalid)).toThrow(/frame delays/u);
  });

  it('preserves absence of a loop extension when requested', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 255]));
    expect(readGifLoopCount(encodeGif(image, null))).toBeNull();
    expect(readGifLoopCount(encodeGif(image, 7))).toBe(7);
  });

  it('returns only a smaller independently pixel-verified lossless GIF', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]));
    const encoded = new Uint8Array(encodeGif(image, 7));
    const comment = new TextEncoder().encode('generated removable comment '.repeat(8));
    const inflated = new Uint8Array(encoded.length + comment.length + 4);
    inflated.set(encoded.subarray(0, -1));
    let target = encoded.length - 1;
    inflated.set([0x21, 0xfe, comment.length], target);
    target += 3;
    inflated.set(comment, target);
    inflated[target + comment.length] = 0;
    inflated[inflated.length - 1] = 0x3b;

    const directCandidate = encodeGif(decodeGif(inflated), 7, {
      optimizeLevel: 0,
      paletteMode: 'per-frame',
      paletteSize: 256,
      quantizer: 'wu',
      dither: 'none',
      disposal: 'none',
    });
    expect(decodeGif(directCandidate)).toEqual(decodeGif(inflated));
    const result = optimizeGifLossless(inflated);
    expect(result.changed).toBe(true);
    expect(result.optimizedBytes).toBeLessThan(result.originalBytes);
    expect(readGifLoopCount(result.bytes)).toBe(7);
    const { encodedMetadata: _optimizedMetadata, ...optimizedRaster } = decodeGif(result.bytes);
    const { encodedMetadata: _sourceMetadata, ...sourceRaster } = decodeGif(inflated);
    expect(optimizedRaster).toEqual(sourceRaster);
  });

  it('preserves no-loop semantics while optimizing a still GIF', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([20, 40, 60, 255]));
    const encoded = new Uint8Array(encodeGif(image, null));
    const result = optimizeGifLossless(encoded);
    expect(readGifLoopCount(result.bytes)).toBeNull();
    expect(decodeGif(result.bytes)).toEqual(decodeGif(encoded));
    expect(result.optimizedBytes).toBeLessThanOrEqual(result.originalBytes);
  });

  it('normalizes a legacy still GIF with no graphic-control delay', () => {
    const legacy = Uint8Array.from(
      Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
    );
    expect(decodeGif(legacy).frames[0].durationMs).toBe(10);
    expect(() => optimizeGifLossless(legacy)).not.toThrow();
  });
  it('encodes an animated GIF that decodes to its original frame count', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    const animated = {
      ...image,
      frames: [image.frames[0], { data: image.frames[0].data.slice(), durationMs: 40 }],
    } as typeof image;
    const decoded = decodeGif(encodeGif(animated));
    expect(decoded.frames).toHaveLength(2);
    expect(decoded.frames.map((frame) => frame.durationMs)).toEqual([10, 40]);
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

  it('uses level 3 to merge frames that differ only in invisible RGB', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 0]));
    const animated = {
      ...image,
      frames: [image.frames[0], { data: new Uint8ClampedArray([0, 255, 0, 0]), durationMs: 40 }],
    } as typeof image;
    expect(optimiseGifFrames(animated, 2).frames).toHaveLength(2);
    const level3 = optimiseGifFrames(animated, 3);
    expect(level3.frames).toHaveLength(1);
    expect(level3.frames[0].durationMs).toBe(40);
    expect(encodeGif(animated, 0, { optimizeLevel: 3 }).byteLength).toBeLessThan(
      encodeGif(animated, 0, { optimizeLevel: 2 }).byteLength,
    );
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

  it('uses a deterministic self-organizing neural palette', () => {
    const pixels = new Uint8ClampedArray(512 * 4);
    for (let pixel = 0; pixel < 512; pixel += 1)
      pixels.set([(pixel * 17) & 255, (pixel * 73) & 255, (pixel * 149) & 255, 255], pixel * 4);
    const image = createRaster(512, 1, pixels);
    const neural = new Uint8Array(encodeGif(image, 0, { quantizer: 'neural' }));
    expect(neural).not.toEqual(new Uint8Array(encodeGif(image, 0, { quantizer: 'fixed-332' })));
    expect(new Uint8Array(encodeGif(image, 0, { quantizer: 'neural' }))).toEqual(neural);
    expect(decodeGif(neural)).toMatchObject({ width: 512, height: 1 });
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

  it.each(['atkinson', 'sierra'] as const)('offers deterministic %s error diffusion', (dither) => {
    const pixels = new Uint8ClampedArray(64 * 4);
    for (let pixel = 0; pixel < 64; pixel += 1) pixels.set([128, 128, 128, 255], pixel * 4);
    const image = createRaster(8, 8, pixels);
    const encoded = new Uint8Array(encodeGif(image, 0, { dither }));
    expect(encoded).not.toEqual(new Uint8Array(encodeGif(image, 0, { dither: 'none' })));
    expect(new Uint8Array(encodeGif(image, 0, { dither }))).toEqual(encoded);
  });

  it('scales dithering to zero without changing non-dithered output', () => {
    const pixels = new Uint8ClampedArray(16 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) pixels.set([128, 128, 128, 255], pixel * 4);
    const image = createRaster(4, 4, pixels);
    expect(new Uint8Array(encodeGif(image, 0, { dither: 'sierra', ditherAmount: 0 }))).toEqual(
      new Uint8Array(encodeGif(image, 0, { dither: 'none' })),
    );
  });

  it.each([
    ['unspecified', 0],
    ['none', 1],
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

  it('writes interlaced row order and decodes it back to the original pixels', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y += 1)
      for (let x = 0; x < 8; x += 1) pixels.set([y * 28, x * 28, 0, 255], (y * 8 + x) * 4);
    const encoded = new Uint8Array(
      encodeGif(createRaster(8, 8, pixels), 0, { quantizer: 'median-cut', interlace: true }),
    );
    const descriptor = encoded.indexOf(0x2c, 13 + 256 * 3);
    expect(descriptor).toBeGreaterThan(0);
    expect(encoded[descriptor + 9]! & 0x40).toBe(0x40);
    expect(decodeGif(encoded).frames[0].data).toEqual(pixels);
  });

  it('writes the requested legal palette table size and matching LZW code size', () => {
    const pixels = new Uint8ClampedArray(16 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1)
      pixels.set([pixel * 16, 255 - pixel * 16, pixel * 7, 255], pixel * 4);
    const encoded = new Uint8Array(
      encodeGif(createRaster(16, 1, pixels), 0, {
        paletteSize: 16,
        quantizer: 'median-cut',
      }),
    );
    expect(encoded[10]! & 7).toBe(3); // 2^(3 + 1) = 16 table entries
    const descriptor = encoded.indexOf(0x2c, 13 + 16 * 3);
    expect(encoded[descriptor + 10]).toBe(4);
    expect(decodeGif(encoded)).toMatchObject({ width: 16, height: 1 });
  });

  it('writes local per-frame colour tables without a global table', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    const animated = {
      ...image,
      frames: [
        image.frames[0],
        { data: new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 0, 255]), durationMs: 40 },
      ],
    } as typeof image;
    const encoded = new Uint8Array(
      encodeGif(animated, 0, { paletteMode: 'per-frame', paletteSize: 4, quantizer: 'median-cut' }),
    );
    expect(encoded[10]! & 0x80).toBe(0);
    const descriptor = encoded.indexOf(0x2c, 13);
    expect(encoded[descriptor + 9]! & 0x80).toBe(0x80);
    expect(decodeGif(encoded).frames).toHaveLength(2);
  });

  it('adaptively chooses global or per-frame palettes from the combined colour budget', () => {
    const low = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    const highPixels = new Uint8ClampedArray(8 * 4);
    for (let pixel = 0; pixel < 8; pixel += 1)
      highPixels.set([pixel * 31, pixel * 17, pixel * 11, 255], pixel * 4);
    const lowEncoded = new Uint8Array(
      encodeGif(low, 0, { paletteMode: 'adaptive', paletteSize: 4, quantizer: 'median-cut' }),
    );
    const highEncoded = new Uint8Array(
      encodeGif(createRaster(8, 1, highPixels), 0, {
        paletteMode: 'adaptive',
        paletteSize: 4,
        quantizer: 'median-cut',
      }),
    );
    expect(lowEncoded[10]! & 0x80).toBe(0x80);
    expect(highEncoded[10]! & 0x80).toBe(0);
  });

  it('remaps transparency to the requested palette index without changing opaque pixels', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 250, 10, 20, 255]);
    const encoded = new Uint8Array(
      encodeGif(createRaster(2, 1, pixels), 0, {
        paletteSize: 8,
        quantizer: 'median-cut',
        transparencyIndex: 5,
      }),
    );
    const extension = encoded.findIndex(
      (value, index) => value === 0x21 && encoded[index + 1] === 0xf9 && encoded[index + 2] === 4,
    );
    expect(encoded[extension + 6]).toBe(5);
    expect(decodeGif(encoded).frames[0].data).toEqual(pixels);
  });
});

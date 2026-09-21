import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { saliencyRetarget } from '../src/cv/saliency-retarget.js';

function makeProtectedSubjectFixture() {
  const width = 24;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  const protectMask = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const background = (x + y) % 2 === 0 ? 230 : 20;
      data[offset] = background;
      data[offset + 1] = background;
      data[offset + 2] = background;
      data[offset + 3] = 255;

      if (x >= 8 && x < 13 && y >= 5 && y < 11) {
        data[offset] = 255;
        data[offset + 1] = 0;
        data[offset + 2] = 255;
        protectMask[pixel] = 255;
      }
    }
  }

  return { image: createRaster(width, height, data), protectMask, width, height };
}

function measureMagentaSubject(image: ReturnType<typeof createRaster>) {
  const data = image.frames[0]!.data;
  let pixelCount = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      if (data[offset] !== 255 || data[offset + 1] !== 0 || data[offset + 2] !== 255) continue;
      pixelCount++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    pixelCount,
    width: maxX < 0 ? 0 : maxX - minX + 1,
    height: maxY < 0 ? 0 : maxY - minY + 1,
  };
}

describe('P4-06 saliency-weighted retargeting', () => {
  it('uniform image falls back honestly and preserves original dimensions', () => {
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(128));
    const image = createRaster(4, 4, src);
    const result = saliencyRetarget(image, { targetWidth: 2, targetHeight: 2 });
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.frames[0]!.data).toBe(image.frames[0]!.data);
  });

  it('2×2 image falls back when the Sobel profile has no useful variation', () => {
    const image = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        255, 255, 255, 255, 10, 10, 10, 255, 10, 10, 10, 255, 255, 255, 255, 255,
      ]),
    );
    const result = saliencyRetarget(image, { targetWidth: 3, targetHeight: 3 });
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it('preserves source alpha values', () => {
    const src = new Uint8ClampedArray([
      255, 0, 0, 200, 0, 255, 0, 255, 255, 255, 255, 255, 128, 128, 128, 200,
    ]);
    const image = createRaster(2, 2, src);
    const result = saliencyRetarget(image, { targetWidth: 3, targetHeight: 3 });
    const data = result.frames[0]!.data;
    for (let offset = 3; offset < data.length; offset += 4) {
      expect(data[offset]).toBeGreaterThanOrEqual(200);
    }
  });

  it('keeps protected subject pixels at their source width and height', () => {
    const { image, protectMask } = makeProtectedSubjectFixture();
    const result = saliencyRetarget(image, {
      targetWidth: 18,
      targetHeight: 12,
      protectMask,
    });

    expect(result.width).toBe(18);
    expect(result.height).toBe(12);
    expect(measureMagentaSubject(result)).toEqual({ pixelCount: 30, width: 5, height: 6 });
  });

  it('a zero-valued protection mask leaves unmasked behavior unchanged', () => {
    const { image, width, height } = makeProtectedSubjectFixture();
    const withoutMask = saliencyRetarget(image, { targetWidth: 18, targetHeight: 12 });
    const withZeroMask = saliencyRetarget(image, {
      targetWidth: 18,
      targetHeight: 12,
      protectMask: new Uint8ClampedArray(width * height),
    });
    expect(withZeroMask.width).toBe(withoutMask.width);
    expect(withZeroMask.height).toBe(withoutMask.height);
    expect(withZeroMask.frames[0]!.data).toEqual(withoutMask.frames[0]!.data);
  });

  it('rejects a protected footprint larger than the requested output with a remedy', () => {
    const { image, protectMask } = makeProtectedSubjectFixture();
    expect(() =>
      saliencyRetarget(image, { targetWidth: 4, targetHeight: 12, protectMask }),
    ).toThrow(/increase the target width or reduce the protected mask/i);
  });

  it('rejects scaling an axis when every source coordinate on it is protected', () => {
    const { image, width, height } = makeProtectedSubjectFixture();
    const allProtected = new Uint8ClampedArray(width * height).fill(255);
    expect(() =>
      saliencyRetarget(image, { targetWidth: width + 1, targetHeight: height, protectMask: allProtected }),
    ).toThrow(/every source width coordinate is protected/i);
  });

  it('rejects a protection mask with the wrong number of pixels', () => {
    const image = createRaster(4, 4, new Uint8ClampedArray(new Array(4 * 4 * 4).fill(128)));
    expect(() =>
      saliencyRetarget(image, {
        targetWidth: 3,
        targetHeight: 3,
        protectMask: new Uint8ClampedArray(15),
      }),
    ).toThrow(/provide one mask value per source pixel/i);
  });

  it('uses a continuous output with the requested dimensions for a non-uniform scene', () => {
    const { image, protectMask } = makeProtectedSubjectFixture();
    const result = saliencyRetarget(image, { targetWidth: 18, targetHeight: 12, protectMask });
    expect(result.width).toBe(18);
    expect(result.height).toBe(12);
    expect(result.frames[0]!.data.length).toBe(18 * 12 * 4);
  });
});

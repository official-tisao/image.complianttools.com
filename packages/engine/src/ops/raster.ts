import type { RasterImage } from '../types.js';

export function createRaster(width: number, height: number, data?: Uint8ClampedArray): RasterImage {
  const pixels = data ?? new Uint8ClampedArray(width * height * 4);
  if (pixels.length !== width * height * 4)
    throw new RangeError('RGBA data length does not match dimensions.');
  return {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: pixels, durationMs: 0 }],
  };
}

export function cloneRaster(image: RasterImage): RasterImage {
  return {
    ...image,
    frames: image.frames.map((frame) => ({
      ...frame,
      data: frame.data.slice(),
    })) as unknown as RasterImage['frames'],
  };
}

export function rasterEquals(left: RasterImage, right: RasterImage): boolean {
  if (
    left.width !== right.width ||
    left.height !== right.height ||
    left.frames.length !== right.frames.length
  )
    return false;
  return left.frames.every((frame, index) => {
    const other = right.frames[index];
    return (
      other !== undefined &&
      frame.data.length === other.data.length &&
      frame.data.every((value, offset) => value === other.data[offset])
    );
  });
}

export function mapPixels(
  image: RasterImage,
  mapper: (
    rgba: readonly [number, number, number, number],
  ) => readonly [number, number, number, number],
): RasterImage {
  const output = new Uint8ClampedArray(image.frames[0].data.length);
  const input = image.frames[0].data;
  for (let offset = 0; offset < input.length; offset += 4) {
    const mapped = mapper([
      input[offset]!,
      input[offset + 1]!,
      input[offset + 2]!,
      input[offset + 3]!,
    ]);
    output.set(mapped, offset);
  }
  return createRaster(image.width, image.height, output);
}

export function applyPixelLocalOptions(
  image: RasterImage,
  options: Readonly<Record<string, unknown>>,
): RasterImage {
  const brightness = typeof options.brightness === 'number' ? options.brightness : 0;
  const contrast = typeof options.contrast === 'number' ? options.contrast : 0;
  const negate = options.negate === true;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return mapPixels(image, ([r, g, b, a]) => {
    const channel = (value: number) => {
      const adjusted = factor * (value - 128) + 128 + brightness;
      return negate ? 255 - adjusted : adjusted;
    };
    return [channel(r), channel(g), channel(b), a];
  });
}

export function boxBlur(image: RasterImage, radius: number): RasterImage {
  if (radius <= 0) return image;
  const source = image.frames[0].data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sums = [0, 0, 0, 0];
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = Math.max(0, Math.min(image.width - 1, x + dx));
          const sy = Math.max(0, Math.min(image.height - 1, y + dy));
          const offset = (sy * image.width + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            sums[channel]! += source[offset + channel]!;
          count += 1;
        }
      }
      const target = (y * image.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1)
        output[target + channel] = Math.round(sums[channel]! / count);
    }
  }
  return createRaster(image.width, image.height, output);
}

export function calculateSsim(left: RasterImage, right: RasterImage): number {
  if (left.width !== right.width || left.height !== right.height) return 0;
  const a = left.frames[0].data;
  const b = right.frames[0].data;
  let error = 0;
  for (let index = 0; index < a.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = a[index + channel]! - b[index + channel]!;
      error += delta * delta;
    }
  }
  const mse = error / Math.max(1, (a.length / 4) * 3);
  return Math.max(0, 1 - mse / (255 * 255));
}

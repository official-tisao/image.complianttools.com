import type { EngineError, Frame, RasterImage } from '../../types.js';

export interface WebpSequenceOptions {
  readonly animated: boolean;
  readonly frameDelayMs: number;
}

/** Validates decoded inputs and creates the exact still or full-canvas animation sent to WebP. */
export function prepareWebpSequence(
  images: readonly RasterImage[],
  options: WebpSequenceOptions,
): RasterImage {
  if (images.length === 0)
    throw {
      kind: 'decode-failed',
      format: 'webp',
      detail: 'WebP export received no decoded image frames.',
      remedy: 'Choose at least one PNG, JPEG, GIF, or WebP image.',
    } satisfies EngineError;
  if (
    !Number.isInteger(options.frameDelayMs) ||
    options.frameDelayMs < 10 ||
    options.frameDelayMs > 60_000
  )
    throw new RangeError(
      'WebP frame delay must be an integer from 10 through 60,000 milliseconds.',
    );
  if (!options.animated && images.length !== 1)
    throw {
      kind: 'unsupported-format',
      format: 'webp-sequence',
      remedy: 'Enable animation to combine multiple image files into one WebP.',
    } satisfies EngineError;

  const first = images[0]!;
  if (!options.animated) return first;
  const frames: Frame[] = [];
  for (const image of images) {
    if (image.width !== first.width || image.height !== first.height)
      throw {
        kind: 'dimension-limit',
        limit: Math.max(first.width, first.height),
        actual: Math.max(image.width, image.height),
        remedy: `Resize every animation frame to ${first.width}×${first.height} pixels and try again.`,
      } satisfies EngineError;
    for (const frame of image.frames)
      frames.push({
        ...frame,
        durationMs: image.frames.length > 1 ? frame.durationMs : options.frameDelayMs,
      });
  }
  return { ...first, frames: frames as unknown as RasterImage['frames'] };
}

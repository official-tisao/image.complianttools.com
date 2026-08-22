import type { EngineError, ExportOptions, FormatId, RasterImage } from '../types.js';
import { encodeRasterAsJpeg, encodeRasterAsPng, encodeRasterAsWebp } from './jsquash.js';
import { getCodec } from './registry.js';

export async function encodeRaster(
  image: RasterImage,
  format: FormatId,
  options: Omit<ExportOptions, 'format'> = {},
): Promise<ArrayBuffer> {
  const codec = getCodec(format);
  if (!codec.productionEncode) {
    const reason =
      codec.encodeUnavailableReason ??
      `The ${format.toUpperCase()} encoder is not wired to the generic production browser exporter.`;
    throw {
      kind: 'codec-unavailable',
      format,
      reason,
      remedy: `Choose a supported export format. ${reason}`,
    } satisfies EngineError;
  }

  switch (format) {
    case 'jpeg':
      return encodeRasterAsJpeg(image, {
        ...(options.quality === undefined ? {} : { quality: options.quality }),
        ...(options.progressive === undefined ? {} : { progressive: options.progressive }),
      });
    case 'png':
      return encodeRasterAsPng(image);
    case 'webp':
      return encodeRasterAsWebp(image, {
        ...(options.quality === undefined ? {} : { quality: options.quality }),
        ...(options.lossless ? { lossless: 1 } : {}),
      });
    default:
      throw {
        kind: 'codec-unavailable',
        format,
        reason: codec.encodeUnavailableReason ?? 'No production browser encoder is available.',
        remedy: 'Choose JPEG, PNG, or WebP for browser export.',
      } satisfies EngineError;
  }
}

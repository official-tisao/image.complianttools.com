import type { EngineError, ExportOptions, FormatId, RasterImage } from '../types.js';
import { encodeRasterAsJpeg, encodeRasterAsPng, encodeRasterAsWebp } from './jsquash.js';
import { getCodec } from './registry.js';
import { restoreContainerMetadata } from '../metadata/container.js';

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

  let encoded: ArrayBuffer;
  switch (format) {
    case 'jpeg':
      encoded = await encodeRasterAsJpeg(image, {
        ...(options.quality === undefined ? {} : { quality: options.quality }),
        ...(options.progressive === undefined ? {} : { progressive: options.progressive }),
      });
      break;
    case 'png':
      encoded = await encodeRasterAsPng(image);
      break;
    case 'webp':
      encoded = await encodeRasterAsWebp(image, {
        ...(options.quality === undefined ? {} : { quality: options.quality }),
        ...(options.lossless ? { lossless: 1 } : {}),
      });
      break;
    default:
      throw {
        kind: 'codec-unavailable',
        format,
        reason: codec.encodeUnavailableReason ?? 'No production browser encoder is available.',
        remedy: 'Choose JPEG, PNG, or WebP for browser export.',
      } satisfies EngineError;
  }
  return (options.stripMetadata ?? 'none') === 'none'
    ? restoreContainerMetadata(encoded, image.encodedMetadata).buffer
    : encoded;
}

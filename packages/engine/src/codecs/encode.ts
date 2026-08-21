import type { ExportOptions, FormatId, RasterImage } from '../types.js';
import { encodeRasterAsJpeg, encodeRasterAsPng, encodeRasterAsWebp } from './jsquash.js';
import { getCodec } from './registry.js';

export async function encodeRaster(
  image: RasterImage,
  format: FormatId,
  options: Omit<ExportOptions, 'format'> = {},
): Promise<ArrayBuffer> {
  const codec = getCodec(format);
  if (!codec.supports.includes('encode')) {
    throw new Error(
      `${format} encoding is unavailable: ${codec.encodeUnavailableReason ?? 'No production browser encoder is available.'}`,
    );
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
      throw new Error(
        `${format} encoding is unavailable: ${codec.encodeUnavailableReason ?? 'No production browser encoder is available.'}`,
      );
  }
}

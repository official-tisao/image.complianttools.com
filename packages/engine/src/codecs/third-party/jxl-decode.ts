import decodeJxl from '@jsquash/jxl/decode.js';

import type { RasterImage } from '../../types.js';

/** Browser-deliverable JPEG XL decoding without importing the encoder worker graph. */
export async function decodeJxlToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  try {
    const decoded = await decodeJxl(bytes);
    if (!decoded)
      throw {
        kind: 'decode-failed' as const,
        format: 'jxl' as const,
        detail: 'The JPEG XL decoder returned no image (file may be truncated or unsupported).',
        remedy: 'Convert the file to PNG or JPEG using a trusted application, then try again.',
      };
    return {
      width: decoded.width,
      height: decoded.height,
      colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [{ data: decoded.data, durationMs: 0 }],
    };
  } catch (e: unknown) {
    throw {
      kind: 'decode-failed' as const,
      format: 'jxl' as const,
      detail: e instanceof Error ? e.message : 'Unknown JXL decode error.',
      remedy: 'Convert the file to PNG or JPEG using a trusted application, then try again.',
    };
  }
}

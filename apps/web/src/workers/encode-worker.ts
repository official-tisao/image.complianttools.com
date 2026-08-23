import { encodeRaster } from '@complianttools/image-engine/codecs/encode';
import { createRaster } from '@complianttools/image-engine/ops/raster';
import type { FormatId } from '@complianttools/image-engine/types';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'reason' in error)
    return String((error as { reason: unknown }).reason);
  return String(error);
}

self.onmessage = async (
  event: MessageEvent<{
    width: number;
    height: number;
    data: ArrayBuffer;
    format: FormatId;
    quality: number;
  }>,
) => {
  try {
    const image = createRaster(
      event.data.width,
      event.data.height,
      new Uint8ClampedArray(event.data.data),
    );
    const bytes = await encodeRaster(image, event.data.format, { quality: event.data.quality });
    self.postMessage({ bytes }, { transfer: [bytes] });
  } catch (error) {
    self.postMessage({ error: errorMessage(error) });
  }
};

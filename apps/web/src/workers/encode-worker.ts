import { encodeRaster } from '@complianttools/image-engine/codecs/encode';
import { createRaster } from '@complianttools/image-engine/ops/raster';
import type { FormatId } from '@complianttools/image-engine/types';

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
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

import { dcci, nedi } from '@complianttools/image-engine/cv/dcci-nedi';
import { createRaster } from '@complianttools/image-engine/ops/raster';

type Request = {
  width: number;
  height: number;
  data: ArrayBuffer;
  method: 'dcci' | 'nedi';
  factor: 2 | 4;
};

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { width, height, data, method, factor } = event.data;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      !['dcci', 'nedi'].includes(method) ||
      ![2, 4].includes(factor)
    ) {
      throw new RangeError('Invalid image dimensions, method, or scale factor.');
    }
    const raster = createRaster(width, height, new Uint8ClampedArray(data));
    const output = method === 'dcci' ? dcci(raster, factor) : nedi(raster, factor);
    const pixels = output.frames[0].data;
    const buffer = pixels.buffer as ArrayBuffer;
    self.postMessage(
      { type: 'result', width: output.width, height: output.height, data: buffer },
      { transfer: [buffer] },
    );
  } catch (cause) {
    self.postMessage({
      type: 'error',
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
};

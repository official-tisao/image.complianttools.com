import { probeRuntimeCapabilities } from '@complianttools/image-engine/capabilities';
import { createRaster } from '@complianttools/image-engine/ops/raster';
import { upscaleWithRealEsrgan } from '@complianttools/image-engine/cv/upscale-model';

type Request = {
  width: number;
  height: number;
  data: ArrayBuffer;
  modelData: ArrayBuffer;
  variant: 'x2plus' | 'x4plus';
  modelSizeBytes: number;
};

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const { width, height, data, modelData, variant, modelSizeBytes } = event.data;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      !['x2plus', 'x4plus'].includes(variant) ||
      modelData.byteLength !== modelSizeBytes
    ) {
      throw new RangeError('Invalid image dimensions or registered model data.');
    }
    const result = await upscaleWithRealEsrgan(
      createRaster(width, height, new Uint8ClampedArray(data)),
      {
        variant,
        modelData,
        modelSizeBytes,
        consentGranted: true,
        webGpuPreferred: true,
      },
      probeRuntimeCapabilities(),
    );
    if (result.status !== 'complete') {
      throw new Error(result.status === 'error' ? result.message : 'The model could not run.');
    }
    const frame = result.image.frames[0];
    const buffer = frame.data.buffer as ArrayBuffer;
    self.postMessage(
      {
        type: 'result',
        width: result.image.width,
        height: result.image.height,
        data: buffer,
        backend: result.backend,
      },
      { transfer: [buffer] },
    );
  } catch (cause) {
    self.postMessage({
      type: 'error',
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
};

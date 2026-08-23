import { createRaster } from '@complianttools/image-engine/ops/raster';
import { run } from '@complianttools/image-engine/pipeline/execute';
import type { Recipe } from '@complianttools/image-engine/types';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'reason' in error)
    return String((error as { reason: unknown }).reason);
  return String(error);
}

self.onmessage = async (
  event: MessageEvent<{ width: number; height: number; data: ArrayBuffer; recipe: Recipe }>,
) => {
  try {
    const image = createRaster(
      event.data.width,
      event.data.height,
      new Uint8ClampedArray(event.data.data),
    );
    const result = await run(event.data.recipe, [image]);
    const output = result.items[0]!.image!;
    const buffer = output.frames[0].data.buffer as ArrayBuffer;
    self.postMessage(
      { width: output.width, height: output.height, data: buffer },
      { transfer: [buffer] },
    );
  } catch (error) {
    self.postMessage({ error: errorMessage(error) });
  }
};

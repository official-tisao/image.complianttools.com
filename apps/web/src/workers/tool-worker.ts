import { createRaster, run, type Recipe } from '@complianttools/image-engine';

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
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

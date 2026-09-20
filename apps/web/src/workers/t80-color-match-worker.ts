import { histogramMatch, reinhardTransfer } from '@complianttools/image-engine/color/transfer';
import { createRaster } from '@complianttools/image-engine/ops/raster';

type Method = 'reinhard' | 'histogram';
type Input = {
  readonly method: Method;
  readonly source: { readonly width: number; readonly height: number; readonly data: ArrayBuffer };
  readonly reference: { readonly width: number; readonly height: number; readonly data: ArrayBuffer };
};

self.onmessage = (event: MessageEvent<Input>) => {
  try {
    const { method, source: sourceInput, reference: referenceInput } = event.data;
    const sourcePixels = sourceInput.width * sourceInput.height;
    const referencePixels = referenceInput.width * referenceInput.height;
    if (
      !['reinhard', 'histogram'].includes(method) ||
      !Number.isSafeInteger(sourcePixels) ||
      !Number.isSafeInteger(referencePixels) ||
      sourceInput.width <= 0 ||
      sourceInput.height <= 0 ||
      referenceInput.width <= 0 ||
      referenceInput.height <= 0 ||
      sourcePixels > 6_000_000 ||
      referencePixels > 6_000_000 ||
      sourcePixels + referencePixels > 8_000_000 ||
      sourceInput.data.byteLength !== sourcePixels * 4 ||
      referenceInput.data.byteLength !== referencePixels * 4
    ) {
      self.postMessage({ type: 'error' });
      return;
    }

    const source = createRaster(
      sourceInput.width,
      sourceInput.height,
      new Uint8ClampedArray(sourceInput.data),
    );
    const reference = createRaster(
      referenceInput.width,
      referenceInput.height,
      new Uint8ClampedArray(referenceInput.data),
    );
    const result = method === 'reinhard'
      ? reinhardTransfer(source, reference)
      : histogramMatch(source, reference);
    const pixels = result.frames[0].data;
    const data = pixels.buffer as ArrayBuffer;
    self.postMessage(
      { type: 'result', width: result.width, height: result.height, data },
      [data],
    );
  } catch {
    self.postMessage({ type: 'error' });
  }
};

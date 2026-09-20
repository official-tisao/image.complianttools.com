import { saliencyRetarget } from '@complianttools/image-engine/cv/saliency-retarget';
import { createRaster } from '@complianttools/image-engine/ops/raster';

type Request = {
  readonly width: number;
  readonly height: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly data: ArrayBuffer;
  readonly protectMask?: ArrayBuffer;
};

const MAX_AXIS = 320;
const MAX_PIXELS = MAX_AXIS * MAX_AXIS;

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { width, height, targetWidth, targetHeight, data, protectMask } = event.data;
    const inputPixels = width * height;
    const outputPixels = targetWidth * targetHeight;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      !Number.isSafeInteger(targetWidth) ||
      !Number.isSafeInteger(targetHeight) ||
      width < 1 ||
      height < 1 ||
      targetWidth < 1 ||
      targetHeight < 1 ||
      width > MAX_AXIS ||
      height > MAX_AXIS ||
      targetWidth > MAX_AXIS ||
      targetHeight > MAX_AXIS ||
      inputPixels > MAX_PIXELS ||
      outputPixels > MAX_PIXELS ||
      data.byteLength !== inputPixels * 4 ||
      (protectMask !== undefined && protectMask.byteLength !== inputPixels)
    ) {
      self.postMessage({ type: 'error', kind: 'invalid-payload' });
      return;
    }

    const source = createRaster(width, height, new Uint8ClampedArray(data));
    const mask = protectMask ? new Uint8ClampedArray(protectMask) : undefined;
    const result = saliencyRetarget(source, { targetWidth, targetHeight, protectMask: mask });
    const fallback = result === source;
    const pixels = result.frames[0]!.data;
    const outputBuffer = pixels.buffer as ArrayBuffer;
    self.postMessage(
      { type: 'result', width: result.width, height: result.height, data: outputBuffer, fallback },
      [outputBuffer],
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    self.postMessage({
      type: 'error',
      kind: detail.includes('Protected source') || detail.includes('Every source')
        ? 'mask-does-not-fit'
        : 'processing-failed',
    });
  }
};

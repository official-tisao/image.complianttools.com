import { createRaster } from '@complianttools/image-engine/ops/raster';
import { pixelArtScale, type ScaleFactor } from '@complianttools/image-engine/cv/pixel-art';
import {
  PixelArtToolError,
  type PixelArtToolErrorKind,
} from '@complianttools/image-engine/schemas/pixel-art';

type Request = {
  width: number;
  height: number;
  data: ArrayBuffer;
  factor: ScaleFactor;
};

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const input = createRaster(
      event.data.width,
      event.data.height,
      new Uint8ClampedArray(event.data.data),
    );
    let lastPercent = -1;
    const output = pixelArtScale(input, event.data.factor, (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
      if (percent !== lastPercent) {
        lastPercent = percent;
        self.postMessage({ type: 'progress', percent });
      }
    });
    const pixels = output.frames[0].data;
    const buffer = pixels.buffer as ArrayBuffer;
    self.postMessage(
      { type: 'result', width: output.width, height: output.height, data: buffer },
      { transfer: [buffer] },
    );
  } catch (cause) {
    const kind: PixelArtToolErrorKind =
      cause instanceof PixelArtToolError
        ? cause.kind
        : cause instanceof Error && 'kind' in cause && cause.kind === 'invalid-factor'
          ? 'invalid-options'
          : 'processing-failed';
    const detail = cause instanceof Error ? cause.message : String(cause);
    const remedy = cause instanceof PixelArtToolError ? cause.remedy : undefined;
    self.postMessage({ type: 'error', kind, detail, remedy });
  }
};

import type { RasterImage } from '@complianttools/image-engine/types';

export function encodeInFormatWorker(
  format: 'avif' | 'jxl' | 'webp',
  image: RasterImage,
  options: Record<string, unknown>,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {

    // Keep this URL literal: Vite statically analyses this exact form and emits the worker as a
    // same-origin chunk. Passing it through createScriptURL makes Vite inline the module as a
    // data: URL, which the production worker-src policy deliberately does not allow.

    const worker = new Worker(new URL('../workers/format-encode-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.bytes) resolve(event.data.bytes);
      else reject(new Error('The format encoder worker returned no bytes.'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The format encoder worker failed.'));
    };
    const frames = image.frames.map((frame) => {
      const data = frame.data.slice().buffer as ArrayBuffer;
      return { data, durationMs: frame.durationMs, disposal: frame.disposal };
    });
    worker.postMessage(
      {
        format,
        width: image.width,
        height: image.height,
        colorSpace: image.colorSpace,
        premultipliedAlpha: image.premultipliedAlpha,
        frames,
        options,
      },
      frames.map((frame) => frame.data),
    );
  });
}

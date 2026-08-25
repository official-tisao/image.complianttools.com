import type { Frame, RasterImage } from '@complianttools/image-engine/types';

type FormatEncodeRequest = {
  format: 'avif' | 'jxl' | 'webp';
  width: number;
  height: number;
  colorSpace: RasterImage['colorSpace'];
  premultipliedAlpha: boolean;
  frames: Array<{ data: ArrayBuffer; durationMs: number; disposal?: Frame['disposal'] }>;
  options: Record<string, unknown>;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'reason' in error)
    return String((error as { reason: unknown }).reason);
  return String(error);
}

self.onmessage = async (event: MessageEvent<FormatEncodeRequest>) => {
  try {
    const image: RasterImage = {
      width: event.data.width,
      height: event.data.height,
      colorSpace: event.data.colorSpace,
      bitDepth: 8,
      premultipliedAlpha: event.data.premultipliedAlpha,
      frames: event.data.frames.map((frame) => ({
        ...frame,
        data: new Uint8ClampedArray(frame.data),
      })) as unknown as RasterImage['frames'],
    };
    let bytes: ArrayBuffer;
    if (event.data.format === 'avif') {
      const { encodeRasterAsAvif } =
        await import('@complianttools/image-engine/codecs/avif-encode');
      bytes = await encodeRasterAsAvif(image, event.data.options);
    } else if (event.data.format === 'jxl') {
      const { encodeRasterAsJxl } = await import('@complianttools/image-engine/codecs/jxl-encode');
      bytes = await encodeRasterAsJxl(image, event.data.options);
    } else if (image.frames.length > 1) {
      const { encodeAnimatedWebp } =
        await import('@complianttools/image-engine/codecs/animated-webp');
      const output = await encodeAnimatedWebp(image, event.data.options);
      bytes = output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength,
      ) as ArrayBuffer;
    } else {
      const { encodeRasterAsWebp } = await import('@complianttools/image-engine/codecs/jsquash');
      bytes = await encodeRasterAsWebp(image, event.data.options);
    }
    self.postMessage({ bytes }, { transfer: [bytes] });
  } catch (error) {
    self.postMessage({ error: errorMessage(error) });
  }
};

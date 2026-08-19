import type { RasterImage } from '../../types.js';

export const VIDEO_UNSUPPORTED_MESSAGE =
  'This browser cannot decode this video codec. Try MP4 or WebM in a browser with WebCodecs support.';

export type VideoDecoderConfig = {
  readonly codec: string;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
};
type VideoFrame = {
  readonly displayWidth: number;
  readonly displayHeight: number;
  copyTo(destination: Uint8Array, options: { format: 'RGBA' }): Promise<void>;
  close(): void;
};
type EncodedVideoChunk = {
  readonly type: 'key' | 'delta';
  readonly timestamp: number;
  readonly data: Uint8Array;
};
type VideoDecoder = {
  configure(config: VideoDecoderConfig): void;
  decode(chunk: EncodedVideoChunk): void;
  flush(): Promise<void>;
  close(): void;
};
export type VideoDecoderConstructor = {
  new (callbacks: { output(frame: VideoFrame): void; error(error: Error): void }): VideoDecoder;
  isConfigSupported?(config: VideoDecoderConfig): Promise<{ supported: boolean }>;
};
type VideoEnvironment = { readonly VideoDecoder?: VideoDecoderConstructor };
const platform = globalThis as unknown as VideoEnvironment;

export async function supportsVideoDecoder(
  config: VideoDecoderConfig,
  environment: VideoEnvironment = platform,
): Promise<boolean> {
  const decoder = environment.VideoDecoder;
  if (!decoder) return false;
  return decoder.isConfigSupported ? (await decoder.isConfigSupported(config)).supported : true;
}

/** Decodes one already-demuxed WebCodecs video chunk into an RGBA raster. */
export async function extractVideoFrame(
  data: Uint8Array,
  config: VideoDecoderConfig,
  options: { readonly timestamp?: number; readonly key?: boolean } = {},
  decoderConstructor: VideoDecoderConstructor | undefined = platform.VideoDecoder,
): Promise<RasterImage> {
  if (!decoderConstructor) throw new Error(VIDEO_UNSUPPORTED_MESSAGE);
  return new Promise<RasterImage>((resolve, reject) => {
    let finished = false;
    const decoder = new decoderConstructor({
      output: (frame) => {
        if (finished) return frame.close();
        finished = true;
        const pixels = new Uint8Array(frame.displayWidth * frame.displayHeight * 4);
        frame
          .copyTo(pixels, { format: 'RGBA' })
          .then(() =>
            resolve({
              width: frame.displayWidth,
              height: frame.displayHeight,
              colorSpace: 'srgb',
              bitDepth: 8,
              premultipliedAlpha: false,
              frames: [{ data: new Uint8ClampedArray(pixels.buffer), durationMs: 0 }],
            }),
          )
          .catch(reject)
          .finally(() => {
            frame.close();
            decoder.close();
          });
      },
      error: (error) => {
        if (!finished) {
          finished = true;
          decoder.close();
          reject(error);
        }
      },
    });
    try {
      decoder.configure(config);
      decoder.decode({
        type: options.key === false ? 'delta' : 'key',
        timestamp: options.timestamp ?? 0,
        data,
      });
      decoder.flush().catch((error: unknown) => {
        if (!finished) {
          finished = true;
          decoder.close();
          reject(error);
        }
      });
    } catch (error) {
      finished = true;
      decoder.close();
      reject(error);
    }
  });
}

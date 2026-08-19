import type { RasterImage } from '../../types.js';

export const VIDEO_UNSUPPORTED_MESSAGE =
  'This browser cannot decode this video codec. Try MP4 or WebM in a browser with WebCodecs support.';

export type VideoDecoderConfig = {
  readonly codec: string;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  /** Codec configuration record supplied by a container demuxer, when required. */
  readonly description?: ArrayBuffer;
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

export type DemuxedVideoChunk = {
  readonly config: VideoDecoderConfig;
  readonly data: Uint8Array;
  readonly timestamp: number;
  readonly key: boolean;
};

type Mp4Track = {
  readonly id: number;
  readonly codec: string;
  readonly timescale: number;
  readonly track_width?: number;
  readonly track_height?: number;
  readonly video?: { readonly width: number; readonly height: number };
  readonly avcDecoderConfigRecord?: ArrayBuffer;
  readonly hevcDecoderConfigRecord?: ArrayBuffer;
};
type Mp4Sample = {
  readonly cts: number;
  readonly timescale: number;
  readonly data?: Uint8Array;
  readonly is_sync: boolean;
};
type Mp4File = {
  onReady?: (info: { readonly videoTracks: readonly Mp4Track[] }) => void;
  onSamples?: (id: number, user: unknown, samples: readonly Mp4Sample[]) => void;
  onError?: (module: string, message: string) => void;
  setExtractionOptions(id: number, user?: unknown, options?: { readonly nbSamples?: number }): void;
  start(): void;
  appendBuffer(buffer: ArrayBuffer & { fileStart: number }, last?: boolean): number;
  flush(): void;
};
export type Mp4Demuxer = { readonly createFile: () => Mp4File };

async function loadMp4Demuxer(): Promise<Mp4Demuxer> {
  const { createFile } = await import('mp4box');
  // mp4box exposes a richer ISOFile surface than this adapter needs.
  return { createFile: createFile as unknown as () => Mp4File };
}

/**
 * Extracts the first video sample from a local MP4 using mp4box. MP4Box only
 * parses the container: the browser's WebCodecs implementation still decodes
 * the bytes, so no video codec is bundled into the application.
 */
export async function demuxMp4FirstVideoSample(
  input: Uint8Array,
  demuxerLoader: () => Promise<Mp4Demuxer> = loadMp4Demuxer,
): Promise<DemuxedVideoChunk> {
  const demuxer = await demuxerLoader();
  const file = demuxer.createFile();
  return new Promise<DemuxedVideoChunk>((resolve, reject) => {
    let settled = false;
    const fail = (message: string) => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    };
    file.onError = (module, message) => fail(`MP4 demux error in ${module}: ${message}`);
    file.onReady = (info) => {
      const track = info.videoTracks[0];
      if (!track) return fail('The MP4 contains no video track.');
      file.setExtractionOptions(track.id, undefined, { nbSamples: 1 });
      file.onSamples = (id, _user, samples) => {
        if (settled || id !== track.id) return;
        const sample = samples[0];
        if (!sample?.data) return fail('The MP4 video track contains no decodable samples.');
        settled = true;
        const description = track.avcDecoderConfigRecord ?? track.hevcDecoderConfigRecord;
        const width = track.video?.width ?? track.track_width;
        const height = track.video?.height ?? track.track_height;
        resolve({
          config: {
            codec: track.codec,
            ...(width === undefined ? {} : { codedWidth: width }),
            ...(height === undefined ? {} : { codedHeight: height }),
            ...(description ? { description } : {}),
          },
          data: sample.data,
          timestamp: Math.round((sample.cts / sample.timescale) * 1_000_000),
          key: sample.is_sync,
        });
      };
      file.start();
    };
    try {
      const buffer = input.buffer.slice(
        input.byteOffset,
        input.byteOffset + input.byteLength,
      ) as ArrayBuffer & {
        fileStart: number;
      };
      buffer.fileStart = 0;
      file.appendBuffer(buffer, true);
      file.flush();
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to parse the MP4 container.');
    }
  });
}

/** Demuxes and decodes the first frame of a local MP4 through browser WebCodecs. */
export async function extractMp4VideoFrame(
  input: Uint8Array,
  decoderConstructor: VideoDecoderConstructor | undefined = platform.VideoDecoder,
  demuxerLoader: () => Promise<Mp4Demuxer> = loadMp4Demuxer,
): Promise<RasterImage> {
  const chunk = await demuxMp4FirstVideoSample(input, demuxerLoader);
  return extractVideoFrame(
    chunk.data,
    chunk.config,
    { timestamp: chunk.timestamp, key: chunk.key },
    decoderConstructor,
  );
}

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

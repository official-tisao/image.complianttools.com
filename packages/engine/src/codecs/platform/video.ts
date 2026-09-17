import type { RasterImage, EngineError } from '../../types.js';

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

export type ContainerVideoFrame = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
};

export type ContainerVideoFrameReader = {
  readFirstFrame(input: Blob, timestampSeconds: number): Promise<ContainerVideoFrame>;
};

async function loadContainerVideoFrameReader(): Promise<ContainerVideoFrameReader> {
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('mediabunny');
  return {
    async readFirstFrame(input: Blob, timestampSeconds: number): Promise<ContainerVideoFrame> {
      const media = new Input({ formats: ALL_FORMATS, source: new BlobSource(input) });
      try {
        const track = await media.getPrimaryVideoTrack();
        if (!track)
          throw {
            kind: 'decode-failed',
            format: 'mp4',
            detail: 'The video contains no video track.',
            remedy: 'Choose a video file with a video stream or try a different container.',
          } satisfies EngineError;
        if (!(await track.canDecode()))
          throw {
            kind: 'codec-unavailable',
            format: 'mp4',
            reason: VIDEO_UNSUPPORTED_MESSAGE,
            remedy: 'Try MP4 or WebM in a browser with WebCodecs support.',
          } satisfies EngineError;
        const wrapped = await new CanvasSink(track).getCanvas(timestampSeconds);
        if (!wrapped)
          throw {
            kind: 'decode-failed',
            format: 'mp4',
            detail: 'The requested timestamp has no video frame.',
            remedy:
              'Choose a non-negative timestamp within the video duration or select a different video file.',
          } satisfies EngineError;
        const context = wrapped.canvas.getContext('2d');
        if (!context)
          throw {
            kind: 'internal',
            detail: 'Your browser cannot read the decoded video canvas.',
            remedy: 'Try a different browser or check that WebCodecs is enabled.',
          } satisfies EngineError;
        const width = wrapped.canvas.width;
        const height = wrapped.canvas.height;
        return { width, height, pixels: context.getImageData(0, 0, width, height).data };
      } finally {
        media.dispose();
      }
    },
  };
}

/**
 * Extracts one local MP4 or WebM frame through a container reader and the
 * browser's WebCodecs implementation. No media bytes leave the device.
 */
export async function extractContainerVideoFrame(
  input: Blob,
  timestampSeconds = 0,
  readerLoader: () => Promise<ContainerVideoFrameReader> = loadContainerVideoFrameReader,
): Promise<RasterImage> {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0)
    throw {
      kind: 'internal',
      detail: 'Video timestamp must be a non-negative finite number.',
      remedy: 'Provide a non-negative finite number representing the timestamp in seconds.',
    } satisfies EngineError;
  const frame = await (await readerLoader()).readFirstFrame(input, timestampSeconds);
  if (frame.width < 1 || frame.height < 1 || frame.pixels.length !== frame.width * frame.height * 4)
    throw {
      kind: 'decode-failed',
      format: 'mp4',
      detail: 'The video decoder returned an invalid RGBA frame.',
      remedy: 'Choose a valid bounded video file with a decodable video track.',
    } satisfies EngineError;
  return {
    width: frame.width,
    height: frame.height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: frame.pixels, durationMs: 0 }],
  };
}

export type DemuxedVideoChunk = {
  readonly config: VideoDecoderConfig;
  readonly data: Uint8Array;
  readonly timestamp: number;
  readonly key: boolean;
};

/**
 * Reads the first encoded video packet from any container supported by the pinned
 * Mediabunny build. This proves container parsing independently from the browser's
 * codec availability and is used for MP4, WebM, Matroska, and AVI capability checks.
 */
export async function demuxContainerFirstVideoPacket(
  input: ArrayBuffer | Uint8Array,
): Promise<DemuxedVideoChunk> {
  const { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } = await import('mediabunny');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const media = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  try {
    const track = await media.getPrimaryVideoTrack();
    if (!track)
      throw {
        kind: 'decode-failed',
        format: 'mp4',
        detail: 'The media container contains no video track.',
        remedy: 'Choose a container with a video stream or try a different file.',
      } satisfies EngineError;
    const config = await track.getDecoderConfig();
    if (!config)
      throw {
        kind: 'decode-failed',
        format: 'mp4',
        detail: 'The video track does not declare a decoder configuration.',
        remedy:
          'Choose a video file with a valid codec configuration or try a different container.',
      } satisfies EngineError;
    const packet = await new EncodedPacketSink(track).getFirstPacket();
    if (!packet)
      throw {
        kind: 'decode-failed',
        format: 'mp4',
        detail: 'The video track contains no encoded packets.',
        remedy: 'Choose a video file with encoded video data or try a different container.',
      } satisfies EngineError;
    const description = config.description;
    const descriptionBytes = description
      ? description instanceof ArrayBuffer
        ? new Uint8Array(description)
        : new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : undefined;
    return {
      config: {
        codec: config.codec,
        ...(config.codedWidth === undefined ? {} : { codedWidth: config.codedWidth }),
        ...(config.codedHeight === undefined ? {} : { codedHeight: config.codedHeight }),
        ...(descriptionBytes ? { description: descriptionBytes.slice().buffer } : {}),
      },
      data: packet.data.slice(),
      timestamp: packet.microsecondTimestamp,
      key: packet.type === 'key',
    };
  } finally {
    media.dispose();
  }
}

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
  if (!decoderConstructor)
    throw {
      kind: 'codec-unavailable',
      format: 'mp4',
      reason: VIDEO_UNSUPPORTED_MESSAGE,
      remedy: 'Try MP4 or WebM in a browser with WebCodecs support.',
    } satisfies EngineError;
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

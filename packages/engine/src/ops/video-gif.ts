/**
 * T13 Video → GIF — engine half. README §4.1, §5.6, §6.10, P6-01.
 *
 * The decode path is unchanged and already approved: the browser's WebCodecs `VideoDecoder`
 * reads bytes that `mediabunny` pulled out of the container. No codec is bundled, no network
 * fetch exists, and no FFmpeg fallback is added here. This module owns everything *around* the
 * decode — which timestamps to sample, how many frames that yields, how they are scaled, and
 * what a codec that the browser cannot decode means for the user.
 *
 * It is deliberately DOM-free so the sampling arithmetic is unit testable in Node against a
 * stub decoder.
 */

import type { EngineError, RasterImage } from '../types.js';

/** README §5.6 containers the pinned reader parses, and the ones it explicitly cannot. */
export const VIDEO_CONTAINER_SUPPORT: Readonly<Record<string, boolean>> = {
  mp4: true,
  m4v: true,
  mov: true,
  '3gp': true,
  webm: true,
  mkv: true,
  ogv: true,
  avi: false,
  wmv: false,
  flv: false,
  mts: false,
  m2ts: false,
};

export interface VideoGifOptions {
  /** Seconds from the start to begin sampling. */
  readonly trimStart: number;
  /** Seconds from the start to stop sampling; must be greater than `trimStart`. */
  readonly trimEnd: number;
  /** Frames sampled per second. */
  readonly frameRate: number;
  /** Drop every Nth decoded frame after rate conversion. 1 keeps every frame. */
  readonly skipFrames: number;
  /** Hard ceiling on output frames, independent of duration. */
  readonly maxFrames: number;
  /** Longest output edge in pixels; 0 keeps the decoded size. */
  readonly scaleWidth: number;
}

export interface VideoFrameSelection {
  /** Presentation timestamps to request, in seconds, ascending. */
  readonly timestamps: readonly number[];
  /** Timestamps dropped by `skipFrames`, reported so the route can say so. */
  readonly skipped: readonly number[];
  readonly totalSamples: number;
  readonly durationUsed: number;
}

/** One decoded frame plus the timestamp it was requested for. */
export interface DecodedVideoFrame {
  readonly timestamp: number;
  readonly image: RasterImage;
}

export interface VideoGifResult {
  readonly frames: readonly RasterImage[];
  /** Duration per frame in milliseconds, derived from `frameRate`. */
  readonly frameDurationMs: number;
  readonly selection: VideoFrameSelection;
}

const MAX_FRAMES_HARD_LIMIT = 5_000;
const MAX_SCALE = 4_096;

/**
 * The slice of the WebCodecs `VideoDecoder` static surface this module probes.
 *
 * Only the static is described, because only the static is used: this probe asks whether a codec
 * is decodable and never constructs a decoder. Modelling it as a constructor would require a
 * `new` signature that this module never exercises.
 */
type DecoderProbe = {
  isConfigSupported?(config: unknown): Promise<{ supported?: boolean } | undefined>;
};

function videoError(
  kind: EngineError['kind'],
  remedy: string,
  detail: string,
  extra: Record<string, unknown> = {},
): EngineError {
  return { kind, remedy, detail, ...extra } as EngineError;
}

/** The extension of a file name, lower-cased and without the dot. */
export function videoExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/iu.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : '';
}

/**
 * Whether the pinned local reader parses this container, and if not, why.
 *
 * README §5.6 names AVI, WMV, FLV, MTS, and M2TS as deliberately unavailable: the reader does
 * not parse them and an FFmpeg fallback is excluded on purpose. Naming the specific container
 * is more useful than a generic "unsupported file".
 */
export function containerSupport(fileName: string): {
  readonly supported: boolean;
  readonly extension: string;
  readonly reason?: string;
} {
  const extension = videoExtension(fileName);
  if (extension === '')
    return {
      supported: false,
      extension,
      reason:
        'The file has no extension, so the container cannot be identified. Rename it with a .mp4, .mov, .m4v, .webm, .mkv, .ogv, or .3gp suffix.',
    };
  if (VIDEO_CONTAINER_SUPPORT[extension] === true) return { supported: true, extension };
  if (VIDEO_CONTAINER_SUPPORT[extension] === false)
    return {
      supported: false,
      extension,
      reason: `${extension.toUpperCase()} input is unavailable because the pinned local container reader does not parse this container, and a network or bundled codec fallback is deliberately excluded. Re-export the video as MP4, WebM, MOV, MKV, OGV, or 3GP and try again.`,
    };
  return {
    supported: false,
    extension,
    reason: `${extension.toUpperCase()} is not a container this tool reads. Re-export the video as MP4, WebM, MOV, MKV, OGV, or 3GP and try again.`,
  };
}

function assertOptions(options: VideoGifOptions): void {
  if (!Number.isFinite(options.trimStart) || options.trimStart < 0)
    throw videoError(
      'unsupported-format',
      'Set the trim start to a non-negative number of seconds.',
      `trimStart was ${options.trimStart}.`,
    );
  if (!Number.isFinite(options.trimEnd) || options.trimEnd <= 0)
    throw videoError(
      'unsupported-format',
      'Set the trim end to a positive number of seconds.',
      `trimEnd was ${options.trimEnd}.`,
    );
  if (options.trimEnd <= options.trimStart)
    throw videoError(
      'unsupported-format',
      'Move the trim end later than the trim start so the range contains at least one frame.',
      `trimEnd ${options.trimEnd}s is not after trimStart ${options.trimStart}s.`,
    );
  if (!Number.isInteger(options.frameRate) || options.frameRate < 1 || options.frameRate > 60)
    throw videoError(
      'unsupported-format',
      'Set the frame rate to a whole number from 1 to 60 frames per second.',
      `frameRate was ${options.frameRate}.`,
    );
  if (!Number.isInteger(options.skipFrames) || options.skipFrames < 1 || options.skipFrames > 1_000)
    throw videoError(
      'unsupported-format',
      'Set the frame skip to a whole number from 1 to 1000.',
      `skipFrames was ${options.skipFrames}.`,
    );
  if (
    !Number.isInteger(options.maxFrames) ||
    options.maxFrames < 1 ||
    options.maxFrames > MAX_FRAMES_HARD_LIMIT
  )
    throw videoError(
      'dimension-limit',
      `Set the frame limit to a whole number from 1 to ${MAX_FRAMES_HARD_LIMIT}.`,
      `maxFrames was ${options.maxFrames}.`,
      { limit: MAX_FRAMES_HARD_LIMIT, actual: Number(options.maxFrames) },
    );
  if (
    !Number.isInteger(options.scaleWidth) ||
    options.scaleWidth < 0 ||
    options.scaleWidth > MAX_SCALE
  )
    throw videoError(
      'unsupported-format',
      `Set the output width to 0 (keep the decoded size) or a whole number from 1 to ${MAX_SCALE}.`,
      `scaleWidth was ${options.scaleWidth}.`,
    );
}

/**
 * Chooses which timestamps to decode from a clip of `durationSeconds`.
 *
 * The rule is the honest one: a frame is only promised when the clip actually contains a frame
 * at that time. Asking for timestamps past the end would make the decoder sit waiting for a
 * frame that never arrives, so the selection stops at the last timestamp the clip can fill.
 */
export function selectVideoTimestamps(
  durationSeconds: number,
  options: VideoGifOptions,
): VideoFrameSelection {
  assertOptions(options);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw videoError(
      'decode-failed',
      'Choose a video that decodes to at least one frame.',
      `The container reported a duration of ${durationSeconds} seconds.`,
    );

  const step = 1 / options.frameRate;
  // A frame is only promised when it exists. The last usable timestamp is the final sample that
  // falls *at or before* the end of the range; nudging the bound upward instead would request a
  // frame at exactly trimEnd, which lies outside the trim the user asked for.
  const lastUsable = Math.min(durationSeconds, options.trimEnd);
  const candidates: number[] = [];
  // Accumulated float drift over many steps can move a sample a few ULPs past the bound, so the
  // comparison allows a fraction of a step of slack without ever crossing into the next interval.
  const tolerance = step / 1000;
  for (let time = options.trimStart; time < lastUsable - tolerance; time += step) {
    candidates.push(time);
    if (candidates.length >= MAX_FRAMES_HARD_LIMIT) break;
  }
  // A clip whose usable length is an exact multiple of the step ends on a real frame. The loop
  // above stops just short of it, so add that final boundary sample explicitly rather than
  // silently losing the last frame of the clip.
  const lastStep = Math.floor(
    (lastUsable - options.trimStart) / step + tolerance * options.frameRate,
  );
  const boundary = options.trimStart + lastStep * step;
  if (boundary < lastUsable - tolerance && candidates.length < MAX_FRAMES_HARD_LIMIT)
    candidates.push(Number(boundary.toFixed(4)));

  const skipped: number[] = [];
  const timestamps: number[] = [];
  candidates.forEach((time, position) => {
    if (position % options.skipFrames === 0) {
      if (timestamps.length < options.maxFrames) timestamps.push(Number(time.toFixed(4)));
      else skipped.push(Number(time.toFixed(4)));
    } else skipped.push(Number(time.toFixed(4)));
  });

  if (timestamps.length === 0)
    throw videoError(
      'decode-failed',
      'Increase the frame rate, lower the frame skip, or widen the trim range so at least one frame falls inside the clip.',
      `No frame timestamp falls between ${options.trimStart}s and ${Math.min(options.trimEnd, durationSeconds)}s at ${options.frameRate} fps with every ${options.skipFrames}th frame kept.`,
    );

  return {
    timestamps,
    skipped,
    totalSamples: timestamps.length + skipped.length,
    durationUsed: timestamps[timestamps.length - 1]! - timestamps[0]!,
  };
}

/** Scales one frame to `scaleWidth` on its longest edge, preserving aspect ratio. */
export function scaleVideoFrame(image: RasterImage, scaleWidth: number): RasterImage {
  if (scaleWidth === 0 || image.width === scaleWidth) return image;
  const ratio = scaleWidth / image.width;
  const width = scaleWidth;
  const height = Math.max(1, Math.round(image.height * ratio));
  const out = new Uint8ClampedArray(width * height * 4);
  // Box filter over the source rectangle that maps to each destination pixel.
  const xRatio = image.width / width;
  const yRatio = image.height / height;
  for (let y = 0; y < height; y += 1) {
    const sourceTop = Math.floor(y * yRatio);
    const sourceBottom = Math.max(
      sourceTop + 1,
      Math.min(image.height, Math.ceil((y + 1) * yRatio)),
    );
    for (let x = 0; x < width; x += 1) {
      const sourceLeft = Math.floor(x * xRatio);
      const sourceRight = Math.max(
        sourceLeft + 1,
        Math.min(image.width, Math.ceil((x + 1) * xRatio)),
      );
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = sourceTop; sy < sourceBottom; sy += 1) {
        for (let sx = sourceLeft; sx < sourceRight; sx += 1) {
          const offset = (sy * image.width + sx) * 4;
          r += image.frames[0]!.data[offset]!;
          g += image.frames[0]!.data[offset + 1]!;
          b += image.frames[0]!.data[offset + 2]!;
          a += image.frames[0]!.data[offset + 3]!;
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      out[target] = Math.round(r / count);
      out[target + 1] = Math.round(g / count);
      out[target + 2] = Math.round(b / count);
      out[target + 3] = Math.round(a / count);
    }
  }
  return {
    width,
    height,
    colorSpace: image.colorSpace,
    bitDepth: image.bitDepth,
    premultipliedAlpha: image.premultipliedAlpha,
    frames: [{ data: out, durationMs: 0 }],
  };
}

/**
 * Turns decoded frames into an animation: scaled, duration-stamped, and in GIF's frame contract.
 *
 * Frames arrive in decode order; a decoder that delivers one out of order would silently
 * reverse a moment in the clip, so order is asserted rather than assumed.
 */
export function buildVideoGifFrames(
  decoded: readonly DecodedVideoFrame[],
  options: VideoGifOptions,
): VideoGifResult {
  assertOptions(options);
  if (decoded.length === 0)
    throw videoError(
      'decode-failed',
      'Choose a video with at least one decodable frame, or widen the trim range.',
      'The decoder returned no frames.',
    );

  const ordered = decoded
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => {
      const image = scaleVideoFrame(entry.image, options.scaleWidth);
      if (image.frames.length !== 1)
        throw videoError(
          'decode-failed',
          'Choose a video file with a single decodable picture per frame.',
          `A frame at ${entry.timestamp}s decoded to ${image.frames.length} pictures.`,
        );
      if (image.width < 1 || image.height < 1)
        throw videoError(
          'decode-failed',
          'Choose a valid video file with a decodable video track.',
          `A frame at ${entry.timestamp}s decoded to ${image.width}×${image.height}.`,
        );
      return { timestamp: entry.timestamp, image };
    });

  const frameDurationMs = Math.max(10, Math.round(1000 / options.frameRate));
  const first = ordered[0]!;
  for (const entry of ordered)
    if (entry.image.width !== first.image.width || entry.image.height !== first.image.height)
      throw videoError(
        'decode-failed',
        'Re-encode the video so every frame has the same dimensions, or pick a different clip.',
        `Frames differ in size: ${first.image.width}×${first.image.height} and ${entry.image.width}×${entry.image.height}.`,
      );

  return {
    frames: ordered.map((entry) => ({
      ...entry.image,
      frames: [{ data: entry.image.frames[0]!.data, durationMs: frameDurationMs }],
    })),
    frameDurationMs,
    selection: {
      timestamps: ordered.map((entry) => entry.timestamp),
      skipped: [],
      totalSamples: ordered.length,
      durationUsed: ordered[ordered.length - 1]!.timestamp - ordered[0]!.timestamp,
    },
  };
}

/** Combines scaled, duration-stamped frames into the single raster `encodeGif` expects. */
export function videoGifRaster(frames: readonly RasterImage[]): RasterImage {
  if (frames.length === 0)
    throw videoError(
      'decode-failed',
      'Choose a video that decodes to at least one frame.',
      'No frames were produced.',
    );
  const first = frames[0]!;
  return {
    width: first.width,
    height: first.height,
    colorSpace: first.colorSpace,
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: frames.map((frame) => ({
      data: frame.frames[0]!.data,
      durationMs: frame.frames[0]!.durationMs,
    })) as unknown as RasterImage['frames'],
  };
}

/**
 * Asks the browser whether it can decode a codec string, without decoding anything.
 *
 * Returns `undefined` when the platform exposes no `VideoDecoder` at all, which is a different
 * condition from "this specific codec is unsupported" and deserves a different remedy.
 */
export async function probeVideoCodec(config: {
  readonly codec: string;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  readonly description?: ArrayBuffer;
}): Promise<{ readonly supported: boolean; readonly reason?: string }> {
  const Decoder = (globalThis as unknown as { VideoDecoder?: unknown }).VideoDecoder as
    DecoderProbe | undefined;
  // Presence is the only test here. `VideoDecoder` is a constructor in every shipping engine,
  // but the probe only ever reads its static, so requiring a callable would reject a host that
  // exposes the static alone — which is exactly what this module's own test double does.
  if (Decoder === undefined || Decoder === null)
    return {
      supported: false,
      reason:
        'This browser does not implement WebCodecs VideoDecoder, so no video can be decoded locally. Try a current Chromium, Firefox, or Safari build, or export the frames yourself.',
    };
  const isConfigSupported = Decoder.isConfigSupported;
  if (typeof isConfigSupported !== 'function')
    return {
      supported: false,
      reason:
        'This browser cannot report whether it supports a video codec, so support cannot be confirmed before decoding.',
    };
  try {
    const result = await isConfigSupported.call(Decoder, {
      codec: config.codec,
      ...(config.codedWidth === undefined ? {} : { codedWidth: config.codedWidth }),
      ...(config.codedHeight === undefined ? {} : { codedHeight: config.codedHeight }),
      ...(config.description === undefined ? {} : { description: config.description }),
    });
    return result?.supported === true ? { supported: true } : { supported: false };
  } catch (cause) {
    return {
      supported: false,
      reason: `This browser rejected the codec configuration while probing it: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    };
  }
}

/** The route's no-op defaults: one frame, no trim, decoded size, every frame kept. */
export const VIDEO_GIF_DEFAULT_OPTIONS: VideoGifOptions = {
  trimStart: 0,
  trimEnd: 5,
  frameRate: 10,
  skipFrames: 1,
  maxFrames: 300,
  scaleWidth: 320,
};

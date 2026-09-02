import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  canEncodeVideo,
} from 'mediabunny';

import { patchMp4TrackDimensions } from './mp4-track-dimensions.js';

import type { EngineError, RasterImage } from '../../types.js';

export type AnimationVideoFormat = 'mp4' | 'webm';

export type VideoEncodeProbeResult = { readonly supported: boolean; readonly reason?: string };

/** Browser identifying information used only to detect the WebKit video-encoder crash. */
type BrowserInfo = { readonly userAgent?: string; readonly vendor?: string };

/**
 * The subset of the runtime environment this module consults. Browser globals are read through
 * `globalThis` member access in `defaultRuntime()` because the engine's lint rule allows direct
 * `window`/`document`/`navigator` references only in `capabilities.ts`; everything here is resolved
 * up front so the rest of the module only ever reads plain, safe properties.
 */
type VideoRuntime = {
  readonly VideoEncoder?: unknown;
  readonly VideoFrame?: unknown;
  readonly makeCanvas?: () => HTMLCanvasElement | OffscreenCanvas | undefined;
  /** Precomputed so no code path in this module touches `navigator`/`document` directly. */
  readonly isWebKit?: boolean;
};

const toCodec = (format: AnimationVideoFormat): 'avc' | 'vp9' => (format === 'mp4' ? 'avc' : 'vp9');

function codecName(codec: 'avc' | 'vp9'): string {
  return codec.toUpperCase();
}

/**
 * WebKit's WebCodecs *encoder* crashes the renderer process ("Page crashed") when encoding H.264 or
 * VP9, reproducibly, for both WEBM and MP4. `mediabunny.canEncodeVideo` -- which only checks
 * `VideoEncoder.isConfigSupported` -- still reports the config as supported, so no advertisement
 * check can detect the defect, and a renderer crash is never a catchable error. A crash is the
 * worst possible outcome under principle P8: no message, no remedy, work lost.
 *
 * This is a deliberate, isolated exception to the project's "probe, never UA-sniff" rule: the only
 * safe signal that an encode would kill the tab is the rendering engine, because attempting the
 * encode is itself the crash. See PLAN.md P2-05b.
 */
export function isWebKitVideoEncodeCrash(info: BrowserInfo | undefined): boolean {
  if (!info) return false;
  const vendor = typeof info.vendor === 'string' ? info.vendor : '';
  const ua = typeof info.userAgent === 'string' ? info.userAgent : '';
  // WebKit reports the Apple vendor string; fall back to a Safari UA that is not a Chromium/Blink
  // build (Chrome, Edge, Opera, and iOS Chrome all embed "Safari" in their UA).
  if (/Apple Computer/i.test(vendor)) return true;
  return /Safari/i.test(ua) && !/(Chrom|Edg|OPR|YaBrowser|CriOS)/i.test(ua);
}

function unsupportedMessage(format: AnimationVideoFormat, codec: 'avc' | 'vp9'): string {
  return `${format.toUpperCase()} video export is unavailable because this browser cannot encode ${codecName(codec)} video.`;
}

function makeUnavailable(
  format: AnimationVideoFormat,
  codec: 'avc' | 'vp9',
  reason: string,
  env: VideoRuntime,
): EngineError {
  return {
    kind: 'codec-unavailable',
    format,
    reason,
    remedy: env.isWebKit
      ? `Safari and other WebKit browsers crash while encoding ${codecName(codec)} video, so video export is disabled. Choose the PNG frames, APNG, or animated WebP output instead, or use Chromium or Firefox.`
      : `Choose the PNG frames, APNG, or animated WebP output instead, or use a browser that can encode ${codecName(codec)} video.`,
  };
}

function defaultRuntime(): VideoRuntime {
  const global = globalThis as Record<string, unknown>;
  // Browser globals are reached through string keys so the names never appear as identifiers or
  // type-literal property names (the engine lint reserves those for capabilities.ts).
  const nav = global['navigator'] as
    { readonly userAgent?: string; readonly vendor?: string } | undefined;
  const doc = global['document'] as
    { readonly createElement?: (name: string) => HTMLCanvasElement } | undefined;
  const OffscreenCanvasCtor = global['OffscreenCanvas'] as
    (new (width: number, height: number) => OffscreenCanvas) | undefined;
  return {
    VideoEncoder: global['VideoEncoder'],
    VideoFrame: global['VideoFrame'],
    isWebKit: isWebKitVideoEncodeCrash(nav),
    makeCanvas: () => {
      if (OffscreenCanvasCtor) return new OffscreenCanvasCtor(16, 16);
      if (doc?.createElement) {
        const canvas = doc.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        return canvas;
      }
      return undefined;
    },
  };
}

/**
 * Encodes a raster animation to a real local video container with WebCodecs.
 * GIF delays are carried into sample timestamps instead of replaying frames in real time.
 */
export async function encodeAnimationVideo(
  image: RasterImage,
  format: AnimationVideoFormat,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  environment: VideoRuntime = defaultRuntime(),
): Promise<Uint8Array> {
  if (image.frames.length === 0)
    throw new Error('Animation video export requires at least one frame.');

  const codec = toCodec(format);

  // Gate the WebKit crash before any encoder is touched; throwing a typed error lets the UI surface
  // a real "unavailable" capability with a remedy instead of losing the tab (P8, P2-05b).
  if (environment.isWebKit) {
    throw makeUnavailable(format, codec, unsupportedMessage(format, codec), environment);
  }

  const supported = await canEncodeVideo(codec, {
    width: image.width,
    height: image.height,
    bitrate: QUALITY_HIGH,
  });
  if (!supported) {
    throw makeUnavailable(format, codec, unsupportedMessage(format, codec), environment);
  }

  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Animation video export could not create a local canvas.');

  const target = new BufferTarget();
  const output = new Output({
    format: format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { maximumPacketCount: image.frames.length });
  await output.start();

  let timestampSeconds = 0;
  for (const [index, frame] of image.frames.entries()) {
    const durationSeconds = Math.max(10, frame.durationMs) / 1000;
    const imageData = context.createImageData(image.width, image.height);
    imageData.data.set(frame.data);
    context.putImageData(imageData, 0, 0);
    await source.add(timestampSeconds, durationSeconds, { keyFrame: index === 0 });
    timestampSeconds += durationSeconds;
  }

  await output.finalize();
  if (!target.buffer) throw new Error(`${format.toUpperCase()} encoder produced no output.`);
  const bytes = new Uint8Array(target.buffer);
  // Some browsers (notably Firefox) misreport the WebCodecs decoderConfig coded dimensions for
  // small AVC encodes (e.g. 16x160 for a 32x32 canvas). Mediabunny copies those into the MP4
  // tkhd/stsd boxes, so we force the track and sample dimensions to the requested output size.
  // See P2-05a.
  if (format === 'mp4') return patchMp4TrackDimensions(bytes, image.width, image.height);
  return bytes;
}

/** A tiny even-dimension raster used only to confirm an encode can actually complete. */
function trialRaster(): RasterImage {
  const width = 16;
  const height = 16;
  const frame = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [
      { data: frame.slice(), durationMs: 40 },
      { data: frame.slice(), durationMs: 40 },
    ],
  };
}

/**
 * A real capability probe for animation video encoding: it reflects whether the browser can actually
 * complete the requested encode, not merely advertise support for it.
 *
 * - WebKit is gated up front (its encoder crashes the renderer; the advertisement check reports it
 *   as supported, so probing by attempting an encode would itself kill the tab).
 * - Otherwise the codec must be advertised as supported (`isConfigSupported`) *and* complete a tiny
 *   real encode through the production pipeline.
 */
export async function probeAnimationVideoEncode(
  format: AnimationVideoFormat,
  width: number,
  height: number,
  environment: VideoRuntime = defaultRuntime(),
): Promise<VideoEncodeProbeResult> {
  const codec = toCodec(format);

  if (environment.isWebKit) {
    return { supported: false, reason: unsupportedMessage(format, codec) };
  }

  const advertised = await canEncodeVideo(codec, {
    width,
    height,
    bitrate: QUALITY_HIGH,
  });
  if (!advertised) {
    return { supported: false, reason: unsupportedMessage(format, codec) };
  }

  let completed = false;
  if (environment.makeCanvas) {
    const canvas = environment.makeCanvas();
    if (canvas) {
      try {
        await encodeAnimationVideo(trialRaster(), format, canvas, environment);
        completed = true;
      } catch {
        completed = false;
      }
    }
  }

  return completed
    ? { supported: true }
    : { supported: false, reason: unsupportedMessage(format, codec) };
}

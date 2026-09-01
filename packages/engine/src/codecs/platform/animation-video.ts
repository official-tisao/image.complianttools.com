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

import type { RasterImage } from '../../types.js';

export type AnimationVideoFormat = 'mp4' | 'webm';

/**
 * Encodes a raster animation to a real local video container with WebCodecs.
 * GIF delays are carried into sample timestamps instead of replaying frames in real time.
 */
export async function encodeAnimationVideo(
  image: RasterImage,
  format: AnimationVideoFormat,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Uint8Array> {
  if (image.frames.length === 0)
    throw new Error('Animation video export requires at least one frame.');

  const codec = format === 'mp4' ? 'avc' : 'vp9';
  const supported = await canEncodeVideo(codec, {
    width: image.width,
    height: image.height,
    bitrate: QUALITY_HIGH,
  });
  if (!supported) {
    throw new Error(
      `${format.toUpperCase()} export is unavailable because this browser cannot encode ${codec.toUpperCase()} video.`,
    );
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

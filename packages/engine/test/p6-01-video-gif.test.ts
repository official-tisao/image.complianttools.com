/**
 * T13 Video → GIF engine tests — PLAN.md P6-01, README §5.6 / §6.10.
 *
 * The decode itself stays the browser's WebCodecs job, so these tests pin the parts this module
 * owns and that are wrong in ways only arithmetic can reveal: which timestamps get sampled, that
 * an unavailable container is named rather than generically refused, that scaling preserves
 * aspect ratio, and that mismatched frame sizes fail loudly instead of producing a corrupt GIF.
 */

import { describe, expect, it } from 'vitest';
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Output,
  WebMOutputFormat,
} from 'mediabunny';

import { readContainerVideoDuration } from '../src/codecs/platform/video.js';
import {
  buildVideoGifFrames,
  containerSupport,
  probeVideoCodec,
  scaleVideoFrame,
  selectVideoTimestamps,
  VIDEO_GIF_DEFAULT_OPTIONS,
  videoExtension,
  videoGifRaster,
  type DecodedVideoFrame,
  type VideoGifOptions,
} from '../src/ops/video-gif.js';
import { createRaster, rasterEquals } from '../src/ops/raster.js';
import type { EngineError, RasterImage } from '../src/types.js';

/**
 * Runs `action`, which throws a plain `EngineError` object. Re-thrown as a real `Error` so an
 * unexpected internal failure surfaces as an ordinary test failure rather than an unhandled
 * object. `action` must be a thunk, because these calls throw.
 */
function captureEngineError(action: () => unknown): EngineError {
  let thrown: unknown;
  try {
    action();
  } catch (cause) {
    thrown = cause;
  }
  if (thrown === undefined)
    throw new Error('Expected the call to throw, but it returned normally.');
  if (typeof thrown !== 'object' || thrown === null || !('remedy' in thrown) || !('kind' in thrown))
    throw new Error(`Expected a typed engine error, received: ${String(thrown)}`);
  return thrown as EngineError;
}

function solidFrame(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = rgba[0];
    data[index * 4 + 1] = rgba[1];
    data[index * 4 + 2] = rgba[2];
    data[index * 4 + 3] = rgba[3];
  }
  return createRaster(width, height, data);
}

const baseOptions: VideoGifOptions = {
  trimStart: 0,
  trimEnd: 2,
  frameRate: 10,
  skipFrames: 1,
  maxFrames: 100,
  scaleWidth: 0,
};

describe('containerSupport', () => {
  it('accepts the containers the pinned reader parses', () => {
    for (const name of [
      'clip.mp4',
      'clip.m4v',
      'clip.mov',
      'clip.3gp',
      'clip.webm',
      'clip.mkv',
      'clip.ogv',
    ])
      expect(containerSupport(name).supported, name).toBe(true);
  });

  it('names the documented containers with no permitted parser', () => {
    for (const [name, label] of [
      ['legacy.avi', 'AVI'],
      ['legacy.wmv', 'WMV'],
      ['legacy.flv', 'FLV'],
      ['legacy.mts', 'MTS'],
      ['legacy.m2ts', 'M2TS'],
    ] as const) {
      const support = containerSupport(name);
      expect(support.supported, name).toBe(false);
      expect(support.reason, name).toContain(`${label} input is unavailable`);
      // The remedy must point somewhere, and it must not quietly suggest fetching a codec.
      expect(support.reason).toMatch(/Re-export the video as MP4/iu);
    }
  });

  it('explains a missing extension instead of refusing generically', () => {
    const support = containerSupport('clip-without-suffix');
    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/no extension/iu);
  });

  it('refuses an unknown container by name', () => {
    const support = containerSupport('clip.xyz');
    expect(support.supported).toBe(false);
    expect(support.reason).toContain('XYZ');
  });

  it('reads the extension case-insensitively', () => {
    expect(videoExtension('CLIP.MP4')).toBe('mp4');
    expect(containerSupport('CLIP.MP4').supported).toBe(true);
  });
});

describe('selectVideoTimestamps', () => {
  it('samples the trimmed range at the requested rate', () => {
    const selection = selectVideoTimestamps(10, baseOptions);
    // 2 seconds at 10 fps => samples at 0.0 … 1.9; 2.0 is the exclusive end of the trim.
    expect(selection.timestamps[0]).toBe(0);
    expect(selection.timestamps.at(-1)).toBeCloseTo(1.9, 3);
    expect(selection.timestamps).toHaveLength(20);
  });

  it('starts at the trim start rather than at zero', () => {
    const selection = selectVideoTimestamps(10, { ...baseOptions, trimStart: 1, trimEnd: 2 });
    expect(selection.timestamps[0]).toBeCloseTo(1, 3);
    expect(selection.timestamps.every((time) => time >= 1 && time < 2)).toBe(true);
  });

  it('never requests a frame past the end of the clip', () => {
    // A 1.5s clip with a 5s trim must stop sampling at the clip, not wait forever.
    const selection = selectVideoTimestamps(1.5, { ...baseOptions, trimEnd: 5 });
    expect(Math.max(...selection.timestamps)).toBeLessThanOrEqual(1.5);
  });

  it('drops skipped frames and reports them', () => {
    const selection = selectVideoTimestamps(10, { ...baseOptions, skipFrames: 2 });
    expect(selection.timestamps).toHaveLength(10);
    expect(selection.skipped.length).toBeGreaterThan(0);
    expect(selection.totalSamples).toBe(selection.timestamps.length + selection.skipped.length);
  });

  it('stops at the frame limit and reports the surplus as skipped', () => {
    const selection = selectVideoTimestamps(10, { ...baseOptions, maxFrames: 5 });
    expect(selection.timestamps).toHaveLength(5);
    expect(selection.skipped.length).toBe(15);
  });

  it('rejects a trim range that is not increasing', () => {
    const error = captureEngineError(() =>
      selectVideoTimestamps(10, { ...baseOptions, trimStart: 4, trimEnd: 2 }),
    );
    expect(error.kind).toBe('unsupported-format');
    expect(error.remedy).toMatch(/trim end later than the trim start/iu);
  });

  it('rejects a zero-length trim range rather than returning no frames', () => {
    const error = captureEngineError(() =>
      selectVideoTimestamps(10, { ...baseOptions, trimStart: 1, trimEnd: 1 }),
    );
    expect(error.remedy).toMatch(/trim end later than the trim start/iu);
  });

  it('rejects a frame rate outside the documented range', () => {
    const error = captureEngineError(() =>
      selectVideoTimestamps(10, { ...baseOptions, frameRate: 0 }),
    );
    expect(error.remedy).toMatch(/1 to 60/iu);
  });

  it('rejects a fractional frame rate', () => {
    const error = captureEngineError(() =>
      selectVideoTimestamps(10, { ...baseOptions, frameRate: 12.5 }),
    );
    expect(error.remedy).toMatch(/whole number/iu);
  });

  it('rejects a clip with no usable duration', () => {
    const error = captureEngineError(() => selectVideoTimestamps(0, baseOptions));
    expect(error.kind).toBe('decode-failed');
    expect(error.remedy).toMatch(/at least one frame/iu);
  });

  it('reports a trim range that falls entirely outside the clip', () => {
    const error = captureEngineError(() =>
      selectVideoTimestamps(1, { ...baseOptions, trimStart: 30, trimEnd: 40 }),
    );
    expect(error.kind).toBe('decode-failed');
    expect(error.remedy).toMatch(/widen the trim range/iu);
  });
});

describe('scaleVideoFrame', () => {
  it('preserves aspect ratio', () => {
    const scaled = scaleVideoFrame(solidFrame(640, 360, [10, 20, 30, 255]), 320);
    expect(scaled.width).toBe(320);
    expect(scaled.height).toBe(180);
  });

  it('averages the source pixels rather than point-sampling them', () => {
    // A 2x1 frame of black and white halves to a 1x1 frame; the mean is mid grey.
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const frame: RasterImage = { ...createRaster(2, 1, data), frames: [{ data, durationMs: 0 }] };
    const scaled = scaleVideoFrame(frame, 1);
    expect(scaled.width).toBe(1);
    expect(scaled.height).toBe(1);
    expect(scaled.frames[0]!.data[0]).toBe(128);
  });

  it('leaves a frame untouched at scale 0', () => {
    const frame = solidFrame(64, 64, [1, 2, 3, 255]);
    expect(rasterEquals(scaleVideoFrame(frame, 0), frame)).toBe(true);
  });

  it('keeps alpha through the downscale', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1) data[index * 4 + 3] = 128;
    const scaled = scaleVideoFrame(createRaster(4, 4, data), 2);
    expect(scaled.frames[0]!.data[3]).toBe(128);
  });
});

describe('buildVideoGifFrames', () => {
  const decoded: DecodedVideoFrame[] = [
    { timestamp: 0, image: solidFrame(4, 4, [255, 0, 0, 255]) },
    { timestamp: 0.1, image: solidFrame(4, 4, [0, 255, 0, 255]) },
    { timestamp: 0.2, image: solidFrame(4, 4, [0, 0, 255, 255]) },
  ];

  it('stamps each frame with the duration implied by the frame rate', () => {
    const result = buildVideoGifFrames(decoded, { ...baseOptions, frameRate: 10 });
    expect(result.frameDurationMs).toBe(100);
    expect(result.frames.every((frame) => frame.frames[0]!.durationMs === 100)).toBe(true);
  });

  it('orders frames by timestamp even if the decoder returns them out of order', () => {
    const shuffled = [decoded[2]!, decoded[0]!, decoded[1]!];
    const result = buildVideoGifFrames(shuffled, baseOptions);
    expect(result.selection.timestamps).toEqual([0, 0.1, 0.2]);
    expect(result.frames[0]!.frames[0]!.data[0]).toBe(255);
    expect(result.frames[2]!.frames[0]!.data[2]).toBe(255);
  });

  it('scales every frame consistently', () => {
    const result = buildVideoGifFrames(decoded, { ...baseOptions, scaleWidth: 2 });
    expect(result.frames.every((frame) => frame.width === 2 && frame.height === 2)).toBe(true);
  });

  it('rejects frames of differing sizes rather than producing a corrupt GIF', () => {
    const mismatched: DecodedVideoFrame[] = [
      { timestamp: 0, image: solidFrame(4, 4, [1, 1, 1, 255]) },
      { timestamp: 0.1, image: solidFrame(8, 8, [2, 2, 2, 255]) },
    ];
    const error = captureEngineError(() => buildVideoGifFrames(mismatched, baseOptions));
    expect(error.kind).toBe('decode-failed');
    expect(error.remedy).toMatch(/same dimensions/iu);
  });

  it('rejects an empty decode result', () => {
    const error = captureEngineError(() => buildVideoGifFrames([], baseOptions));
    expect(error.remedy).toMatch(/at least one decodable frame/iu);
  });

  it('clamps a sub-10 fps rate to a GIF-legal frame delay', () => {
    const result = buildVideoGifFrames(decoded, { ...baseOptions, frameRate: 1 });
    // GIF delays are stored in hundredths of a second, so 1 fps is the slowest legal step.
    expect(result.frameDurationMs).toBe(1000);
  });
});

describe('videoGifRaster', () => {
  it('produces a single raster carrying every frame delay', () => {
    const frames = [
      {
        ...solidFrame(2, 2, [1, 1, 1, 255]),
        frames: [{ data: solidFrame(2, 2, [1, 1, 1, 255]).frames[0]!.data, durationMs: 40 }],
      },
      {
        ...solidFrame(2, 2, [2, 2, 2, 255]),
        frames: [{ data: solidFrame(2, 2, [2, 2, 2, 255]).frames[0]!.data, durationMs: 80 }],
      },
    ];
    const raster = videoGifRaster(frames);
    expect(raster.frames).toHaveLength(2);
    expect(raster.frames.map((frame) => frame.durationMs)).toEqual([40, 80]);
  });

  it('rejects an empty frame list', () => {
    const error = captureEngineError(() => videoGifRaster([]));
    expect(error.remedy).toMatch(/at least one frame/iu);
  });
});

describe('probeVideoCodec', () => {
  it('explains a platform with no WebCodecs VideoDecoder', async () => {
    const globals = globalThis as unknown as { VideoDecoder?: unknown };
    const original = globals.VideoDecoder;
    delete globals.VideoDecoder;
    try {
      const result = await probeVideoCodec({ codec: 'vp8' });
      expect(result.supported).toBe(false);
      expect(result.reason).toMatch(/does not implement WebCodecs VideoDecoder/iu);
    } finally {
      if (original !== undefined) globals.VideoDecoder = original;
    }
  });

  it('reports an unsupported codec honestly', async () => {
    const globals = globalThis as unknown as { VideoDecoder?: unknown };
    const original = globals.VideoDecoder;
    globals.VideoDecoder = {
      isConfigSupported: async () => ({ supported: false }),
    } as unknown;
    try {
      const result = await probeVideoCodec({ codec: 'avc1.999999' });
      expect(result.supported).toBe(false);
      // A codec the browser rejects has no configured remedy, only a boolean.
      expect(result.reason).toBeUndefined();
    } finally {
      if (original === undefined) delete globals.VideoDecoder;
      else globals.VideoDecoder = original;
    }
  });

  it('confirms a codec the browser accepts', async () => {
    const globals = globalThis as unknown as { VideoDecoder?: unknown };
    const original = globals.VideoDecoder;
    globals.VideoDecoder = { isConfigSupported: async () => ({ supported: true }) } as unknown;
    try {
      expect((await probeVideoCodec({ codec: 'vp8' })).supported).toBe(true);
    } finally {
      if (original === undefined) delete globals.VideoDecoder;
      else globals.VideoDecoder = original;
    }
  });

  it('surfaces a platform that cannot answer the probe at all', async () => {
    const globals = globalThis as unknown as { VideoDecoder?: unknown };
    const original = globals.VideoDecoder;
    globals.VideoDecoder = function VideoDecoderStub() {} as unknown;
    try {
      const result = await probeVideoCodec({ codec: 'vp8' });
      expect(result.supported).toBe(false);
      expect(result.reason).toMatch(/cannot report whether it supports/iu);
    } finally {
      if (original === undefined) delete globals.VideoDecoder;
      else globals.VideoDecoder = original;
    }
  });
});

describe('VIDEO_GIF_DEFAULT_OPTIONS', () => {
  it('samples a short default range at a bounded size', () => {
    const selection = selectVideoTimestamps(30, VIDEO_GIF_DEFAULT_OPTIONS);
    expect(selection.timestamps[0]).toBe(0);
    expect(selection.timestamps.length).toBeLessThanOrEqual(VIDEO_GIF_DEFAULT_OPTIONS.maxFrames);
  });
});

describe('readContainerVideoDuration', () => {
  /** Muxes a real, finalized WebM with the pinned local muxer. */
  async function realWebm(): Promise<Uint8Array> {
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const source = new EncodedVideoPacketSource('vp8');
    output.addVideoTrack(source);
    await output.start();
    for (let index = 0; index < 3; index += 1)
      await source.add(
        new EncodedPacket(
          new Uint8Array([0x9d, 0x01, 0x2a, 0x02, 0, 1, 0]),
          'key',
          index * 40_000,
          40_000,
        ),
        {
          decoderConfig: { codec: 'vp8', codedWidth: 2, codedHeight: 1 },
        },
      );
    await output.finalize();
    return new Uint8Array(target.buffer!);
  }

  it('reads a duration from a finalized clip', async () => {
    const bytes = await realWebm();
    const duration = await readContainerVideoDuration(new Blob([bytes], { type: 'video/webm' }));
    expect(duration).toBeGreaterThan(0);
    expect(Number.isFinite(duration)).toBe(true);
  });

  it('awaits the duration before disposing the reader', async () => {
    // Regression: returning `track.computeDuration()` without awaiting let the `finally` block
    // dispose the input first, and every caller saw `InputDisposedError` instead of a duration.
    // In Node the microtask ordering hid this, so it only failed in the browser.
    const bytes = await realWebm();
    await expect(
      readContainerVideoDuration(new Blob([bytes], { type: 'video/webm' })),
    ).resolves.toBeGreaterThan(0);
    // Repeated calls must not share a disposed input either.
    await expect(
      readContainerVideoDuration(new Blob([bytes], { type: 'video/webm' })),
    ).resolves.toBeGreaterThan(0);
  });

  it('rejects bytes that are not a container at all', async () => {
    // Four arbitrary bytes are neither a recognised container nor a readable track, and the
    // route must surface that as a typed failure rather than an unhandled rejection.
    await expect(
      readContainerVideoDuration(new Blob([new Uint8Array([1, 2, 3, 4])])),
    ).rejects.toBeDefined();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  dcci,
  getUpscaleTier2Availability,
  nedi,
  prepareRealEsrganInput,
  reconstructRealEsrganFrame,
  upscaleWithRealEsrgan,
  validateRealEsrganOutput,
  type UpscaleRuntimeAdapter,
} from '../src/cv/index.js';
import type { RasterImage } from '../src/types.js';
import type { OnnxRuntimeState, OnnxTileFeeds, OnnxTileOutputs } from '../src/onnx-runtime.js';

function makeImage(
  width = 2,
  height = 1,
  data = new Uint8ClampedArray(width * height * 4).fill(255),
  options: { premultipliedAlpha?: boolean; bitDepth?: 8 | 16 } = {},
): RasterImage {
  const frame = {
    data,
    durationMs: 50,
    ...(options.bitDepth === 16 ? { data16: new Uint16Array(width * height * 4).fill(65535) } : {}),
  };
  return {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: options.bitDepth ?? 8,
    premultipliedAlpha: options.premultipliedAlpha ?? false,
    frames: [frame],
  };
}

function makeMockRuntime(
  scale: 2 | 4,
  wrongShape = false,
): {
  readonly adapter: UpscaleRuntimeAdapter;
  readonly closed: () => number;
  readonly capturedInput: () => { data: Float32Array; dimensions: readonly number[] } | undefined;
} {
  let closeCount = 0;
  let input: { data: Float32Array; dimensions: readonly number[] } | undefined;
  const session = { inputNames: ['input'], outputNames: ['output'] } as unknown as NonNullable<
    OnnxRuntimeState['session']
  >;
  const adapter: UpscaleRuntimeAdapter = {
    open: async (state) => ({ ...state, backend: 'wasm', session }),
    createTensor: async (data, dimensions) => {
      input = { data, dimensions: [...dimensions] };
      return { data, dims: [...dimensions] } as never;
    },
    run: async (_state: OnnxRuntimeState, feeds: OnnxTileFeeds) => {
      const tensor = (feeds as unknown as Record<string, { dims: readonly number[] }>).input!;
      const [, , inputHeight, inputWidth] = tensor.dims;
      const outputHeight = inputHeight! * scale;
      const outputWidth = inputWidth! * scale + (wrongShape ? 1 : 0);
      const output = {
        dims: [1, 3, outputHeight, outputWidth],
        data: new Float32Array(3 * outputHeight * outputWidth).fill(0.5),
      };
      return { output } as unknown as OnnxTileOutputs;
    },
    close: async () => {
      closeCount++;
    },
  };
  return {
    adapter,
    closed: () => closeCount,
    capturedInput: () => input,
  };
}

const capabilities = {
  wasmSimd: true,
  wasmThreads: false,
  webGpu: false,
  webGl2: false,
  offscreenCanvas: false,
  fileSystemAccess: false,
  opfs: false,
  webCodecs: false,
};

describe('P4-16 Real-ESRGAN upscale adapter', () => {
  it('keeps Tier 2 unavailable until a model source and consent are supplied', () => {
    expect(getUpscaleTier2Availability()).toEqual({
      status: 'unavailable',
      reason: 'model_not_supplied',
      tier1FallbackAvailable: true,
    });
    expect(
      getUpscaleTier2Availability({ variant: 'x4plus', modelPath: '/cache/realesrgan-x4.onnx' }),
    ).toEqual({
      status: 'unavailable',
      reason: 'consent_required',
      tier1FallbackAvailable: true,
    });
    expect(
      getUpscaleTier2Availability({
        variant: 'x4plus',
        modelData: new Uint8Array([1]),
        consentGranted: true,
      }),
    ).toEqual({ status: 'available', scaleFactor: 4, tier1FallbackAvailable: true });
  });

  it('fails closed for a runtime model variant outside the registered x2/x4 set', () => {
    expect(
      getUpscaleTier2Availability({
        variant: 'x3plus' as 'x2plus',
        modelData: new Uint8Array([1]),
        consentGranted: true,
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'unsupported_variant',
      tier1FallbackAvailable: true,
    });
  });

  it('normalizes RGBA input to NCHW RGB and removes premultiplication', () => {
    const image = makeImage(2, 1, new Uint8ClampedArray([64, 32, 16, 128, 255, 64, 0, 255]), {
      premultipliedAlpha: true,
    });
    const prepared = prepareRealEsrganInput(image);
    expect(prepared.dimensions).toEqual([1, 3, 1, 2]);
    expect(Array.from(prepared.data)).toEqual(
      Array.from(new Float32Array([0.5, 1, 0.25, 64 / 255, 0.125, 0])),
    );
    expect(Array.from(prepared.alpha)).toEqual(Array.from(new Float32Array([128 / 255, 1])));
  });

  it('validates x2 output shape and rejects the wrong spatial scale', () => {
    const image = makeImage(2, 1);
    const output = { dims: [1, 3, 2, 4], data: new Float32Array(24) };
    expect(() => validateRealEsrganOutput(image, output, 2)).not.toThrow();
    expect(() => validateRealEsrganOutput(image, { ...output, dims: [1, 3, 2, 5] }, 2)).toThrow(
      'output shape must be [1, 3, 2, 4]',
    );
    expect(() =>
      validateRealEsrganOutput(image, { ...output, data: new Float32Array(23) }, 2),
    ).toThrow('expected 24');
  });

  it('re-interleaves RGB, restores bilinear alpha, and preserves 16-bit output', () => {
    const image = makeImage(1, 1, new Uint8ClampedArray([0, 0, 0, 128]), { bitDepth: 16 });
    const output = {
      dims: [1, 3, 2, 2],
      data: new Float32Array([0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75]),
    };
    const prepared = prepareRealEsrganInput(image);
    const frame = reconstructRealEsrganFrame(image, 0, prepared.alpha, output, 2);
    expect(Array.from(frame.data.slice(0, 4))).toEqual([64, 128, 191, 255]);
    expect(frame.data16).toBeInstanceOf(Uint16Array);
    expect(Array.from(frame.data16!.slice(0, 4))).toEqual([16384, 32768, 49151, 65535]);
  });

  it('runs the caller-supplied x2 conversion and always releases its session', async () => {
    const image = makeImage(2, 1);
    const fake = makeMockRuntime(2);
    const progress: Array<{ completedFrames: number; totalFrames: number }> = [];
    const result = await upscaleWithRealEsrgan(
      image,
      { variant: 'x2plus', modelData: new Uint8Array([1]), consentGranted: true },
      capabilities,
      { runtime: fake.adapter, onProgress: (value) => progress.push(value) },
    );

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    expect(result.backend).toBe('wasm');
    expect(result.image.width).toBe(4);
    expect(result.image.height).toBe(2);
    expect(result.image.frames[0].data.length).toBe(4 * 2 * 4);
    expect(fake.capturedInput()?.dimensions).toEqual([1, 3, 1, 2]);
    expect(progress).toEqual([{ completedFrames: 1, totalFrames: 1 }]);
    expect(fake.closed()).toBe(1);
  });

  it('returns an explicit model error and releases the session after a shape mismatch', async () => {
    const fake = makeMockRuntime(2, true);
    const result = await upscaleWithRealEsrgan(
      makeImage(2, 1),
      { variant: 'x2plus', modelPath: '/cache/realesrgan-x2.onnx', consentGranted: true },
      capabilities,
      { runtime: fake.adapter },
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('output shape must be');
    expect(fake.closed()).toBe(1);
  });

  it('Tier 1 DCCI and NEDI remain available when Tier 2 is not loaded', () => {
    const image = makeImage(4, 4);
    expect(dcci(image, 2).width).toBe(8);
    expect(dcci(image, 2).height).toBe(8);
    expect(nedi(image, 2).width).toBe(8);
    expect(nedi(image, 2).height).toBe(8);
  });

  it('records the exact checkpoint, CPU parity, and x2/x4 browser smoke evidence', () => {
    const content = readFileSync(
      new URL('../bench/escalation/p4-16-upscale.md', import.meta.url),
      'utf-8',
    );
    expect(content).toContain('`RealESRGAN_x2plus.pth`');
    expect(content).toContain('Both exact checkpoints were converted');
    expect(content).toContain('Both models passed a tiny-input Chromium 151 WASM smoke');
  });
});

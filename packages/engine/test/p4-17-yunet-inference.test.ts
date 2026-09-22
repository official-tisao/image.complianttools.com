import { describe, expect, it, vi } from 'vitest';
import {
  decodeYuNetOutputs,
  detectFacesYuNet,
  prepareYuNetInput,
  type YuNetNumericOutput,
  type YuNetOutputMap,
  type YuNetRuntimeAdapter,
} from '../src/cv/yunet-face-detection.js';
import type { OnnxRuntimeState, OnnxTileFeeds, OnnxTileOutputs } from '../src/onnx-runtime.js';
import type { RasterImage } from '../src/types.js';

type MutableOutput = { dims: number[]; data: Float32Array };

function makeImage(
  width = 1,
  height = 1,
  data = new Uint8ClampedArray(width * height * 4).fill(255),
  options: { colorSpace?: RasterImage['colorSpace']; premultipliedAlpha?: boolean } = {},
): RasterImage {
  return {
    width,
    height,
    colorSpace: options.colorSpace ?? 'srgb',
    bitDepth: 8,
    premultipliedAlpha: options.premultipliedAlpha ?? false,
    frames: [{ data, durationMs: 0 }],
  };
}

function makeOutputs(): Record<string, MutableOutput> {
  const result: Record<string, MutableOutput> = {};
  for (const stride of [8, 16, 32]) {
    const anchors = (640 / stride) ** 2;
    result[`cls_${stride}`] = { dims: [1, anchors, 1], data: new Float32Array(anchors) };
    result[`obj_${stride}`] = { dims: [1, anchors, 1], data: new Float32Array(anchors) };
    result[`bbox_${stride}`] = {
      dims: [1, anchors, 4],
      data: new Float32Array(anchors * 4),
    };
    result[`kps_${stride}`] = {
      dims: [1, anchors, 10],
      data: new Float32Array(anchors * 10),
    };
  }
  return result;
}

function setPrediction(
  outputs: Record<string, MutableOutput>,
  stride: 8 | 16 | 32,
  row: number,
  column: number,
  scores: { classScore: number; objectScore: number },
  box: { dx: number; dy: number; width: number; height: number },
): void {
  const columns = 640 / stride;
  const index = row * columns + column;
  outputs[`cls_${stride}`]!.data[index] = scores.classScore;
  outputs[`obj_${stride}`]!.data[index] = scores.objectScore;
  const offset = index * 4;
  outputs[`bbox_${stride}`]!.data[offset] = box.dx;
  outputs[`bbox_${stride}`]!.data[offset + 1] = box.dy;
  outputs[`bbox_${stride}`]!.data[offset + 2] = Math.log(box.width / stride);
  outputs[`bbox_${stride}`]!.data[offset + 3] = Math.log(box.height / stride);
}

function makeRuntime(outputs: YuNetOutputMap): {
  readonly adapter: YuNetRuntimeAdapter;
  readonly open: ReturnType<typeof vi.fn>;
  readonly createTensor: ReturnType<typeof vi.fn>;
  readonly run: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
} {
  const session = {
    inputNames: ['input'],
    outputNames: Object.keys(outputs),
  } as unknown as NonNullable<OnnxRuntimeState['session']>;
  const open = vi.fn(async (state: OnnxRuntimeState) => ({
    ...state,
    backend: 'wasm' as const,
    session,
  }));
  const createTensor = vi.fn(
    async (data: Float32Array, dims: readonly number[]) =>
      ({
        data,
        dims: [...dims],
      }) as never,
  );
  const run = vi.fn(
    async (_state: OnnxRuntimeState, _feeds: OnnxTileFeeds) =>
      outputs as unknown as OnnxTileOutputs,
  );
  const close = vi.fn(async (_state: OnnxRuntimeState) => undefined);
  return {
    adapter: { open, createTensor, run, close },
    open,
    createTensor,
    run,
    close,
  };
}

describe('P4-17 YuNet 2023mar ONNX face detector adapter', () => {
  it('prepares 640x640 BGR NCHW raw pixel input and pads the short dimension with black', () => {
    const image = makeImage(2, 1, new Uint8ClampedArray([255, 10, 20, 255, 30, 40, 50, 255]));
    const prepared = prepareYuNetInput(image);
    const planeSize = 640 * 640;

    expect(prepared.dimensions).toEqual([1, 3, 640, 640]);
    expect(prepared.scaleX).toBe(320);
    expect(prepared.scaleY).toBe(320);
    expect(prepared.data[0]).toBeCloseTo(20); // B plane starts from input blue.
    expect(prepared.data[planeSize]).toBeCloseTo(10); // G plane.
    expect(prepared.data[planeSize * 2]).toBeCloseTo(255); // R plane.
    expect(prepared.data[320 * 640]).toBe(0); // Right/bottom pad stays black.
    expect(prepared.data[planeSize + 320 * 640]).toBe(0);
  });

  it('unpremultiplies RGBA samples and accepts a grayscale raster', () => {
    const premultiplied = makeImage(1, 1, new Uint8ClampedArray([64, 32, 16, 128]), {
      premultipliedAlpha: true,
    });
    const prepared = prepareYuNetInput(premultiplied);
    const planeSize = 640 * 640;
    expect(prepared.data[0]).toBeCloseTo(31.875);
    expect(prepared.data[planeSize]).toBeCloseTo(63.75);
    expect(prepared.data[planeSize * 2]).toBeCloseTo(127.5);

    const gray = prepareYuNetInput(
      makeImage(1, 1, new Uint8ClampedArray([77, 0, 0, 255]), { colorSpace: 'gray' }),
    );
    expect(gray.data[0]).toBe(77);
    expect(gray.data[planeSize]).toBe(77);
    expect(gray.data[planeSize * 2]).toBe(77);
  });

  it('decodes official stride outputs, filters confidence, applies NMS, and clips to source bounds', () => {
    const outputs = makeOutputs();
    // Two stride-8 anchors predict the same partly out-of-frame box; the higher score wins.
    setPrediction(
      outputs,
      8,
      0,
      0,
      { classScore: 0.81, objectScore: 0.64 },
      { dx: 0.5, dy: 0.5, width: 16, height: 16 },
    );
    setPrediction(
      outputs,
      8,
      0,
      1,
      { classScore: 0.95, objectScore: 0.95 },
      { dx: -0.5, dy: 0.5, width: 16, height: 16 },
    );
    // A below-threshold prediction is ignored.
    setPrediction(
      outputs,
      8,
      10,
      10,
      { classScore: 0.25, objectScore: 0.25 },
      { dx: 0.5, dy: 0.5, width: 16, height: 24 },
    );
    // A non-overlapping stride-16 prediction verifies that all three heads are decoded.
    setPrediction(
      outputs,
      16,
      10,
      10,
      { classScore: 0.81, objectScore: 0.64 },
      { dx: 0.5, dy: 0.5, width: 32, height: 48 },
    );

    const boxes = decodeYuNetOutputs(outputs, {
      sourceWidth: 320,
      sourceHeight: 640,
      scaleX: 1,
      scaleY: 1,
    });

    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.x).toBe(0);
    expect(boxes[0]?.y).toBe(0);
    expect(boxes[0]?.width).toBeCloseTo(12);
    expect(boxes[0]?.height).toBeCloseTo(12);
    expect(boxes[0]?.confidence).toBeCloseTo(0.95);
    expect(boxes[1]?.confidence).toBeCloseTo(0.72);
    expect(boxes[1]?.x).toBeCloseTo(152);
    expect(boxes[1]?.y).toBeCloseTo(144);
    expect(boxes[1]?.width).toBeCloseTo(32);
    expect(boxes[1]?.height).toBeCloseTo(48);
  });

  it('requires consented caller bytes, opens WASM lazily, and releases the session', async () => {
    const outputs = makeOutputs();
    const fake = makeRuntime(outputs);
    const modelData = new Uint8Array([1, 2, 3]);
    const boxes = await detectFacesYuNet(
      makeImage(),
      { modelData, consentGranted: true },
      { runtime: fake.adapter },
    );

    expect(boxes).toEqual([]);
    expect(fake.open).toHaveBeenCalledOnce();
    const state = fake.open.mock.calls[0]?.[0];
    expect(state?.sessionConfig?.modelData).toBe(modelData);
    expect(state?.sessionConfig?.consentGranted).toBe(true);
    expect(state?.sessionConfig?.modelPath).toBeUndefined();
    expect(state?.sessionConfig?.webGpuPreferred).toBe(false);
    expect(fake.createTensor).toHaveBeenCalledOnce();
    expect(fake.createTensor.mock.calls[0]?.[1]).toEqual([1, 3, 640, 640]);
    expect(fake.run).toHaveBeenCalledOnce();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('rejects missing consent/bytes and malformed output contracts without leaking the session', async () => {
    const outputs = makeOutputs();
    const fake = makeRuntime(outputs);
    await expect(
      detectFacesYuNet(
        makeImage(),
        { modelData: new Uint8Array([1]), consentGranted: false },
        {
          runtime: fake.adapter,
        },
      ),
    ).rejects.toThrow('caller-confirmed model consent');
    await expect(
      detectFacesYuNet(
        makeImage(),
        { modelData: new Uint8Array(), consentGranted: true },
        {
          runtime: fake.adapter,
        },
      ),
    ).rejects.toThrow('non-empty caller-supplied model bytes');
    expect(fake.open).not.toHaveBeenCalled();

    delete (outputs as Record<string, YuNetNumericOutput | undefined>).cls_8;
    const badRuntime = makeRuntime(outputs);
    await expect(
      detectFacesYuNet(
        makeImage(),
        { modelData: new Uint8Array([1]), consentGranted: true },
        { runtime: badRuntime.adapter },
      ),
    ).rejects.toThrow('model output cls_8 is missing');
    expect(badRuntime.close).toHaveBeenCalledOnce();
  });

  it('rejects incompatible raster color spaces and malformed output shapes', () => {
    expect(() =>
      prepareYuNetInput(
        makeImage(1, 1, new Uint8ClampedArray([1, 2, 3, 255]), { colorSpace: 'display-p3' }),
      ),
    ).toThrow('requires sRGB or grayscale');

    const outputs = makeOutputs();
    outputs.cls_8!.dims = [1, 6400];
    expect(() =>
      decodeYuNetOutputs(outputs, { sourceWidth: 1, sourceHeight: 1, scaleX: 1, scaleY: 1 }),
    ).toThrow('must have shape [1, 6400, 1]');
  });
});

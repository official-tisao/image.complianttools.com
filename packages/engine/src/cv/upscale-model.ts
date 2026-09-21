/**
 * P4-16 — consented Tier 2 Real-ESRGAN inference adapter.
 *
 * Only the official x2 and x4 source checkpoints are owner-approved in
 * docs/model-assets.json. This adapter accepts a caller-supplied ONNX conversion; it does not ship
 * source weights or claim a conversion is available when the caller has not supplied one.
 * DCCI/NEDI Tier 1 functions remain independent of this module.
 */

import type { Tensor as OrtTensor } from 'onnxruntime-web';
import type { RuntimeCapabilities } from '../capabilities.js';
import type { Frame, RasterImage } from '../types.js';
import {
  closeOnnxRuntime,
  createFloatOnnxTensor,
  initOnnxRuntime,
  openOnnxRuntime,
  runOnnxInference,
  type OnnxRuntimeState,
  type OnnxSessionConfig,
  type OnnxTileFeeds,
  type OnnxTileOutputs,
} from '../onnx-runtime.js';

export type RealEsrganVariant = 'x2plus' | 'x4plus';
export type RealEsrganScale = 2 | 4;

export interface UpscaleModelSource {
  readonly variant: RealEsrganVariant;
  readonly modelPath?: string;
  /** Set only after the caller confirms this path came from its persistent model cache. */
  readonly cachedModelPath?: string;
  readonly modelData?: Uint8Array | ArrayBuffer;
  readonly modelSizeBytes?: number;
  readonly consentGranted?: boolean;
  readonly webGpuPreferred?: boolean;
}

export type UpscaleTier2Availability =
  | {
      readonly status: 'unavailable';
      readonly reason: 'model_not_supplied' | 'consent_required' | 'unsupported_variant';
      readonly tier1FallbackAvailable: true;
    }
  | {
      readonly status: 'available';
      readonly scaleFactor: RealEsrganScale;
      readonly tier1FallbackAvailable: true;
    };

export interface PreparedRealEsrganInput {
  /** Contiguous RGB planes in NCHW order. */
  readonly data: Float32Array;
  readonly dimensions: readonly [1, 3, number, number];
  /** Straight-alpha plane retained outside the model. */
  readonly alpha: Float32Array;
}

export interface NumericOnnxOutput {
  readonly dims: readonly number[];
  readonly data: ArrayLike<unknown>;
}

export interface UpscaleRuntimeAdapter {
  open(state: OnnxRuntimeState): Promise<OnnxRuntimeState>;
  createTensor(data: Float32Array, dimensions: readonly number[]): Promise<OrtTensor>;
  run(state: OnnxRuntimeState, feeds: OnnxTileFeeds): Promise<OnnxTileOutputs>;
  close(state: OnnxRuntimeState): Promise<void>;
}

export interface UpscaleModelProgress {
  readonly completedFrames: number;
  readonly totalFrames: number;
}

export type UpscaleModelResult =
  | {
      readonly status: 'unavailable';
      readonly availability: Extract<UpscaleTier2Availability, { status: 'unavailable' }>;
    }
  | {
      readonly status: 'complete';
      readonly image: RasterImage;
      readonly backend: 'wasm' | 'webgpu';
      readonly scaleFactor: RealEsrganScale;
    }
  | {
      readonly status: 'cancelled';
      readonly completedFrames: number;
      readonly tier1FallbackAvailable: true;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly tier1FallbackAvailable: true;
    };

const REAL_ESRGAN_SCALE: Record<RealEsrganVariant, RealEsrganScale> = {
  x2plus: 2,
  x4plus: 4,
};

const defaultRuntime: UpscaleRuntimeAdapter = {
  open: openOnnxRuntime,
  createTensor: createFloatOnnxTensor,
  run: runOnnxInference,
  close: closeOnnxRuntime,
};

function hasModelSource(source: UpscaleModelSource): boolean {
  const hasPath = typeof source.modelPath === 'string' && source.modelPath.trim().length > 0;
  const hasBytes =
    (source.modelData instanceof Uint8Array || source.modelData instanceof ArrayBuffer) &&
    source.modelData.byteLength > 0;
  return hasPath || hasBytes;
}

function isRealEsrganVariant(variant: unknown): variant is RealEsrganVariant {
  return (
    typeof variant === 'string' && Object.prototype.hasOwnProperty.call(REAL_ESRGAN_SCALE, variant)
  );
}

/** Tier 2 stays clearly unavailable until a caller provides model bytes/path and consent. */
export function getUpscaleTier2Availability(source?: UpscaleModelSource): UpscaleTier2Availability {
  if (!source || !hasModelSource(source)) {
    return { status: 'unavailable', reason: 'model_not_supplied', tier1FallbackAvailable: true };
  }
  if (source.consentGranted !== true) {
    return { status: 'unavailable', reason: 'consent_required', tier1FallbackAvailable: true };
  }
  if (!isRealEsrganVariant(source.variant)) {
    return { status: 'unavailable', reason: 'unsupported_variant', tier1FallbackAvailable: true };
  }
  return {
    status: 'available',
    scaleFactor: REAL_ESRGAN_SCALE[source.variant],
    tier1FallbackAvailable: true,
  };
}

function validateRasterFrame(image: RasterImage, frameIndex: number): Frame {
  if (
    !Number.isInteger(image.width) ||
    image.width <= 0 ||
    !Number.isInteger(image.height) ||
    image.height <= 0
  ) {
    throw new RangeError('Real-ESRGAN input dimensions must be positive integers.');
  }
  if (image.colorSpace !== 'srgb' && image.colorSpace !== 'gray') {
    throw new RangeError(
      `Real-ESRGAN input requires sRGB-compatible pixels; got ${image.colorSpace}.`,
    );
  }
  const frame = image.frames[frameIndex];
  if (!frame) throw new RangeError(`Real-ESRGAN input frame ${frameIndex} does not exist.`);
  const sampleCount = image.width * image.height * 4;
  if (!Number.isSafeInteger(sampleCount) || frame.data.length !== sampleCount) {
    throw new RangeError('Real-ESRGAN input frame must contain RGBA samples for every pixel.');
  }
  if (image.bitDepth === 16 && (!frame.data16 || frame.data16.length !== sampleCount)) {
    throw new RangeError('16-bit Real-ESRGAN input requires complete RGBA data16 samples.');
  }
  return frame;
}

/** Convert interleaved RGBA samples into normalized, un-premultiplied RGB NCHW float planes. */
export function prepareRealEsrganInput(
  image: RasterImage,
  frameIndex = 0,
  padToMultiple = 1,
): PreparedRealEsrganInput {
  const frame = validateRasterFrame(image, frameIndex);
  if (!Number.isInteger(padToMultiple) || padToMultiple < 1) {
    throw new RangeError('Real-ESRGAN input padding multiple must be a positive integer.');
  }
  const width = image.width;
  const height = image.height;
  const modelWidth = Math.ceil(width / padToMultiple) * padToMultiple;
  const modelHeight = Math.ceil(height / padToMultiple) * padToMultiple;
  const sourcePixelCount = width * height;
  const modelPixelCount = modelWidth * modelHeight;
  if (!Number.isSafeInteger(modelPixelCount * 3)) {
    throw new RangeError('Real-ESRGAN padded input dimensions exceed safe image limits.');
  }
  const data = new Float32Array(modelPixelCount * 3);
  const alpha = new Float32Array(sourcePixelCount);
  const rgba = image.bitDepth === 16 ? frame.data16! : frame.data;
  const maxValue = image.bitDepth === 16 ? 65535 : 255;

  for (let y = 0; y < modelHeight; y++) {
    const sourceY = Math.min(y, height - 1);
    for (let x = 0; x < modelWidth; x++) {
      const sourceX = Math.min(x, width - 1);
      const sourcePixel = sourceY * width + sourceX;
      const modelPixel = y * modelWidth + x;
      const rgbaOffset = sourcePixel * 4;
      const a = rgba[rgbaOffset + 3]! / maxValue;
      if (x < width && y < height) alpha[sourcePixel] = a;
      for (let channel = 0; channel < 3; channel++) {
        const stored = rgba[rgbaOffset + channel]! / maxValue;
        const straight = image.premultipliedAlpha ? (a > 0 ? stored / a : 0) : stored;
        data[channel * modelPixelCount + modelPixel] = Math.min(1, Math.max(0, straight));
      }
    }
  }

  return { data, dimensions: [1, 3, modelHeight, modelWidth], alpha };
}

interface RealEsrganInputDimensions {
  readonly width: number;
  readonly height: number;
}

function expectedOutputDimensions(
  width: number,
  height: number,
  scaleFactor: RealEsrganScale,
): [number, number, number, number] {
  const dimensions = [1, 3, height * scaleFactor, width * scaleFactor] as const;
  const sampleCount = dimensions.reduce((product, value) => product * value, 1);
  if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError('Real-ESRGAN output dimensions exceed safe image limits.');
  }
  return [...dimensions];
}

/** Reject a non-NCHW, non-RGB, wrong-scale, or incomplete model output. */
export function validateRealEsrganOutput(
  image: RasterImage,
  output: NumericOnnxOutput,
  scaleFactor: RealEsrganScale,
  modelInputDimensions?: RealEsrganInputDimensions,
): void {
  const inputWidth = modelInputDimensions?.width ?? image.width;
  const inputHeight = modelInputDimensions?.height ?? image.height;
  if (
    !Number.isInteger(inputWidth) ||
    inputWidth < image.width ||
    !Number.isInteger(inputHeight) ||
    inputHeight < image.height
  ) {
    throw new RangeError('Real-ESRGAN model input dimensions must include the full source image.');
  }
  const expected = expectedOutputDimensions(inputWidth, inputHeight, scaleFactor);
  if (
    output.dims.length !== expected.length ||
    output.dims.some((value, i) => value !== expected[i])
  ) {
    throw new RangeError(
      `Real-ESRGAN ${scaleFactor}x output shape must be [${expected.join(', ')}], got [${output.dims.join(', ')}].`,
    );
  }
  const expectedValues = expected.reduce((product, value) => product * value, 1);
  if (output.data.length !== expectedValues) {
    throw new RangeError(
      `Real-ESRGAN output has ${output.data.length} values; expected ${expectedValues}.`,
    );
  }
  for (let i = 0; i < output.data.length; i++) {
    if (!Number.isFinite(Number(output.data[i]))) {
      throw new RangeError(`Real-ESRGAN output contains a non-finite value at index ${i}.`);
    }
  }
}

function sampleAlphaBilinear(
  alpha: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  outX: number,
  outY: number,
  scaleFactor: RealEsrganScale,
): number {
  const sourceX = Math.max(0, Math.min(sourceWidth - 1, (outX + 0.5) / scaleFactor - 0.5));
  const sourceY = Math.max(0, Math.min(sourceHeight - 1, (outY + 0.5) / scaleFactor - 0.5));
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(sourceWidth - 1, x0 + 1);
  const y1 = Math.min(sourceHeight - 1, y0 + 1);
  const wx = sourceX - x0;
  const wy = sourceY - y0;
  const top = alpha[y0 * sourceWidth + x0]! * (1 - wx) + alpha[y0 * sourceWidth + x1]! * wx;
  const bottom = alpha[y1 * sourceWidth + x0]! * (1 - wx) + alpha[y1 * sourceWidth + x1]! * wx;
  return top * (1 - wy) + bottom * wy;
}

/** Re-interleave model RGB output with the separately resized alpha plane. */
export function reconstructRealEsrganFrame(
  image: RasterImage,
  frameIndex: number,
  alpha: Float32Array,
  output: NumericOnnxOutput,
  scaleFactor: RealEsrganScale,
  modelInputDimensions?: RealEsrganInputDimensions,
): Frame {
  validateRasterFrame(image, frameIndex);
  validateRealEsrganOutput(image, output, scaleFactor, modelInputDimensions);
  const width = image.width;
  const height = image.height;
  const modelWidth = modelInputDimensions?.width ?? width;
  const modelHeight = modelInputDimensions?.height ?? height;
  const modelOutWidth = modelWidth * scaleFactor;
  const modelOutHeight = modelHeight * scaleFactor;
  const outWidth = width * scaleFactor;
  const outHeight = height * scaleFactor;
  const outPixelCount = outWidth * outHeight;
  const byteData = new Uint8ClampedArray(outPixelCount * 4);
  const wordData = image.bitDepth === 16 ? new Uint16Array(outPixelCount * 4) : undefined;
  const planeSize = modelOutWidth * modelOutHeight;

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const modelPixel = y * modelOutWidth + x;
      const outputPixel = y * outWidth + x;
      const byteOffset = outputPixel * 4;
      for (let channel = 0; channel < 3; channel++) {
        const normalized = Math.max(
          0,
          Math.min(1, Number(output.data[channel * planeSize + modelPixel])),
        );
        byteData[byteOffset + channel] = Math.round(normalized * 255);
        if (wordData) wordData[byteOffset + channel] = Math.round(normalized * 65535);
      }
      const normalizedAlpha = sampleAlphaBilinear(alpha, width, height, x, y, scaleFactor);
      byteData[byteOffset + 3] = Math.round(normalizedAlpha * 255);
      if (wordData) wordData[byteOffset + 3] = Math.round(normalizedAlpha * 65535);
    }
  }

  const sourceFrame = image.frames[frameIndex]!;
  return {
    data: byteData,
    ...(wordData ? { data16: wordData } : {}),
    durationMs: sourceFrame.durationMs,
    ...(sourceFrame.disposal ? { disposal: sourceFrame.disposal } : {}),
  };
}

function isCancelled(signal?: AbortSignal | { readonly cancelled: boolean }): boolean {
  if (!signal) return false;
  return 'aborted' in signal ? signal.aborted : signal.cancelled;
}

/** Execute one official x2/x4 conversion supplied by the caller after explicit consent. */
export async function upscaleWithRealEsrgan(
  image: RasterImage,
  source: UpscaleModelSource | undefined,
  capabilities: RuntimeCapabilities,
  options: {
    readonly signal?: AbortSignal | { readonly cancelled: boolean };
    readonly onProgress?: (progress: UpscaleModelProgress) => void;
    readonly runtime?: UpscaleRuntimeAdapter;
  } = {},
): Promise<UpscaleModelResult> {
  const availability = getUpscaleTier2Availability(source);
  if (availability.status === 'unavailable') return { status: 'unavailable', availability };

  const config = source!;
  const scaleFactor = availability.scaleFactor;
  const runtime = options.runtime ?? defaultRuntime;
  const sessionConfig: OnnxSessionConfig = {
    modelName: `RealESRGAN_${config.variant}`,
    consentGranted: true,
    ...(config.modelPath ? { modelPath: config.modelPath } : {}),
    ...(config.cachedModelPath ? { cachedModelPath: config.cachedModelPath } : {}),
    ...(config.modelData ? { modelData: config.modelData } : {}),
    ...(config.modelSizeBytes !== undefined ? { modelSizeBytes: config.modelSizeBytes } : {}),
    ...(config.webGpuPreferred !== undefined ? { webGpuPreferred: config.webGpuPreferred } : {}),
  };
  let state = initOnnxRuntime(capabilities, sessionConfig);

  try {
    state = await runtime.open(state);
    if (!state.session) throw new Error('The model runtime opened without an inference session.');
    if (state.session.inputNames.length !== 1 || state.session.outputNames.length !== 1) {
      throw new Error('The selected Real-ESRGAN conversion must have one input and one output.');
    }

    const frames: Frame[] = [];
    for (let frameIndex = 0; frameIndex < image.frames.length; frameIndex++) {
      if (isCancelled(options.signal)) {
        return {
          status: 'cancelled',
          completedFrames: frames.length,
          tier1FallbackAvailable: true,
        };
      }
      // Both registered exports contain pixel-unshuffle operations and require even dimensions.
      // Replicate the last source edge for model input, then crop the inference result back to the
      // exact requested x2/x4 dimensions during reconstruction.
      const prepared = prepareRealEsrganInput(image, frameIndex, 2);
      const tensor = await runtime.createTensor(prepared.data, prepared.dimensions);
      const result = await runtime.run(state, {
        [state.session.inputNames[0]!]: tensor,
      } as OnnxTileFeeds);
      const output = result[state.session.outputNames[0]!];
      if (!output) throw new Error('The Real-ESRGAN session returned no output tensor.');
      const modelInputDimensions = {
        width: prepared.dimensions[3],
        height: prepared.dimensions[2],
      };
      frames.push(
        reconstructRealEsrganFrame(
          image,
          frameIndex,
          prepared.alpha,
          output,
          scaleFactor,
          modelInputDimensions,
        ),
      );
      options.onProgress?.({ completedFrames: frames.length, totalFrames: image.frames.length });
    }

    const { encodedMetadata: _encodedMetadata, ...imageProperties } = image;
    return {
      status: 'complete',
      backend: state.backend === 'webgpu' ? 'webgpu' : 'wasm',
      scaleFactor,
      image: {
        ...imageProperties,
        width: image.width * scaleFactor,
        height: image.height * scaleFactor,
        colorSpace: 'srgb',
        premultipliedAlpha: false,
        frames: frames as [Frame, ...Frame[]],
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      tier1FallbackAvailable: true,
    };
  } finally {
    await runtime.close(state);
  }
}

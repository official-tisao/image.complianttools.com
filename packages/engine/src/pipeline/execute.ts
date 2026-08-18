import { decodeJpegToRaster } from '../codecs/jsquash.js';
import { cropRaster, rotateRaster } from '../ops/geometry.js';
import { applyPixelLocalOptions, boxBlur } from '../ops/raster.js';
import { resizeRaster } from '../ops/resize.js';
import { CropOptionsSchema, ResizeOptionsSchema, RotateOptionsSchema } from '../schemas/options.js';
import type {
  EngineError,
  InputMeta,
  ItemResult,
  Progress,
  RasterImage,
  Recipe,
  RunResult,
} from '../types.js';
import { compile } from './compile.js';
import { executeTiled } from './tiling.js';

export type EngineInput = RasterImage | ArrayBuffer;

function isRasterImage(input: EngineInput): input is RasterImage {
  return 'frames' in input;
}

async function decodeInput(input: ArrayBuffer): Promise<RasterImage> {
  try {
    return await decodeJpegToRaster(input);
  } catch (cause) {
    throw {
      kind: 'decode-failed',
      format: 'jpeg',
      detail: cause instanceof Error ? cause.message : String(cause),
      remedy: 'Choose a valid, non-corrupted JPEG, PNG, or WebP image.',
    } satisfies EngineError;
  }
}

function cancelled(): EngineError {
  return { kind: 'cancelled', remedy: 'Retry the operation when you are ready.' };
}

async function executeStep(
  image: RasterImage,
  op: string,
  options: Readonly<Record<string, unknown>>,
  tiled: boolean,
  tileSize = 512,
  kernelRadius = 0,
): Promise<RasterImage> {
  if (op === 'resize') return resizeRaster(image, ResizeOptionsSchema.parse(options));
  if (op === 'crop') return cropRaster(image, CropOptionsSchema.parse(options));
  if (op === 'rotate') return rotateRaster(image, RotateOptionsSchema.parse(options));
  if (op === 'pixel-local') {
    const operation = (input: RasterImage) =>
      (options.operations as ReadonlyArray<Readonly<Record<string, unknown>>>).reduce(
        applyPixelLocalOptions,
        input,
      );
    return tiled ? executeTiled(image, operation, tileSize, 0) : operation(image);
  }
  if (op === 'enhance' && typeof options.radius === 'number') {
    const operation = (input: RasterImage) => boxBlur(input, Math.ceil(options.radius as number));
    return tiled ? executeTiled(image, operation, tileSize, kernelRadius) : operation(image);
  }
  return image;
}

export async function run(
  recipe: Recipe,
  inputs: readonly EngineInput[],
  opts: {
    signal?: AbortSignal;
    onProgress?: (progress: Progress) => void;
    onItemDone?: (result: ItemResult) => void;
    concurrency?: number;
    inputMeta?: Partial<InputMeta>;
  } = {},
): Promise<RunResult> {
  if (opts.signal?.aborted) throw cancelled();
  const first = inputs[0];
  if (!first)
    return { items: [], plan: await compile(recipe, { width: 1, height: 1, format: 'png' }) };
  const initial = isRasterImage(first) ? first : await decodeInput(first);
  const plan = await compile(recipe, {
    width: initial.width,
    height: initial.height,
    format: 'jpeg',
    ...opts.inputMeta,
  });
  if (plan.memoryStrategy === 'refuse') {
    throw {
      kind: 'dimension-limit',
      limit: plan.largestWorkableDimension ?? 0,
      actual: Math.max(initial.width, initial.height),
      remedy: plan.warnings[0] ?? 'Use a smaller source image.',
    } satisfies EngineError;
  }
  const items: ItemResult[] = [];
  for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
    if (opts.signal?.aborted) throw cancelled();
    const input = inputs[itemIndex]!;
    let image = isRasterImage(input) ? input : await decodeInput(input);
    for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex += 1) {
      if (opts.signal?.aborted) throw cancelled();
      const step = plan.steps[stepIndex]!;
      opts.onProgress?.({
        itemIndex,
        itemCount: inputs.length,
        stepIndex,
        stepCount: plan.steps.length,
        fraction: (itemIndex + stepIndex / Math.max(1, plan.steps.length)) / inputs.length,
        phase: 'processing',
        label: step.op,
        bytesProcessed: image.frames[0].data.byteLength,
      });
      image = await executeStep(
        image,
        step.op,
        step.options,
        plan.memoryStrategy === 'tiled' || plan.memoryStrategy === 'opfs-spill',
        plan.tileSize,
        step.kernelRadius,
      );
      await Promise.resolve();
    }
    const result: ItemResult = { itemIndex, image, tiers: plan.steps.map(() => plan.tier) };
    items.push(result);
    opts.onItemDone?.(result);
  }
  opts.onProgress?.({
    itemIndex: inputs.length - 1,
    itemCount: inputs.length,
    stepIndex: plan.steps.length,
    stepCount: plan.steps.length,
    fraction: 1,
    phase: 'packaging',
    label: 'Complete',
  });
  return { items, plan };
}

export async function preview(
  recipe: Recipe,
  proxy: RasterImage,
  opts: { signal?: AbortSignal } = {},
): Promise<RasterImage> {
  const result = await run(recipe, [proxy], opts.signal ? { signal: opts.signal } : {});
  return result.items[0]?.image ?? proxy;
}

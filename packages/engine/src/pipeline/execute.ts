import { decodeJpegToRaster } from '../codecs/jsquash.js';
import { cropRaster, rotateRaster } from '../ops/geometry.js';
import { applyAdjustments, DEHAZE_RADIUS } from '../ops/adjust.js';
import { applyPixelLocalOptions, boxBlur } from '../ops/raster.js';
import { resizeRaster } from '../ops/resize.js';
import {
  AdjustOptionsSchema,
  CropOptionsSchema,
  ResizeOptionsSchema,
  RotateOptionsSchema,
} from '../schemas/options.js';
import type {
  EngineError,
  ExecutionTier,
  InputMeta,
  ItemResult,
  Progress,
  RasterImage,
  Recipe,
  RunResult,
} from '../types.js';
import type { GpuEnvironment } from '../gpu/types.js';
import { executeOnTier } from './execute-on-tier.js';
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

/**
 * The option keys that constitute an `adjust` step. Used to distinguish an adjustment record from a
 * filter record inside a fused `pixel-local` operations array.
 */
const adjustOptionKeys = new Set<string>(Object.keys(AdjustOptionsSchema.shape));

function isAdjustRecord(record: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(record).some((key) => adjustOptionKeys.has(key));
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
  if (op === 'adjust') {
    const parsed = AdjustOptionsSchema.parse(options);
    // Clarity reads a 3×3 neighbourhood (halo = 1); dehaze reads a 15×15 window (halo =
    // DEHAZE_RADIUS = 7). When either is active the step must be tiled or the result
    // is wrong on the image edges. The `pixel-local` fusion in compile.ts otherwise
    // fuses adjust steps with kernelRadius: 0, which is correct for everything else.
    const needsTile =
      (typeof parsed.clarity === 'number' && parsed.clarity !== 0) ||
      (typeof parsed.dehaze === 'number' && parsed.dehaze !== 0);
    if (needsTile) {
      const halo = parsed.dehaze !== 0 ? DEHAZE_RADIUS : 1;
      const operation = (input: RasterImage) => applyAdjustments(input, parsed);
      return executeTiled(image, operation, tileSize, halo);
    }
    return applyAdjustments(image, parsed);
  }
  if (op === 'pixel-local') {
    const operation = (input: RasterImage) =>
      (options.operations as ReadonlyArray<Readonly<Record<string, unknown>>>).reduce(
        (current, record) =>
          isAdjustRecord(record)
            ? applyAdjustments(current, AdjustOptionsSchema.parse(record))
            : applyPixelLocalOptions(current, record),
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
    /**
     * Optional GPU environment. When provided, the executor dispatches
     * pixel-local steps through `executeOnTier` so the GPU backends can
     * accelerate them. The environment is opaque to the engine except
     * for the fields declared in `GpuEnvironment`. When `null` or
     * omitted, the executor falls back to the CPU path with no overhead.
     */
    gpu?: GpuEnvironment | null;
    /**
     * When `true`, the executor honours the GPU tier for the export path
     * (P3-01 opt-in). Default `false` enforces the README §10.4
     * determinism guarantee: export always runs on CPU/WASM unless the
     * caller explicitly opts in.
     */
    runExportOnGpu?: boolean;
    /**
     * The plan mode. `'preview'` is the default; `'export'` forces
     * `chooseTier` to skip the GPU tiers in `compile.ts`. When
     * `runExportOnGpu: true` and `mode: 'export'`, the export path may
     * still use a GPU tier for the pixel-local steps.
     */
    mode?: 'preview' | 'export';
  } = {},
): Promise<RunResult> {
  if (opts.signal?.aborted) throw cancelled();
  const first = inputs[0];
  const mode = opts.mode ?? 'preview';
  const capabilitiesFromGpu = opts.gpu
    ? {
        wasmSimd: typeof WebAssembly === 'object',
        webGpu: opts.gpu.capabilities?.webGpu ?? false,
        webGl2: opts.gpu.capabilities?.webGl2 ?? false,
      }
    : undefined;
  const compileOptions = capabilitiesFromGpu
    ? { mode, capabilities: capabilitiesFromGpu }
    : { mode };
  if (!first)
    return {
      items: [],
      plan: await compile(recipe, { width: 1, height: 1, format: 'png' }, compileOptions),
    };
  const initial = isRasterImage(first) ? first : await decodeInput(first);
  const plan = await compile(
    recipe,
    {
      width: initial.width,
      height: initial.height,
      format: 'jpeg',
      ...opts.inputMeta,
    },
    compileOptions,
  );
  if (plan.memoryStrategy === 'refuse') {
    throw {
      kind: 'dimension-limit',
      limit: plan.largestWorkableDimension ?? 0,
      actual: Math.max(initial.width, initial.height),
      remedy: plan.warnings[0] ?? 'Use a smaller source image.',
    } satisfies EngineError;
  }
  const items: ItemResult[] = [];
  // Whether the GPU tier is allowed for the current path. The export path
  // is allowed to use the GPU only when the caller has explicitly opted
  // in via `runExportOnGpu: true`. This is the P3-01 determinism guarantee
  // from README §10.4 enforced at the executor boundary.
  const allowGpu = opts.gpu != null && (opts.mode !== 'export' || opts.runExportOnGpu === true);
  for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
    if (opts.signal?.aborted) throw cancelled();
    const input = inputs[itemIndex]!;
    let image = isRasterImage(input) ? input : await decodeInput(input);
    const perStepTiers: ExecutionTier[] = [];
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
      if (allowGpu && step.fused && step.op === 'pixel-local') {
        const result = await executeOnTier(
          {
            ...plan,
            steps: [step],
          },
          image,
          opts.gpu ?? null,
        );
        image = result.image;
        perStepTiers.push(result.tiers[0] ?? plan.tier);
      } else {
        image = await executeStep(
          image,
          step.op,
          step.options,
          plan.memoryStrategy === 'tiled' || plan.memoryStrategy === 'opfs-spill',
          plan.tileSize,
          step.kernelRadius,
        );
        // Non-GPU-eligible steps always record the canonical CPU tier
        // so the per-step `tiers` array is honest.
        perStepTiers.push('wasm-simd');
      }
      await Promise.resolve();
    }
    const result: ItemResult = {
      itemIndex,
      image,
      tiers: perStepTiers.length > 0
        ? perStepTiers
        : plan.steps.map(() => plan.tier),
    };
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

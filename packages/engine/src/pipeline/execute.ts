import { decodeJpegToRaster } from '../codecs/jsquash.js';
import { cropRaster, rotateRaster } from '../ops/geometry.js';
import { applyAdjustments, DEHAZE_RADIUS } from '../ops/adjust.js';
import { applyPixelLocalOptions, boxBlur } from '../ops/raster.js';
import { resizeRaster } from '../ops/resize.js';
import { applyWatermark } from '../ops/watermark.js';
import { renderText } from '../typography/index.js';
import { applyBorder } from '../transform/border.js';
import { roundCorners } from '../transform/round-corners.js';
import { makeCollage } from '../transform/collage.js';
import { splitImage } from '../transform/split.js';
import { canvasResize } from '../transform/canvas-resize.js';
import { enlarge } from '../transform/enlarge.js';
import { RESIZE_PRESETS } from '../transform/bulk-resize.js';
import {
  applyAntialias,
  applyBlur,
  applyDenoise,
  applyDespeckle,
  applyEnhanceToggle,
  applyNoMultilayer,
  applyNormalize,
  applySharpen,
  applyThreshold,
  applyEqualize,
  applyDeskew,
  SAUVOLA_HALO,
  BLUR_HALO_FN,
  DESPECKLE_HALO_FN,
  SHARPEN_HALO_FN,
} from '../ops/enhance/index.js';
import {
  convertColorSpace,
  extractPalette,
  exportPalette,
  exportPaletteCss,
  exportPaletteGpl,
  exportPaletteJson,
  type Palette,
  type PaletteFormat,
} from '../color/index.js';
import { applyRecolour } from '../color/recolour.js';
import {
  applyAntialias,
  applyBlur,
  applyDenoise,
  applyDespeckle,
  applyEnhanceToggle,
  applyNoMultilayer,
  applyNormalize,
  applySharpen,
  applyThreshold,
  SAUVOLA_HALO,
  BLUR_HALO_FN,
  DESPECKLE_HALO_FN,
  SHARPEN_HALO_FN,
} from '../ops/enhance/index.js';
import {
  convertColorSpace,
  extractPalette,
  exportPalette,
  exportPaletteCss,
  exportPaletteGpl,
  exportPaletteJson,
  type Palette,
  type PaletteFormat,
} from '../color/index.js';
import { applyRecolour } from '../color/recolour.js';
import {
  AdjustOptionsSchema,
  ColorSpaceOptionsSchema,
  CanvasResizeOptionsSchema,
  EnlargeOptionsSchema,
  BorderOptionsSchema,
  RoundCornersOptionsSchema,
  CropOptionsSchema,
  EnhanceOptionsSchema,
  NoMultilayerOptionsSchema,
  PaletteOptionsSchema,
  RecolourOptionsSchema,
  ResizeOptionsSchema,
  RotateOptionsSchema,
  SharpenOptionsSchema,
  DespeckleOptionsSchema,
  AntialiasOptionsSchema,
  NormalizeOptionsSchema,
  BlurOptionsSchema,
  DenoiseOptionsSchema,
  BlackWhiteThresholdOptionsSchema,
  EqualizeOptionsSchema,
  DeskewOptionsSchema,
  TextOptionsSchema,
  WatermarkOptionsSchema,
  CollageOptionsSchema,
  SplitOptionsSchema,
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
    // Legacy path: `'enhance'` with a `radius` option. The original
    // OC `Enhance` checkbox was a mild radius-based blur. Preserved
    // verbatim so legacy recipes still work.
    const operation = (input: RasterImage) => boxBlur(input, Math.ceil(options.radius as number));
    return tiled ? executeTiled(image, operation, tileSize, kernelRadius) : operation(image);
  }
  if (op === 'enhance-toggle') {
    // New richer enhance (P3-04): auto-levels + auto-contrast + local
    // tone map. **Not tile-safe**: the auto-levels sub-step reads the
    // per-frame histogram, which is a strict subset of the whole
    // image's when tiled. We therefore always run enhance on the
    // whole image, even when the rest of the plan is tiled. This is
    // logged in PLAN.md §16 as a deliberate v1 design constraint.
    const parsed = EnhanceOptionsSchema.parse(options);
    if (parsed.amount > 0) {
      return applyEnhanceToggle(image, parsed.amount);
    }
    return image;
  }
  if (op === 'sharpen') {
    const parsed = SharpenOptionsSchema.parse(options);
    if (parsed.enabled) {
      const operation = (input: RasterImage) =>
        applySharpen(input, parsed.amount, parsed.radius, parsed.threshold);
      const halo = SHARPEN_HALO_FN(parsed.radius);
      return tiled ? executeTiled(image, operation, tileSize, halo) : operation(image);
    }
    return image;
  }
  if (op === 'despeckle') {
    const parsed = DespeckleOptionsSchema.parse(options);
    if (parsed.enabled) {
      const operation = (input: RasterImage) => applyDespeckle(input, parsed.radius);
      const halo = DESPECKLE_HALO_FN(parsed.radius);
      return tiled ? executeTiled(image, operation, tileSize, halo) : operation(image);
    }
    return image;
  }
  if (op === 'antialias') {
    const parsed = AntialiasOptionsSchema.parse(options);
    if (parsed.enabled) {
      const operation = (input: RasterImage) => applyAntialias(input, parsed.amount);
      return tiled ? executeTiled(image, operation, tileSize, 1) : operation(image);
    }
    return image;
  }
  if (op === 'normalize') {
    const parsed = NormalizeOptionsSchema.parse(options);
    if (parsed.enabled) {
      return applyNormalize(image, parsed.lowPercentile, parsed.highPercentile);
    }
    return image;
  }
  if (op === 'blur') {
    const parsed = BlurOptionsSchema.parse(options);
    if (parsed.enabled) {
      const operation = (input: RasterImage) =>
        applyBlur(input, parsed.type, parsed.radius, parsed.angle);
      const halo = BLUR_HALO_FN(parsed.type, parsed.radius);
      return tiled ? executeTiled(image, operation, tileSize, halo) : operation(image);
    }
    return image;
  }
  if (op === 'denoise') {
    const parsed = DenoiseOptionsSchema.parse(options);
    if (parsed.enabled) {
      const operation = (input: RasterImage) =>
        applyDenoise(input, parsed.method, parsed.strength);
      const halo = parsed.method === 'bilateral' ? 2 : 1;
      return tiled ? executeTiled(image, operation, tileSize, halo) : operation(image);
    }
    return image;
  }
  if (op === 'no-multilayer') {
    const parsed = NoMultilayerOptionsSchema.parse(options);
    if (parsed.enabled) return applyNoMultilayer(image);
    return image;
  }
  if (op === 'threshold') {
    const parsed = BlackWhiteThresholdOptionsSchema.parse(options);
    if (parsed.mode === 'off') return image;
    if (parsed.mode === 'adaptive') {
      const operation = (input: RasterImage) => applyThreshold(input, 'adaptive');
      return tiled ? executeTiled(image, operation, tileSize, SAUVOLA_HALO) : operation(image);
    }
    return applyThreshold(image, parsed.mode);
  }
  if (op === 'equalize') {
    const parsed = EqualizeOptionsSchema.parse(options);
    if (parsed.enabled) {
      return applyEqualize(image, parsed.channels, parsed.clipLimit);
    }
    return image;
  }
  if (op === 'deskew') {
    const parsed = DeskewOptionsSchema.parse(options);
    if (parsed.enabled) {
      return applyDeskew(image, parsed.maxAngle, parsed.background);
    }
    return image;
  }
  if (op === 'color-space') {
    const parsed = ColorSpaceOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    return convertColorSpace(image, parsed.target, parsed.bitDepth, parsed.embedIcc, parsed.stripIcc);
  }
  if (op === 'recolour') {
    const parsed = RecolourOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    return applyRecolour(image, {
      targetHue: parsed.targetHue,
      tolerance: parsed.tolerance,
      replacement: parsed.replacement,
      feather: parsed.feather,
    });
  }
  if (op === 'palette-extract') {
    const parsed = PaletteOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    // The palette is returned via the side-channel: the `onProgress`
    // callback in `run()` exposes it on the result. v1 stashes the
    // palette on `image` via a non-enumerable symbol so downstream
    // consumers can read it.
    const palette = extractPalette(image, parsed.method, parsed.count, parsed.seed);
    (image as RasterImage & { __palette?: Palette }).__palette = palette;
    return image;
  }
  if (op === 'palette-export') {
    // The palette is read from the most-recent `palette-extract` step
    // via the same symbol side-channel. v1 returns the encoded string
    // on a similar symbol on the image.
    const palette = (image as RasterImage & { __palette?: Palette }).__palette;
    if (!palette) {
      throw {
        kind: 'internal',
        detail: 'palette-export must follow a palette-extract step in the same recipe.',
        remedy: 'Add a palette-extract step before palette-export.',
      } satisfies EngineError;
    }
    const format = (options.format as PaletteFormat) ?? 'css';
    const encoded = formatPalette(palette, format);
    (image as RasterImage & { __paletteExport?: string }).__paletteExport = encoded;
    return image;
  }
  if (op === 'canvas-resize') {
    const parsed = CanvasResizeOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    return canvasResize(image, {
      enabled: true,
      width: parsed.width,
      height: parsed.height,
      anchor: parsed.anchor,
      fillColor: parsed.fillColor,
    });
  }
  if (op === 'enlarge') {
    const parsed = EnlargeOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    return enlarge(image, { scale: parsed.scale, allowUpscale: parsed.allowUpscale });
  }
  if (op === 'border') {
    const parsed = BorderOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    return applyBorder(image, { enabled: true, width: parsed.width, color: parsed.color, inner: parsed.inner });
  }
  if (op === 'round-corners') {
    const parsed = RoundCornersOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    return roundCorners(image, { enabled: true, radius: parsed.radius, background: parsed.background });
  }
  if (op === 'bulk-resize') {
    // T25 preset pack: applies the preset dimensions via resizeRaster with fit mode.
    const presetName = (options.preset as string) ?? options.format as string;
    const preset = RESIZE_PRESETS.find((p) => p.label === presetName);
    if (!preset) {
      // Fallback to direct resize options
      return resizeRaster(image, ResizeOptionsSchema.parse(options));
    }
    return resizeRaster(image, ResizeOptionsSchema.parse({
      mode: 'fit',
      width: preset.width,
      height: preset.height,
      fitMode: preset.fitMode ?? 'contain',
      algorithm: 'lanczos3',
      allowUpscale: true,
      lockAspect: true,
    }));
  }
  if (op === 'collage') {
    const parsed = CollageOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    // For pipeline, images array would come from previous steps or batch; v1 uses single image repeated
    return makeCollage(image, { mode: parsed.mode, columns: parsed.columns ?? undefined, rows: parsed.rows ?? undefined, gap: parsed.gap, background: parsed.background, alignment: (parsed.alignment as 'center' | 'top-left' | 'bottom-right') ?? 'center', images: [image] });
  }
  if (op === 'split') {
    const parsed = SplitOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    const tiles = splitImage(image, { enabled: true, rows: parsed.rows, cols: parsed.cols, output: parsed.output });
    // Pipeline returns array? v1 returns first tile or whole? We'll return first tile for single-output pipeline.
    return tiles[0] ?? image;
  }
  if (op === 'watermark') {
    const parsed = WatermarkOptionsSchema.parse(options);
    if (!parsed.enabled && parsed.kind === 'none') return image;
    return applyWatermark(image, {
      kind: (parsed.kind === 'none' ? 'text' : parsed.kind) as 'image' | 'text',
      textContent: parsed.textContent,
      opacity: parsed.opacity,
      blendMode: parsed.blendMode,
      position: parsed.position,
      rotation: parsed.rotation,
      tiled: parsed.tiled,
      diagonalTiled: parsed.diagonalTiled,
      scaleWithImage: parsed.scaleWithImage,
      enabled: true,
    });
  }
  if (op === 'text') {
    const parsed = TextOptionsSchema.parse(options);
    if (!parsed.enabled) return image;
    // Minimal: render text overlay onto the image using typography module.
    return renderText(image, {
      text: parsed.content,
      fontFamily: parsed.fontFamily,
      fontSize: parsed.fontSize,
      color: parsed.color,
      opacity: parsed.opacity / 100,
      x: 10,
      y: 20,
    });
  }
  return image;
}

/** Format a palette as a string in the requested format. */
function formatPalette(palette: Palette, format: PaletteFormat): string {
  switch (format) {
    case 'css':
      return exportPaletteCss(palette);
    case 'json':
      return exportPaletteJson(palette);
    case 'gpl':
      return exportPaletteGpl(palette);
    case 'ase':
      return new TextDecoder().decode(exportPalette(palette, 'ase') as Uint8Array);
  }
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

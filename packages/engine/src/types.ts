export type FormatId =
  | 'avif'
  | 'bmp'
  | 'cur'
  | 'dds'
  | 'exr'
  | 'fits'
  | 'gif'
  | 'hdr'
  | 'heic'
  | 'ico'
  | 'jpeg'
  | 'jxl'
  | 'pcx'
  | 'pfm'
  | 'psd'
  | 'png'
  | 'pnm'
  | 'qoi'
  | 'sgi'
  | 'svg'
  | 'sun-raster'
  | 'tga'
  | 'tiff'
  | 'wbmp'
  | 'xbm'
  | 'webp';

export type ColorSpaceId = 'srgb' | 'display-p3' | 'adobe-rgb' | 'gray' | 'cmyk';

export interface Frame {
  readonly data: Uint8ClampedArray;
  readonly durationMs: number;
  readonly disposal?: 'none' | 'background' | 'previous';
}

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly colorSpace: ColorSpaceId;
  readonly bitDepth: 8 | 16;
  readonly premultipliedAlpha: boolean;
  readonly frames: readonly [Frame, ...Frame[]];
  readonly iccProfile?: Uint8Array;
}

export interface ExportOptions {
  readonly format: FormatId | 'same';
  readonly quality?: number;
  readonly lossless?: boolean;
  readonly nearLossless?: number | 'off';
  readonly effort?: number;
  readonly progressive?: boolean;
  readonly chromaSubsampling?: 'keep' | '4:4:4' | '4:4:0' | '4:2:2' | '4:2:0' | '4:1:1' | '4:1:0';
  readonly bitDepth?: 'keep' | 1 | 2 | 4 | 8 | 10 | 12 | 16;
  readonly colorSpace?: ColorSpaceId | 'keep';
  readonly iccProfile?: 'preserve' | 'convert' | 'strip' | `embed:${string}`;
  readonly dpi?: number | 'keep';
  readonly dpiUnit?: 'none' | 'inches' | 'cm';
  readonly resampleWithDpi?: boolean;
  readonly stripMetadata?: 'none' | 'all' | 'gps' | 'except-orientation-copyright';
  readonly targetSize?: { readonly value: number; readonly unit: 'KB' | 'MB' } | null;
  readonly targetSizeStrategy?: 'quality' | 'quality-then-scale' | 'scale';
  readonly backgroundColor?: string;
  readonly flattenAlpha?: 'auto' | 'always' | 'never';
  readonly filenameTemplate?: string;
}

export interface InputMeta {
  readonly width: number;
  readonly height: number;
  readonly format: FormatId;
  readonly frameCount?: number;
  readonly deviceMemoryGb?: number;
  readonly wasm32?: boolean;
}

export type ExecutionTier = 'webgpu' | 'webgl2' | 'wasm-simd' | 'wasm' | 'js';

export interface PlanStep {
  readonly op: string;
  readonly options: Readonly<Record<string, unknown>>;
  readonly sourceStepIndexes: readonly number[];
  readonly fused: boolean;
  readonly kernelRadius: number;
}

export interface Plan {
  readonly steps: readonly PlanStep[];
  readonly tier: ExecutionTier;
  readonly estimatedPeakBytes: number;
  readonly lazyDownloads: readonly { readonly id: string; readonly bytes: number }[];
  readonly warnings: readonly string[];
  readonly memoryStrategy: 'whole' | 'reduced-concurrency' | 'tiled' | 'opfs-spill' | 'refuse';
  readonly tileSize?: number;
  readonly largestWorkableDimension?: number;
}

export interface Progress {
  readonly itemIndex: number;
  readonly itemCount: number;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly fraction: number;
  readonly phase: 'decoding' | 'processing' | 'encoding' | 'ai-request' | 'packaging';
  readonly label: string;
  readonly bytesProcessed?: number;
  readonly etaMs?: number;
}

export interface ItemResult {
  readonly itemIndex: number;
  readonly image?: RasterImage;
  readonly error?: EngineError;
  readonly tiers: readonly ExecutionTier[];
}

export interface RunResult {
  readonly items: readonly ItemResult[];
  readonly plan: Plan;
}

type StepFor<Op extends string> = Readonly<{
  op: Op;
  options: Readonly<Record<string, unknown>>;
}>;

export type Step =
  | StepFor<'decode'>
  | StepFor<'resize'>
  | StepFor<'crop'>
  | StepFor<'rotate'>
  | StepFor<'adjust'>
  | StepFor<'filter'>
  | StepFor<'enhance'>
  | StepFor<'watermark'>
  | StepFor<'metadata'>
  | StepFor<'mask'>
  | StepFor<'composite'>
  | StepFor<'ai'>
  | StepFor<'custom'>;

export interface Recipe {
  readonly version: 1;
  readonly id: string;
  readonly name?: string;
  readonly steps: readonly Step[];
  readonly export: ExportOptions;
}

type Remediable = Readonly<{ remedy: string }>;

export type EngineError =
  | (Remediable & { kind: 'unsupported-format'; format: string })
  | (Remediable & { kind: 'codec-unavailable'; format: string; reason: string })
  | (Remediable & { kind: 'decode-failed'; format: string; detail: string })
  | (Remediable & { kind: 'out-of-memory'; neededBytes: number; budgetBytes: number })
  | (Remediable & { kind: 'dimension-limit'; limit: number; actual: number })
  | (Remediable & { kind: 'cancelled' })
  | (Remediable & { kind: 'ai-not-configured'; capability: string })
  | (Remediable & {
      kind: 'ai-provider-error';
      provider: string;
      status?: number;
      providerMessage?: string;
    })
  | (Remediable & { kind: 'ai-cors-blocked'; provider: string })
  | (Remediable & { kind: 'ai-rate-limited'; provider: string; retryAfterMs?: number })
  | (Remediable & { kind: 'ai-auth-failed'; provider: string })
  | (Remediable & { kind: 'internal'; detail: string });

// This is deliberately compiled with production sources: adding an EngineError
// member without a remedy turns this assignment into a typecheck failure.
type EveryEngineErrorHasRemedy = EngineError extends { remedy: string } ? true : false;
export const everyEngineErrorHasRemedy: EveryEngineErrorHasRemedy = true;

export function cancelledError(): EngineError {
  return { kind: 'cancelled', remedy: 'Retry the operation when you are ready.' };
}

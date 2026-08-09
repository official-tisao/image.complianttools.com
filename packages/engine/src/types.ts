export type FormatId = 'avif' | 'bmp' | 'gif' | 'jpeg' | 'jxl' | 'png' | 'tiff' | 'webp';

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
  readonly effort?: number;
  readonly progressive?: boolean;
  readonly colorSpace?: ColorSpaceId | 'keep';
  readonly stripMetadata?: 'none' | 'all' | 'gps' | 'except-orientation-copyright';
  readonly filenameTemplate?: string;
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

import type { ExecutionTier, RasterImage, Plan, PlanStep } from '../types.js';
import { selectBackendWithFallback } from '../gpu/registry.js';
import { OP_CODES } from '../gpu/op-codes.js';
import type { GpuBackend, GpuEnvironment, GpuPixelLocalStep } from '../gpu/types.js';
import { applyAdjustments } from '../ops/adjust.js';
import { AdjustOptionsSchema } from '../schemas/options.js';

/**
 * The per-step tier actually used at runtime. Mirrors `ItemResult.tiers`
 * (which is a `readonly ExecutionTier[]` of length `plan.steps.length`).
 */
export type StepTiers = readonly ExecutionTier[];

/**
 * Run a plan on the requested tier with the given environment. Returns the
 * per-step result plus the actual tier per step. The function is the
 * canonical entry point for the **preview** path; the export path is
 * served by `run()` in `execute.ts` and never calls this function unless
 * the caller has explicitly opted in via `runExportOnGpu: true`.
 *
 * Tier downgrade: if the requested backend throws, the function catches
 * and falls back through the ladder (`webgpu` → `webgl2` → `wasm-simd` →
 * `wasm` → `js`). The first step's tier is recorded on `Plan.backend`
 * upstream; subsequent steps record their own tier in `result.tiers` so
 * a partial downgrade is observable.
 */
export async function executeOnTier(
  plan: Plan,
  image: RasterImage,
  env: GpuEnvironment | null,
): Promise<{ image: RasterImage; tiers: StepTiers }> {
  let current = image;
  const tiers: ExecutionTier[] = [];
  for (const step of plan.steps) {
    const result = await runStep(step, current, plan.tier, env);
    current = result.image;
    tiers.push(result.usedTier);
  }
  return { image: current, tiers };
}

async function runStep(
  step: PlanStep,
  image: RasterImage,
  requestedTier: ExecutionTier,
  env: GpuEnvironment | null,
): Promise<{ image: RasterImage; usedTier: ExecutionTier }> {
  if (step.fused && step.op === 'pixel-local') {
    return runFusedPixelLocal(step, image, requestedTier, env);
  }
  // Non-pixel-local steps always run on CPU regardless of the requested
  // tier. The fusion invariant in `compile.ts` is that only the
  // 'pixel-local' step is GPU-eligible; everything else (`'resize'`,
  // `'crop'`, `'rotate'`, `'enhance'`, etc.) is CPU-bound.
  return { image: runOnCpu(step, image), usedTier: tierForCpu(requestedTier) };
}

function runFusedPixelLocal(
  step: PlanStep,
  image: RasterImage,
  requestedTier: ExecutionTier,
  env: GpuEnvironment | null,
): { image: RasterImage; usedTier: ExecutionTier } {
  if (!env) {
    return { image: runFusedOnCpu(step, image), usedTier: tierForCpu(requestedTier) };
  }
  const { backend, downgraded } = selectBackendWithFallback(requestedTier, env);
  const steps = toGpuSteps(step);
  try {
    const result = backend.applyPixelLocal(image, steps);
    if (downgraded) {
      // The tier was lowered at construction time (capability mismatch),
      // not at apply time. Either way the result is correct and the
      // `usedTier` is honest.
    }
    return { image: result.image, usedTier: result.usedTier };
  } catch {
    // The GPU backend threw at apply time. Fall back to the CPU
    // reference, which is guaranteed to succeed for the same step.
    return { image: runFusedOnCpu(step, image), usedTier: tierForCpu(requestedTier) };
  }
}

function tierForCpu(_requested: ExecutionTier): ExecutionTier {
  // For non-pixel-local steps the CPU tier is always 'wasm-simd' —
  // the canonical deterministic CPU tier from README §10.4. The
  // requested tier is captured for future logging but not used in v1.
  return 'wasm-simd';
}

function toGpuSteps(step: PlanStep): readonly GpuPixelLocalStep[] {
  const records = (step.options.operations as ReadonlyArray<Readonly<Record<string, unknown>>>) ?? [];
  return records.map((record) => recordToGpuStep(record));
}

/**
 * Translate a single fused-step record (an `AdjustOptions` partial) into
 * the GPU op-code + value pair. Unknown fields map to passthrough codes
 * (≥ 100) which the WebGL2 backend forwards to the CPU implementation
 * via `applyAdjustments`. The order of these assignments is stable and
 * documented; cross-tier tests rely on the same op-code for the same
 * field name.
 */
function recordToGpuStep(record: Readonly<Record<string, unknown>>): GpuPixelLocalStep {
  const opCode = pickOpCode(record);
  const value = pickOpValue(record, opCode);
  return { op: opCode, value };
}

function pickOpCode(record: Readonly<Record<string, unknown>>): number {
  // Each `case` checks a single field; the order is the documented P3-02
  // application order so the fused step applies ops in the same sequence
  // the CPU `applyAdjustments` does. If multiple fields are present in
  // the same record (the recipe author shouldn't do that — the schema
  // accepts each in a separate step in practice) the first match wins;
  // the remaining fields are dropped on the GPU and recovered by the
  // CPU passthrough batch.
  if (typeof record.brightness === 'number') return OP_CODES.BRIGHTNESS;
  if (typeof record.contrast === 'number') return OP_CODES.CONTRAST;
  if (typeof record.saturation === 'number') return OP_CODES.SATURATION;
  if (typeof record.exposure === 'number') return OP_CODES.EXPOSURE;
  if (typeof record.gamma === 'number') return OP_CODES.GAMMA;
  if (typeof record.temperature === 'number') return OP_CODES.TEMPERATURE;
  if (typeof record.tint === 'number') return OP_CODES.TINT;
  if (typeof record.highlights === 'number') return OP_CODES.HIGHLIGHTS;
  if (typeof record.shadows === 'number') return OP_CODES.SHADOWS;
  // Passthrough codes for the 7 scalars P3-01 does not run on the GPU.
  if (typeof record.blacks === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 0;
  if (typeof record.clarity === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 1;
  if (typeof record.dehaze === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 2;
  if (typeof record.hue === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 3;
  if (typeof record.opacity === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 4;
  if (typeof record.vibrance === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 5;
  if (typeof record.whites === 'number') return OP_CODES.PASSTHROUGH_THRESHOLD + 6;
  return OP_CODES.IDENTITY;
}

function pickOpValue(record: Readonly<Record<string, unknown>>, opCode: number): number {
  if (opCode === OP_CODES.IDENTITY) return 0;
  if (opCode < OP_CODES.PASSTHROUGH_THRESHOLD) {
    const fieldName = gpuOpToFieldName(opCode);
    const value = fieldName ? record[fieldName] : undefined;
    if (typeof value === 'number') return value;
    return gpuOpDefault(opCode);
  }
  const passthroughField = passthroughOpToFieldName(opCode);
  if (!passthroughField) return 0;
  const value = record[passthroughField];
  if (typeof value === 'number') return value;
  return 0;
}

function gpuOpToFieldName(op: number): string | null {
  switch (op) {
    case OP_CODES.BRIGHTNESS: return 'brightness';
    case OP_CODES.CONTRAST: return 'contrast';
    case OP_CODES.SATURATION: return 'saturation';
    case OP_CODES.EXPOSURE: return 'exposure';
    case OP_CODES.GAMMA: return 'gamma';
    case OP_CODES.TEMPERATURE: return 'temperature';
    case OP_CODES.TINT: return 'tint';
    case OP_CODES.HIGHLIGHTS: return 'highlights';
    case OP_CODES.SHADOWS: return 'shadows';
    default: return null;
  }
}

function passthroughOpToFieldName(op: number): string | null {
  switch (op - OP_CODES.PASSTHROUGH_THRESHOLD) {
    case 0: return 'blacks';
    case 1: return 'clarity';
    case 2: return 'dehaze';
    case 3: return 'hue';
    case 4: return 'opacity';
    case 5: return 'vibrance';
    case 6: return 'whites';
    default: return null;
  }
}

function gpuOpDefault(op: number): number {
  switch (op) {
    case OP_CODES.GAMMA: return 1;
    case OP_CODES.TEMPERATURE: return 6500;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// CPU fallback. Reuses the existing `applyAdjustments` from `ops/adjust.ts`
// for non-pixel-local steps and the canonical schema parser. The fused
// pixel-local step is a single `applyAdjustments` call with the merged
// record.
// ---------------------------------------------------------------------------

function runOnCpu(step: PlanStep, image: RasterImage): RasterImage {
  if (step.op === 'adjust') {
    return applyAdjustments(image, AdjustOptionsSchema.parse(step.options));
  }
  // Other ops (resize, crop, rotate, enhance) are handled by the existing
  // executor in `execute.ts`; this function only sees what the executor
  // delegates to it. For step types the executor does not delegate, we
  // return the image unchanged; the executor's own logic is the source of
  // truth for those.
  return image;
}

function runFusedOnCpu(step: PlanStep, image: RasterImage): RasterImage {
  const records = (step.options.operations as ReadonlyArray<Readonly<Record<string, unknown>>>) ?? [];
  let current = image;
  for (const record of records) {
    const parsed = AdjustOptionsSchema.parse(record);
    if (hasNonIdentityField(parsed)) {
      current = applyAdjustments(current, parsed);
    }
  }
  return current;
}

function hasNonIdentityField(options: ReturnType<typeof AdjustOptionsSchema.parse>): boolean {
  return (
    options.brightness !== 0 ||
    options.contrast !== 0 ||
    options.saturation !== 0 ||
    options.exposure !== 0 ||
    options.gamma !== 1 ||
    options.temperature !== 'detected' ||
    options.tint !== 0 ||
    options.highlights !== 0 ||
    options.shadows !== 0 ||
    options.whites !== 0 ||
    options.blacks !== 0 ||
    options.vibrance !== 0 ||
    options.hue !== 0 ||
    options.clarity !== 0 ||
    options.dehaze !== 0 ||
    options.opacity !== 100
  );
}

// Re-export for tests and downstream callers.
export { selectBackendWithFallback, type GpuBackend, type GpuEnvironment };

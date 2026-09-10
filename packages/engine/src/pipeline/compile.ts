import { chooseMemoryStrategy } from '../scheduler/memory-governor.js';
import { codecDownloadDisclosure, getCodec } from '../codecs/registry.js';
import type { ExecutionTier, InputMeta, Plan, PlanStep, Recipe } from '../types.js';

const pixelLocalOps = new Set(['adjust', 'filter']);

/**
 * Optional runtime probe the host can pass to `compile`. When present,
 * `chooseTier` walks the GPU tier ladder; when absent (e.g. tests), it
 * falls back to the CPU/WASM tier. The shape mirrors
 * `RuntimeCapabilities.webGpu`, `webGl2`, `wasmSimd` — the engine
 * never inspects any browser global here.
 */
export interface CompileCapabilities {
  readonly wasmSimd?: boolean;
  readonly webGpu?: boolean;
  readonly webGl2?: boolean;
}

export interface CompileOptions {
  /** The mode of the plan. `'export'` forces a CPU tier regardless of
   *  capabilities. `'preview'` may use any tier. Default is `'preview'`. */
  readonly mode?: 'preview' | 'export';
  /** The runtime capabilities. Default is `{}` (no GPU). */
  readonly capabilities?: CompileCapabilities;
}

/**
 * Walk the tier ladder given the capabilities and the plan mode. The
 * ladder is `webgpu` → `webgl2` → `wasm-simd` → `wasm` → `js`. Export
 * mode skips the GPU tiers (P3-01 determinism guarantee, README §10.4).
 *
 * The function is exported for tests so the tier choice is observable
 * without having to go through the whole `compile` pipeline.
 */
export function chooseTier(opts: CompileOptions = {}): ExecutionTier {
  const mode = opts.mode ?? 'preview';
  const caps = opts.capabilities ?? {};
  if (mode === 'export') {
    return caps.wasmSimd === false ? 'wasm' : 'wasm-simd';
  }
  if (caps.webGpu === true) return 'webgpu';
  if (caps.webGl2 === true) return 'webgl2';
  if (caps.wasmSimd === true) return 'wasm-simd';
  if (typeof WebAssembly === 'object') return 'wasm';
  return 'js';
}

export async function compile(
  recipe: Recipe,
  inputMeta: InputMeta,
  options: CompileOptions = {},
): Promise<Plan> {
  const steps: PlanStep[] = [];
  recipe.steps.forEach((step, index) => {
    const previous = steps.at(-1);
    if (pixelLocalOps.has(step.op) && previous?.fused) {
      const operations = previous.options.operations as ReadonlyArray<
        Readonly<Record<string, unknown>>
      >;
      steps[steps.length - 1] = {
        ...previous,
        options: { operations: [...operations, step.options] },
        sourceStepIndexes: [...previous.sourceStepIndexes, index],
      };
    } else if (pixelLocalOps.has(step.op)) {
      steps.push({
        op: 'pixel-local',
        options: { operations: [step.options] },
        sourceStepIndexes: [index],
        fused: true,
        kernelRadius: 0,
      });
    } else {
      const radius =
        step.op === 'enhance' && typeof step.options.radius === 'number'
          ? Math.ceil(step.options.radius)
          : 0;
      steps.push({
        op: step.op,
        options: step.options,
        sourceStepIndexes: [index],
        fused: false,
        kernelRadius: radius,
      });
    }
  });
  const memory = chooseMemoryStrategy(inputMeta, 2);
  const lazyDownloads =
    recipe.export.format === 'same'
      ? []
      : getCodec(recipe.export.format).load
        ? [codecDownloadDisclosure(recipe.export.format)]
        : [];
  const tier = chooseTier(options);
  return {
    steps,
    tier,
    mode: options.mode ?? 'preview',
    backend: tier,
    lazyDownloads,
    ...memory,
  };
}

import type { ExecutionTier, RasterImage } from '../types.js';

/**
 * A single pixel-local operation record, lifted from the existing `pixel-local`
 * compile fusion. The GPU backends take one `GpuPixelLocalStep` per op in the
 * fused pipeline and either pack the op into a uniform array (one draw call per
 * fused step) or apply it on the CPU as a fallback.
 */
export interface GpuPixelLocalStep {
  /** Numeric op code understood by the backend's shader. */
  readonly op: number;
  /** Single value uniform for the op. Range is op-specific; the shader clamps. */
  readonly value: number;
  /** Single secondary value uniform where the op needs two (e.g. temperature in K). */
  readonly value2?: number;
}

/**
 * What a backend returns: a brand-new `RasterImage`. The shape mirrors
 * `applyAdjustments` so the executor can compose backends with non-pixel-local
 * steps without type juggling.
 */
export interface BackendResult {
  readonly image: RasterImage;
  /** The tier that actually executed the step (may differ from the requested tier
   *  when a higher tier fell back, e.g. webgpu → webgl2). */
  readonly usedTier: ExecutionTier;
}

/**
 * Runtime environment the host bootstraps once and threads through. The engine
 * never references `window`, `document`, or `navigator` directly; the
 * `no-engine-browser-globals` lint rule keeps that promise.
 *
 * `gl` and `gpu` are typed as `unknown` so the engine typechecks without
 * pulling in DOM lib types; backends narrow them with a single, audited cast
 * at the boundary.
 */
export interface GpuEnvironment {
  /** WebGL2 rendering context, or `null` if not present. */
  readonly gl: unknown;
  /** WebGPU adapter, or `null` if not present. */
  readonly gpu: unknown;
  /**
   * The runtime capability probe result — used by `selectBackend` to know
   * which higher-tier fallbacks are legal. Optional; when absent the backend
   * falls back to the CPU path defensively.
   */
  readonly capabilities?: {
    readonly wasmSimd: boolean;
    readonly webGpu: boolean;
    readonly webGl2: boolean;
  };
  /** Function that produces a fresh RGBA8 `Uint8ClampedArray` of `length`. */
  readonly allocateBuffer: (length: number) => Uint8ClampedArray;
}

/**
 * The contract every backend implements. The engine composes backends by
 * calling `applyPixelLocal` for one fused step, then chaining the result
 * through any non-pixel-local steps in the `Plan`. Backends may throw; the
 * executor catches and downgrades to the next tier, recording the fallback
 * on the result.
 */
export interface GpuBackend {
  /** The tier this backend implements. A single backend returns one tier. */
  readonly tier: ExecutionTier;
  /**
   * Apply a fused pixel-local step to `image` and return the result. Steps
   * are applied in the order given. The backend MUST treat every step's
   * op-code it does not understand as a no-op (return the input unchanged
   * for that step) rather than throw — that lets the GPU path ship with
   * 9/16 scalars while the CPU path covers the rest.
   */
  applyPixelLocal(image: RasterImage, steps: readonly GpuPixelLocalStep[]): BackendResult;
}

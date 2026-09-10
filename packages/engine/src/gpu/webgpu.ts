import type { RasterImage } from '../types.js';
import type { BackendResult, GpuBackend, GpuEnvironment, GpuPixelLocalStep } from './types.js';

/**
 * The v1 WebGPU backend. **This is a deliberate no-op**: the WebGPU spec
 * was still stabilising in 2024–2025, the engine has no existing WGSL
 * surface, and we cannot exercise a real WebGPU path in CI today. The
 * `WebGpuBackend` is therefore a class that throws a typed error so
 * `selectBackend` can downgrade to `webgl2` and the type union stays
 * honest.
 *
 * The throw is logged at most once per process so a misconfigured host
 * doesn't spam the console. The downgrade path is exercised by the
 * `gpu-pipeline.test.ts` "webgpu requested but no backend" case.
 *
 * The interface, the `tier` field, and the `applyPixelLocal` signature
 * are the real contracts a future WGSL implementation must satisfy; the
 * throw body is the only v1-specific code.
 */
let loggedOnce = false;
export function webGpuFallbackLogged(): boolean {
  return loggedOnce;
}

export class WebGpuBackend implements GpuBackend {
  readonly tier = 'webgpu' as const;

  // The environment is captured so a future implementation can read the
  // `gpu` adapter; for now it is unused. The `_` prefix silences the
  // `no-unused-vars` rule via the project's `varsIgnorePattern`.
  constructor(_env: GpuEnvironment) {
    // v1 no-op: see class docstring.
  }

  applyPixelLocal(_image: RasterImage, _steps: readonly GpuPixelLocalStep[]): BackendResult {
    if (!loggedOnce) {
      loggedOnce = true;
      // Use the global console if it is present; the engine never imports
      // it directly so this is the single logging call site.
      const g = globalThis as { console?: { warn?: (msg: string) => void } };
      g.console?.warn?.(
        'WebGPU backend not implemented in v1; falling back to WebGL2. ' +
          'See PLAN.md §16 Change Log for the v1 scope cut rationale.',
      );
    }
    throw new Error('WebGPU backend not implemented in v1; falling back');
  }
}

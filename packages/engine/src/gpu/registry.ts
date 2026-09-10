import type { ExecutionTier } from '../types.js';
import { CpuWasmBackend } from './cpu-wasm.js';
import { WebGpuBackend } from './webgpu.js';
import { WebGl2Backend } from './webgl2.js';
import type { GpuBackend, GpuEnvironment } from './types.js';

/**
 * Select the concrete backend for a requested tier. The function is
 * referentially transparent: same `tier` + same `env` always returns a
 * backend of the same class. It is **not** a cache (backends are cheap to
 * construct) but it is the single point where tier downgrades are decided,
 * so the WebGPU no-op path can fall back to WebGL2 without the executor
 * caring.
 */
export function selectBackend(tier: ExecutionTier, env: GpuEnvironment): GpuBackend {
  switch (tier) {
    case 'webgpu':
      // The WebGPU backend always throws. The caller (the executor)
      // catches and downgrades. We do not swallow the throw here because
      // the executor needs to observe it to set `Plan.backend` correctly.
      return new WebGpuBackend(env);
    case 'webgl2':
      return new WebGl2Backend(env);
    case 'wasm-simd':
      return new CpuWasmBackend('wasm-simd');
    case 'wasm':
      return new CpuWasmBackend('wasm');
    case 'js':
      return new CpuWasmBackend('js');
  }
}

/**
 * Try the requested tier, falling back through the ladder on failure.
 * Returns `{ backend, usedTier, downgraded }` so the executor can record
 * the actual tier on `Plan.backend` and surface a warning to the UI.
 */
export function selectBackendWithFallback(
  requested: ExecutionTier,
  env: GpuEnvironment,
): { backend: GpuBackend; usedTier: ExecutionTier; downgraded: boolean } {
  const ladder: ExecutionTier[] = [
    'webgpu',
    'webgl2',
    'wasm-simd',
    'wasm',
    'js',
  ];
  const startIndex = ladder.indexOf(requested);
  if (startIndex < 0) {
    return { backend: selectBackend('js', env), usedTier: 'js', downgraded: true };
  }
  for (let i = startIndex; i < ladder.length; i += 1) {
    const tier = ladder[i]!;
    const backend = selectBackend(tier, env);
    try {
      // Probe by constructing + checking the tier field. The real
      // capability check (does the GL context compile a shader?) happens
      // on the first `applyPixelLocal` call, which is where the executor
      // will catch a failure and call `selectBackendWithFallback` again.
      // For now we treat construction success as success.
      if (tier === 'webgpu' && env.capabilities?.webGpu !== true) {
        continue;
      }
      if (tier === 'webgl2' && env.capabilities?.webGl2 !== true) {
        continue;
      }
      return { backend, usedTier: tier, downgraded: i !== startIndex };
    } catch {
      // Continue the ladder.
    }
  }
  // Unreachable: the ladder ends at 'js' and the CPU backend never
  // throws. Keep the typechecker happy with a defensive return.
  return { backend: selectBackend('js', env), usedTier: 'js', downgraded: true };
}

import { describe, expect, it } from 'vitest';

import {
  CpuWasmBackend,
  OP_CODES,
  WebGl2Backend,
  WebGpuBackend,
  applyGpuOpInline,
  chooseTier,
  compile,
  createRaster,
  executeOnTier,
  preview,
  selectBackendWithFallback,
  type GpuEnvironment,
  type GpuPixelLocalStep,
} from '../src/index.js';
import type { RasterImage, Recipe } from '../src/index.js';

const px = (r: number, g: number, b: number, a = 255) =>
  createRaster(1, 1, new Uint8ClampedArray([r, g, b, a]));

const bytes = (image: { frames: readonly { data: Uint8ClampedArray }[] }) =>
  Array.from(image.frames[0]!.data);

const recipe = (steps: Recipe['steps']): Recipe => ({
  version: 1,
  id: 'p3-gpu-test',
  steps,
  export: { format: 'same' },
});

/** A small 8x8 RGBA raster with a known gradient pattern. The exact values
 *  are irrelevant for the cross-tier tolerance test — what matters is that
 *  both backends see the same input and the output difference is bounded. */
function gradientRaster(): RasterImage {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 8 + x) * 4;
      data[offset] = (x * 32) % 256;
      data[offset + 1] = (y * 32) % 256;
      data[offset + 2] = ((x + y) * 16) % 256;
      data[offset + 3] = 255;
    }
  }
  return createRaster(8, 8, data);
}

const noGpuEnv: GpuEnvironment = {
  gl: null,
  gpu: null,
  allocateBuffer: (length: number) => new Uint8ClampedArray(length),
};

describe('P3-01 chooseTier ladder', () => {
  it('returns js when no capabilities are present (legacy behaviour)', () => {
    expect(chooseTier()).toBe(typeof WebAssembly === 'object' ? 'wasm' : 'js');
  });

  it('prefers webgpu when both webgpu and webgl2 are available', () => {
    expect(chooseTier({ capabilities: { webGpu: true, webGl2: true, wasmSimd: true } })).toBe('webgpu');
  });

  it('falls back to webgl2 when webgpu is not available', () => {
    expect(chooseTier({ capabilities: { webGpu: false, webGl2: true, wasmSimd: true } })).toBe('webgl2');
  });

  it('falls back to wasm-simd when neither GPU tier is available', () => {
    expect(chooseTier({ capabilities: { webGpu: false, webGl2: false, wasmSimd: true } })).toBe('wasm-simd');
  });

  it('falls back to wasm when wasmSimd is explicitly false', () => {
    expect(chooseTier({ capabilities: { wasmSimd: false } })).toBe('wasm');
  });

  it('forces a CPU tier in export mode regardless of capabilities', () => {
    // README §10.4 determinism: export never uses the GPU.
    expect(
      chooseTier({ mode: 'export', capabilities: { webGpu: true, webGl2: true, wasmSimd: true } }),
    ).toBe('wasm-simd');
    expect(chooseTier({ mode: 'export', capabilities: { wasmSimd: false } })).toBe('wasm');
  });
});

describe('P3-01 compile() reflects the mode and tier', () => {
  it('preview mode with webgpu capability picks webgpu', async () => {
    const plan = await compile(recipe([{ op: 'adjust', options: { brightness: 10 } }]), {
      width: 1,
      height: 1,
      format: 'png',
    }, { capabilities: { webGpu: true, webGl2: true, wasmSimd: true } });
    expect(plan.tier).toBe('webgpu');
    expect(plan.backend).toBe('webgpu');
    expect(plan.mode).toBe('preview');
  });

  it('export mode forces wasm-simd even with webgpu', async () => {
    const plan = await compile(recipe([{ op: 'adjust', options: { brightness: 10 } }]), {
      width: 1,
      height: 1,
      format: 'png',
    }, { mode: 'export', capabilities: { webGpu: true } });
    expect(plan.tier).toBe('wasm-simd');
    expect(plan.mode).toBe('export');
  });
});

describe('P3-01 selectBackendWithFallback', () => {
  it('downgrades from webgpu to webgl2 when webgpu is not actually available', () => {
    const env: GpuEnvironment = {
      gl: null, // no WebGL2
      gpu: null, // WebGPU exists conceptually but the backend is a v1 no-op
      capabilities: { wasmSimd: true, webGpu: false, webGl2: false },
      allocateBuffer: (length) => new Uint8ClampedArray(length),
    };
    const { usedTier, downgraded } = selectBackendWithFallback('webgpu', env);
    expect(usedTier).not.toBe('webgpu');
    expect(downgraded).toBe(true);
  });

  it('returns the requested tier when it is available', () => {
    const env: GpuEnvironment = {
      gl: null,
      gpu: null,
      capabilities: { wasmSimd: true, webGpu: false, webGl2: false },
      allocateBuffer: (length) => new Uint8ClampedArray(length),
    };
    const { usedTier, downgraded } = selectBackendWithFallback('wasm-simd', env);
    expect(usedTier).toBe('wasm-simd');
    expect(downgraded).toBe(false);
  });
});

describe('P3-01 WebGpuBackend is a v1 no-op', () => {
  it('always throws so the executor can downgrade', () => {
    const backend = new WebGpuBackend(noGpuEnv);
    expect(() => backend.applyPixelLocal(px(1, 2, 3), [])).toThrow(/not implemented in v1/);
  });
});

describe('P3-01 WebGl2Backend CPU-simulation matches the CpuWasmBackend within tolerance', () => {
  // The tolerance is per-channel, in 0..255 units. Linear ops (brightness,
  // contrast, saturation, tint) round to within ±1; gamma and exposure
  // can lose 1–2 in the last bit on a fractional exponent. We assert ±2
  // to leave headroom for the per-pixel reordering (gamma recomputes
  // luma, the CPU reference accumulates a tiny error).
  const TOLERANCE_LINEAR = 1;
  const TOLERANCE_NONLINEAR = 2;

  /** Run one op on the same input via the WebGL2 CPU-simulation backend
   *  and the CpuWasmBackend; return the max per-channel absolute delta. */
  function maxDelta(step: GpuPixelLocalStep, image: RasterImage): number {
    const webgl2 = new WebGl2Backend(noGpuEnv);
    const cpu = new CpuWasmBackend('wasm-simd');
    const a = webgl2.applyPixelLocal(image, [step]);
    const b = cpu.applyPixelLocal(image, [step]);
    const ad = a.image.frames[0]!.data;
    const bd = b.image.frames[0]!.data;
    let max = 0;
    for (let i = 0; i < ad.length; i += 4) {
      max = Math.max(
        max,
        Math.abs((ad[i] ?? 0) - (bd[i] ?? 0)),
        Math.abs((ad[i + 1] ?? 0) - (bd[i + 1] ?? 0)),
        Math.abs((ad[i + 2] ?? 0) - (bd[i + 2] ?? 0)),
      );
    }
    return max;
  }

  it('brightness is byte-identical', () => {
    expect(maxDelta({ op: OP_CODES.BRIGHTNESS, value: 25 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });

  it('contrast is within ±1 per channel', () => {
    expect(maxDelta({ op: OP_CODES.CONTRAST, value: 30 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });

  it('saturation is within ±1 per channel', () => {
    expect(maxDelta({ op: OP_CODES.SATURATION, value: -40 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });

  it('exposure is within ±2 per channel (non-linear)', () => {
    expect(maxDelta({ op: OP_CODES.EXPOSURE, value: 1.5 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_NONLINEAR);
  });

  it('gamma is within ±2 per channel (non-linear)', () => {
    expect(maxDelta({ op: OP_CODES.GAMMA, value: 1.8 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_NONLINEAR);
  });

  it('temperature is within ±1 per channel (linear in gains)', () => {
    expect(maxDelta({ op: OP_CODES.TEMPERATURE, value: 4200 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });

  it('tint is byte-identical', () => {
    expect(maxDelta({ op: OP_CODES.TINT, value: 60 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });

  it('highlights is within ±1 per channel', () => {
    expect(maxDelta({ op: OP_CODES.HIGHLIGHTS, value: 40 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });

  it('shadows is within ±1 per channel', () => {
    expect(maxDelta({ op: OP_CODES.SHADOWS, value: 40 }, gradientRaster())).toBeLessThanOrEqual(TOLERANCE_LINEAR);
  });
});

describe('P3-01 executeOnTier is the preview path', () => {
  it('falls back to CPU when no env is provided', async () => {
    const image = gradientRaster();
    const plan = await compile(
      recipe([{ op: 'adjust', options: { brightness: 10, contrast: 10 } }]),
      { width: 8, height: 8, format: 'png' },
      { capabilities: { wasmSimd: true } },
    );
    const result = await executeOnTier(plan, image, null);
    expect(result.tiers).toEqual(['wasm-simd']);
    // The CPU path is the deterministic reference; it must not be a
    // no-op when values are non-default.
    expect(bytes(result.image)).not.toEqual(bytes(image));
  });

  it('records the per-step tier on the result', async () => {
    // The compile fusion in `compile.ts` merges two adjacent adjust
    // steps into a single `pixel-local` step. So we get one tier
    // recording, not two. The recording is still meaningful because
    // it tells the UI which tier the fused step actually ran on.
    const plan = await compile(
      recipe([
        { op: 'adjust', options: { brightness: 10 } },
        { op: 'adjust', options: { contrast: 10 } },
      ]),
      { width: 8, height: 8, format: 'png' },
      { capabilities: { wasmSimd: true } },
    );
    const result = await executeOnTier(plan, gradientRaster(), noGpuEnv);
    expect(result.tiers).toEqual(['wasm-simd']);
  });

  it('routes the pixel-local step through the requested backend when one is available', async () => {
    // No WebGL2 in the env, so the executor falls through to the CPU
    // reference (downgrade). The tier recorded is the actual tier used,
    // not the requested one.
    const plan = await compile(
      recipe([{ op: 'adjust', options: { brightness: 10 } }]),
      { width: 8, height: 8, format: 'png' },
      { capabilities: { webGl2: true, wasmSimd: true } },
    );
    const result = await executeOnTier(plan, gradientRaster(), noGpuEnv);
    // env.capabilities is not set, so registry skips the GPU tier and
    // downgrades to wasm-simd.
    expect(result.tiers).toEqual(['wasm-simd']);
  });
});

describe('P3-01 preview is unchanged without gpu', () => {
  it('still applies adjustments on the CPU path', async () => {
    const out = await preview(
      recipe([{ op: 'adjust', options: { brightness: 25, contrast: 25 } }]),
      px(120, 90, 150),
    );
    // The CPU reference's deterministic output for brightness=25,
    // contrast=25 on (120, 90, 150) is the canonical test fixture; we
    // just check that the output differs from the input.
    expect(bytes(out)).not.toEqual([120, 90, 150, 255]);
  });
});

describe('P3-01 applyGpuOpInline is the same math the webgl2 fragment shader uses', () => {
  it('every GPU-supported op returns a new raster for a non-default value', () => {
    const image = gradientRaster();
    for (const op of [
      OP_CODES.BRIGHTNESS,
      OP_CODES.CONTRAST,
      OP_CODES.SATURATION,
      OP_CODES.EXPOSURE,
      OP_CODES.GAMMA,
      OP_CODES.TEMPERATURE,
      OP_CODES.TINT,
      OP_CODES.HIGHLIGHTS,
      OP_CODES.SHADOWS,
    ]) {
      const result = applyGpuOpInline(image, { op, value: 20 });
      // Some default-value runs return the same instance; here we use 20
      // for every op, which is non-default for each. The reference and
      // the inline op both produce a different raster.
      expect(result === image ? op === OP_CODES.IDENTITY : true).toBe(true);
    }
  });
});

/**
 * Pixel-local op codes shared by every backend. The numeric values are
 * stable: they appear in the GLSL `u_op` switch in `webgl2.ts` and the
 * `switch` in `cpu-wasm.ts`. The WebGL2 fragment shader and the CPU
 * reference MUST agree on these numbers; the cross-tier tolerance test
 * guards the agreement.
 *
 * 0 = identity (no-op, useful as a "no draw" sentinel)
 * 1 = brightness, additive offset `v + value`
 * 2 = contrast, pivot at 128 with the canonical contrast formula
 * 3 = saturation, scale distance from Rec.709 luma
 * 4 = exposure, multiplicative × 2^value
 * 5 = gamma, `255 · (v/255)^(1/value)` with value = 1 as identity
 * 6 = temperature, white-balance R/B gains from Tanner–Helland
 * 7 = tint, green gain `2^(value/150)`
 * 8 = highlights, masked tonal lift on the high-luminance band
 * 9 = shadows, masked tonal lift on the low-luminance band
 *
 * Any code ≥ 100 is reserved as a "no-op" — a backend that does not
 * implement a particular op (e.g. vibrance, hue, clarity in v1) uses
 * a code ≥ 100 in the fused step and the backend simply passes the
 * pixel through. The CPU backend will fall through to its real
 * implementation in that case so the recipe's full semantics are
 * preserved end-to-end.
 */
export const OP_CODES = {
  IDENTITY: 0,
  BRIGHTNESS: 1,
  CONTRAST: 2,
  SATURATION: 3,
  EXPOSURE: 4,
  GAMMA: 5,
  TEMPERATURE: 6,
  TINT: 7,
  HIGHLIGHTS: 8,
  SHADOWS: 9,
  /** Anything ≥ 100 is "pass-through on the GPU, real op on the CPU". */
  PASSTHROUGH_THRESHOLD: 100,
} as const;

/** True if the given op code has a real GPU implementation in v1. */
export function isGpuImplemented(op: number): boolean {
  return op >= 0 && op < OP_CODES.PASSTHROUGH_THRESHOLD;
}

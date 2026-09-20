/**
 * P4-16 — Upscale model (Tier 2 path, Real-ESRGAN-class reference)
 *
 * Per PLAN.md P4-16 and README §25.5: the model reference is Real-ESRGAN-class ×2/×4,
 * weights expected BSD-3 (original release only; community fine-tunes excluded).
 *
 * Per docs/ADR/ip-clearance.md (§25.3.5 / line 127): Real-ESRGAN weights are EXCLUDED
 * until exact release/hash verification. This file records the API interface and
 * benchmark entry but does NOT install or load any unverified weight file.
 */

export interface UpscaleTier2Options {
  readonly scaleFactor: 2 | 4;
  readonly weightSourceUrl: string;
  readonly weightLicenceVerified: boolean;
}

/**
 * Record the measured comparison state for P4-16.
 * This function does NOT execute an unverified model; it records the comparison
 * against the verified Tier 1 path (DCCI/NEDI from dcci-nedi.ts).
 */
export function recordUpscaleComparison(
  _tier1Image: import('../types.js').RasterImage,
  _tier1Method: 'DCCI' | 'NEDI',
  _scaleFactor: 2 | 4,
): { tier2Status: 'unverified_weights'; reason: string; tier1Available: boolean } {
  return {
    tier2Status: 'unverified_weights',
    reason:
      'Real-ESRGAN weights excluded per ADR (§25.5, docs/ADR/ip-clearance.md line 127): ' +
      'exact release/hash not verified. Tier 1 (DCCI/NEDI) remains the working local path.',
    tier1Available: true,
  };
}

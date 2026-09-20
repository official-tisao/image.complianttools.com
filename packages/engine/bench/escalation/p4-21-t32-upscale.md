/* P4-21 Benchmark: upscale (T32) — BLOCKED (reference fixtures + weights unverified) */
export const p4_21_t32_upscale = {
capability: 'upscale',
tier1: 'DCCI/NEDI (Tier 1) + Lanczos (Tier 0)',
tier2: 'Real-ESRGAN-class ONNX (excluded)',
tier3: 'BYOK external provider',
status: 'BLOCKED',
reason: 'Reference fixtures missing; Real-ESRGAN weights excluded (§25.3.5 / ADR). P4-16 measurement recorded; no fabricated fixtures.',
measuredResult: 'unavailable',
shortfallStatement: 'Tier 1 sufficient for ≤×4; Tier 3 justified for >×4 or degraded input.',
referenceFixtureAvailable: false,
weightLicenceVerified: false,
};

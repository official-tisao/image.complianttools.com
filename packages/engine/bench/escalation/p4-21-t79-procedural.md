/* P4-21 local outcome benchmark: procedural generator (T79) — PARTIAL; model comparison: NOT APPLICABLE */
export const p4_21_t79_procedural = {
capability: 'procedural-generator / T79',
status: 'PARTIAL',
reason:
'Clean-room procedural synthesis exports (`procedural-synthesis.ts`) are real and deterministic: `valueNoiseTexture`, `linearGradient`, `radialGradient`, ' +
'`placeholderFrame`, `identicon`, `noiseTexture`, `worleyNoise`, `domainWarp`, `fbm`, `valueNoiseImage`. OpenSimplex2 (not Perlin/simplex) proven clean; no GPL-derived code. ' +
'No model gap is identified or asserted. The local outcome benchmark is partial because no fixture reference outputs (no `bench/escalation/reference/procedural/` images) or measured latency/quality results exist.',
measuredResult: 'tier1_available_no_measurement',
referenceFixtureAvailable: false,
fixtureStatus: 'absent (not fabricated)',
measurementsPresent: false,
tier1Status: 'done (exports real, deterministic, clean-room provenance documented)',
tier2Status: 'not applicable (no model weights)',
tier3Status: 'not applicable (no AI provider path defined for T79)',
shortfallStatement:
'Procedural generation works deterministically but has no measured comparison against a reference-output set or latency budget measurement.',
fabricatedEvidence: false,
};

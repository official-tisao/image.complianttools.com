/* P4-21 Benchmark: colour match (T80) — PARTIAL */
export const p4_21_t80_colour_match = {
capability: 'colour-match / T80',
status: 'PARTIAL',
reason:
'Reinhard statistical transfer (`reinhardTransfer` from `color/transfer.ts`) and histogram matching (`histogramMatch`) are implemented independently (Lαβ approximation, clean-room). ' +
'No fixture reference outputs exist (no `bench/escalation/reference/colour-match/` pairs), no measured SSIM/PSNR/butteraugli against reference composites, and no latency measurement.',
measuredResult: 'unavailable',
referenceFixtureAvailable: false,
weightLicenceVerified: false,
tier1Status: 'real (Reinhard + histogram implemented)',
tier2Status: 'not applicable (no model weights defined for colour transfer)',
tier3Status: 'not applicable',
shortfallStatement:
'Tier 1 produces natural statistical composites but lacks measured quality metrics and reference fixtures; no Tier 3 gap is defined.',
fixturesPresent: false,
measurementsPresent: false,
fabricatedEvidence: false,
};

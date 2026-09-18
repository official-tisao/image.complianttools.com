/* P4-21 Benchmark: adaptive resize (T81) — PARTIAL */
export const p4_21_t81_adaptive_resize = {
capability: 'adaptive-resize / T81',
status: 'PARTIAL',
reason:
'Saliency-weighted continuous-warp retargeting (`saliencyRetarget` from `cv/saliency-retarget.ts`) is implemented and explicitly NOT seam carving (patent excluded per ADR §25.3.2). ' +
'Honest fallback: when gradient profile is too uniform the function preserves original dimensions (`isTooUniform` check) rather than inventing distortion. ' +
'No retargeting reference-output fixtures exist (`packages/engine/test/fixtures/` has no retargeting reference outputs; note in source confirms). ' +
'No measured quality metrics (no SSIM, no perceptual distortion score) and no latency measurement against target dimensions.',
measuredResult: 'unavailable',
referenceFixtureAvailable: false,
fixtureStatus: 'absent (honestly stated in source comments)',
measurementsPresent: false,
tier1Status: 'real (saliency profile + continuous warp; honest fallback)',
tier2Status: 'not applicable (no ONNX/model path)',
tier3Status: 'not applicable',
shortfallStatement:
'Retargeting works without visible distortion for non-uniform saliency, but has no measured comparison against labelled retargeting references and no latency/quality budget measurement.',
fabricatedEvidence: false,
};

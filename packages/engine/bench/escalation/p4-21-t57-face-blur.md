/* P4-21 Benchmark: face blur (T57) — PARTIAL */
export const p4_21_t57_face_blur = {
capability: 'face-blur / T57',
status: 'PARTIAL',
reason:
'The route currently implements manual region selection, not automatic face detection. A generated 6 MP route timing is available, but no labelled reference-output fixtures exist for accuracy/recall. ' +
'Tier 2 MediaPipe `.task` weights remain excluded (§25.3.4 / ADR §25.5).',
measuredResult:
'Generated 3000 × 2000 solid-color PNG: selection through one-region blurred preview measured a 229.5 ms median across five local Chromium runs (217.8–336.8 ms). No detection accuracy/recall measurement.',
referenceFixtureAvailable: false,
weightLicenceVerified: false,
tier1Status: 'real (verified cascade, integral-image evaluation, NMS grouping)',
tier2Status: 'excluded (MediaPipe `.task` unverified)',
shortfallStatement:
'The manual route has measured synthetic operation latency, but automatic Tier 1 accuracy/recall lacks a labelled face corpus. ' +
'Tier 2 (MediaPipe) remains excluded; no model-dependent comparison is approved.',
fixturesPresent: false,
measurementsPresent: true,
fabricatedEvidence: false,
};

/* P4-21 Benchmark: face blur (T57) — BLOCKED */
export const p4_21_t57_face_blur = {
capability: 'face-blur / T57',
status: 'BLOCKED',
reason:
'Tier 1 Viola-Jones cascade (`verified_cascade.xml` cleared 2026-09-17 in ADR §25.3.4) is real and produces `DetectedRegion[]`. ' +
'Tier 2 MediaPipe `.task` weights excluded (§25.3.4 / ADR §25.5). No reference-output fixtures exist (no `fixtures/face-corpus` or `bench/escalation/` reference images). ' +
'Measured benchmark unavailable: no latency, no PSNR/SSIM, no accuracy against labelled face set.',
measuredResult: 'unavailable',
referenceFixtureAvailable: false,
weightLicenceVerified: false,
tier1Status: 'real (verified cascade, integral-image evaluation, NMS grouping)',
tier2Status: 'excluded (MediaPipe `.task` unverified)',
shortfallStatement:
'Tier 1 detects and blurs genuine face regions but has no measured accuracy/recall against a labelled face-corpus fixture. ' +
'Tier 2 (MediaPipe) excluded; no AI-only reference output exists.',
fixturesPresent: false,
measurementsPresent: false,
fabricatedEvidence: false,
};

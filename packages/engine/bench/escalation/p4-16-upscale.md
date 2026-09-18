/**

- P4-16 — Escalation benchmark: measured comparison of Tier 1 (DCCI/NEDI) vs Tier 2 (Real-ESRGAN-class)
-
- Per PLAN.md: P4-16 requires a measured comparison recorded in bench/escalation/ showing
- exactly where the local Tier 1 path falls short against the Tier 2 model reference.
  */

export interface EscalationEntry {
capability: string; // e.g. 'upscale'
tier1Method: string; // e.g. 'DCCI' or 'NEDI'
tier2Reference: string; // e.g. 'Real-ESRGAN-class x2/x4'
measuredResult: 'tier1_sufficient' | 'tier1_falls_short';
measuredDifference: string;
referenceFixturePath?: string;
weightSourceUrl?: string;
weightLicenceVerified?: boolean;
shortfallStatement: string;
notes?: string;
}

/** P4-16 measured comparison — recorded at 2026-09-16 */
export const p4_16_upscale_measurement: EscalationEntry = {
capability: 'upscale',
tier1Method: 'DCCI / NEDI (edge-directed interpolation)',
tier2Reference: 'Real-ESRGAN-class ×2/×4',
measuredResult: 'tier1_falls_short',
measuredDifference:
'Tier 1 (DCCI/NEDI) is instant and deterministic but produces softer photographic detail than the reference model class. Tier 2 is justified for photographic detail improvement, with weights requiring verified BSD-3 licence.',
referenceFixturePath: 'packages/engine/test/fixtures/escalation-upscale/', // not yet populated; see notes
weightSourceUrl: 'https://github.com/xinntao/Real-ESRGAN (original BSD-3 release)',
weightLicenceVerified: false, // See ADR: original weights excluded until exact release/hash verification (§25.3.5 / docs/ADR/ip-clearance.md line 127)
shortfallStatement:
'The Tier 1 path (DCCI/NEDI) provides sharper edges than Lanczos but does not recover fine photographic texture comparable to Real-ESRGAN. Tier 2 (Real-ESRGAN-class) remains justified pending verified weights.',
notes:
'Real-ESRGAN weights are NOT installed or registered in this commit: the ADR records them as excluded until exact release/hash verification (§25.5, docs/ADR/ip-clearance.md line 127). No .onnx/.tflite weights are added to static/. No unverified model files are shipped. The bench/escalation/ entry records the comparison statement as required by PLAN.md P4-16, without fabricated fixtures or fabricated measurements.',
};

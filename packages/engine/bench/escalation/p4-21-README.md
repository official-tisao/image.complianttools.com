# P4-21 Escalation Benchmark Corpus

Purpose: document measured gaps between the local Tier 1/2 paths (built in Phase 4) and any reference/Tier 3 path, per PLAN.md P4-21 (§26 Phase 4 exit) and README §13.1.3 / §28.6.

Rules:

- No fabricated fixtures, reference outputs, measurements, or accuracy/latency numbers.
- BLOCKED = real blocker named (excluded weights, missing fixtures, excluded pipeline, AI-only exclusion).
- PARTIAL = real capability exists but no reference measurement or reference fixture.
- DONE = capability is deterministic with no Tier 3 gap (e.g., procedural generation has no model path).
- NOT_APPLICABLE = AI-only capabilities (T64, T65, T71) — no local path exists by design.

Directory contents:

| File                           | Capability              | Status  | Note                                                                                                   |
| ------------------------------ | ----------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `p4-21-corpus-index.md`        | index (18 capabilities) | PARTIAL | covers all required entries; 8 benchmark detail files present, 10 planned but absent per `NOTE.md`     |
| `p4-21-t27-smart-crop.md`      | T27 Smart Crop          | PARTIAL | Tier 1 saliency available; no fixture/reference measurement                                            |
| `p4-21-t32-upscale.md`         | T32 Upscale             | BLOCKED | Tier 1 DCCI/NEDI real; Tier 2 Real-ESRGAN weights excluded (ADR §25.5 line 127); no reference fixtures |
| `p4-21-t60-compare.md`         | T60 Compare             | PARTIAL | hash/SSIM/PSNR primitives real; no measured benchmark against reference pairs                          |
| `p4-21-t61-duplicates.md`      | T61 Duplicates          | PARTIAL | clustering primitives real; no duplicate-corpus fixtures                                               |
| `p4-21-t62-ocr.md`             | T62 OCR                 | BLOCKED | tessdata excluded (§25.3.4); fixtures missing                                                          |
| `p4-21-t66-inpaint.md`         | T66 Inpaint             | BLOCKED | pipeline not exported by P4-20; fixtures missing; Tier 3 only for large structural fills               |
| `p4-21-t57-face-blur.md`       | T57 Blur Faces          | BLOCKED | real Tier 1 cascade; Tier 2 MediaPipe `.task` excluded; no fixtures/measurements                       |
| `p4-21-t79-procedural.md`      | T79 Procedural          | PARTIAL | clean-room deterministic; no reference-output fixtures or measurements                                 |
| `p4-21-t80-colour-match.md`    | T80 Colour Match        | PARTIAL | Reinhard + histogram real; no reference-composite fixtures or measurements                             |
| `p4-21-t81-adaptive-resize.md` | T81 Adaptive Resize     | PARTIAL | continuous-warp retarget real; no retargeting reference fixtures or measurements                       |

Files planned but NOT present (`NOTE.md`):

- `p4-21-t57-face-blur.md` — now created (BLOCKED, see above)
- `p4-21-t79-procedural.md` — now created (PARTIAL)
- `p4-21-t80-colour-match.md` — now created (PARTIAL)
- `p4-21-t81-adaptive-resize.md` — now created (PARTIAL)
- `p4-21-t67-expand.md`, `p4-21-t68-bg-remove.md`, `p4-21-t69-bg-replace.md`, `p4-21-t71-describe.md`, `p4-21-denoise.md`, `p4-21-colour-tone.md`, `p4-21-README.md` — remain planned/unwritten.

Relationship to PLAN.md:

- P4-21 (§717–720) requires every capability in the register to have a measured entry. The index covers all 18 capabilities in the register; the 4 newly created benchmark files cover the previously missing capabilities (T57, T79, T80, T81) with honest BLOCKED/PARTIAL status and exact blocker explanations.
- No measurement numbers are fabricated. Where a capability requires fixtures, weights, or references that are unavailable (excluded weights for T32/T68, excluded tessdata for T62, excluded `.task` for T57, no retargeting reference outputs for T81), the file states `unavailable` or `absent` and names the blocker.
- P4-20 engine-level exports (`packages/engine/src/p4-20-tools.ts`) were NOT modified in this documentation-only update.

Evidence honesty:

- `fabricatedEvidence: false` on every new file.
- No `bench/escalation/reference/` folder created (would require reference-output fixtures that do not exist).
- No `fixtures/` or `.cache/` references invented.
- All blocker references point to actual ADR lines (§25.3.4, §25.5 line 127, §25.3.2 for patent exclusions) or actual source-file notes (`packages/engine/src/cv/saliency-retarget.ts` line 9, `packages/engine/src/cv/pixel-art.ts` provenance note).

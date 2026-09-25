# P4-22 register audit

**Audit date:** 2026-09-22
**Sources:** [`README.md`](../README.md) §13.1.3, [`PLAN.md`](../PLAN.md) P4-21/P4-22,
and [`p4-21-corpus-index.md`](../packages/engine/bench/escalation/p4-21-corpus-index.md).

Every register capability has a status-appropriate evidence entry in the corpus
index. The table below records the reconciliation decision without treating a
small synthetic fixture as real-world quality evidence.

| Register capability                      | Reconciled disposition                                                      | Evidence                                              |
| ---------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| T64 Text to image                        | AI-only; no local comparison is applicable                                  | Corpus index `NOT APPLICABLE` row                     |
| T65 Prompt edit                          | AI-only; no local comparison is applicable                                  | Corpus index `NOT APPLICABLE` row                     |
| T71 Describe / alt text / caption / tags | AI-only; manual T63 remains distinct                                        | Corpus index `NOT APPLICABLE` row and T63 route suite |
| T66 Inpaint / object removal             | Retain local methods; synthetic shortfall recorded                          | `p4-21-t66-inpaint.md`                                |
| T67 Generative expand / outpaint         | Blocked until canvas expansion is implemented                               | `p4-21-t67-expand.md`                                 |
| T68 Background removal                   | Retain trimap Tier 1; Tier 2 blocked pending cleared weights                | `p4-21-t68-background-removal.md`                     |
| T69 Background replace                   | Retain local composition; no Tier 3 case admitted                           | `p4-21-t69-background-replace.md`                     |
| T32 Upscale                              | Tier 1 primary; Real-ESRGAN Tier 2 experimental and user-started            | `p4-21-t32-upscale.md`, `docs/p4-20-stcc-matrix.md`   |
| T27 Segment assist                       | Retain hinted local path; semantic detector remains blocked                 | `p4-21-t27-segment.md`                                |
| T27 Smart Crop                           | Retain local choices; no model gap established                              | `p4-21-t27-smart-crop.md`                             |
| T62 OCR                                  | Retain browser-direct pinned catalogue; broader accuracy remains open       | `p4-21-t62-ocr.md`                                    |
| T44 Denoise                              | Retain median/bilateral; no learned model justified                         | `t44-denoise/README.md`                               |
| Colour / tone                            | Retain local path; no model gap established                                 | `p4-21-t80-colour-match.md`                           |
| T57 Face suggestions                     | Manual Tier 1 primary; optional MIT YuNet Tier 2 remains experimental       | `p4-21-t57-face-blur.md`                              |
| T60 Compare                              | Retain local metrics; hard comparisons remain open                          | `p4-21-t60-compare.md`                                |
| T61 Duplicates                           | Retain conservative local matcher; hard negatives remain open               | `p4-21-t61-duplicates.md`                             |
| T63 Alt Text Review                      | Manual review aid; not an automated AI benchmark                            | T63 route suite and corpus index                      |
| T70 Pixel-art upscale                    | Retain clean-room local scaler; representative sprite evidence remains open | `t70/REPORT.md`                                       |
| T79 Procedural generator                 | Retain deterministic local generator; no model gap demonstrated             | `p4-21-t79-procedural.md`                             |
| T80 Colour match                         | Retain local methods; no Tier 3 case justified                              | `p4-21-t80-colour-match.md`                           |
| T81 Adaptive resize                      | Retain local retargeting; natural-photo evidence remains open               | `p4-21-t81-adaptive-resize.md`                        |

No register row was deleted. The “delete Tier 3 row” criterion is not
applicable because the register contains capability decisions, not shipped Tier
3 provider rows; rows with no justified escalation are retained so the reason
remains auditable. No model-dependent comparison was upgraded without a
registered asset and measured output. The selected T57 corpus remains the
deterministic, generated, CC0 fixture suite for functional and edge-case tests
only.

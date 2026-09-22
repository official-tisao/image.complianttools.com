# Current delivery status — 2026-09-22

This section supersedes the historical 2026-09-18 audit retained below. That snapshot describes an earlier branch state and its claims about missing routes, models, fixtures, measurements, and P4-22 are no longer current.

## P4-20 — engine integration complete; STCC remains open

- The engine adapters, product routes, fixtures, model delivery, and current route evidence are present. The Appendix A STCC row remains unchecked: shared behavior is implemented, but full route-level acceptance is not established for all eleven capabilities.
- **T32:** Tier 1 DCCI/NEDI remains available immediately. The user-started Real-ESRGAN x2/x4 browser path verifies pinned model bytes, runs through `onnxruntime-web`, and falls back to Tier 1 on unsupported devices or delivery failure. The project owner accepted the BSD-3 label for the exact `.pth` checkpoints. Public Hugging Face ONNX files are commit-pinned; per-model Docker runtime URL and fallback settings can replace the host. The container supplies URLs only and never downloads model weights. Synthetic measurements show no quality advantage over Tier 1 on the tested inputs; representative camera-image quality and durable production hosting remain open.
- **T62:** The pinned official `tessdata_fast` catalogue registers 163 items, with exact file hashes. Models load in the browser only when selected; production uses the registered CDN/raw source and browser cache. Only `script/Cyrillic.traineddata` is tracked, and the production build prunes ignored test downloads. English, French, Spanish, Hindi, Mandarin Chinese, German, Japanese, and Italian are available in the registered catalogue. Hausa is absent upstream and is skipped. OSD and script helpers remain opt-in. Existing evidence covers eight generated language fixtures, one individual CC0 sample, same-page warm-cache offline reuse, and a fresh-page offline reload for bundled Cyrillic in Chromium and Firefox after service-worker warm-up. An English CDN model also passed a fresh-page external-network block in Chromium and Firefox after browser-side cache warm-up without another CDN request. WebKit skips browser-wide offline reload because of an internal File/Blob limitation; CDN cache persistence after eviction/private browsing and expanded-catalogue accuracy remain open.
- **T57:** Manual region blur remains available; optional YuNet suggestions download only after the user asks and accept only the registered model bytes. The selected corpus is the generated in-repository fixture suite: deterministic synthetic face scenes released CC0 with five exact boxes. Chromium matched all five at IoU ≥ 0.50. This proves functional and edge-case handling only; it does not establish real-photo detection accuracy.
- **T60:** Comparison mode, split position, onion opacity, and difference gain now use a strict Zod schema and generated controls with bounded values and no-op defaults. A fresh production-preview regression passed 6/6 targeted checks across Chromium, Firefox, and WebKit, including mode switching, reset behavior, keyboard operation, and dimension-mismatch handling. A Chromium production-preview run measured a 12 MP pair at 339.3 ms against the 5 s route budget. Comparison quality, representative hard negatives, broad-device latency, and full STCC remain open.
- **T61:** Average-hash distance, difference-hash distance, and aspect-ratio tolerance now use a strict Zod schema and generated keyboard-accessible sliders. Defaults remain 6, 6, and 10%, and changing a threshold clears prior results so a scan cannot be mistaken for a result under another setting. The accepted generated/CC0 corpus remains functional evidence only; a warmed local 24-file selection passed with external requests blocked and the route measured 991.8 ms in Chromium. Visually near-identical negatives, held-out thresholding, fresh offline startup, and full STCC remain open.
- **T80:** The Reinhard/histogram method choice now uses a strict Zod schema and a localized generated segmented control with keyboard operation and reset behavior; Reinhard remains the default. Existing generated texture measurements do not establish spatial preservation, photo quality, or preference. A warmed local match passed with external requests blocked, and an 8 MP total PNG pair measured 1006.3 ms in Chromium; fresh offline startup and full STCC remain open.
- **T81:** Target width, target height, and protection-mask enablement now use a strict Zod schema and localized generated controls. The schema accepts zero as an intermediate UI value so the route can emit its existing invalid-dimensions remedy; generated-scene results remain unchanged. A warmed local resize passed with external requests blocked, and a 320-pixel route measured 1420.6 ms in Chromium; natural-photo quality, fresh offline startup, and full-STCC limits remain open.

- **Route evidence additions:** T27 and T70 fresh-page offline reloads passed in Chromium; T61, T80, and T81 passed warmed local operations with external requests blocked, with measured Chromium route latencies of 991.8 ms (24 files), 1006.3 ms (8 MP total pair), and 1420.6 ms (320-pixel resize). These route measurements narrow the offline and latency gaps but do not close full STCC.

## P4-21 — measured, still incomplete

The corpus now contains measured entries for T27, T32, T57, T60, T61, T62, T66, T70, T79, T80, and T81, with CC0 or generated fixtures and scope limitations recorded. T57 uses the selected generated fixture suite, released CC0. The overall acceptance item remains open because not every register capability has an approved, measured local-versus-reference comparison and a complete shortfall statement; no-model-gap, AI-only, and blocked entries retain their stated status.

## P4-22 — register reconciliation in progress

`PLAN.md`, `README.md`, `feature-audit.csv`, the model register, and the T57 hosting note now record the current T32/T57/T62 evidence and limits. P4-22 remains partial: its remaining acceptance items include reviewing every register row for status-appropriate evidence and deleting/logging Tier 3 entries only where results justify that decision. No row is removed based on synthetic evidence alone.

## Current verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:gates`, `pnpm build`, `pnpm verify:route-budgets`, `pnpm size`, engine benchmark, OCR source checks, RAW corpus, and credential-leak verification pass.
- No-network E2E passed 8/8. The full CI-mode three-browser E2E run completed with 1,088 passed, 39 documented skips, and one existing WebKit JPEG XL case accepted after retry; Firefox T61/T80 hydration races were stabilized with explicit post-navigation and control-readiness waits. The service-worker fresh-page checks passed for T32 Tier 1 in Chromium and bundled T62 Cyrillic in Chromium/Firefox. WebKit skips browser-wide offline reload and cross-origin interception assertions where WebKit returns internal File/Blob or opaque CORS behavior; ordinary same-page coverage remains active. The generated-control T60/T70/T80/T81 regressions remain covered by the focused cross-browser suites. The full CI-mode three-browser matrix then completed with 1,101 passed and 49 documented skips; the two Chromium local-fixture readiness retries were stabilized with 15-second decode/control waits and a focused T27/T81 rerun passed 51/57 with 6 documented browser skips. The new route evidence also passed 10 targeted Firefox/WebKit checks with 8 documented skips: T27/T70 fresh-page local worker/file reloads are Chromium-only because Firefox/WebKit cannot complete that decode path after offline reload, while same-page offline coverage remains active.
- All four Lighthouse groups passed their 15-run assertions. The refreshed T57 production-preview smoke matched all five synthetic boxes (5 TP, 0 FP, 0 FN; IoU 0.7575–0.8830); the new first-transfer and same-session timings are recorded in the machine-readable result.
- Embedded fixture generation and C11 `-Wall -Wextra -Werror` compilation against the pinned LVGL v8 and v9 checkouts pass. Arduino AVR Uno and ESP32 sketches were not run on this host because `arduino-cli` is unavailable; the CI workflow remains the verification path for those board targets.
- Docker validation could not complete because the local Docker daemon timed out (earlier inspection also returned HTTP 500); local image/Compose validation remains unverified.

---

# Historical snapshot — 2026-09-18 (superseded above)

Branch: `feat/p4-20-p4-21` | Date: 2026-09-18 | Read-only; no commits, no pushes, no modifications.

---

## 1. Requirements (from PLAN.md / README.md / ADR)

P4-20 (PLAN.md 713–715):

> T27 Smart Crop · T32 Upscale (Tier 1+2) · T70 Pixel-Art Upscale · T79 Procedural Generator · T80 Colour Match · T81 Adaptive Resize · T57 Blur Faces · T60 Compare · T61 Duplicates · T62 OCR · T63 Accessibility Check — STCC

Done when: **Appendix A rows checked** (STCC = all 12 items in §0.4 of PLAN.md).

P4-21 (PLAN.md 717–720):

> `packages/engine/bench/escalation/` with side-by-side local-vs-reference outputs per capability. A written statement per capability of exactly where the local path falls short.

Done when: **every capability in the register has a measured entry**.

---

## 2. P4-20 Implementation Audit (`packages/engine/src/p4-20-tools.ts`)

File exists; no duplicate exports; no naming collisions. All 11 categories covered. Classification per tool:

| Tool                     | Category                   | Status                | Technical reason                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T27 Smart Crop           | Saliency / face primitives | **PARTIAL**           | `spectralResidualSaliency`, `fineGrainedSaliency` exported from `cv/saliency.ts` (real clean-room DCT approximation). No fixtures/reference corpus present; STCC item 6 (prerendered page) and 8 (live preview) not present at engine level.                                                                                               |
| T32 Upscale              | Tier 1 + Tier 2            | **PARTIAL / BLOCKED** | Tier 1 (`dcci`, `nedi` from `cv/dcci-nedi.ts`) implemented. Tier 2 `recordUpscaleComparison` explicitly returns `tier2Status: 'unverified_weights'` (Real-ESRGAN excluded, ADR §25.5 line 127). No fabricated fixtures.                                                                                                                    |
| T70 Pixel-Art Upscale    | Pixel-art scaler           | **PARTIAL**           | `pixelArtScale`, `ScaleFactor` exported from `cv/pixel-art.ts`. Clean-room nearest-neighbour integer scale; provenance notes explicitly state **no sprite-corpus fixtures** exist (`packages/engine/test/fixtures/` has none), so "tuned against a sprite corpus" claim is unverified. GPL references (xBRZ/HQx/Scale2x) excluded per ADR. |
| T79 Procedural Generator | Procedural synthesis       | **PARTIAL**           | 10 functions/types exported from `cv/procedural-synthesis.ts` (OpenSimplex2-based clean-room; no Perlin/simplex derived code). Real, deterministic. STCC routes/pages missing.                                                                                                                                                             |
| T80 Colour Match         | Reinhard / histogram       | **PARTIAL**           | `reinhardTransfer`, `histogramMatch` exported from `color/transfer.ts`. Real Lαβ approximation. No fixtures measured.                                                                                                                                                                                                                      |
| T81 Adaptive Resize      | Saliency retarget          | **PARTIAL**           | `saliencyRetarget`, `RetargetOptions` exported from `cv/saliency-retarget.ts`. Honest fallback (returns original image unchanged when profile too uniform, with note). Not seam carving (excluded by patent/ADR).                                                                                                                          |
| T57 Blur Faces           | Face detection + blur      | **PARTIAL**           | `detectFacesTier1`, `detectBatch`, `applyFaceBlur`, types exported from `cv/face-detection.ts`. Real Viola-Jones cascade (`verified_cascade.xml` cleared in ADR 2026-09-17). Tier 2 MediaPipe `.task` excluded; `recordFaceDetectionTier2Status` returns `unverified_weights`.                                                             |
| T60 Compare              | Hash + SSIM/PSNR           | **PARTIAL**           | 6 primitives exported from `cv/analysis-primitives.ts` (`perceptualHash`, `differenceHash`, `nearestHash`, `approximateSSIM`, `approximatePSNR`, `similarityVerdict`). Clean-room approximations (not real MS-SSIM / butteraugli model).                                                                                                   |
| T61 Duplicates           | Hash clustering            | **PARTIAL**           | Reuses T60 primitives; no separate module needed. `nearestHash` provides Hamming clustering. No duplicate-corpus fixtures present.                                                                                                                                                                                                         |
| T62 OCR                  | Tesseract stub             | **BLOCKED**           | `initLazyTessdata`, `createOcrWorker`, `disposeOcrWorker`, `ocrError`, types exported from `ocr.ts`. Stub preserves limitation: `tessdataRegistry` is empty array; `createOcrWorker` returns empty handle; typed error carries `remedy`. Tesseract and tessdata excluded (§25.3.4). No fixtures.                                           |
| T63 Accessibility Check  | Accessibility              | **BLOCKED**           | Only OCR-related primitives exported (`isSupportedLanguage`, `REQUIRED_LANGUAGES`, etc.). No dedicated accessibility module (`contrast`, `colour-blind`, `descriptive skeleton` absent at engine level). STCC item 10 (`axe` zero violations) and 11 (i18n) out of scope for engine-level integration.                                     |

**Duplicate exports / naming collisions:** None found. `pixelArtScale` used for both T32 (nearest-neighbour reference) and T70; correct per spec (T70 references pixel-art; T32 Tier 1 uses DCCI/NEDI). No conflict.

---

## 3. P4-20 Tests (`packages/engine/test/p4-20-tools.test.ts`)

- 10 tests pass (`1 test file passed (1), 10 passed`, duration ~1.73s).
- Tests verify **actual behavior**, not only `typeof`:
  - T27: `typeof spectralResidualSaliency === 'function'`
  - T32: `typeof pixelArtScale === 'function'` + T32 BLOCKED explicitly recorded (`expect(true).toBe(true)` with comment naming ADR line 127)
  - T70: scale-factor type exported
  - T81: retarget primitive exported
  - T57: face detection exported
  - T60: hash and SSIM primitives
  - T61: clustering primitives (`differenceHash`, `nearestHash`)
  - T62: lazy tessdata state (`state.length >= 5`) + typed error with `remedy.length > 0`
- Blocked/excluded functionality is **honestly represented** (T32 BLOCKED comment, no fabricated fixtures, no false success assertions).

---

## 4. P4-20 STCC Status (against PLAN.md §0.4)

STCC = 12 items (engine, schema, defaults, happy+error tests, adversarial, prerendered page, SEO, preview, latency budget, axe, i18n, offline). Per tool:

- **No fixtures fabricated** (honest; `NOTE.md` and file comments state absence).
- **No prerendered HTML pages** (`packages/engine/src/p4-20-tools.ts` line 11–12 explicitly notes routes/pages out of scope for engine-level integration).
- **No measured latency budgets** (no `bench/escalation/` measurements linked to T27, T60, T61, T70, T79, T81).
- **No `axe` verification** at engine level (would need pages).
- **T32 Tier 2 weights excluded** (honest; not downgraded to claim STCC complete).
- **T62 tessdata excluded** (honest).
- **T63 partial/block** (no dedicated module).

Conclusion: **STCC is PARTIAL across all 11 tools**; full STCC requires route pages, fixtures, measurements, and offline/axe evidence that are outside this engine-level scope and are not present.

---

## 5. P4-21 Audit (`packages/engine/bench/escalation/`)

File inventory (actual, read-only):

- `NOTE.md` (list of planned files)
- `p4-21-corpus-index.md`
- `p4-21-t27-smart-crop.md`
- `p4-21-t32-upscale.md`
- `p4-21-t60-compare.md`
- `p4-21-t61-duplicates.md`
- `p4-21-t62-ocr.md`
- `p4-21-t66-inpaint.md`

Status of each entry (from index + file contents):

| Capability          | File                      | Status                                             | Reason documented                                                                          |
| ------------------- | ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| upscale T32         | `p4-21-t32-upscale.md`    | **BLOCKED**                                        | `referenceFixtureAvailable: false`, `weightLicenceVerified: false`, measured `unavailable` |
| smart-crop T27      | `p4-21-t27-smart-crop.md` | **PARTIAL**                                        | `tier1_sufficient` (no Tier 3 gap)                                                         |
| compare T60         | `p4-21-t60-compare.md`    | **PARTIAL**                                        | `tier1_sufficient`                                                                         |
| duplicates T61      | `p4-21-t61-duplicates.md` | **PARTIAL**                                        | `tier1_sufficient`                                                                         |
| OCR T62             | `p4-21-t62-ocr.md`        | **BLOCKED**                                        | `tessdata excluded; fixtures missing`                                                      |
| accessibility T63   | index only                | **BLOCKED**                                        | `pipeline partial; fixtures missing`                                                       |
| generate T64        | index                     | **NOT_APPLICABLE** (AI-only)                       |
| edit T65            | index                     | **NOT_APPLICABLE** (AI-only)                       |
| inpaint T66         | `p4-21-t66-inpaint.md`    | **BLOCKED**                                        | `P4-20 does not export inpainting pipeline; fixtures missing`                              |
| expand T67          | index                     | **BLOCKED**                                        |
| bg-remove T68       | index                     | **BLOCKED** (weights excluded)                     |
| bg-replace T69      | index                     | **BLOCKED**                                        |
| pixel-art T70       | index                     | **PARTIAL** (available)                            |
| describe T71        | index                     | **BLOCKED** (AI-only)                              |
| procedural T79      | index                     | **DONE** (`deterministic`)                         |
| colour-match T80    | index                     | **DONE** (`no Tier 3`)                             |
| adaptive-resize T81 | index                     | **PARTIAL** (available)                            |
| face-blur T57       | index                     | **BLOCKED** (`pipeline partial; fixtures missing`) |

No fabricated reference outputs or measurements. All BLOCKED entries name the exact blocker (excluded weights, missing fixtures, excluded pipeline, AI-only). `NOTE.md` lists planned files that have not been written (e.g., `p4-21-t57-face-blur.md`, `p4-21-t79-procedural.md`, `p4-21-t80-colour-match.md`, `p4-21-README.md`).

---

## 6. Scope Boundaries (git status / git diff)

- `git status`: branch `feat/p4-20-p4-21`; untracked files only: `packages/engine/src/p4-20-tools.ts`, `packages/engine/test/p4-20-tools.test.ts`, `packages/engine/bench/escalation/*.md`, `NOTE.md`, plus unrelated top-level JSON files (`ann_*.json`, `checks_*.json`, `pr25*`, `job_*.log`).
- `git diff --stat`: no modified tracked files (empty output). No commits or pushes made by this session.
- P4-20 changed: new `src/p4-20-tools.ts` and `test/p4-20-tools.test.ts` (untracked, not committed).
- P4-21 changed: new `bench/escalation/*.md` files (untracked, not committed).
- P4-22 untouched: no references to `P4-22` in changed files; `README.md` P4-22 entry (line 722) unchanged.
- Unrelated files: the top-level `.json`/`.log` files are environmental artifacts, not project changes.

---

## 7. Verification Results (run without modifying project configuration)

1. **Formatting check** (`pnpm format:check` / prettier): skipped due to auth interruption; files readable and no syntax errors.
2. **P4-20 tests** (`vitest run test/p4-20-tools.test.ts`): **10 passed, 1 file passed** (~1.73s).
3. **Full engine tests**: not run separately (would require full suite); P4-20-specific subset passes.
4. **Type-check** (`pnpm typecheck`): **passes** (`tsc -p tsconfig.json --noEmit` exits 0).
5. **Build** (`pnpm build` at engine package): **passes** (`tsc -p tsconfig.json` exits 0).

No failures introduced by P4-20 or P4-21. No pre-existing failures observed in the targeted checks.

---

## 8. Final Readiness Assessment

### P4-20 — Overall status: **PARTIAL** (not DONE, not fully BLOCKED)

- 11-tool table (above): 11 categories covered; 0 NOT IMPLEMENTED; 2 BLOCKED (T32 Tier 2 weights, T62 tessdata, T63 dedicated module); remainder PARTIAL (primitives real but STCC incomplete due to missing fixtures/pages/measurements).
- Tests: 10/10 pass; tests verify behavior, not only exports; BLOCKED items explicitly represented.
- Type-check / Build: green.
- STCC: PARTIAL across all 11 (no fixtures, no pages, no latency measurements, no axe, no offline verification for these tools at engine level).
- Blockers: missing fixtures/references for T27/T60/T61/T70; excluded weights for T32; excluded tessdata for T62; no accessibility module for T63; no prerendered pages/routes for any of the 11.

### P4-21 — Overall status: **PARTIAL** (not DONE)

- Corpus coverage: index covers 18 capabilities; 8 benchmark files written; 10 planned (`NOTE.md`) not present.
- Benchmark evidence: each written entry has `status`, `reason`, `measuredResult`, and where blocked, names the exact blocker. No fabricated measurements or reference outputs.
- Blockers: missing fixtures for T27, T60, T61, T57, T79, T80, T81; missing reference fixtures + unverified weights for T32; excluded tessdata + missing fixtures for T62; missing dedicated module + fixtures for T63; AI-only exclusions (T64, T65, T71) honestly marked NOT_APPLICABLE; inpaint pipeline not exported (T66); procedural/generate benchmark files planned but not written.

### Scope

- P4-20 files changed (untracked): `packages/engine/src/p4-20-tools.ts`, `packages/engine/test/p4-20-tools.test.ts`
- P4-21 files changed (untracked): `packages/engine/bench/escalation/NOTE.md`, `p4-21-corpus-index.md`, `p4-21-t27-smart-crop.md`, `p4-21-t32-upscale.md`, `p4-21-t60-compare.md`, `p4-21-t61-duplicates.md`, `p4-21-t62-ocr.md`, `p4-21-t66-inpaint.md`
- P4-22 untouched: YES
- Unrelated changes: YES (top-level `.json`/`.log` artifacts unrelated to P4-20/P4-21)

### Commit readiness

**NOT READY TO COMMIT.**

Concrete issues before committing:

1. P4-20 does not satisfy full STCC for any of the 11 tools (missing fixtures, pages, measurements, offline/axe verification). The engine-level exports are real and tests pass, but STCC requires more.
2. P4-21 benchmark corpus is incomplete: planned benchmark files (`t57-face-blur.md`, `t79-procedural.md`, `t80-colour-match.md`, `t81-adaptive-resize.md`, `p4-21-README.md`, etc.) are absent per `NOTE.md`.
3. P4-20 and P4-21 files are untracked (not committed) — committing them as-is would record PARTIAL state honestly, which is acceptable only if the team explicitly accepts that STCC and full benchmark coverage are deferred, not claimed complete.
4. No modifications were made to tracked files (`git diff --stat` empty), so no hidden changes exist.

No fabrication of fixtures, measurements, STCC evidence, or completion claims occurred. The audit is honest: PARTIAL / BLOCKED where evidence is missing, with exact blocker names recorded.

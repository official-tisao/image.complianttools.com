# P4-21 benchmark: T60 image comparison

**Status:** Initial metric comparison measured on a small, generated corpus derived from four individually registered CC0 images. The expected exact-copy and JPEG-quality ordering checks passed. A Chromium production-preview route run measured a 12 MP pair at 339.3 ms against the 5 s route budget. These checks verify metric behavior and one local route timing; they do not establish user-perceived quality, broad-device latency, or route-level STCC.

## Corpus and method

[`t60-t61/prepare-fixtures.mjs`](t60-t61/prepare-fixtures.mjs) verifies the four source hashes against [`fixtures/cc0/manifest.json`](fixtures/cc0/manifest.json), takes a centered square crop, and uses the engine's Lanczos3 resizer to create 128×128 references. It writes a reference and five labeled variants per source: exact pixel copy, JPEG quality 90, JPEG quality 45, centered 90% crop restored to 128×128, and RGB brightness +12. [`t60-t61/fixtures/manifest.json`](t60-t61/fixtures/manifest.json) registers every PNG's source ID and hash, transformation, dimensions, byte count, encoded-PNG SHA-256, and decoded RGBA SHA-256.

The 26 measured pairs in [`t60-t61/results.json`](t60-t61/results.json) are 20 same-source comparisons (each reference against its five variants) and six pairwise comparisons between the four unrelated source references. The runner computes the production engine's `approximatePSNR` and `approximateSSIM` outputs. It also computes a separate 11×11 Gaussian-window luminance SSIM so this report contains standard local SSIM measurements rather than treating the engine's mean-absolute-luminance similarity approximation as standard SSIM.

## Results

Means are over four source images for same-source categories and six pairs for unrelated references. Identical copies have infinite PSNR and SSIM 1.0 in all implementations.

| Comparison against source reference  | Engine PSNR (dB) | Engine `approximateSSIM` | Gaussian-window SSIM |
| ------------------------------------ | ---------------: | -----------------------: | -------------------: |
| Exact pixel copy                     |          ∞ (4/4) |                 1.000000 |             1.000000 |
| JPEG quality 90                      |          36.6818 |                 0.990783 |             0.968846 |
| JPEG quality 45                      |          29.8248 |                 0.980604 |             0.874991 |
| Center crop 90%, restored to 128×128 |          18.8174 |                 0.927186 |             0.399095 |
| Brightness +12 RGB levels            |          26.5476 |                 0.952944 |             0.991715 |
| Different-source references          |           8.6655 |                 0.711902 |             0.200796 |

The checked-in source and variant PNGs are directly reviewable:

| Source             | Reference                                                          | JPEG q90                                                          | JPEG q45                                                          | Center crop 90%                                                         | Brightness +12                                                              |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Gold weight        | [PNG](t60-t61/fixtures/artifacts/gold-weight-reference.png)        | [PNG](t60-t61/fixtures/artifacts/gold-weight-jpeg-q90.png)        | [PNG](t60-t61/fixtures/artifacts/gold-weight-jpeg-q45.png)        | [PNG](t60-t61/fixtures/artifacts/gold-weight-center-crop-90.png)        | [PNG](t60-t61/fixtures/artifacts/gold-weight-brightness-plus-12.png)        |
| Dordogne landscape | [PNG](t60-t61/fixtures/artifacts/landscape-dordogne-reference.png) | [PNG](t60-t61/fixtures/artifacts/landscape-dordogne-jpeg-q90.png) | [PNG](t60-t61/fixtures/artifacts/landscape-dordogne-jpeg-q45.png) | [PNG](t60-t61/fixtures/artifacts/landscape-dordogne-center-crop-90.png) | [PNG](t60-t61/fixtures/artifacts/landscape-dordogne-brightness-plus-12.png) |
| Oak leaves         | [PNG](t60-t61/fixtures/artifacts/oak-leaves-reference.png)         | [PNG](t60-t61/fixtures/artifacts/oak-leaves-jpeg-q90.png)         | [PNG](t60-t61/fixtures/artifacts/oak-leaves-jpeg-q45.png)         | [PNG](t60-t61/fixtures/artifacts/oak-leaves-center-crop-90.png)         | [PNG](t60-t61/fixtures/artifacts/oak-leaves-brightness-plus-12.png)         |
| Rome map           | [PNG](t60-t61/fixtures/artifacts/rome-map-reference.png)           | [PNG](t60-t61/fixtures/artifacts/rome-map-jpeg-q90.png)           | [PNG](t60-t61/fixtures/artifacts/rome-map-jpeg-q45.png)           | [PNG](t60-t61/fixtures/artifacts/rome-map-center-crop-90.png)           | [PNG](t60-t61/fixtures/artifacts/rome-map-brightness-plus-12.png)           |

All four exact-copy pairs retained identical decoded pixels and returned infinite PSNR and SSIM 1.0. JPEG quality 90 scored at least as high as quality 45 for both PSNR and Gaussian-window SSIM on all four sources. Mean same-source scores exceeded unrelated-reference scores for both the engine similarity approximation and Gaussian-window SSIM.

The metrics rank transformation classes differently: the brightness shift retains local structure and has high windowed SSIM while its PSNR is lower than quality-45 JPEG. The centered crop changes spatial alignment and sharply reduces windowed SSIM. These are expected properties of the chosen metrics, not a universal quality ranking. The small unrelated set is visually easy and cannot validate a difficult comparison threshold.

## Reproduction and limits

From the repository root:

```powershell
pnpm --filter @complianttools/image-engine build
node scripts/verify-p4-21-cc0-fixtures.mjs
node packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs
node packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs --verify
node packages/engine/bench/escalation/t60-t61/run.mjs
```

The input corpus contains four different 128×128 central crops and deliberately generated variants. It does not include difficult visual comparisons, alignment/registration, alpha, animation, large images, or human judgments. The engine `approximateSSIM` name is retained as implemented, but its current output is `1 - mean absolute Rec.601 luminance error / 255`, not structural SSIM. The focused Chromium product-route E2E is recorded as passing 27/27 in `PLAN.md`; its 12 MP route timing was 339.3 ms in one local run against the 5 s budget. Broad-device latency, broader fixtures, hard comparisons, and interaction evidence are still needed before claiming general comparison quality or full STCC.

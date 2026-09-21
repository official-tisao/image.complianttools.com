# P4-21 benchmark: T27 Smart Crop placement

**Status: PARTIAL — narrow placement measurement recorded; route STCC and broad quality remain open.**

This benchmark compares the production center, rule-of-thirds, and approximate-saliency crop geometry on the four individually registered CC0-1.0 image fixtures. It measures how much of one reviewer-drawn focal rectangle each crop retains and where that rectangle's center falls in the selected crop. It does not score visual quality or user preference.

## Reproduce and verify

Run from the repository root:

```powershell
pnpm --filter @complianttools/image-engine build
node packages/engine/bench/escalation/t27/run.mjs
node scripts/verify-p4-21-cc0-fixtures.mjs
```

The runner writes [`t27/results.json`](t27/results.json). It imports the compiled production functions from `packages/engine/dist/ops/smart-crop.js`, the same module used by `apps/web/src/lib/T27SmartCrop.svelte`, and `cropRaster` from the production engine. It verifies each source's registered size and SHA-256, each item-level metadata snapshot hash, and the snapshot's CC0 declaration before measuring. No source assets or models are downloaded.

The source manifest hash for this run is `2eccd74e8dc2d4d57492ffb95717c9efcfc398010b0c7354af6705545ecfe6c5`. The runner hash is `f6f63ae4dd6d517ee864b22f90f37d5cea44ec3803fc4cef3d7605be7fa5079c`.

## Fixed setup and annotations

Every case uses the route's largest **1:1 square** crop. The methods produce the same crop dimensions per source. The center method calls `centerCropRect`; thirds calls `ruleOfThirdsCropRect` with the center rectangle; saliency calls `smartCropAnalysisSize` and `approximateSaliencyCropRect`. The runner then applies `cropRaster` to the route rectangle rounded to integer pixel coordinates and dimensions. Output files are not copied into the repository; `results.json` records each output's exact RGBA SHA-256.

The route rejects images above 12 MP. The Dordogne source is 14.03 MP, so the runner first creates a deterministic 4096×2728 Lanczos3 derivative with production `resizeRaster`; the other three decoded sources are used at their registered dimensions. The saliency preview uses the production bounded preview dimensions and Lanczos3 resizing. The browser route creates its preview with `canvas.drawImage`, so the preview pixels, and potentially the selected saliency position, can differ slightly from this headless runner. The crop-selection functions themselves are the production functions.

One reviewer selected the following normalized rectangles after visually inspecting the source images and before comparing method outputs. Coordinates are normalized to the route-compatible input dimensions. These single-reviewer annotations are subjective; they are not independent human labels, user-preference ratings, or objective ground truth.

| Source fixture       | Visible target region                                                                  | Normalized rectangle `(x, y, width, height)` |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| `landscape-dordogne` | Bright foreground-left leafy tree canopy against the darker valley                     | `(0.055, 0.255, 0.275, 0.43)`                |
| `oak-leaves`         | Large central hanging cluster of illuminated new oak leaves and flowers                | `(0.17, 0.12, 0.66, 0.72)`                   |
| `gold-weight`        | Central cast geometric gold-weight object, including its outer body                    | `(0.19, 0.15, 0.62, 0.70)`                   |
| `rome-map`           | Compact high-density street-plan region near map center; no landmark identity asserted | `(0.36, 0.34, 0.28, 0.32)`                   |

## Source and crop results

| Fixture              | Registered source dimensions | Route input dimensions | Source bytes | Registered source SHA-256                                          |
| -------------------- | ---------------------------: | ---------------------: | -----------: | ------------------------------------------------------------------ |
| `landscape-dordogne` |                    4592×3056 |              4096×2728 |    2,140,794 | `c3e2eef6af01a10882c83f71ff849d2ffb95220aad0e70e98daf6cf27e1975b7` |
| `oak-leaves`         |                    3720×2790 |              3720×2790 |    5,671,146 | `71c0f2fb2fa89385955bca609cf9983d493137a81879005143606d0fa74d2802` |
| `gold-weight`        |                    2619×2338 |              2619×2338 |    3,330,155 | `575c3663c372bb43e7da86a253cd9cb3602211bc39e3756332ca682963beb351` |
| `rome-map`           |                    3400×2176 |              3400×2176 |    3,948,980 | `4f86a0ae3baa75bd29b690ef005e40029327824ec49f5241fd102e3a06126065` |

Each measured method has a fixed square output per source: 2728×2728, 2790×2790, 2338×2338, and 2176×2176 respectively. Crop coordinates below are the integer pixel rectangles used by `cropRaster`. Retention is the percentage of the annotated rectangle intersecting the crop. Offset is the annotated center's Euclidean distance from crop center in crop-width/crop-height units; it is descriptive, not a preference score.

| Fixture     | Method               | Crop `(x, y, width, height)` | Target retained | Center offset |
| ----------- | -------------------- | ---------------------------- | --------------: | ------------: |
| Dordogne    | Center               | `(684, 0, 2728, 2728)`       |          59.28% |        0.4627 |
| Dordogne    | Thirds               | `(1139, 0, 2728, 2728)`      |          18.91% |        0.6291 |
| Dordogne    | Approximate saliency | `(1360, 0, 2728, 2728)`      |           0.00% |        0.7101 |
| Oak leaves  | Center               | `(465, 0, 2790, 2790)`       |         100.00% |        0.0200 |
| Oak leaves  | Thirds               | `(930, 0, 2790, 2790)`       |          87.88% |        0.1679 |
| Oak leaves  | Approximate saliency | `(0, 0, 2790, 2790)`         |          87.88% |        0.1679 |
| Gold weight | Center               | `(141, 0, 2338, 2338)`       |         100.00% |        0.0000 |
| Gold weight | Thirds               | `(281, 0, 2338, 2338)`       |         100.00% |        0.0601 |
| Gold weight | Approximate saliency | `(31, 0, 2338, 2338)`        |         100.00% |        0.0470 |
| Rome map    | Center               | `(612, 0, 2176, 2176)`       |         100.00% |        0.0000 |
| Rome map    | Thirds               | `(975, 0, 2176, 2176)`       |         100.00% |        0.1667 |
| Rome map    | Approximate saliency | `(0, 0, 2176, 2176)`         |         100.00% |        0.2813 |

Every output's `outputRgbaSha256`, the exact floating-point crop rectangle, decoded and prepared RGBA input hashes, item-level metadata hash, and full-precision metric values are recorded per case in [`t27/results.json`](t27/results.json).

## Aggregate over these four annotations

| Method               | Mean target-box retention | Mean subject-center offset |
| -------------------- | ------------------------: | -------------------------: |
| Center               |                    89.82% |          0.1207 crop units |
| Rule of thirds       |                    76.70% |          0.2559 crop units |
| Approximate saliency |                    71.97% |          0.3016 crop units |

For these four selected boxes and this square crop, center placement retained the largest mean fraction. The difference is driven in part by the single left-foreground Dordogne annotation, which the two shifted placements mostly omit. All three methods retained the full annotated gold-weight and Rome-map regions. These outcomes describe only the chosen boxes and images; they do not show which composition viewers prefer or whether any crop looks better.

## Limits

- Four CC0 photographs/artworks and one manually drawn box per image are a tiny, subjective corpus. There is no independent annotator, user study, or visual-quality rating.
- The annotations evaluate only rectangular area retention and box-center offset. They do not test whether a method recognizes a semantic subject, preserves context, or produces a preferred composition.
- This measures one 1:1 target ratio. Other target ratios, content types, and user-selected focal points are unmeasured.
- The route's browser canvas sampling and its float-rectangle canvas resampling differ from the headless Lanczos3 preview and integer `cropRaster` output used for reproducible hashes. Crop-rectangle calculations use the same production engine functions as the route.
- No face-aware behavior, Tier 2 model comparison, or Tier 3 gap is established by this benchmark.

# P4-21 T81 adaptive-resize benchmark

**Result:** The protect-mask implementation now reserves one output sample for each protected source row and column, preserving the marked geometry exactly when the requested output can fit it. Across three generated 192×128 scenes retargeted to 128×128, all four protected subjects retained their original pixel count and bounding-box dimensions (1.000× area retention, 0% aspect change). Their mean horizontal centroid offset from uniform resize was 8.08 px, so protected subjects can still move as background coordinates are compressed. Before the fix, these same masks retained 0.5232× area and had 40.27% mean aspect change; see the preserved [pre-fix results](results-before-protection-fix.json).

## Fixture and measured controls

The fixture generator creates three deterministic scenes with a low-detail background and one or two textured, color-labeled rectangular subjects. Each has a generated subject-mask PNG, known subject bounds, generation parameters, and SHA-256 hashes in fixtures/manifest.json. No third-party images, model assets, or unregistered licenses are used.

The runner compares Lanczos resize, center crop, unmasked saliency retarget, and saliency retarget with every subject pixel protected. It checks output dimensions, opacity, and subject visibility. For each subject it records output pixel area, bounding box, aspect change, and centroid offset. These are geometry diagnostics, not a learned or human quality score.

The protected mapping projects the binary mask onto both source axes. Each marked source row and column receives exactly one output sample; remaining output samples are apportioned across unprotected coordinates by saliency with a deterministic largest-remainder rule. If the protected footprint cannot fit the target axis, or every source coordinate is protected while the target size changes, the function raises a RangeError with a remedy. A mask must contain exactly one value per source pixel.

## Aggregate results

| Method | Output geometry | Subjects detected | Mean output/input subject-pixel ratio | Mean absolute bbox aspect change | Mean absolute centroid offset |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lanczos3 resize | 3/3 | 4/4 | 0.6647× | 33.53% | 0.21 px |
| Center crop | 3/3 | 4/4 | 0.6800× | 32.00% | 7.17 px |
| Saliency retarget, no mask | 3/3 | 4/4 | 1.4720× | 19.29% | 7.67 px |
| Saliency retarget, subject mask | 3/3 | 4/4 | 1.0000× | 0.00% | 8.08 px |

The feasible protect-mask case now preserves each subject's measured dimensions exactly. This displaces more background content to satisfy the requested output size, and the subjects shift horizontally. The no-mask path has a better centroid score on this generated set and remains a different tradeoff.

## Per-scene review images

| Scene | Input | Annotation mask | Lanczos3 | Center crop | Retarget | Retarget with mask |
| --- | --- | --- | --- | --- | --- | --- |
| Centered subject | [PNG](fixtures/inputs/centered-subject-input.png) | [PNG](fixtures/inputs/centered-subject-mask.png) | [PNG](artifacts/centered-subject-lanczos3-resize.png) | [PNG](artifacts/centered-subject-center-crop.png) | [PNG](artifacts/centered-subject-saliency-retarget.png) | [PNG](artifacts/centered-subject-saliency-retarget-protect-mask.png) |
| Left subject | [PNG](fixtures/inputs/left-subject-input.png) | [PNG](fixtures/inputs/left-subject-mask.png) | [PNG](artifacts/left-subject-lanczos3-resize.png) | [PNG](artifacts/left-subject-center-crop.png) | [PNG](artifacts/left-subject-saliency-retarget.png) | [PNG](artifacts/left-subject-saliency-retarget-protect-mask.png) |
| Edge pair | [PNG](fixtures/inputs/edge-pair-input.png) | [PNG](fixtures/inputs/edge-pair-mask.png) | [PNG](artifacts/edge-pair-lanczos3-resize.png) | [PNG](artifacts/edge-pair-center-crop.png) | [PNG](artifacts/edge-pair-saliency-retarget.png) | [PNG](artifacts/edge-pair-saliency-retarget-protect-mask.png) |

Complete per-subject results, output hashes, fixture hashes, runtime details, and constraints are in results.json. The original protected-mask results and output images are preserved in results-before-protection-fix.json and artifacts-before-protection-fix/.

## Reproduction and limits

From the repository root:

    pnpm --filter @complianttools/image-engine build
    node packages/engine/bench/escalation/t81/generate-fixtures.mjs --verify
    node packages/engine/bench/escalation/t81/run.mjs

This evidence covers three artificial scenes, four annotated boxes, one aspect-ratio change, and 192×128 inputs. It cannot establish behavior on natural photographs, people, text, irregular masks, large images, or perceptual acceptability. There is no exact reference image for an ideal retargeted scene. Route-level STCC remains unverified.
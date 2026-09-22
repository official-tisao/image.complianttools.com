# P4-21 benchmark: T80 Colour Match

**Status:** The local colour-distribution behavior is measured on three self-generated synthetic cases. No model comparison is applicable: the current justification register identifies no model gap for colour matching. Product-level visual preference and route-level STCC remain open.

## Reproduce

From the repository root:

```powershell
pnpm --filter @complianttools/image-engine build
node packages/engine/bench/escalation/t80/run.mjs
pnpm --filter @complianttools/image-engine exec vitest run test/p4-03-colour-transfer.test.ts
```

The runner writes deterministic source, reference, no-op, Reinhard, and histogram-matched PNGs under [`t80/artifacts/`](t80/artifacts/) and measurements plus file/pixel hashes to [`t80/results.json`](t80/results.json). All inputs are generated from the recorded integer-coordinate recipe; no outside pixels are used. Source and target images deliberately have different dimensions, and target dimensions vary across cases.

## Metric and results

The metric is mean channel-wise normalized empirical-CDF distance (1D Wasserstein distance divided by 255) between the output and target color distributions. Lower values indicate closer global RGB distributions. It does not compare spatial structure or semantic image style.

| Method                      | Mean distribution distance | Median operation time | p95 operation time |
| --------------------------- | -------------------------: | --------------------: | -----------------: |
| Unchanged source            |                   0.065537 |             0.0004 ms |          0.0015 ms |
| Reinhard mean/std transfer  |                   0.014468 |             0.4678 ms |          2.3094 ms |
| Per-channel histogram match |                   0.002413 |             0.4838 ms |          3.0402 ms |

This run used Node.js 22 on Windows x64 / Intel Core i7-10750H. Each case had one untimed warm-up and nine timed method calls. Times cover the color-transfer operation only; generation, PNG encoding, file access, and metric calculation are excluded. The reports contain per-case samples and hashes.

Both methods brought the generated output distributions closer to their references than the no-op baseline in all three cases. Histogram matching was closest on this synthetic metric; this is not evidence that its visual composites are preferred. The generated cases contain controlled textures only, so they do not establish quality on photographs or human-selected style references.

## Correctness fixes surfaced by the fixtures

The tests and fixture pairs exposed two implementation defects. Reinhard transfer previously allocated target statistics with source dimensions and read only matching pixel indices; a smaller reference yielded invalid samples, and a larger reference was cropped implicitly. Its inverse opponent transform also did not invert the approximation used to create Lαβ values. Histogram matching compared raw cumulative counts and failed to normalize source and reference populations of different sizes.

The implementation now computes each image's statistics over its own dimensions, uses the corresponding inverse for the simplified transform, and maps normalized source CDF thresholds to reference values. Focused regression tests cover different image sizes and alpha preservation. This corrects distribution alignment behavior without adding a model or changing the route status.

## Limits and remaining gap

The benchmark measures global color distributions, not spatial preservation, perceptual similarity, user preference, photo consistency, or accessibility. It does not establish that an automatic color match is useful enough for a product route. Keep T80 local-only, record no Tier 3 candidate, and keep product-route STCC and real-image preference evidence open.

## Route verification

The focused T80 production-preview route suite passes 27/27 checks across Chromium, Firefox, and WebKit. It covers localized page rendering, a generated PNG pair, byte-identical preview/download, keyboard operation, Axe, no off-origin requests, typed file remedies, simulated decode and worker-construction failures, and cancellation with worker termination. This is interaction/error-path evidence only; it does not expand the synthetic quality corpus or establish browser-scale latency. Invalid-PNG, canvas-unavailable, and missing-image route errors, offline operation, representative photo quality/preference, and full STCC remain open.

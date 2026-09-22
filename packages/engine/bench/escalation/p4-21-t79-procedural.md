# P4-21 benchmark: T79 procedural generator

**Status:** Local outcome integrity and Node operation latency are measured for 15 generated cases. This is not a visual-quality comparison: generated artifacts are not ground-truth references. The deterministic local feature has no demonstrated model gap, so a Tier 3 model comparison is not applicable to its current scope.

## Scope and results

[`t79/run.mjs`](t79/run.mjs) calls five production engine operations at 128×128, 256×256, and 512×512 with fixed seeds: value noise, fBm, Worley noise, linear gradient, and radial gradient. The `/generate` route currently exposes fBm, value noise, and radial gradient; the benchmark also measures the linear-gradient and Worley engine operations.

For each operation/size/seed case, the runner performs one warm-up and seven measured calls. Fixed-seed RGBA SHA-256 matched across all seven runs for all 15 cases. The summary below pools the 21 timed samples per operation across its three sizes:

| Operation       | Sizes (px)    | Pooled median latency (ms) | Pooled p95 latency (ms) | RGBA repeatability        |
| --------------- | ------------- | -------------------------: | ----------------------: | ------------------------- |
| Value noise     | 128, 256, 512 |                    42.3808 |                140.4471 | All 3 cases deterministic |
| fBm             | 128, 256, 512 |                    40.9802 |                167.8039 | All 3 cases deterministic |
| Worley noise    | 128, 256, 512 |                    10.4063 |                 39.5785 | All 3 cases deterministic |
| Linear gradient | 128, 256, 512 |                     1.3975 |                  4.9906 | All 3 cases deterministic |
| Radial gradient | 128, 256, 512 |                     1.8111 |                  6.4302 | All 3 cases deterministic |

[`t79/results.json`](t79/results.json) records the per-case timing samples, dimensions, PNG bytes, PNG and RGBA SHA-256 values, and runtime environment. Reviewable PNG outputs are in [`t79/artifacts/`](t79/artifacts/). The runner SHA-256 is `c18e994aef34ae6211dfb1363986c2b024266173cea355e0308d38803e79bfc9`.

## Reproduction

From the repository root:

```sh
pnpm --filter @complianttools/image-engine build
node packages/engine/bench/escalation/t79/run.mjs
```

The recorded environment was Node.js 22.22.0 on Windows x64 with an Intel Core i7-10750H CPU. Timing measures only each synchronous generation operation; it excludes browser rendering, PNG encoding, perceived responsiveness, and UI interaction. These latency values describe this recorded run and can vary with host load; hashes are deterministic, but performance is not. Percentiles are pooled across sizes and are not browser performance budgets.

## Limits and disposition

The benchmark measures deterministic output integrity and local operation latency, not whether users prefer the generated patterns or consider them visually useful. It contains no quality-reference images and makes no broader visual-quality claim. T79 remains local-only; the current evidence establishes no model gap. Browser latency and user preference remain unmeasured.

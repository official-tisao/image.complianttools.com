# T79 procedural generator benchmark

This benchmark checks deterministic output integrity and Node operation latency for five procedural generation primitives at 128×128, 256×256, and 512×512. Every output is generated from a fixed seed by the production image engine; no external image assets or quality-reference images are used.

## Reproduce

From the repository root:

```sh
pnpm --filter @complianttools/image-engine build
node packages/engine/bench/escalation/t79/run.mjs
```

The runner performs one warm-up and seven measured calls for each of 15 fixed operation/size/seed cases. It stores a PNG per case and records dimensions, PNG byte count, PNG SHA-256, decoded RGBA SHA-256, repeated-run determinism, timing samples, and environment in [`results.json`](results.json). The runner's recorded SHA-256 is `c18e994aef34ae6211dfb1363986c2b024266173cea355e0308d38803e79bfc9`.

## Recorded summary

| Operation | Sizes | Median latency (ms) | Pooled p95 (ms) | Repeated RGBA output |
| --- | --- | ---: | ---: | --- |
| Value noise | 128, 256, 512 | 42.3808 | 140.4471 | Deterministic in all 3 cases |
| fBm | 128, 256, 512 | 40.9802 | 167.8039 | Deterministic in all 3 cases |
| Worley noise | 128, 256, 512 | 10.4063 | 39.5785 | Deterministic in all 3 cases |
| Linear gradient | 128, 256, 512 | 1.3975 | 4.9906 | Deterministic in all 3 cases |
| Radial gradient | 128, 256, 512 | 1.8111 | 6.4302 | Deterministic in all 3 cases |

Percentiles use all 21 measured samples per operation (three sizes × seven runs). This is a pooled summary, not a per-size browser performance result.

Environment: Node v22.22.0, win32/x64, Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz. Results measure only the synchronous generation operation in Node. They do not measure browser rendering, encoding, perceived responsiveness, visual quality, or user preference, and should not be generalized to other machines.

The PNG files in [`artifacts/`](artifacts/) are generated outputs, not ground-truth references. `results.json` contains the full per-case hashes and all latency samples. T79 remains a deterministic local feature with no demonstrated AI/model gap; no model comparison is applicable to this scope.

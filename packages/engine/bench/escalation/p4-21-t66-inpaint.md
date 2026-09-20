# P4-21 benchmark: T66 inpaint / object removal

**Status:** Initial self-generated comparison measured for five local methods on three small synthetic scenes. Real-image quality, larger or irregular masks, and structural reconstruction remain unmeasured.

## Method comparison

The repeatable benchmark is [`t66/run.mjs`](t66/run.mjs); raw results, per-scene metrics, runtime samples, and all image hashes and dimensions are in [`t66/results.json`](t66/results.json). It calls the exported `removeObject` controller with the same 8×8 opaque-magenta mask for every method. The 48×48 reference scenes are generated deterministically in code, and each exact pre-occlusion patch is retained as ground truth. No third-party image or model assets are used.

| Method              | Mean ROI PSNR (RGB) | Mean ROI SSIM | Median latency | p95 latency |
| ------------------- | ------------------: | ------------: | -------------: | ----------: |
| Telea               |          19.9944 dB |      0.678207 |       1.739 ms |    3.789 ms |
| Navier–Stokes       |          13.8012 dB |      0.384905 |       0.347 ms |    1.625 ms |
| Confidence-priority |           5.5982 dB |      0.251969 |       4.371 ms |    6.520 ms |
| Efros–Leung         |          20.0959 dB |      0.608839 |      40.967 ms |   50.660 ms |
| Quilting            |          14.3052 dB |      0.331379 |      29.685 ms |   35.402 ms |

The result has no single winner across these simple synthetic textures: Efros–Leung has the highest mean ROI PSNR, while Telea has the highest mean ROI SSIM. Navier–Stokes is quickest here but scores lower on both quality metrics. The labels identify repository implementations; this benchmark does not independently validate conformance to the named academic algorithms.

## Fixtures and measurements

| Generated scene |  Telea PSNR / SSIM | Navier–Stokes PSNR / SSIM | Confidence-priority PSNR / SSIM | Efros–Leung PSNR / SSIM | Quilting PSNR / SSIM |
| --------------- | -----------------: | ------------------------: | ------------------------------: | ----------------------: | -------------------: |
| Woven lattice   | 17.1905 / 0.573947 |        15.6674 / 0.450161 |               6.7774 / 0.367532 |      23.4961 / 0.865673 |   16.1078 / 0.500150 |
| Crossing bands  | 18.4435 / 0.636678 |        14.6844 / 0.465012 |               6.2203 / 0.228429 |      16.9756 / 0.429174 |   12.0311 / 0.069767 |
| Seeded cloud    | 24.3491 / 0.823995 |        11.0518 / 0.239541 |               3.7969 / 0.159947 |      19.8159 / 0.531669 |   14.7768 / 0.424220 |

Measurements used one warmup and five timed calls per scene and method in Node.js 22.22.0, Windows x64, Intel Core i7-10750H. Timing covers only `removeObject`; PNG encoding, metrics, and fixture generation are excluded. Aggregate p95 uses nearest-rank over 15 calls per method. PSNR is computed strictly inside the 64 masked pixels. SSIM averages 7×7 Gaussian-window local scores at those masked-pixel centers; each window also samples neighboring known pixels for context. The complete generator descriptions, exact PNG and RGBA SHA-256 hashes, raw mask hash, runtime metadata, individual timing samples, and formulas are recorded in `results.json`.

## Reviewable output samples

Each artifact below is one of the exact lossless PNGs whose dimensions and PNG/RGBA hashes are recorded in [`t66/results.json`](t66/results.json).

| Scene          | Exact reference                                                      | Masked input                                                                  | Telea                                                                  | Efros–Leung                                                                        |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Woven lattice  | ![Woven-lattice target](t66/artifacts/woven-lattice-reference.png)   | ![Woven-lattice masked input](t66/artifacts/woven-lattice-masked-input.png)   | ![Woven-lattice Telea result](t66/artifacts/woven-lattice-telea.png)   | ![Woven-lattice Efros–Leung result](t66/artifacts/woven-lattice-efros-leung.png)   |
| Crossing bands | ![Crossing-bands target](t66/artifacts/crossing-bands-reference.png) | ![Crossing-bands masked input](t66/artifacts/crossing-bands-masked-input.png) | ![Crossing-bands Telea result](t66/artifacts/crossing-bands-telea.png) | ![Crossing-bands Efros–Leung result](t66/artifacts/crossing-bands-efros-leung.png) |
| Seeded cloud   | ![Seeded-cloud target](t66/artifacts/seeded-cloud-reference.png)     | ![Seeded-cloud masked input](t66/artifacts/seeded-cloud-masked-input.png)     | ![Seeded-cloud Telea result](t66/artifacts/seeded-cloud-telea.png)     | ![Seeded-cloud Efros–Leung result](t66/artifacts/seeded-cloud-efros-leung.png)     |

## Shortfall

This is a narrow functional comparison: three 48×48 generated textures, one centered rectangular 8×8 mask, and no photographs, edge-touching masks, varied object shapes, or large fills. It cannot establish removal quality on real images or determine whether any method can reconstruct missing structure. The next useful evidence is a broader compliant corpus with varied masks and target classes, then a separate evaluation of larger structural gaps. Keep model-dependent comparisons open until their exact assets are approved and run through the intended runtime on the same fixtures.

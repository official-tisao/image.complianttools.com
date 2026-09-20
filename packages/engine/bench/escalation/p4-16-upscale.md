# P4-16 upscale model status

## Checkpoint register

The owner explicitly directs the project to use the upstream BSD-3 label for these exact official release `.pth` files and accepts the associated asset-level terms risk. This records the project decision; it does not claim that the upstream release attaches a separate model-specific licence statement to each binary. Community fine-tunes remain excluded.

| Model | Official release | Size (bytes) | SHA-256 | Owner-directed label |
| --- | --- | ---: | --- | --- |
| `RealESRGAN_x4plus.pth` | `v0.1.0` | 67,040,989 | `4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1` | BSD-3-Clause |
| `RealESRGAN_x2plus.pth` | `v0.2.1` | 67,061,725 | `49fafd45f8fd7aa8d31ab2a22d14d91b536c34494a5cfe31eb5d89c2fa266abb` | BSD-3-Clause |

The machine-readable source URLs, release references, architecture, and accepted-risk statement are in [`docs/model-assets.json`](../../../../docs/model-assets.json). [`scripts/fetch-realesrgan-source-weights.mjs`](../../../../scripts/fetch-realesrgan-source-weights.mjs) downloads only to an OS temporary directory and checks the registered byte sizes and hashes. Both source files have passed that check.

## Measured results and remaining gate

The Tier 1 measurements and four-fixture x2 Real-ESRGAN comparison are documented in [`p4-21-t32-upscale.md`](p4-21-t32-upscale.md). On the clean synthetic Lanczos-downscale pairs, mean PSNR/SSIM were 26.6370 dB / 0.765509 for the x2 model, 29.6861 dB / 0.827896 for DCCI, and 30.7267 dB / 0.858497 for Lanczos3. The model did not improve this ordinary interpolation task; its benefit on genuinely degraded photographs remains unmeasured.

Both exact checkpoints were converted to dynamic-spatial ONNX, passed ONNX validation and CPU parity against PyTorch on two deterministic shapes each, and have output hashes in [`conversion/cpu-parity-report.json`](t32/conversion/cpu-parity-report.json). Both models passed a tiny-input Chromium 151 WASM smoke with the model and ORT WASM served from the same origin: x2 produced `1x3x16x24`, and x4 produced `1x3x32x48` from `1x3x8x12`. The x4 smoke's inference took 5.20 seconds for that tiny input; all 4,608 output values were finite. This confirms browser loading, execution, and output shape, not useful-image performance. The smoke used a caller-supplied temporary ONNX file; neither the `.pth` source nor converted ONNX is bundled in the app. x2 fixture output hashes and metrics are in [`t32/model-results.json`](t32/model-results.json). CPU latency is recorded separately from the Node.js Tier 1 timing because the runtime and measurement boundaries differ. A representative degraded-photo corpus, x4 quality comparison, browser performance on useful image sizes, and product model hosting/download flow remain open; do not claim the model closes the T32 gap until those are measured.

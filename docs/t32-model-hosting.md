# T32 model hosting and browser delivery

**Status:** the opt-in browser delivery path is implemented. The selected public Hugging Face repository is controlled by a third party, so long-term production availability has not been established. The deployer can replace each model URL and can configure an optional fallback without rebuilding the application image.

## Pinned model files

The browser accepts only the exact bytes registered in [`model-assets.json`](model-assets.json). Both files use the same immutable Hugging Face revision:
`d14119a40dfeef208e4e724dfaceb2640d2df95b`.

| Variant | File                     |             Size | SHA-256                                                            | Current default URL                                                                                                                                  |
| ------- | ------------------------ | ---------------: | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| x2      | `RealESRGAN_x2plus.onnx` | 67,156,218 bytes | `35d016524a6eb7e9a99f192cfa81b6cf1f80fdf8f1b51605d77f0763f5ccba7f` | [Pinned x2 export](https://huggingface.co/fernandotonon/QtMeshEditor-models/resolve/d14119a40dfeef208e4e724dfaceb2640d2df95b/RealESRGAN_x2plus.onnx) |
| x4      | `RealESRGAN_x4plus.onnx` | 67,132,609 bytes | `c999e5e3365a23cda6d627c407005076c160f420d6b122a0ef7c9d4210aee96a` | [Pinned x4 export](https://huggingface.co/fernandotonon/QtMeshEditor-models/resolve/d14119a40dfeef208e4e724dfaceb2640d2df95b/RealESRGAN_x4plus.onnx) |

The current default URL is under `fernandotonon/QtMeshEditor-models`. The project does not control that account or guarantee that its repository will remain available. The selected ONNX files carry a publisher-declared BSD-3-Clause label on the dedicated [Real-ESRGAN ONNX model card](https://huggingface.co/fernandotonon/QtMeshEditor-realesrgan-onnx/blob/766bac4b35aaeefe85a065ece8ee2f827b1314d8/README.md). That is distinct from the project owner's explicit decision to accept the BSD-3 label for the exact upstream `.pth` checkpoints; the latter is not an upstream per-file license statement.

## Runtime URL configuration

`deploy/t32-runtime-config.sh` writes a small JSON file containing the primary and fallback URLs. It writes no model data. Each URL can be changed independently at container runtime:

| Environment variable         | Default                                         |
| ---------------------------- | ----------------------------------------------- |
| `T32_ESRGAN_X2_URL`          | Pinned x2 URL at the revision above             |
| `T32_ESRGAN_X2_FALLBACK_URL` | Empty                                           |
| `T32_ESRGAN_X4_URL`          | Pinned x4 URL at the revision above             |
| `T32_ESRGAN_X4_FALLBACK_URL` | Empty                                           |
| `T32_RUNTIME_CONFIG_PATH`    | `/usr/share/nginx/html/t32-runtime-config.json` |

Use a stable, immutable URL controlled by the deployer for production when available. A substitute must serve the registered filename's exact byte sequence and be fetchable from the browser: use HTTPS or the app's own origin, and allow the deployed app origin through CORS for a cross-origin host. The browser rejects a file whose byte count or SHA-256 differs from the register. Changing an environment URL cannot authorize different model bytes.

The route attempts the configured fallback when the primary host returns HTTP 403 or the browser cannot reach it because of a network/CORS failure. The fallback is optional and empty by default. A failed or invalid download leaves Tier 1 available.

## What users' devices download

The Tier 1 DCCI/NEDI path works without fetching either model. A user must explicitly choose the experimental Tier 2 control to load or fetch the selected model. The page discloses its size and shows byte progress; the user can cancel. After transfer, the browser checks the registered size and SHA-256, stores the verified bytes in IndexedDB, and runs a small runtime inference probe before enabling model-based processing. The model is stored in the browser's site storage; this is not a file saved to the user's Downloads folder.

The ONNX files are not copied into the Git repository, the static site bundle, or the Docker image. The container only emits runtime URLs; it does not contact Hugging Face or download model files. The browser contacts the selected model host only after the user chooses Tier 2. `onnxruntime-web` is pinned in the package manifest and runs on the user's device.

## Evidence and remaining delivery checks

The model register records exact file hashes, conversion parity, current-host full-byte/CORS checks, and Chromium WASM inference smokes. These checks establish that the pinned files were retrievable and usable from the tested browser at that time; they do not promise future host availability or validate a production deployment origin.

Fresh-preview Chromium route E2E covers primary HTTP 403 followed by an unavailable fallback, with Tier 1 still usable. It streams the verified registered x2 bytes through a local test fixture, verifies browser-side progress and size/SHA-256 checks, runs actual x2 inference on a 3×2 PNG with a 6×4 output, and confirms IndexedDB reuse after reload while the model host returns unavailable. A separate route E2E runs the registered x4 model on a 3×2 PNG and verifies the 12×8 output. The x2 checks also reject same-size hash corruption without using the fallback and confirm a cancelled partial transfer is not cached. These verify delivery plumbing and inference, not the production host's longevity, a fully offline app-shell/worker start, representative photo quality, or the full P4-20 STCC.

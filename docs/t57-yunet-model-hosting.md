# T57 YuNet model delivery

## Registered model

T57's optional face-region suggestions use OpenCV Zoo's `face_detection_yunet_2023mar.onnx` file from commit `47534e27c9851bb1128ccc0102f1145e27f23f98`. The exact 232,589-byte model has SHA-256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`. The upstream model directory states that all files in that directory are MIT-licensed. The file, license evidence, immutable revision, size, and digest are recorded in [`model-assets.json`](model-assets.json).

The GitHub `blob` page is an HTML page, and `raw.githubusercontent.com` returns the 131-byte Git LFS pointer for this file. The pinned default therefore uses GitHub's LFS media endpoint, which was verified to serve the registered model bytes with CORS enabled:

`https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/face_detection_yunet_2023mar.onnx`

## Runtime host override

Set `T57_YUNET_MODEL_URL` in the web container environment to change the delivery URL without rebuilding the image. The value may point to a project-controlled static host in the future. A replacement must serve the exact registered bytes, support browser CORS when hosted off-origin, and use HTTPS or the application origin. The browser still checks the registered byte count and SHA-256; changing the URL does not authorize different model content.

The Docker entrypoint writes the configured URL into `/t32-runtime-config.json`; it does not fetch or store the model. The model is outside Git, the static bundle, and the container image. The Docker validation job checks that the runtime environment value reaches the served configuration.

## Browser behavior and limits

The route does not fetch the model during page load. The user must request face suggestions; the browser then downloads and verifies the model, keeps a verified copy in IndexedDB where available, and runs inference locally. The source image is not sent to the model host. Manual region drawing remains available.

Detected regions are suggestions that must be reviewed and corrected before export. A missed face remains visible unless the user adds a region. The synthetic, in-repository CC0 fixture suite checks deterministic functional behavior and box mapping; it does not establish real-photo accuracy or safe coverage for every person, pose, lighting condition, or camera.

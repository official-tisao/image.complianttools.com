# P4-21 benchmark: T57 face-region suggestions

**Status: measured on the selected synthetic CC0 fixture suite.** This report checks the approved
YuNet adapter and T57 region-coordinate path. It does not estimate detection accuracy on real photos.

## Corpus and model

The corpus is three deterministic, project-generated PNGs released under CC0 1.0 Universal. The
manifest records the exact image dimensions, PNG and decoded-pixel SHA-256 hashes, generator hash,
and five exact visible-face boxes. The cases cover one centered face, two different-sized faces,
one face clipped at the image edge, and one small face. See [`the corpus README`](t57/README.md),
[`fixture manifest`](t57/fixtures/manifest.json), and [`CC0 dedication`](t57/LICENSE.txt).

The model is OpenCV Zoo YuNet `face_detection_yunet_2023mar.onnx` from commit
`47534e27c9851bb1128ccc0102f1145e27f23f98`, registered at 232,589 bytes with SHA-256
`8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`. Its model-directory README
states MIT terms. The browser downloaded the model only after the explicit suggestion action and
validated the registered size and digest. The source image remains local.

## Measurement

The real-browser smoke opens `/blur-face`, uploads each exact fixture, requests suggestions, and
matches predicted boxes one-to-one against the manifest at IoU ≥ 0.50. In the recorded Chromium
151 run, the model returned 5 true positives, 0 false positives, and 0 false negatives across the
five synthetic boxes. Individual IoUs were:

| Fixture           | Annotated faces | TP / FP / FN | IoU for matched boxes |
| ----------------- | --------------: | ------------ | --------------------- |
| `single-centered` |               1 | 1 / 0 / 0    | 0.8615                |
| `two-faces`       |               2 | 2 / 0 / 0    | 0.8218, 0.7836        |
| `edge-and-small`  |               2 | 2 / 0 / 0    | 0.7575, 0.8830        |

The latest repeat took 2,408 ms for the first fixture action, including the one model transfer and
runtime startup; the next two same-session actions took 405 ms and 342 ms. The runner was Chromium 151.0.7922.34,
Node.js 22.22.0, Windows x64, Intel Core i7-10750H at 2.60 GHz. These tiny-fixture timings are
functional smoke observations, not a representative performance benchmark. The complete machine-readable
record, including browser, runner, exact boxes, predictions, response status, and timing, is
[`browser-smoke-results.json`](t57/browser-smoke-results.json). Reproduce against a built preview
with:

```sh
T57_BASE_URL=http://127.0.0.1:4174 node packages/engine/bench/escalation/t57/browser-smoke.mjs
```

Regenerate and verify fixture bytes with `node packages/engine/bench/escalation/t57/generate-fixtures.mjs`
and `node packages/engine/bench/escalation/t57/generate-fixtures.mjs --verify` respectively.

## What the result establishes

The selected synthetic cases exercise model loading, integrity verification, browser inference,
multiple-box ordering, mapping to image coordinates, and edge/small-region behavior. The results
are limited to these generated front-facing geometric drawings. They do not establish real-photo
precision/recall, performance across people or demographics, pose/lighting/occlusion coverage,
plate detection, or safe automatic redaction. Suggestions require review; missed regions remain
unblurred unless the user adds them. Manual marking remains available without downloading the
model. Route-level STCC remains open.

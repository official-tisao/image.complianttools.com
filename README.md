3670	| `@jsquash/webp` 1.5.0 → libwebp | **Apache-2.0 wrapper + BSD-3 codec portion — verified 2026-08-18** | WebP codec |
3671	| `@jsquash/jxl` 1.3.0 → libjxl | **Apache-2.0 wrapper + BSD-3 codec portion — verified 2026-08-18** | JPEG XL codec + butteraugli |
3672	| `utif` 3.1.0 (UTIF.js) | **MIT — verified 2026-08-18** | TIFF decode/encode. Upstream `photopea/UTIF.js`; the `utif2` fork was rejected in favour of the canonical package |
3673	| `gifuct-js` 2.1.2 | **MIT — verified 2026-08-18** | GIF decode |
3674	| `parse-exr` 1.0.2 | **MIT — verified 2026-08-18** | OpenEXR decode; ESM parser with bundled types, depends only on allowlisted `fflate` 0.8.3 |
3675	| `imagetracerjs` 1.2.6 | **Unlicense — verified 2026-08-19** | Browser-local raster-to-SVG vectorization; no runtime network access |
3676	| `@resvg/resvg-wasm` 2.6.2 | **MPL-2.0 — verified 2026-08-19** | Browser-local SVG rasterization. We use the upstream package unmodified through a local wrapper; its WASM only loads after an SVG is selected |
3677	| `pdfjs-dist` 5.4.624 | **Apache-2.0 — verified 2026-08-19** | Browser-local PDF page rendering with a bundled local worker; no document content is sent to a service |
3678	| `pdf-lib` 1.17.1 | **MIT — verified 2026-08-19** | Browser-local PDF creation for image-to-PDF output; generated documents remain on the device |
3679	| `mp4box` 2.4.1 | **BSD-3-Clause — verified 2026-08-19** | Browser-local MP4 container demuxing before WebCodecs decoding; no bundled video codec |
3680	| `mediabunny` 1.25.1 | **MPL-2.0 — verified 2026-08-19** | Browser-local MP4 and WebM container reading over platform WebCodecs; its TypeScript source is used unmodified and no media is uploaded |
3681	| `ag-psd` 31.0.2 | **MIT — verified 2026-08-19** | Browser-local PSD/PSB read and write; no upload or external service |
3682	| `dxf-parser` 1.1.2, transitive `loglevel` 1.9.2 | **MIT — verified 2026-08-22** | Browser-local DXF parsing; both installed manifests and bundled MIT licence files verified |
3683	| `onnxruntime-web` 1.30.0 | **MIT — verified 2026-09-19** | Lazy browser ONNX inference. WebGPU is attempted when available, with WASM fallback; the model loader must obtain consent and provide a same-origin cached model URL or bytes |
3684	| `tesseract.js` 7.0.0 | **Apache-2.0 — verified 2026-09-19** | Browser-local OCR engine; package and transitive dependencies are pinned and checked by `verify:licenses`. Language data is registered separately as model assets |
3685	| `pako` 1.0.11 | **MIT AND Zlib — verified 2026-08-18** | Deflate, pulled in by `utif`. Both terms of the conjunction are allowlisted |
3686	| `heic2any` 0.0.4 | **MIT — verified 2026-08-20** | HEIC/HEIF to PNG/JPEG/GIF conversion. Client-side browser-only implementation with no network access. |
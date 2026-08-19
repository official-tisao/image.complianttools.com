# ADR: IP clearance baseline

- **Status:** Active
- **Date:** 2026-08-09
- **Scope:** README §25.3

## Decision rule

An item without an affirmative recorded decision is excluded from shipping. “Awaiting counsel” is not
approval: the named fallback ships and the questioned implementation remains off. Dependency and asset
approval applies only to the exact version/hash verified by the automated registers.

This is an engineering screening record, not a freedom-to-operate opinion or legal advice.

## Copyleft dependency substitutions

| Item                                       | Decision | Shipping implementation                                 |
| ------------------------------------------ | -------- | ------------------------------------------------------- |
| `wasm-vips` / libvips                      | Excluded | Narrow permissive codecs and in-house operations        |
| `gifsicle`                                 | Excluded | In-house GIF encoder/optimizer                          |
| `libheif` / x265                           | Excluded | Platform HEIC decode only; no HEIC encode               |
| LibRaw                                     | Excluded | Embedded-preview extraction, then in-house DNG pipeline |
| Ghostscript                                | Excluded | EPS preview extraction and bounded PostScript subset    |
| Potrace                                    | Excluded | Posterize and in-house contour tracing                  |
| `ffmpeg.wasm`                              | Excluded | WebCodecs and small permissive demuxers                 |
| xBRZ / HQx / Scale2x code                  | Excluded | Independently designed pixel-art rules                  |
| `@imgly/background-removal` / RMBG weights | Excluded | Separately cleared runtime and weights only             |

## Algorithms and formats

| Item                                          | Decision                                 | Shipping fallback or constraint                                        |
| --------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| PatchMatch                                    | Excluded                                 | Exemplar synthesis from older prior art                                |
| Seam carving                                  | Excluded                                 | Saliency-weighted continuous warp                                      |
| Guided filter                                 | Excluded                                 | Joint bilateral filter plus alpha-band refinement                      |
| Dark-channel-prior dehaze                     | Excluded                                 | Retinex/MSRCR and local tone mapping                                   |
| Non-local means                               | Awaiting counsel; fallback shipping      | Bilateral and BayesShrink only                                         |
| Criminisi inpainting                          | Design around                            | Efros–Leung plus quilting with independent priority design             |
| GrabCut                                       | Awaiting counsel; fallback shipping      | Colour range, watershed, and independent iterative colour models       |
| Poisson blending                              | Awaiting counsel; fallback shipping      | Laplacian-pyramid blending                                             |
| Closed-form matting                           | Awaiting counsel; fallback shipping      | Joint-bilateral alpha refinement                                       |
| Simplex noise                                 | Excluded                                 | OpenSimplex2                                                           |
| LZW, S3TC/DXT, baseline JPEG/PNG/GIF/BMP/TIFF | Approved as expired/clear                | Implement against published formats                                    |
| WebP/VP8 and JPEG XL                          | Approved with upstream grants            | Use pinned permissive implementations                                  |
| AV1/AVIF                                      | Approved with dispute disclosed          | Use pinned AOMedia implementation; do not call patent position settled |
| HEVC/HEIC                                     | Encode excluded                          | Platform decode only                                                   |
| QR Code                                       | Approved with stated standard constraint | In-house ISO/IEC 18004 encoder or cleared MIT dependency               |

## Trademark and asset substitutions

| Item                          | Decision                            | Shipping name/asset                                             |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| Third-party filter names      | Excluded and lint-blocked           | Original descriptive preset names                               |
| Polaroid                      | Excluded and lint-blocked           | “Instant print”                                                 |
| Impact font                   | Excluded and lint-blocked           | Anton after exact font asset verification                       |
| Third-party meme templates    | Excluded                            | User upload or registered CC0 assets                            |
| Platform emoji fonts          | Excluded                            | Registered Noto Emoji asset only                                |
| Magic Eraser/Edit/Expand/Wand | Excluded and lint-blocked           | Remove Object, Prompt Edit, Expand Image, Similar-Colour Select |
| Content-Aware Fill            | Excluded and lint-blocked           | Exemplar Fill                                                   |
| Adobe RGB profile             | Excluded                            | Generated compatible profile from published chromaticities      |
| Vendor ICC profiles           | Excluded                            | Synthesized profiles                                            |
| Branded device frames         | Excluded                            | Generic non-branded frames                                      |
| Social-platform preset names  | Awaiting counsel; fallback shipping | Generic “Square 1080”, “Story 1080×1920”, etc.                  |

## Positive dependency register

Every item below remains **excluded until its exact version appears in `pnpm-lock.yaml` and passes
`pnpm verify:licenses`**. This is the explicit fallback decision required while P0-08 is incomplete.

| README item                                      | Provisional disposition before pinning                                                                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte, SvelteKit, Vite                          | Svelte 5.56.8 approved; SvelteKit and Vite remain excluded until pinned                                                                                                                                                                                                          |
| TypeScript, Vitest, Playwright, ESLint, Prettier | Only versions in the generated register approved; Vitest 4.1.10 and Playwright 1.62.1 verified 2026-08-09                                                                                                                                                                        |
| Tailwind CSS                                     | Tailwind CSS 4.3.3 approved (MIT, verified 2026-08-09)                                                                                                                                                                                                                           |
| `bits-ui`                                        | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `lucide-svelte`                                  | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `zod`                                            | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `fast-check`                                     | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `@inlang/paraglide-js`                           | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `@jsquash/jpeg`                                  | Approved at 1.6.0: Apache-2.0 wrapper; IJG, BSD-3, and Zlib apply by portion to bundled MozJPEG. IJG attribution is build-enforced                                                                                                                                               |
| `@jsquash/png`, `@jsquash/oxipng`                | Approved at 3.1.1 and 2.3.0; wrapper and bundled codec licence files verified                                                                                                                                                                                                    |
| `@jsquash/webp`                                  | Approved at 1.5.0; Apache-2.0 wrapper and BSD-3 bundled codec portion verified                                                                                                                                                                                                   |
| `@jsquash/avif`                                  | Approved at 2.1.1; Apache-2.0 wrapper and BSD-2 bundled codec portion verified 2026-08-18                                                                                                                                                                                        |
| `@jsquash/jxl`                                   | Approved at 1.3.0; Apache-2.0 wrapper and BSD-3 bundled codec portion verified 2026-08-18                                                                                                                                                                                        |
| `@jsquash/resize`, `pica`                        | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `UTIF.js`                                        | Approved as npm `utif` 3.1.0; MIT verified 2026-08-18. Canonical `photopea/UTIF.js`; the third-party `utif2` fork was rejected on supply-chain grounds. Pulls `pako` 1.0.11 (MIT AND Zlib — both terms allowlisted)                                                              |
| `tinyexr`                                        | **Deferred, not excluded on licence.** Upstream is BSD-3 and would clear, but no npm/WASM distribution exists — it is a C++ single-header library. Adopting it requires vendoring source and owning a WASM build (P2-04a). OpenEXR reported unsupported until then               |
| `parse-exr`                                      | Approved at 1.0.2: MIT verified from the installed package and npm metadata 2026-08-18. Browser-native ESM OpenEXR decoder; depends only on already-approved `fflate` 0.8.3. Replaces the immediate need to vendor tinyexr.                                                      |
| OpenJPEG                                         | **Excluded as distributed.** npm `openjpeg` 0.2.3 publishes **no licence field**, which this gate denies by rule, and is an unaffiliated personal fork. Upstream OpenJPEG is BSD-2 and would clear via a vendored WASM build (P2-04a). JPEG 2000 reported unsupported until then |
| `gifuct-js`                                      | Approved at 2.1.2; MIT verified 2026-08-18                                                                                                                                                                                                                                       |
| `imagetracerjs`                                  | Approved at 1.2.6; Unlicense verified from npm metadata and installed package 2026-08-19. Browser-local raster-to-SVG tracing; no network runtime.                                                                                                                               |
| `mp4box.js`                                      | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `pdfjs-dist`                                     | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `pdf-lib` 1.17.1                                 | Approved — MIT verified 2026-08-19; browser-local PDF creation for image-to-PDF output                                                                                                                                                                                           |
| `mp4box` 2.4.1                                   | Approved — BSD-3-Clause verified from the installed package manifest 2026-08-19; browser-local MP4 demuxing for WebCodecs, with no bundled codec                                                                                                                                 |
| `ag-psd`                                         | Approved at 31.0.2 — MIT verified from the installed package manifest and npm metadata 2026-08-19; browser-local PSD/PSB read and write. Its `base64-js` and `pako` transitives are covered by the dependency licence gate.                                                      |
| `@resvg/resvg-wasm` 2.6.2                        | Approved — MPL-2.0 verified 2026-08-19. The upstream renderer and WASM binary are used unmodified behind our local SVG safety wrapper; any modification to MPL-covered source would require publishing that source.                                                              |
| `libarchive.js`                                  | Excluded until pinned and RAR provenance is verified; CBZ-only fallback                                                                                                                                                                                                          |
| `dxf-parser`                                     | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| OpenCV                                           | Excluded until pinned and verified; algorithm review remains separate                                                                                                                                                                                                            |
| `onnxruntime-web`                                | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `tesseract.js`                                   | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `@mediapipe/tasks-vision`                        | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `exifr`                                          | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `piexifjs`                                       | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `fflate`                                         | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| `culori`                                         | Excluded until pinned and verified                                                                                                                                                                                                                                               |
| Inter, JetBrains Mono, Anton                     | Excluded until exact font hashes and OFL conditions are registered                                                                                                                                                                                                               |
| Noto Emoji                                       | Excluded until exact font hash and OFL conditions are registered                                                                                                                                                                                                                 |

## Model and data assets

| Item                    | Decision                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Tesseract language data | Excluded until every exact file hash and per-language licence is registered                    |
| MediaPipe `.task` files | Excluded until exact model-card terms and hashes are registered                                |
| Segmentation weights    | RMBG-1.4 denied; all alternatives excluded until exact weight terms and hashes are registered  |
| Real-ESRGAN weights     | Community fine-tunes excluded; original weights excluded until exact release/hash verification |
| OpenSimplex2            | Excluded until the exact source revision/public-domain statement is registered                 |
| Fixture corpus          | Only self-generated or individually registered CC0 fixtures allowed                            |

## Formerly open items

| Item                                       | Decision                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| DjVu                                       | Dropped; report unsupported because no permissive decoder is approved                           |
| Twemoji                                    | Not shipped; official graphics are CC-BY 4.0, so use Noto Emoji after OFL asset verification    |
| `libarchive.js` RAR path                   | CBR disabled until the pinned implementation is proven independent of restricted `unrar` source |
| GrabCut, Poisson, closed-form matting, NLM | Awaiting counsel; named fallbacks above are the only shipping paths                             |
| Social-platform names                      | Awaiting counsel; generic dimension names ship                                                  |
| General FTO                                | Not performed; disclose this limitation, do not imply a guarantee                               |

## Sources checked

- [Noto Emoji](https://github.com/googlefonts/noto-emoji) identifies the font library as OFL-1.1.
- [Twemoji](https://github.com/twitter/twemoji) identifies its code as MIT and graphics as CC-BY 4.0.
- [libarchive](https://github.com/libarchive/libarchive) is the upstream whose exact pinned RAR path must be reviewed before enabling CBR.
- README §25.3 remains the project’s screening rationale; automated dependency and asset registers are the authority for shipped bytes.

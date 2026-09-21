# image.complianttools.com — Master Build Specification

> **Status:** Greenfield. This repository is empty apart from this file.
> **Audience:** An autonomous coding agent (or human team) implementing the product end to end.
> **Contract:** Everything needed to build, verify, and ship is in this document. Where a fact must be
> re-verified against a live third‑party API, the section is marked **⚠ VERIFY** with the exact
> verification step. Do not invent API shapes; verify then implement.

---

## Table of contents

1. [Product thesis](#1-product-thesis)
2. [Non-negotiable principles](#2-non-negotiable-principles)
3. [Competitive feature union](#3-competitive-feature-union)
4. [Complete tool catalog](#4-complete-tool-catalog)
5. [Format support matrix](#5-format-support-matrix)
6. [Exhaustive option reference](#6-exhaustive-option-reference)
7. [Technology decisions](#7-technology-decisions)
8. [Architecture](#8-architecture)
9. [Repository layout](#9-repository-layout)
10. [The engine API](#10-the-engine-api)
11. [UX specification](#11-ux-specification)
12. [Design system](#12-design-system)
13. [Capability escalation and BYOK AI](#13-capability-escalation-and-byok-ai)
14. [Provider adapter specifications](#14-provider-adapter-specifications)
15. [The CORS problem and the Relay](#15-the-cors-problem-and-the-relay)
16. [Key storage and security model](#16-key-storage-and-security-model)
17. ["Connect your AI" teaching page](#17-connect-your-ai-teaching-page)
18. [Persistence and state](#18-persistence-and-state)
19. [Performance budgets](#19-performance-budgets)
20. [Accessibility](#20-accessibility)
21. [Internationalization](#21-internationalization)
22. [Testing strategy](#22-testing-strategy)
23. [Build, CI, and deployment](#23-build-ci-and-deployment)
24. [SEO and growth](#24-seo-and-growth)
25. [Legal, privacy, and trust](#25-legal-privacy-and-trust)
26. [Implementation roadmap](#26-implementation-roadmap)
27. [Definition of done](#27-definition-of-done)
28. [Appendices](#28-appendices)

---

## 1. Product thesis

### 1.1 What this is

A **browser-based image toolkit** that performs every image modification operation offered by the
leading online converters — locally, in the user's browser, with no upload, no account, no watermark,
and no paywall. Where an operation genuinely requires a generative model, the user supplies their own
provider endpoint and secret (BYOK — Bring Your Own Key), and the app calls it directly from the
browser on the user's behalf.

### 1.2 Why it wins

The incumbents share one architectural weakness: they upload your file to their server. That forces
them into the shape they all have — queues, size caps, "file will be deleted in 24 hours", credit
systems, sign-in walls, and a Pro tier. Every one of those is a UX tax that exists only because of
where the computation happens.

Moving computation to the client removes the tax:

| Incumbent constraint | Our position |
| --- | --- |
| 1 GB max file size (FreeConvert free tier) | Limited only by device RAM; streamed/tiled for large inputs |
| 3 files per batch free, 25 with premium (SimpleImageResizer) | Unlimited batch |
| "Deleted from our servers within 24 hours" | Never leaves the device; nothing to delete |
| Upload → queue → wait → download | Instant; result appears as you drag the slider |
| Sign in for background removal (Canva Pro) | Runs locally, free, offline |
| Conversion credits / daily limits | None |
| Watermarks on free tier | None, ever |
| Requires network | Full PWA; works offline after first load |

### 1.3 Positioning statement

> **Every image tool. In your browser. Nothing uploaded. Actually free.**

### 1.4 Growth mechanics

Growth is a consequence of three properties, in order of leverage:

1. **Per-operation landing pages.** The search demand is long-tail and literal: "heic to jpg",
   "resize image to 200kb", "cr2 to jpg", "remove exif data online", "png to lvgl c array". Each gets
   a prerendered, fast, self-contained page (§24).
2. **Shareable recipes.** A pipeline is encoded in the URL fragment. A user who builds
   "resize 1200px wide → strip EXIF → WebP q80" shares a link that reproduces it exactly, with no
   server round-trip and no stored state. This is the viral loop.
3. **Trust.** "Nothing is uploaded" is verifiable — the Network panel is empty. That claim, provable,
   is the differentiator no server-side competitor can copy.

---

## 2. Non-negotiable principles

These are constraints on every design decision. A change that violates one requires an explicit,
documented exception.

| # | Principle | Enforcement |
| --- | --- | --- |
| P1 | **Local-first.** Every non-generative operation runs on-device. | CI test asserts zero network requests during a full conversion pipeline run (§22.6). |
| P2 | **No upload of user pixels, ever, except to a BYOK endpoint the user explicitly configured.** | Strict CSP `connect-src` allowlist built from the user's own provider config at runtime (§16.4). |
| P3 | **No account, no email, no sign-in.** | No auth code exists in the repo. |
| P4 | **No paywall, no credits, no watermark, no artificial caps.** | No billing code exists in the repo. |
| P5 | **No third-party runtime scripts.** No analytics SDK, no tag manager, no ad network, no font CDN. | CSP has no `script-src` host allowlist beyond `'self'`. Fonts self-hosted. |
| P6 | **Works offline.** After first visit, the full toolkit functions with the network off (AI tools excepted). | Playwright test runs the suite with `context.setOffline(true)`. |
| P7 | **Keys are the user's.** Never transmitted to any origin we control. We operate no server that can receive them. | Static hosting only; no server runtime in the deploy target (§23). |
| P8 | **Honest capability reporting.** If a codec is unavailable, a provider blocks CORS, or a device lacks RAM, say so plainly with the reason and the remedy. Never fail silently, never fake a result. | Every failure path has a typed error with a `remedy` field rendered in the UI (§10.6). |
| P9 | **Lossless by default.** Never silently re-encode, downsample, strip metadata, or convert color space. Every destructive step is explicit and reversible. | Default option values in §6 are all pass-through. |
| P10 | **Fast enough to feel direct.** Interaction to visible preview under 100 ms for adjustments; see §19. | Performance budget test in CI. |
| P11 | **Programmatic before probabilistic.** A feature may only call an external model if no deterministic algorithm, classical computer-vision method, or on-device model can produce an acceptable result. "Acceptable" is defined per feature, in writing, before any adapter is written. | Every AI code path requires an entry in the **AI Justification Register** (§13.1.3). A feature reaching an external provider without a register entry fails review. |
| P12 | **Escalation is the user's choice, never the default.** Where both a local and an external path exist, the local one runs first, its result is shown, and the external path is offered as a visible, labelled, costed upgrade — never as an automatic fallback and never as the preselected option. | UI test asserts that no AI request is issued without an explicit user gesture on the escalation control. |
| P13 | **Clean IP by construction.** Every dependency is permissively licensed, every algorithm is unencumbered or cleared, every name is our own, and every shipped asset is redistributable. Where no clean option exists, we build our own; where we cannot, the capability is honestly reported as unavailable rather than shipped on a shaky footing. | The substitution register (§25.3) covers every dependency and algorithm. `verify:licenses` gates the build. A capability with no cleared implementation must not appear in the UI as available (P8). |

---

## 3. Competitive feature union

The product surface is the **union** of all features across the seven reference products. Where two
products offer the same feature with different options, we implement the **superset** of options.

### 3.1 Sources

| ID | Product | What we take from it |
| --- | --- | --- |
| **FC** | [FreeConvert Image Converter](https://www.freeconvert.com/image-converter) | Breadth of format support (500+ claimed), full RAW camera list, adjacent tool set (resizer, cropper, compressor, color picker, rotate, flip, enlarger), 1 GB ceiling we remove |
| **CC** | [CloudConvert Image Converter](https://cloudconvert.com/image-converter) | Per-format conversion graph, resize + fit modes, quality/resolution/file-size controls, metadata strip, pixel density, the task-composition model (convert / optimize / watermark / thumbnail / merge / archive / metadata) |
| **OC** | [online-convert Image](https://image.online-convert.com/) | The most literal and complete option set of any competitor — color filters, enhancement toggles, DPI + unit, crop-from-edges, B/W threshold, chroma subsampling, color space |
| **SIR** | [SimpleImageResizer](https://www.simpleimageresizer.com/image-converter) | Resize-by-percent, "make image N% smaller", resize-to-target-KB, social/print/Instagram presets, dimension calculator, EXIF viewer+remover, quality scale wording (LOW→BEST) |
| **ILI** | [iLoveIMG](https://www.iloveimg.com/) | Tool taxonomy and naming, photo editor (text/effects/frames/stickers), upscale, remove background, watermark, meme generator, bulk rotate with orientation selection, HTML→image, blur face |
| **CV** | [Canva Image Converter](https://www.canva.com/features/image-converter/) | Editor-adjacent conversion flow, HEIC/WebP/SVG↔PNG/JPG/PDF matrix, generative features (background remover, magic edit, magic expand) that we map to BYOK |
| **LV** | [LVGL Image Converter](https://lvgl.io/tools/imageconverter) | Embedded-target export: LVGL v8/v9 color formats, C array + binary output, dithering, alpha byte, chroma key, big-endian |

### 3.2 Union matrix

Competitor columns: `●` = offered · `○` = partially offered · blank = not offered.

**Our column** uses the tier ladder from §13.1.2 — `●` = fully local, no key, works offline
(Tier 0–2) · `◐` = fully local, with an **optional** AI escalation for a documented hard case ·
`AI` = genuinely requires an external model, justified in the register at §13.1.3.
Note how few `AI` marks there are: three.

| Capability | FC | CC | OC | SIR | ILI | CV | LV | Ours |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Universal format conversion | ● | ● | ● | ● | ○ | ○ | ○ | ● |
| RAW camera decode | ● | ● | ○ | | ○ | | | ● |
| HEIC / HEIF (decode) | ● | ● | | ● | ● | ● | | ● |
| AVIF | ● | ● | | | | | | ● |
| JPEG XL | ● | | | | | | | ● |
| SVG → raster | ● | ● | ● | ● | ● | ● | ● | ● |
| Raster → SVG (vectorize) | | | | | | | | ● |
| PDF ↔ image | | ● | | ● | | ● | | ● |
| Favicon / multi-size ICO | ● | ● | ● | | | | | ● |
| Images → animated GIF | | ● | ● | | ● | | | ● |
| Video → animated GIF | | ● | ● | | | | | ● |
| GIF → frames / APNG / WebP | | ● | | | | | | ● |
| Embedded C-array export | | | | | | | ● | ● |
| Base64 / data-URI | | | | | | | ○ | ● |
| HTML / URL → image | | ● | | | ● | | | ● |
| Resize by pixels | ● | ● | ● | ● | ● | ● | | ● |
| Resize by percent | ● | | | ● | ● | | | ● |
| "Make N% smaller" | | | | ● | | | | ● |
| Resize to target file size (KB) | | ● | | ● | | | | ● |
| Fit modes (contain/cover/fill/inside/outside) | | ● | | | | | | ● |
| Social / print / device presets | | | | ● | | ● | | ● |
| DPI change + unit (in/cm) | | ● | ● | ● | | | | ● |
| Crop (visual) | ● | | | ● | ● | ● | | ● |
| Crop N px from each edge | | | ● | | | | | ● |
| Smart / subject-aware crop | | ● | | | | | | ● |
| Rotate | ● | | ● | | ● | ● | | ● |
| Bulk rotate by orientation | | | | | ● | | | ● |
| Flip / mirror | ● | | ● | | | ● | | ● |
| Deskew / straighten | | | ● | | | | | ● |
| Canvas extend / pad | | | | | | ● | | ● |
| Enlarge (classic interpolation) | ● | | | | | | | ● |
| Compress (quality slider) | ● | ● | ● | ● | ● | | | ● |
| Compress to target size | ● | ● | | ● | | | | ● |
| Lossless optimize | | ● | | ● | ● | | | ● |
| Chroma subsampling control | | | ● | | | | | ● |
| Progressive / interlace | | ● | | | | | | ● |
| Color space (sRGB/CMYK/Gray) | | ● | ● | | | | | ● |
| Bit depth / color depth | | | ● | | | | ● | ● |
| ICC profile handling | | ● | ○ | | | | | ● |
| Grayscale / Monochrome / Negate / Retro / Sepia | | | ● | | ● | ● | | ● |
| Enhance / Sharpen / Antialias | | | ● | | ● | ● | | ● |
| Despeckle / Equalize / Normalize | | | ● | | | | | ● |
| B/W threshold | | | ● | | | | | ● |
| Brightness / contrast / saturation / etc. | | | ○ | | ● | ● | | ● |
| Curves / levels | | | | | | ○ | | ● |
| Blur / denoise | | | ● | | ● | ● | | ● |
| Duotone / gradient map / LUT | | | | | ○ | ● | | ● |
| Color picker / palette extract | ● | | | | | ● | | ● |
| Dithering | | | | | | | ● | ● |
| Chroma key / transparent color | | | | | | | ● | ● |
| Layered photo editor | | | | | ● | ● | | ● |
| Text on image | | | | | ● | ● | | ● |
| Stickers / shapes / frames / draw | | | | | ● | ● | | ● |
| Watermark (text + image) | | ● | ● | ● | ● | ○ | | ● |
| Meme generator | | | | | ● | | | ● |
| Collage / merge / grid | | ● | | | | ● | | ● |
| Split / tile / spritesheet | | | | | | | | ● |
| Metadata viewer (EXIF/IPTC/XMP) | | ● | ○ | ● | | | | ● |
| Metadata strip / edit | | ● | ○ | ● | | | | ● |
| Blur / pixelate region | | | | | ● | | | ● |
| Blur faces & plates (detection) | | | | | ● | | | ● |
| Image info / inspector | ● | | | ● | | | | ● |
| A/B compare + quality metrics | | | | | | | | ● |
| Duplicate / similar finder | | | | | | | | ● |
| OCR | | | | | | | | ● |
| Background removal | | | | ● | ● | ● | | ◐ |
| Alpha matting / hair-edge cutout | | | | | | | | ● |
| Upscale | ● | | | ● | ● | | | ◐ |
| Edge-directed upscale (DCCI / NEDI) | | | | | | | | ● |
| Pixel-art / line-art upscale (clean-room integer scaler) | | | | | | | | ● |
| Object removal ("magic eraser") | | | | | | ● | | ◐ |
| Exemplar fill (texture synthesis) | | | | | | | | ● |
| Generative fill / expand | | | | | | ● | | ◐ |
| Background replace | | | | | | ● | | ◐ |
| Seamless composite (alpha blend; full pyramid/Poisson methods not shipped) | | | | | | | | ● |
| Colour harmonization (colour transfer) | | | | | | | | ● |
| Click-to-select object (colour range / watershed) | | | | | | ○ | | ● |
| Procedural image generation (QR, noise, patterns, avatars) | | | | | | ○ | | ● |
| Generate image from a prompt | | | | | | ● | | AI |
| Prompt-based edit ("magic edit") | | | | | | ● | | AI |
| Alt text / caption / tag generation | | | | | | | | AI |
| Batch processing | ● | ● | ● | ● | ● | | ● | ● |
| ZIP download of results | ● | ● | ● | ● | ● | | ● | ● |
| Saved / shareable recipes | | ○ | | | | | | ● |
| Browser extension | | | | ● | | | | ● |
| Public API | ● | ● | ● | | ● | | | ● |
| Works offline | | | | | | | | ● |
| No file-size cap | | | | | | | | ● |
| No batch cap | | | | | | | | ● |

### 3.3 Intersections resolved

Where products overlap, these are the merge decisions:

- **Quality scale.** SIR labels quality `LOW … BEST` over 1–100; OC uses a 0–100 % slider; CC exposes
  a numeric quality. We expose **one control**: a 1–100 integer slider with named anchor labels
  (`Smallest 1–39 · Small 40–59 · Balanced 60–79 · High 80–92 · Best 93–100`) plus a numeric input,
  plus a live predicted output size. One control, three affordances.
- **Resize.** FC/ILI/SIR/CC each expose a subset (pixels, percent, "N% smaller", target KB, fit
  modes, presets). We expose all five *modes* in one segmented control, so nothing is a separate tool.
- **Compress vs. Convert vs. Optimize.** CC models these as separate tasks; FC as separate tools. We
  model them as **one pipeline** with distinct entry points: each landing page is a preset view of
  the same engine, so a user who lands on "Compress JPG" can add a resize step without navigating away.
- **Background removal.** SIR/ILI/CV all offer it; CV gates it behind Pro. We run it **locally by
  default** (ONNX model, §7.4) and offer BYOK providers as an optional quality upgrade — never as the
  only path.
- **Upscale.** FC's "Image Enlarger" (classic interpolation) and ILI/SIR's "AI upscale" are different
  operations sold under similar names. We keep both, clearly labeled: **Enlarge** (Lanczos/Mitchell,
  instant, local) and **Upscale** (learned model, local ONNX by default, BYOK optional).
- **Metadata.** SIR has separate "EXIF viewer" and "EXIF remover"; CC has a metadata task. We ship one
  **Metadata** tool with read, edit, and strip in a single panel, plus a `strip` toggle available
  inline on every export.
- **Rotate.** OC exposes rotate as a conversion option; ILI as a bulk tool with landscape/portrait
  selection. We support both: an inline transform step *and* a batch tool with an
  `only-if-landscape` / `only-if-portrait` / `auto-from-EXIF` predicate.

---

## 4. Complete tool catalog

81 tools. Each has a dedicated route, a prerendered landing page, and is a thin preset over the shared
engine.

**Mode column**, per the tier ladder in §13.1.2:

- `Local` — Tier 0–2. Runs entirely on-device. No key, no network, works offline. **72 tools.**
- `Local ⇗AI` — Tier 0–2 primary and fully functional; an optional, explicitly-invoked Tier 3
  escalation exists for one documented hard case. **6 tools:** T32, T62, T66, T67, T68, T69.
- `AI` — Tier 3 only, because no algorithm exists. Justified in the register at §13.1.3.
  **3 tools:** T64, T65, T71.

T48 (Photo Editor), T72 (Batch Runner), and T73 (Recipe Builder) are `Local` **hosts** — they can
include an AI step if the user has configured one, but they issue no request of their own.

### 4.1 Convert & export

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T01 | Image Converter | `/convert` | Local | Universal. Any supported input → any supported output |
| T02 | HEIC / HEIF Converter | `/heic-converter` | Local | iPhone photos; multi-image HEIC containers. **Decode-only**, via the platform decoder — the overwhelmingly common need is HEIC→JPEG/PNG anyway. HEIC *output* is excluded on patent grounds (§25.3.2) and the page says so |
| T03 | RAW Converter | `/raw-converter` | Local | Full camera list, §5.3. Demosaic + white balance + tone curve |
| T04 | AVIF Converter | `/avif-converter` | Local | Encode + decode |
| T05 | WebP Converter | `/webp-converter` | Local | Lossy, lossless, animated |
| T06 | JPEG XL Converter | `/jxl-converter` | Local | Incl. lossless JPEG recompression (`jpeg_transcode`) |
| T07 | SVG Rasterizer | `/svg-to-png` | Local | Explicit output dimension / scale factor |
| T08 | Vectorizer (raster → SVG) | `/image-to-svg` | Local | Posterize + trace; colour count, curve tolerance |
| T09 | PDF → Images | `/pdf-to-image` | Local | Per-page, DPI selectable |
| T10 | Images → PDF | `/image-to-pdf` | Local | Page size, orientation, margin, ordering, compression |
| T11 | Favicon Generator | `/favicon-generator` | Local | Multi-resolution `.ico` + PNG set + `manifest.json` + HTML snippet |
| T12 | GIF Maker | `/gif-maker` | Local | Images → animated GIF; per-frame delay, loop, dither, palette |
| T13 | Video → GIF | `/video-to-gif` | Local | Trim, fps, scale, palette generation |
| T14 | GIF Splitter / Converter | `/gif-converter` | Local | GIF → frames, APNG, animated WebP, MP4/WebM |
| T15 | Spritesheet Tools | `/spritesheet` | Local | Pack frames → sheet + JSON atlas; slice sheet → frames |
| T16 | Embedded Image Converter | `/embedded-converter` | Local | LVGL v8/v9 C array + binary; also raw RGB565/RGB888/mono for other targets |
| T17 | Base64 / Data-URI | `/base64-image` | Local | Encode + decode both directions; CSS/HTML snippet output |
| T18 | HTML / URL → Image | `/html-to-image` | Local† | †Local for pasted HTML/CSS; a URL needs a Relay or screenshot provider (§15) |
| T19 | Comic / Archive Converter | `/cbz-converter` | Local | CBZ/CBR/ZIP ↔ image set ↔ PDF |

### 4.2 Optimize

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T20 | Image Compressor | `/compress` | Local | Quality slider + live size prediction + visual diff |
| T21 | Compress to Target Size | `/compress-to-size` | Local | Binary search on quality (and optionally dimensions) to hit an exact KB/MB budget |
| T22 | Web Optimizer | `/optimize-for-web` | Local | Emits a responsive set + `<picture>`/`srcset` markup + Core Web Vitals notes |
| T23 | Lossless Optimizer | `/lossless-optimize` | Local | `oxipng` (MIT), `mozjpeg -copy none` (BSD-3), and our own GIF optimizer — byte reduction with pixel-identical output |

### 4.3 Transform

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T24 | Image Resizer | `/resize` | Local | 5 modes (§6.2) |
| T25 | Bulk Resize | `/bulk-resize` | Local | Preset packs: social, print, app icons, favicons, email |
| T26 | Crop Image | `/crop` | Local | Visual handles + numeric + edge-offsets + aspect presets + rule-of-thirds/golden overlays |
| T27 | Smart Crop | `/smart-crop` | Local | Center, rule-of-thirds, and approximate visual-saliency placements for a chosen aspect ratio; original ratio + center is the no-op default. Options come from a Zod schema and the shared generated-control renderer. The saliency mode is a low-resolution edge-energy and colour-variation heuristic; it does not detect faces or recognize subjects. On 12 square-crop cases from four individually registered CC0 images, mean manually annotated target-box retention was 89.82% for center, 76.70% for thirds, and 71.97% for approximate saliency. A generated 12 MP PNG square-crop preview measured 1.428 s median over five local Chromium runs; the §19.2 budget is 3 s and CI asserts it. These measurements do not establish crop quality or user preference. See [T27 measurements](packages/engine/bench/escalation/p4-21-t27-smart-crop.md) |
| T28 | Rotate & Straighten | `/rotate` | Local | 90° steps, arbitrary angle, auto-deskew, EXIF-orientation normalize |
| T29 | Flip / Mirror | `/flip` | Local | Horizontal, vertical, both |
| T30 | Canvas Resize / Pad | `/canvas-resize` | Local | Anchor 3×3, pad colour or transparent, extend to aspect ratio |
| T31 | Enlarge | `/enlarge` | Local | **Tier 0:** Lanczos3, Mitchell, Catmull-Rom, nearest. Instant, no model, no download |
| T32 | Upscale | `/upscale` | Local ⇗AI | **Tier 1:** DCCI and NEDI run in a local worker. The route accepts still PNGs up to 32 MiB / 12 MP, limits output to 4 MP / 32 MiB, previews before/after, and exports PNG. **Tier 2 (experimental, opt-in):** an explicit action downloads the selected pinned Real-ESRGAN model, displays its size/progress, supports cancellation and a per-model fallback URL, verifies byte length/SHA-256, stores verified bytes in IndexedDB, and runs a tiny local browser inference before enabling image processing. Primary and fallback origins are runtime-configurable with `T32_ESRGAN_X2_URL`, `T32_ESRGAN_X2_FALLBACK_URL`, and matching X4 names; Docker never downloads model files. See the [T32 host assessment](docs/t32-model-hosting.md). On four clean synthetic 2× pairs, x2 did not beat Lanczos3 or DCCI; on 16 CC0-derived synthetic ×4 blur/grain/JPEG pairs, x4 trailed Tier 1. A separate exploratory Swin2SR q4f16 record had a small aggregate metric gain but mixed class PSNR and slow CPU/WASM runtime. Its asset terms and training-data provenance remain unestablished, so those results are not asset-cleared and do not support product selection. Real degraded-camera performance remains unmeasured. Product copy describes the model as experimental without a general quality claim. See T70 for pixel/line art |
| T33 | Border / Frame | `/add-border` | Local | Width per side, colour, inner/outer, **instant-print** and film-sprocket presets (*not* "Polaroid" — that is a live trademark; the frame geometry is generic) |
| T34 | Round Corners | `/round-corners` | Local | Per-corner radius, outputs alpha PNG/WebP |
| T35 | Collage / Merge | `/collage` | Local | Grid, horizontal, vertical, mosaic; gap, background, alignment |
| T36 | Split / Tile | `/split-image` | Local | By grid, by pixel size, Instagram carousel slicer |

### 4.4 Colour & adjust

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T37 | Adjustments | `/adjust` | Local | Exposure, brightness, contrast, highlights, shadows, whites, blacks, saturation, vibrance, temperature, tint, clarity, dehaze |
| T38 | Filters & Effects | `/filters` | Local | The OC five (Grayscale, Monochrome, Negate, Retro, Sepia) + 24 more + `.cube` LUT import |
| T39 | Curves & Levels | `/curves` | Local | RGB + per-channel curves, input/output levels, histogram, auto-levels |
| T40 | Colour Space & Depth | `/color-space` | Local | sRGB / Display-P3 / Adobe RGB / Gray / CMYK; 8/16-bit; ICC embed/convert/strip |
| T41 | Threshold / Binarize | `/threshold` | Local | Global value, Otsu, adaptive (Sauvola) |
| T42 | Auto Enhance | `/enhance` | Local | The OC `Enhance` toggle, expanded: auto-level + auto-contrast + mild local tone mapping |
| T43 | Sharpen & Blur | `/sharpen` | Local | Unsharp mask, smart sharpen, Gaussian/box/motion/radial/lens blur |
| T44 | Denoise & Despeckle | `/denoise` | Local | Median and bilateral are implemented; the current engine has no wavelet/BayesShrink implementation. Non-local means remains excluded pending counsel |
| T45 | Colour Picker & Palette | `/color-picker` | Local | Eyedropper, dominant-colour extraction (k-means + median cut), export as CSS/JSON/ASE/GPL |
| T46 | Recolour / Hue Replace | `/recolor` | Local | Target hue range → replacement, tolerance, feather |
| T47 | Duotone / Gradient Map | `/duotone` | Local | Two-colour and multi-stop gradient mapping |

### 4.5 Annotate & create

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T48 | Photo Editor | `/editor` | Local (host) | The full layered editor; every other tool is reachable from inside it. Issues no request of its own |
| T49 | Text on Image | `/add-text` | Local | Self-hosted font set + local font access + user font upload; stroke, shadow, curve, arc |
| T50 | Watermark | `/watermark` | Local | Text or image; opacity, rotation, scale, 3×3 + custom position, tiled/mosaic mode, batch |
| T51 | Meme Generator | `/meme-generator` | Local | Top/bottom caption preset using **Anton** (OFL) — *not* Impact, which is a licensed Monotype face we cannot redistribute. **User-upload only: no bundled template gallery**, because the well-known meme images are third-party copyrighted photographs. An optional CC0/public-domain starter set is acceptable if each item's provenance is recorded |
| T52 | Draw / Shapes / Stickers | `/draw` | Local | Brush, arrow, line, rect, ellipse, callout. Emoji rendered from **Noto Emoji** (OFL) or **Twemoji** (CC-BY 4.0, attributed in `/about`) — never platform emoji fonts, which are not redistributable. Sticker packs are our own artwork or CC0 |
| T53 | Signature | `/signature` | Local | Draw or upload, auto-background-removal, transparent PNG export |

### 4.6 Privacy & metadata

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T54 | Metadata Viewer | `/exif-viewer` | Local | EXIF, IPTC, XMP, ICC, MakerNotes, GPS map (offline tiles absent → coords + copy button), C2PA/CAI read |
| T55 | Metadata Remover / Editor | `/remove-exif` | Local | Strip all / strip GPS only / keep copyright+orientation / edit any field |
| T56 | Blur / Pixelate Region | `/blur-image` | Local | Rect, ellipse, freehand; Gaussian, pixelate, solid, noise |
| T57 | Blur Faces & Plates | `/blur-face` | Local | Manually mark up to 12 rectangular regions, review the local still-PNG preview, and download the blurred copy. There is no automatic face or plate detection; review the whole image because unmarked regions remain visible. The focused route suite passes 40/42 checks across Chromium, Firefox, and WebKit (the two non-Chromium latency checks are skipped). A generated 6 MP PNG reached a one-region blur preview in a 229.5 ms median across five Chromium runs (217.8–336.8 ms); this synthetic timing does not establish broad-device speed or detection accuracy (§19.2) |
| T58 | Redact | `/redact` | Local | Irreversible destructive redaction (pixels replaced, not overlaid) with verification pass |

### 4.7 Analyze

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T59 | Image Inspector | `/image-info` | Local | Dimensions, aspect, DPI, colour space, bit depth, channels, alpha, animation, chunk/box dump, entropy, est. quality factor |
| T60 | Compare | `/compare` | Local | A/B slider, onion skin, difference blend, approximate SSIM / PSNR and hashes on a ≤256 px proxy; source dimensions must match and an in-progress comparison can be cancelled |
| T61 | Duplicate Finder | `/find-duplicates` | Local | Find exact SHA-256 duplicates and possible visual matches across up to 24 files (20 MiB/file, 80 MiB total, 24 MP/image). Near matches require human review; export a non-destructive CSV report. A controlled P4-21 supplement measured 34/60 same-source matches (including four exact-SHA detections) and 0/72 topic-matched false matches through Chromium's route-sized hash canvas; visually near-identical negatives and route STCC remain open. See [T61 benchmark](packages/engine/bench/escalation/p4-21-t61-duplicates.md) |
| T62 | OCR | `/ocr` | Local ⇗AI | The standalone page offers 124 language/variant choices, 37 script models, OSD orientation/script results, and `equ` equation text. Installed Edge reports the 270° correction for a generated image rotated 90° clockwise; language OCR and text download also pass on the same origin. Tesseract.js 7 uses all 163 pinned official `tessdata_fast` entries: 123 language/variant model binaries, one deprecated `frk` alias pointer to `deu_latf`, 37 script model binaries, and two helpers. Only the selected model is requested. A present static model is used first (Cyrillic is the only bundled file); when another model is missing, the browser fetches it directly from its pinned public source. Production never downloads or caches OCR models on the app server; only test/benchmark preparers write ignored cache files, and clean production builds prune those files. Missing data uses the pinned jsDelivr URL except `script/Latin.traineddata` (89,384,811 bytes), which uses its pinned raw GitHub source because jsDelivr returns 403. The Latin script option discloses its 85.2 MiB size before recognition. `script/Cyrillic.traineddata` remains the sole bundled model. The page recommends upright images; OSD and Script models remain unloaded unless selected. Hausa is absent upstream. The exact eight self-generated print PNG fixtures and hashes are persisted in `packages/engine/bench/fixtures/ocr-language/`; the initial accuracy smoke is 7/8 exact, mean CER 0.00735. Arabic CDN delivery and Latin raw-source delivery passed browser smokes, which do not measure their OCR accuracy. Wider-language quality and offline shell caching remain open |
| T63 | Alt Text Review | `/alt-text` | Local | Manual image preview, editable alt-text draft, decorative-image reminder, and wording checklist. It does not identify image contents, extract text, measure contrast, simulate colour vision, or certify accessibility; a person must judge the image and page context |

### 4.8 Cutout, fill, and synthesis — local-first

These are the tools competitors sell as "AI". Local methods remain the primary path where implemented,
but several tools are incomplete: T67 does not expand the canvas, T68 requires a user trimap and has no
cleared Tier 2 model, and T69's Poisson path remains excluded. Any AI escalation is an explicitly invoked
upgrade for the narrow case documented in §13.1.3 — never the default, never required.

| # | Tool | Route | Mode | Primary implementation (Tier 0–2) | Escalation |
| --- | --- | --- | --- | --- | --- |
| T66 | Remove Object | `/remove-object` | Local ⇗AI | Brush a mask → choose among **Telea**, **Navier–Stokes**, **confidence-priority**, **Efros–Leung**, or **quilting**. Five methods are measured on three generated textures and eight synthetic-occlusion cases derived from registered CC0 photos; hidden pixels are known by construction, so this is not real object-removal ground truth. See §26. | Real-photo removal, large or structural fills remain unmeasured |
| T67 | Expand Image | `/expand-image` | Local ⇗AI | Current engine stub applies Telea inside a supplied same-size mask and returns the image unchanged without a mask; canvas expansion and outpaint are not implemented | Semantic scene continuation; implementation gap remains |
| T68 | Remove Background | `/remove-background` | Local ⇗AI | User trimap → band-limited alpha matting → joint-bilateral refinement, alpha-band trim, and defringe. GrabCut and guided filter remain excluded; no cleared Tier 2 segmentation model is available | Requires a trimap; fine-edge quality remains unmeasured |
| T69 | Replace Background | `/replace-background` | Local ⇗AI | Local cutout and compositing primitives include per-pixel alpha blending, colour transfer, and shadow synthesis. The function labelled Laplacian-pyramid blend is currently a simplified per-pixel blend, not a full pyramid; Poisson remains excluded pending counsel | Only when the backdrop must be generated; model need is unmeasured |
| T70 | Pixel-Art & Line-Art Upscale | /pixel-art-upscaler | Local | Deterministic palette-aware scaling. A narrow four-fixture engine benchmark found no invented RGB colors after a strict-majority guard; the opaque stepped fixture matched nearest-neighbour exactly, while transparent edges gained intermediate alpha. Its 16-case route suite passes in Chromium and installed Edge; Firefox and WebKit pass all 15 functional cases and skip only the latency measurement. It covers every typed error kind and remedy, keyboard use, offline reuse, and the 320 CSS-pixel layout without horizontal overflow in all four browsers. Broad sprite preference and actual 400% browser zoom remain open, so full route STCC is not claimed. See [T70 benchmark](packages/engine/bench/escalation/t70/REPORT.md) | None needed |
| T77 | Cutout Refine (Alpha Matting) | `/cutout` | Local | Band-limited colour-unmixing alpha matte from a trimap; joint-bilateral refinement, alpha-band trim, and defringe. Closed-form matting and guided filter are excluded | Hair/fur reference quality remains unmeasured |
| T78 | Seamless Composite | `/composite` | Local | Layer compositing with alpha; the function labelled Laplacian-pyramid blend currently implements a simplified per-pixel alpha blend, not a full pyramid. Poisson/gradient-domain blending remains excluded pending counsel | — |
| T79 | Procedural Generator | `/generate` | Local | The route exposes seeded value noise/fBm textures and radial gradients in a local worker, bounded to 16–512 px with PNG preview/download. The wider engine exports additional clean-room primitives that this route does not yet expose. Determinism and Node operation latency are measured for five primitives at 128/256/512 px; visual quality, browser latency, and preference remain unmeasured. See [T79 benchmark](packages/engine/bench/escalation/t79/README.md) | — |
| T80 | Colour Match | `/color-match` | Local | Apply Reinhard transfer or per-channel histogram matching to two still PNGs (16 MiB / 6 MP each, 8 MP total) in a local worker, then compare and export the result. On three generated texture pairs, mean normalized channel-CDF distance was 0.065537 unchanged, 0.014468 with Reinhard, and 0.002413 with histogram matching. Spatial preservation, photo composites, and user preference remain unmeasured. See [T80 benchmark](packages/engine/bench/escalation/p4-21-t80-colour-match.md) | — |
| T81 | Adaptive Resize | /adaptive-resize | Local | Saliency-weighted continuous-warp retargeting (§25.4) with a protect mask. In three generated scenes, feasible masked subjects retained their exact pixel area and bbox dimensions (1.000×, 0% aspect change), but shifted 8.08 px on average as background content was compressed. The unmasked path measured 19.29% mean bbox-aspect change versus 33.53% for resize. Natural-photo quality and route-level STCC remain open. See [T81 benchmark](packages/engine/bench/escalation/t81/README.md). It is not seam carving, which remains excluded (§25.3.2) | — |

### 4.9 AI-only tools (Tier 3, justified)

Three tools. Each has a register entry in §13.1.3 establishing that no algorithm can do the job. Each is
clearly labelled, costed before it runs, and unavailable without a user-configured provider — and each
degrades to something honest rather than to nothing.

| # | Tool | Route | Capability | Why no local path exists | Without a key |
| --- | --- | --- | --- | --- | --- |
| T64 | Generate from Prompt | `/ai/generate` | `generate` | No algorithm synthesizes a depicted subject from text | T79 offers procedural generation for patterns, placeholders, QR, and avatars |
| T65 | Prompt Edit | `/ai/edit` | `edit` | Requires interpreting intent, not applying a specified transform | T37/T38/T46 perform any transformation the user can specify |
| T71 | Describe Image | `/ai/describe` | `describe` | Requires recognition plus language generation | A **descriptive skeleton** is produced locally: dimensions, aspect, dominant palette, transparency, orientation, face count, embedded text via OCR (T62), and EXIF subject fields — enough for a human to finish an alt text in seconds |

### 4.10 Batch & developer

| # | Tool | Route | Mode | Notes |
| --- | --- | --- | --- | --- |
| T72 | Batch Runner | `/batch` | Local (host) | Drop N files, apply a recipe, download ZIP; per-file status, retry, partial download. A recipe containing an AI step shows total projected cost and requires confirmation (§13.6) |
| T73 | Recipe Builder | `/recipe` | Local (host) | Visual pipeline editor; save to IndexedDB, export JSON, share via URL fragment. Flags any AI step so a shared recipe never surprises the recipient with a cost |
| T74 | Folder Watcher | `/watch` | Local | File System Access API — pick a folder, auto-process new files into an output folder |
| T75 | Code Generator | `/codegen` | Local | `<picture>`/`srcset`, CSS sprite sheet + classes, Tailwind config, LVGL `LV_IMG_DECLARE` snippet |
| T76 | CLI & Library | `packages/cli`, `packages/engine` | Local | Same engine, npm-published, so a recipe JSON runs identically in Node and in the browser |

---

## 5. Format support matrix

### 5.1 Reading the matrix

`D` = decode (input) · `E` = encode (output) · `A` = animation supported · `—` = not supported.
"Lib" is the implementing library (§7.3). Every entry must be backed by a fixture test (§22.3).

### 5.2 Standard raster formats

| Format | Ext | D | E | A | Lib | Notes |
| --- | --- | :-: | :-: | :-: | --- | --- |
| JPEG | `.jpg .jpeg .jpe .jfif .jif` | D | E | — | jSquash/mozjpeg | Progressive, chroma subsampling, trellis quant, restart markers |
| PNG | `.png` | D | E | — | jSquash/oxipng | 8/16-bit, palette, interlace, `oxipng` levels 0–6 |
| APNG | `.apng .png` | D | E | A | our own muxer | Frame delay, loop, blend/dispose ops |
| WebP | `.webp` | D | E | A | jSquash/libwebp | Lossy, lossless, near-lossless, alpha quality |
| AVIF | `.avif .avifs` | D | E | — | jSquash/libavif | Speed 0–10, chroma 4:4:4 / 4:2:2 / 4:2:0, 8/10/12-bit. Animation is not exposed because the pinned jSquash decoder/encoder handle a single raster frame; a multi-frame AVIF tool would require a container+frame codec path that is not yet cleared. |
| JPEG XL | `.jxl` | D | E | — | jSquash/libjxl | Effort 1–9, distance, lossless raster mode. Animation is not exposed for the same reason as AVIF. Reversible JPEG transcode (re-encode a JPEG bitstream without decoding/quantising) is not exposed because the pinned `@jsquash/jxl` codec accepts only decoded raster pixels; lossless mode is pixel-lossless, not bitstream-lossless. |
| GIF | `.gif` | D | E | A | gifuct-js + our own encoder | Palette, dither, loop, per-frame delay/dispose, optimize levels |
| BMP | `.bmp .dib` | D | E | — | our own | 1/4/8/16/24/32-bit, RLE, top-down/bottom-up |
| TIFF | `.tif .tiff` | D | E | A | UTIF.js (MIT) | LZW / Deflate / PackBits / JPEG / none, multipage, tiled, CMYK, 16-bit |
| ICO | `.ico` | D | E | — | custom muxer | Multi-image; 16 → 512 px; PNG or BMP payload |
| CUR | `.cur` | D | E | — | custom muxer | ICO variant with hotspot |
| HEIC / HEIF | `.heic .heif .hif` | D† | **never** | A | platform image decoder | †Decode only, and only where the OS/browser provides a decoder (macOS/iOS, recent Windows) — WebCodecs `ImageDecoder` is probed first, then the native `createImageBitmap` / image-element path. **Encode is permanently excluded**: HEVC has multiple active patent pools and the only encoders are GPL or commercial (§25.3.2). The UI states this as a deliberate decision, not a missing feature |
| TGA | `.tga .icb .vda .vst` | D | E | — | our own | RLE, 16/24/32-bit, origin flag |
| PCX | `.pcx` | D | E | — | our own | |
| PPM / PGM / PBM / PNM | `.ppm .pgm .pbm .pnm` | D | E | — | our own | ASCII + binary |
| PAM | `.pam` | D | E | — | our own | |
| WBMP | `.wbmp` | D | E | — | custom | 1-bit wireless bitmap (OC parity) |
| XBM / XPM | `.xbm .xpm` | D | E | — | our own | |
| DDS | `.dds` | D | E | — | custom + BCn codec | DXT1/3/5, BC4/5/7, mipmaps, cubemaps |
| KTX / KTX2 | `.ktx .ktx2` | — | — | — | **v1 unsupported** | No pinned, verified Basis Universal transcoder is shipped for ETC1S/UASTC; a reproducible encoder build and conformance corpus are still required |
| Radiance HDR | `.hdr .pic` | D | E | — | our own (RGBE) | 32-bit RGBE; tone-map on export to SDR |
| OpenEXR | `.exr` | — | — | — | **v1 unsupported** | A small experimental parser is fixture-tested but does not establish complete ZIP/PIZ interoperability. A reproducible, licence-recorded TinyEXR WASM build has not been produced, so production decode/encode are not offered |
| PFM | `.pfm` | D | E | — | our own | |
| FITS | `.fits .fit` | D | — | — | our own | Astronomy |
| JPEG 2000 | `.jp2 .j2k .jpf .jpx .jpm` | — | — | — | **v1 unsupported** | No verified permissive browser package exists, and a reproducible, licence-recorded OpenJPEG WASM build has not been produced |
| SGI / RGB | `.sgi .rgb .bw` | D | E | — | our own | |
| Sun Raster | `.ras .sun` | D | — | — | our own | |
| PICT | `.pct .pict` | — | — | — | **dropped** — legacy, complex, and the only viable decoders are copyleft. Reported unsupported with the reason | Legacy Mac |
| MNG | `.mng` | — | — | — | — | **Dropped.** Effectively dead format; the effort is better spent on APNG. Reported unsupported with that reason |
| QOI | `.qoi` | D | E | — | custom (tiny) | |
| FLIF | `.flif` | — | — | — | — | **Dropped.** Superseded by JPEG XL, and the reference decoder is copyleft. Reported unsupported with that reason |

### 5.3 Camera RAW formats

Decode only, via **our own RAW pipeline** (§25.4) — `LibRaw` is LGPL-2.1 and cannot ship in an
Apache-2.0 engine. Encode always targets a standard format. This list is the union of FreeConvert's and
CloudConvert's published sets.

**Two-stage support, and the stages are advertised separately so nothing is oversold:**

- **Stage 1 — embedded preview (all formats below, ships first).** Extract the largest camera-rendered
  preview exposed by the container/IFD structure. JPEG previews remain byte-for-byte intact; TIFF-derived
  formats that store an uncompressed RGB preview are exported losslessly as BMP. This uses bounded
  container/IFD parsing and no demosaic. Labelled *"camera preview"* in the UI, never passed off as a raw
  develop. Preview availability and dimensions remain camera/file-dependent.
- **Stage 2 — full develop (phased, DNG first).** Our own demosaic and colour pipeline, per §5.3's
  option list. Formats without Stage 2 support say so plainly rather than silently using Stage 1.

| Vendor | Extensions |
| --- | --- |
| Canon | `.cr2 .cr3 .crw .crf` |
| Nikon | `.nef .nrw` |
| Sony | `.arw .srf .sr2` |
| Fujifilm | `.raf` |
| Olympus / OM System | `.orf` |
| Panasonic | `.rw2 .raw` |
| Pentax / Ricoh | `.pef .ptx` |
| Leica | `.rwl .dng` |
| Sigma | `.x3f` |
| Samsung | `.srw` |
| Kodak | `.dcr .kdc .k25 .dcs .drf` |
| Epson | `.erf` |
| Mamiya | `.mef` |
| Minolta | `.mrw .mdc` |
| Hasselblad | `.3fr .fff` |
| Phase One | `.iiq .cap` |
| Leaf | `.mos` |
| Casio | `.bay` |
| Adobe (open standard) | `.dng` |
| Other / generic | `.raw .rwz .cs1` |

Stage 1 has a SHA-verified real-file corpus for `.3fr`, `.arw`, `.cr2`, `.cr3`, `.crw`, `.dcr`,
`.dng`, `.erf`, `.fff`, `.iiq`, `.kdc`, `.mos`, `.nef`, `.nrw`, `.orf`, `.pef`, `.raf`, `.raw`,
`.rw2`, `.rwl`, `.sr2`, `.srf`, `.srw`, and `.x3f`. The following v1 extensions are deliberately
reported unavailable before processing rather than guessed: `.bay`, `.cap`, `.crf`, `.cs1`, `.dcs`,
`.drf`, `.k25`, `.mef`, `.ptx`, and `.rwz` have no hash-pinned redistributable real-file corpus or
published container conformance evidence recorded in this repository. Verified `.mdc` and `.mrw`
samples contain no embedded camera rendering, and Stage 2 does not ship a proprietary sensor decoder.
The RAW tool gives the camera-software → DNG/TIFF/JPEG export remedy for each unavailable extension.

**RAW pipeline options** (T03): white balance (`as-shot` / `camera` / `auto` / `daylight` / custom
temp + tint), demosaic algorithm (`AHD` / `VNG` / `PPG` / `DCB` / `linear`), highlight recovery
(`clip` / `unclip` / `blend` / `rebuild`), output colour space, output bit depth (8 / 16), gamma
curve, exposure compensation (−3 … +3 EV), noise-reduction threshold, chromatic-aberration
correction, and an **embedded-JPEG-preview fast path** exposed as an "instant preview" toggle
(decodes in ms; full demosaic runs in the background).

### 5.4 Vector, document, and design formats

| Format | Ext | D | E | Lib | Notes |
| --- | --- | :-: | :-: | --- | --- |
| SVG | `.svg .svgz` | D | E | resvg-wasm (in), custom tracer (out) | Decode = rasterize at chosen scale / DPI; encode = vectorize (T08) |
| PDF | `.pdf` | D | E | pdf.js (in), pdf-lib (out) | Per-page raster in; multi-page assemble out |
| EPS / PS | `.eps .ps` | D† | — | our own (§25.4) | †Embedded preview extraction plus a documented PS operator subset. Ghostscript is AGPL-3.0 and excluded. Files outside the subset are reported unsupported, never partially rendered without saying so. EPS export is not offered; export SVG or PDF for a safer, fully specified vector output. |
| AI | `.ai` | D | — | pdf.js | Modern `.ai` is PDF-compatible. Pre-PDF `.ai` is unsupported — report that specifically |
| PSD / PSB | `.psd .psb` | D | — | ag-psd | Layer tree preserved on read; flattened composite only. PSD/PSB export is not implemented in v1; export the flattened result as PNG/TIFF/WebP/AVIF. |
| XCF | `.xcf` | D | — | our own (layer-composite subset) | GIMP. Spec is public; we read the flattened composite and named layers |
| CDR | `.cdr` | — | — | — | **Not supported.** Proprietary and undocumented. Show an explicit "not supported, and here is why" page rather than a generic failure |
| WMF / EMF | `.wmf .emf` | D | — | custom metafile parser | Best-effort record subset; warn on unsupported records |
| DXF | `.dxf` | D | — | dxf-parser | |
| DWG | `.dwg` | — | — | — | Not supported; say so explicitly |
| DjVu | `.djvu .djv` | — | — | — | **Dropped pending clearance** (§25.3.5). DjVuLibre is GPL-2.0 and no permissive decoder is confirmed. Reported unsupported with that reason rather than shipped on an unverified licence |
| CBZ / CBR | `.cbz .cbr` | D | E‡ | fflate / libarchive-wasm | ‡CBZ encode only — CBR is RAR, decode-only |

### 5.5 Embedded / GPU targets (T16)

Sourced from the LVGL converter, generalized to other embedded targets.

| Target | Output | Colour formats |
| --- | --- | --- |
| LVGL v9 C array | `.c` + `.h` | `RGB565`, `RGB565A8`, `RGB888`, `XRGB8888`, `ARGB8888` |
| LVGL v9 binary | `.bin` | `RGB332`, `RGB565`, `RGB565 Swap`, `RGB888` |
| LVGL v8 C array | `.c` + `.h` | `CF_ALPHA_1/2/4/8_BIT`, `CF_INDEXED_1/2/4/8_BIT`, `CF_RAW`, `CF_RAW_CHROMA`, `CF_RAW_ALPHA`, `CF_TRUE_COLOR`, `CF_TRUE_COLOR_ALPHA`, `CF_TRUE_COLOR_CHROMA`, `CF_RGB565A8` |
| LVGL v8 binary | `.bin` | `RGB332`, `RGB565`, `RGB565 Swap`, `RGB888` |
| Generic raw | `.bin` + `.h` | `RGB565`, `RGB565BE`, `RGB888`, `BGR888`, `ARGB8888`, `RGBA8888`, `Gray8`, `Mono1` |
| Adafruit GFX | `.h` | 1-bit `PROGMEM` bitmap array |
| ESP-IDF / TFT_eSPI | `.h` | `uint16_t` array, selectable byte order |

**Shared embedded options** (LVGL parity, exact naming): `Output name` (validated C identifier),
`Alpha byte` (append an 8-bit alpha value to each pixel), `Chroma keyed` (map a chosen colour to
transparent — colour picker, default `#00FF00` per `LV_COLOR_CHROMA_KEY`), `Dithering`
(Floyd–Steinberg / ordered / none), `Big-endian` byte order. Plus our additions: `const` / `static`
qualifiers, `PROGMEM` attribute, line-wrap width, and a live byte-size + flash-footprint readout with
an `LV_IMG_DECLARE` / `lv_image_set_src` usage snippet.

### 5.6 Video input (T13 only)

Decode only, for frame extraction: `.mp4 .m4v .mov .webm .mkv .avi† .ogv .wmv† .flv† .3gp .mts† .m2ts†`
Implemented with the platform's **WebCodecs `VideoDecoder`** plus `mp4box` (BSD-3) and
`mediabunny` (MPL-2.0) for ISO-BMFF (MP4/M4V/MOV/3GP), Matroska/WebM, and Ogg container reading — no
bundled codec, no patent exposure, and hardware acceleration for free. AVI, WMV, FLV, MTS, and M2TS
are explicitly unavailable because the pinned local reader does not parse those containers and an
FFmpeg fallback is deliberately excluded. For readable containers, codec support is **whatever the
browser provides**, so it is capability-probed per §5.7 and reported honestly rather than promised.

### 5.7 Runtime capability probing

Format availability is **detected, never assumed**:

```ts
// packages/engine/src/capabilities.ts
export interface FormatCapability {
  id: FormatId;
  decode: 'ready' | 'lazy' | 'unavailable';
  encode: 'ready' | 'lazy' | 'unavailable';
  animation: boolean;
  lazyBytes?: number;          // download cost when 'lazy'
  unavailableReason?: string;  // rendered verbatim in the UI when 'unavailable'
}

export function probeCapabilities(): Promise<FormatCapability[]>;
```

Rules the UI must honour: never offer an output format whose `encode` is `unavailable`; always show
`lazyBytes` before triggering a lazy download; always surface `unavailableReason` instead of a
generic error (P8).

---

## 6. Exhaustive option reference

This is the canonical option list. Every entry has a typed schema field (§10.2) and a UI control.
**Defaults are chosen so that a step with all-default options is a no-op** (principle P9).

### 6.1 Global export options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `format` | `FormatId` | *same as input* | |
| `quality` | 1–100 | `82` | Lossy formats; named anchors per §3.3 |
| `lossless` | boolean | `false` | WebP, JXL, AVIF |
| `nearLossless` | 0–100 \| `off` | `off` | WebP only |
| `effort` | 0–10 | per-codec | AVIF `speed`, JXL `effort`, oxipng `level`, WebP `method` |
| `progressive` | boolean | `false` | JPEG progressive / PNG interlace |
| `chromaSubsampling` | `keep \| 4:4:4 \| 4:4:0 \| 4:2:2 \| 4:2:0 \| 4:1:1 \| 4:1:0` | `keep` | Exact OC option set |
| `bitDepth` | `keep \| 1 \| 2 \| 4 \| 8 \| 10 \| 12 \| 16` | `keep` | Filtered per format |
| `colorSpace` | `keep \| sRGB \| display-p3 \| adobe-rgb \| gray \| cmyk` | `keep` | OC offers sRGB/Gray/CMYK; we add wide-gamut |
| `iccProfile` | `preserve \| convert \| strip \| embed:<file>` | `preserve` | |
| `dpi` | integer \| `keep` | `keep` | Metadata only unless `resampleWithDpi` |
| `dpiUnit` | `none \| inches \| cm` | `none` | Exact OC option set |
| `resampleWithDpi` | boolean | `false` | When true, a DPI change resamples pixels |
| `stripMetadata` | `none \| all \| gps \| except-orientation-copyright` | `none` | |
| `targetSize` | `{ value, unit: 'KB' \| 'MB' }` \| `null` | `null` | Enables the search encoder (§10.5) |
| `targetSizeStrategy` | `quality \| quality-then-scale \| scale` | `quality` | |
| `backgroundColor` | CSS colour | `#FFFFFF` | Used when flattening alpha for a format without alpha |
| `flattenAlpha` | `auto \| always \| never` | `auto` | `auto` = only when the target lacks alpha |
| `filenameTemplate` | string | `{name}.{ext}` | Tokens: `{name} {ext} {w} {h} {index} {date} {recipe} {hash}` |

### 6.2 Resize (T24) — five modes

| Mode | Inputs |
| --- | --- |
| `pixels` | `width?`, `height?`, `lockAspect` (default `true`) — either dimension may be blank |
| `percent` | `scale` 1–1000 % |
| `reduceBy` | `percent` 1–99 — the SIR "make image N % smaller" wording |
| `targetBytes` | `value`, `unit`, `allowUpscale` (default `false`) |
| `fit` | `width` **and** `height` required, plus `fitMode` |

`fitMode` (CloudConvert parity, superset): `contain` · `cover` · `fill` · `inside` · `outside` ·
`pad`. With `pad`: `padColor`, `padAnchor` (3×3 grid).

Shared: `algorithm` (`lanczos3` default · `lanczos2` · `mitchell` · `catmull-rom` · `bicubic` ·
`bilinear` · `box` · `nearest` · `magic-kernel`), `sharpenAfterResize` 0–100 (default `0`),
`allowUpscale` (default `false`), `roundTo` (snap to a multiple of N, default `1`), `maxPixels`
guard (default `268435456` = 16384²).

**Preset packs** (T25), each `{ label, width, height, fitMode, format, quality }`:

- **Social** — Instagram post 1080×1080, portrait 1080×1350, story/reel 1080×1920; Facebook post
  1200×630, cover 820×312; X post 1600×900, header 1500×500; LinkedIn post 1200×627, cover
  1584×396; Pinterest pin 1000×1500; YouTube thumbnail 1280×720, channel art 2560×1440; TikTok
  1080×1920.
- **Print @300 DPI** — 4×6 in 1200×1800 · 5×7 1500×2100 · 8×10 2400×3000 · A4 2480×3508 ·
  A3 3508×4961 · A5 1748×2480 · US Letter 2550×3300 · Legal 2550×4200 · passport 35×45 mm 413×531.
- **App icons** — iOS (20…1024), Android mipmap (36…512), macOS `.icns` set, Windows `.ico` set
  (16…256), PWA (192, 512, maskable 512).
- **Email** — max width 600 px. **Web ladder** — 320/480/640/768/1024/1280/1536/1920/2560.

### 6.3 Crop (T26)

`x`, `y`, `width`, `height` (px or %) **or** edge offsets `cropTop` / `cropBottom` / `cropLeft` /
`cropRight` in px — the exact OC "Crop pixels from" control, offered as an alternate input mode on
the same panel.

Aspect presets: `free`, `original`, `1:1`, `4:3`, `3:2`, `16:9`, `21:9`, `9:16`, `2:3`, `3:4`,
`5:4`, `golden` (1.618:1), custom `w:h`. Overlays: none, thirds, grid, golden ratio, golden spiral,
centre cross, safe margins. `autoTrim`: `off` · `border` (uniform edge colour + `tolerance` 0–100) ·
`alpha` (transparent edges) · `content` (bounding box of non-background). `outputRounding`: snap to
even / multiple-of-N.

### 6.4 Rotate, flip, deskew (T28, T29)

`angle` −360…360 (float), `snap90` quick buttons, `expandCanvas` (default `true`), `fillColor` for
exposed corners, `interpolation` (`bicubic` default), `flipH`, `flipV`, `autoDeskew` (Hough
transform, ±20°, shows the detected angle for confirmation before applying),
`applyExifOrientation` (default `true` — normalize pixels then clear the tag), and
`batchPredicate` (`all` · `only-landscape` · `only-portrait` · `only-square` · `from-exif`) —
the iLoveIMG bulk-rotate behaviour.

### 6.5 Colour filters (T38)

The five OC filters with their exact names, plus our additions:

| Filter | Parameters |
| --- | --- |
| `none` (OC "no change") | — |
| `grayscale` | `method`: `luminance` (Rec.709, default) · `average` · `lightness` · `rec601` · `single-channel:R\|G\|B` |
| `monochrome` | `threshold` 0–255 (default 128), `dither`: `none \| floyd-steinberg \| ordered \| atkinson \| bayer` |
| `negate` (OC "Negate colors") | `channels`: `rgb` (default) · `r` · `g` · `b` · `alpha` |
| `retro` | `intensity` 0–100 (default 70) |
| `sepia` | `intensity` 0–100 (default 80), `tone` (default `#704214`) |
| `duotone` | `shadowColor`, `highlightColor`, `midpoint` |
| `gradientMap` | array of `{ stop: 0–1, color }` |
| `posterize` | `levels` 2–64 |
| `solarize` | `threshold` 0–255 |
| `vignette` | `amount`, `midpoint`, `roundness`, `feather`, `color` |
| `grain` | `amount`, `size`, `roughness`, `monochromatic` |
| `lut` | `.cube` / `.3dl` upload, `strength` 0–100 |

Plus 24 named presets, **all names our own**. The obvious set to copy here is Instagram's
(Clarendon, Gingham, Juno, Lo-Fi, 1977, X-Pro II…) — **those are Meta trademarks and must not be used**,
however common the practice is elsewhere. Our names are descriptive of the effect, which is both safer
and more useful to a user who has never seen the original:

*Warm Film · Cool Film · Faded Matte · Deep Matte · Soft Pastel · High Key · Low Key · Bleach Bypass ·
Cross Process · Split Tone · Cold Morning · Golden Hour · Blue Hour · Overcast · Desert · Forest ·
Neon Night · Cyanotype · Platinum · Silver Halide · Newsprint · Faded Poster · Slide Film · Tungsten.*

**Each preset is defined declaratively as a stack of the primitives above** in
`packages/engine/src/filters/presets.ts` — so none is a black box, all are user-editable, and none
reproduces a specific commercial look-up table. A preset that merely reimplements a named commercial
filter under a different name is still a problem; these are built from the primitives to be pleasing,
not to match anyone's output.

### 6.6 Enhancement toggles (T42–T44)

The OC checkbox set, implemented faithfully, each gaining an intensity control where meaningful:

| Option | Type | Default | Implementation |
| --- | --- | --- | --- |
| `enhance` | boolean + `amount` 0–100 | off | Auto-levels + auto-contrast + mild local tone map |
| `sharpen` | boolean + `amount`, `radius`, `threshold` | off | Unsharp mask |
| `antialias` | boolean + `amount` | off | Edge-aware post-scale smoothing |
| `despeckle` | boolean + `radius` | off | Median filter |
| `equalize` | boolean + `channels`, `clipLimit` | off | Histogram equalization / CLAHE |
| `normalize` | boolean + `lowPercentile`, `highPercentile` | off | Stretch to full range |
| `deskew` | boolean + `maxAngle`, `background` | off | See §6.4 |
| `noMultilayer` | boolean | off | OC "No multilayer" — flatten multi-page / multi-layer input to the composite |
| `blackWhiteThreshold` | `off \| 0–255 \| otsu \| adaptive` | `off` | OC "Set black-and-white threshold" |
| `denoise` | `method` (`median \| bilateral \| nlm`) + `strength` | off | |
| `blur` | `type` (`gaussian \| box \| motion \| radial \| lens \| zoom`) + `radius`, `angle` | off | |

### 6.7 Adjustments (T37)

All −100…+100, default `0`, unless noted: `exposure` (−5…+5 EV), `brightness`, `contrast`,
`highlights`, `shadows`, `whites`, `blacks`, `saturation`, `vibrance`, `temperature` (2000–50000 K,
default = detected), `tint` (green↔magenta), `hue` (−180…180°), `clarity`, `dehaze`, `gamma`
(0.1–5.0, default `1.0`), `opacity` (0–100, default `100`). Per-channel: `curvesRGB` / `curvesR` /
`curvesG` / `curvesB` (control-point arrays), `levelsInBlack` / `levelsGamma` / `levelsInWhite` /
`levelsOutBlack` / `levelsOutWhite`.

### 6.8 Watermark (T50)

| Option | Values |
| --- | --- |
| `kind` | `text` \| `image` |
| `content` (text) | String with tokens `{filename} {date} {time} {width} {height} {exif:Field}` |
| `fontFamily` | Self-hosted set + user upload + Local Font Access API |
| `fontSize` | px **or** % of image width |
| `fontWeight`, `italic`, `letterSpacing`, `lineHeight` | — |
| `color`, `strokeColor`, `strokeWidth`, `shadow{x,y,blur,color}` | — |
| `source` (image) | Uploaded file; `scale` as % of base width; `preserveAspect` |
| `opacity` | 0–100, default `50` |
| `rotation` | −180…180°, default `0` |
| `position` | 3×3 grid (`top-left` … `bottom-right`) \| `center` \| `custom{x,y}` |
| `offsetX`, `offsetY` | px or %, measured from the anchor |
| `mode` | `single` \| `tiled` \| `diagonal-tiled` |
| `spacingX`, `spacingY`, `stagger` | Tiled modes only |
| `blendMode` | `normal \| multiply \| screen \| overlay \| soft-light \| difference` |
| `scaleWithImage` | boolean, default `true` — keeps relative size constant across a mixed-size batch |

### 6.9 Metadata (T54, T55)

**Read:** EXIF (all IFDs, incl. MakerNote for Canon / Nikon / Sony / Fuji / Olympus / Panasonic),
IPTC-IIM, XMP (all namespaces), ICC header + tags, JFIF, PNG `tEXt` / `iTXt` / `zTXt` / `eXIf`,
GIF comment extension, WebP `EXIF` / `XMP` / `ICCP` chunks, AVIF / HEIF item properties, and
C2PA / CAI manifests with a validity report. GPS is shown as decimal + DMS + a copy-able `geo:` URI —
**no map tiles are fetched**, because that would violate P5.

**Write / strip presets:** `Keep everything` · `Strip all` · `Strip GPS only` ·
`Strip all except Orientation + Copyright` · `Strip MakerNotes only` · `Custom` (per-field checkbox
tree). Editable fields: Artist, Copyright, ImageDescription, UserComment, DateTimeOriginal, Software,
Rating, Keywords, GPS coordinates, Orientation.

### 6.10 Animation options (T12–T14)

`fps` or per-frame `delayMs`; `loopCount` (0 = infinite); `paletteSize` 2–256;
`paletteMode` (`global \| per-frame \| adaptive`); `quantizer` (`neuquant \| median-cut \| octree \| wu`);
`dither` (`none \| floyd-steinberg \| ordered \| atkinson \| sierra`) + `ditherAmount` 0–100;
`transparencyIndex`; `disposeMethod` (`unspecified \| none \| background \| previous`);
`optimizeLevel` 1–3 and `lossy` 0–200 (our own optimizer, matching the well-known `-O`/`--lossy`
semantics without using that GPL implementation); `interlace`;
frame generators `reverse` / `bounce` / `crossfade`; and for video sources `trimStart`, `trimEnd`,
`skipFrames`, `maxFrames`.

### 6.11 Batch options (T72)

`concurrency` (auto = `navigator.hardwareConcurrency − 1`, clamped 1–16, user-overridable),
`onError` (`stop \| skip \| retry:N`), `outputMode` (`zip \| individual \| folder` via File System
Access API), `zipCompression` (`store \| deflate:1–9`), `preserveFolderStructure`,
`skipIfUnchanged`, `dedupeIdentical`, `sortOrder` (`name \| size \| date \| natural`), and
`memoryCeiling` in MB — the scheduler reduces concurrency rather than crashing the tab (§19.4).

---

## 7. Technology decisions

Each decision records the alternative rejected and why, so a future maintainer can revisit it with the
original reasoning intact.

### 7.1 Application framework

**Decision: SvelteKit 2 + Svelte 5 (runes) + TypeScript (strict) + Vite 6,
`@sveltejs/adapter-static`.**

| Alternative | Why not |
| --- | --- |
| Next.js + React | ~45 kB larger baseline JS for zero benefit here; we render no server content. The interaction budget in §19 is tight enough that Svelte's compiled reactivity matters for the editor canvas |
| Vanilla TS + no framework | 81 tools with shared state needs a component model; hand-rolling one is a worse use of the budget |
| Astro + islands | Excellent for the 81 landing pages, worse for the single stateful editor. SvelteKit prerendering gets us most of Astro's benefit |

**Constraint that makes this reversible:** all logic lives in `packages/engine` (framework-agnostic,
zero DOM dependencies). The Svelte layer is a view. Swapping frameworks touches `apps/web` only.

### 7.2 Non-negotiable platform APIs

| API | Use | Fallback when absent |
| --- | --- | --- |
| `Worker` (module workers) | All decode/encode/transform off the main thread | None — hard requirement; show an unsupported-browser page |
| `OffscreenCanvas` | Worker-side rasterization | Main-thread `<canvas>` with a yield loop, and a UI note that previews will be less smooth |
| `WebAssembly` + `WebAssembly.instantiateStreaming` | All codecs | Hard requirement |
| WASM SIMD | 2–5× on most codecs | Non-SIMD build fetched instead; capability-probed, not UA-sniffed |
| WASM threads (`SharedArrayBuffer`) | libvips / libjxl parallelism | Single-threaded build. Requires COOP/COEP headers — see §23.4 |
| `WebGPU` | GPU filter/adjustment pipeline, ONNX acceleration | WebGL2 → then CPU WASM. Three tiers, probed |
| `WebGL2` | Filter pipeline tier 2 | CPU |
| File System Access API | T74 folder watch, folder output | Hidden; `<input type=file>` + ZIP download |
| `showSaveFilePicker` | Save-as | Anchor download |
| Origin Private File System | Large-file scratch space, spill for batches | In-memory with a lower `memoryCeiling` |
| `navigator.storage.estimate()` | Quota-aware caching | Assume 50 MB budget |
| Local Font Access API | Text/watermark font list | Self-hosted font set only |
| Web Share API (level 2, files) | Share result to OS | Download button |
| `crypto.subtle` | Key encryption at rest (§16) | Disable persistent key storage; session-only |
| Clipboard API (`read`/`write` with `ClipboardItem`) | Paste an image in, copy result out | Drag-drop only |
| `navigator.hardwareConcurrency` | Worker pool sizing | Assume 4 |
| `performance.measureUserAgentSpecificMemory()` | Memory pressure signal | Heuristic from processed bytes |

### 7.3 Codec and processing libraries

Pinned, audited, self-hosted. **No runtime CDN fetches** (P5) — all WASM binaries are served from our
own origin with long-lived immutable cache headers and SRI-equivalent integrity checks (§23.5).

| Concern | Library | Why | Load |
| --- | --- | --- | --- |
| JPEG encode/decode | `@jsquash/jpeg` (MozJPEG) | Best size/quality; exposes trellis, subsampling, progressive | eager |
| PNG encode/decode | `@jsquash/png` + `@jsquash/oxipng` | Decode + true lossless optimization | eager |
| WebP | `@jsquash/webp` | Full libwebp option surface incl. animation | eager |
| AVIF | `@jsquash/avif` | libavif with speed/depth/chroma control | lazy |
| JPEG XL | `@jsquash/jxl` | Effort, distance, lossless raster mode; reversible JPEG transcode is not exposed in the pinned codec | lazy |
| Resize (high quality) | `@jsquash/resize` + `pica` | `pica` for the interactive path (fast, WebGL/worker), jSquash for final export fidelity | eager |
| **Simple raster long tail** — BMP, DIB, TGA, PCX, PPM/PGM/PBM/PNM/PAM, WBMP, XBM/XPM, ICO, CUR, DDS, QOI, SGI/RGB, Sun Raster, Radiance HDR, PFM, FITS | **our own**, `packages/engine/src/codecs/simple/` | These are byte-layout formats with public specifications — each is 100–400 lines, and writing them removes the need for any copyleft mega-dependency. See §25.4 | eager (tiny) |
| TIFF | `UTIF.js` | MIT. Baseline + LZW/Deflate/PackBits, multipage | lazy |
| OpenEXR | **v1 unsupported**; experimental `parse-exr` is not exposed as production support | A complete, reproducible TinyEXR WASM build has not been produced | none |
| JPEG 2000 | **v1 unsupported** | No verified browser distribution or reproducible, licence-recorded OpenJPEG WASM build exists | none |
| GIF decode | `gifuct-js` | MIT | eager |
| GIF encode + optimize | **our own**, `codecs/gif/` | `gifsicle` is **GPL-2.0** and cannot ship. We implement LZW (patent expired 2004), palette quantization, frame differencing, transparency optimization, and the `-O1..3`-equivalent passes ourselves. See §25.4 | eager |
| HEIC / HEIF decode | **platform image APIs** (`ImageDecoder`, then `createImageBitmap` / image element) | `libheif` is **LGPL-3.0** and HEVC carries active patent pools. We use the OS/browser decoder where the platform provides one and report unavailable elsewhere. **No HEIC encode, ever** | none — platform |
| Camera RAW | **our own**, `codecs/raw/` | `LibRaw` is **LGPL-2.1**. Stage 1 extracts the largest embedded camera rendering — preserving JPEG previews byte-for-byte and losslessly exporting uncompressed RGB TIFF previews as BMP — using bounded container/IFD parsing and no demosaic. Stage 2 is our own demosaic pipeline, starting with DNG (Adobe's spec is published) | lazy |
| SVG → raster | `@resvg/resvg-wasm` | MPL-2.0 — file-level copyleft, allowlisted, no linking obligation | lazy |
| Raster → SVG | `imagetracerjs` | **Public domain (Unlicense).** Explicitly *not* `potrace`, which is **GPL-2.0** | lazy |
| PDF read | `pdfjs-dist` | Apache-2.0 | lazy |
| PDF write | `pdf-lib` | MIT | lazy |
| PSD / PSB | `ag-psd` | MIT | lazy |
| EPS / PS | **our own preview extractor** + minimal PS subset | Ghostscript is **AGPL-3.0** and aggressively enforced. Most EPS files embed a TIFF or WMF preview per the EPSF spec — we extract it, and interpret a documented subset for simple vector EPS. Anything beyond that is reported unsupported with the reason (P8) | lazy |
| Video decode (T13) | **platform `VideoDecoder`** (WebCodecs) + `mp4box.js` (BSD-3) for demuxing | `ffmpeg.wasm` is LGPL and drags in H.264/HEVC patent exposure. The platform decoder is cleaner, faster, and removes a 25 MB download. Strictly better on every axis | none — platform |
| CBZ / CBR | `libarchive.js` | BSD-2. Uses libarchive's **own** RAR reader, not the `unrar` source, whose licence forbids reuse. ⚠ verify RAR3 vs RAR5 coverage | lazy |
| EXIF/IPTC/XMP read | `exifr` | Fastest, most complete, tree-shakeable | eager |
| EXIF write/strip | `piexifjs` + custom chunk surgery for PNG/WebP/AVIF | Byte-level control, no re-encode | eager |
| ICC parsing | custom (`packages/engine/src/icc`) | ~300 lines; avoids a heavy dep | eager |
| **Tier 1 CV — simple ops** | hand-rolled in `packages/engine/src/cv/` | Flood fill, colour range, chroma key, Otsu/Sauvola, Hough, Canny/Sobel, spectral-residual saliency, Reinhard colour transfer, histogram matching, CLAHE, bilateral, median, unsharp, Laplacian-pyramid blend, DCCI, NEDI, pHash, SSIM. Each is 40–300 lines. Hand-rolling gives exact licence clarity, no bundle cost, worker-safety, and testability — all of which matter more here than saving a week | eager (SIMD-optimized WASM for the hot kernels) |
| **Tier 1 CV — heavy ops** | No OpenCV runtime is currently bundled. The engine exports its local TypeScript/JavaScript methods: colour-range/watershed segmentation, Telea and Navier–Stokes inpainting, and band-limited alpha matting/refinement | Only cleared methods are described as shipping. GrabCut, `seamlessClone`, and any uncleared algorithm are excluded regardless of the OpenCV source licence. Route wiring, representative benchmarks, and STCC remain tracked in Phase 4 | lazy engine modules |
| **Tier 1 — inpainting** | Current local methods: Telea, Navier–Stokes, confidence-priority, Efros–Leung, and quilting | T66 has both a three-texture generated comparison and an eight-case CC0 photo-derived synthetic-occlusion proxy with known hidden pixels. Neither measures real object removal or structural fills. Criminisi is not implemented | lazy engine module |
| **Tier 1 — matting** | Hand-rolled band-limited colour-unmixing solve, joint-bilateral refinement, alpha-band trim, and defringe | Closed-form and KNN matting are not implemented; hair/fur quality has no measured reference corpus | lazy engine module |
| **Tier 1 — pixel-art scaler** | clean-room 3×3-neighbourhood implementation in packages/engine/src/cv/pixel-art.ts | Four generated fixtures measured at ×2/×3/×4; no RGB palette additions after the strict-majority fix. Representative sprite quality and route-level STCC remain open; GPL/LGPL reference implementations stay excluded | lazy |
| **Tier 2 — segmentation (candidate, blocked)** | `onnxruntime-web` is pinned and available; U²-Net / ISNet / BiRefNet weights have not been approved or registered | No segmentation model is shipped or loaded. Exact model terms and hashes must be approved before measurement or use. Never use `@imgly/background-removal` with its non-commercial BRIA RMBG-1.4 weights | not included |
| **Tier 2 — upscale** | `onnxruntime-web` + pinned public Real-ESRGAN x2/x4 ONNX exports; Swin2SR q4f16 is an unapproved exploratory candidate | The Tier 1 route remains the default. Tier 2 is user-started, size-disclosed, streamed with progress, SHA/size-checked before IndexedDB caching, and smoke-tested locally in the browser before use. The current public Hugging Face source is pinned to an immutable revision; optional per-model Docker runtime fallbacks can replace an inaccessible origin but must serve identical registered bytes. Docker does not fetch model files. The dedicated model card declares BSD-3-Clause for the exports, and the owner separately accepts the upstream label for exact `.pth` source checkpoints. Across 16 controlled synthetic x4 pairs, Real-ESRGAN scored below Tier 1 on PSNR and SSIM; Swin2SR q4f16 improved aggregate metrics modestly but had mixed per-class PSNR and slow CPU/WASM runtime. Swin2SR's publisher-declared Apache-2.0 card is recorded, but a separate per-file notice and training-data provenance were not found, so it is not selected. Results do not cover real degraded camera photos. Community fine-tunes remain excluded | no model binary bundled; delivery code implemented, route STCC and real-photo evidence remain open |
| Face detection | Cleared Tier 1 Viola–Jones cascade only; MediaPipe `.task` runtime/model path is not included | The registered cascade data is separate from the model-based `.task` assets, which remain excluded pending exact review. Labelled accuracy corpus and route-level STCC are open | Tier 1 only |
| OCR | `tesseract.js` + `tesseract.js-core` (Apache-2.0) | All 163 recursive `tessdata_fast` entries are individually hash-registered as Apache-2.0; 162 are binary model assets and the deprecated `frk` entry is a symlink pointer to `deu_latf`. Worker/core stay same-origin. A selected model uses its local static file when present; otherwise the exact pinned jsDelivr commit serves the model, except `script/Latin.traineddata` (89,384,811 bytes), which falls back to its exact pinned `raw.githubusercontent.com` source after jsDelivr's 403. The browser delivery smoke reached the pinned Latin fallback and returned OCR output; a separate streamed source check verified the registered byte length and SHA-256. Only `script/Cyrillic.traineddata` is bundled. `pnpm ocr:verify-catalog` checks the 162 lazy URLs by HEAD without downloading models; it currently sees 161 jsDelivr successes and the expected Latin 403/raw fallback. OSD and Script data are requested only when selected. The test preparer downloads only named models into the ignored static cache and verifies their registered size and SHA-256; a clean production build prunes that cache. By default Playwright prepares English and OSD; set `PLAYWRIGHT_SKIP_OCR_TESSDATA_PREFETCH=1` for a focused E2E such as `pnpm exec playwright test e2e/ocr.spec.ts --project=chromium --grep "bundled Cyrillic"` to preserve and test the one-file bundled cache. The first accuracy measurement covers eight languages only. Hausa is absent from the official model set | same-origin worker/core; lazy per language/helper |
| ZIP | `fflate` | Smallest, streaming, worker-safe | eager |
| ICC profiles we ship | **our own**, generated from published primaries | The **Adobe RGB (1998) profile is Adobe-copyrighted and not redistributable**, and vendor profiles generally are not either. We synthesize working profiles from published primaries, white point, and transfer curves (sRGB per IEC 61966-2.1, Display P3 per SMPTE RP 431-2 + sRGB TRC, Adobe-RGB-compatible from its published chromaticities), labelled as *compatible with*, never as the vendor's profile. A user's embedded profile is always preserved verbatim regardless | eager |
| Perceptual hashing | custom (`packages/engine/src/phash`) | ~150 lines | eager |
| Quality metrics | custom SSIM/PSNR + `butteraugli` WASM | Compare tool credibility | lazy |
| Colour maths | `culori` | Correct Lab/LCH/OKLab conversions | eager |

**OCR production-delivery invariant:** Production builds never bulk-download language, script, or
helper `.traineddata` files to the app server. `ocr:fetch-assets` is an explicit test/development
preparer that accepts only named model IDs; clean web builds prune its ignored cache before Vite
builds. `.dockerignore` excludes local generated builds and every cached `.traineddata` file except
the pinned Cyrillic model whose CDN request returns 403. The nginx runtime stage serves only the
static app build. When a selected model is absent locally, the browser worker fetches it directly
from the exact pinned jsDelivr URL (or the registered raw GitHub URL for oversized Latin); the app
server does not proxy or save that response. The browser uses Tesseract.js' IndexedDB model cache
where available, and normal HTTP caching follows the CDN response headers; browser storage can be
evicted, so warm-cache offline use is not a first-use or permanent-offline guarantee. A clean
production Docker build was inspected: its only `.traineddata` file is the 29,252,466-byte
`script/Cyrillic.traineddata` fallback.

**T32 model delivery:** Tier 1 loads first; optional Tier 2 downloads only after the user starts it.
The selected x2 and x4 exports are 67,156,218 bytes and 67,132,609 bytes, pinned to Hugging Face
revision `d14119a40dfeef208e4e724dfaceb2640d2df95b`, and registered by exact SHA-256 in
`docs/model-assets.json`. Docker writes runtime URL configuration but never downloads or packages
the model files. Set `T32_ESRGAN_X2_URL` / `T32_ESRGAN_X4_URL` to replace a primary URL and
`T32_ESRGAN_X2_FALLBACK_URL` / `T32_ESRGAN_X4_FALLBACK_URL` for optional fallback hosts; fallback
is attempted after primary HTTP 403 or browser network/CORS failure. Every host must serve the exact
registered bytes. The browser verifies size and SHA, caches the file locally, runs a small inference
probe, and keeps Tier 1 available on failure. The chosen public repo is externally controlled and
may disappear; the URL override and fallback support replacement after the replacement files pass
registration and validation. See [the host assessment](docs/t32-model-hosting.md). The owner-directed
BSD-3 acceptance applies to the two exact upstream `.pth` checkpoints; the ONNX model card's
publisher-declared BSD-3 evidence is recorded separately.

**⚠ VERIFY before implementing:** pin exact versions, confirm licences **at the pinned version** (a
package can relicense between releases — record each in `docs/THIRD-PARTY-LICENSES.md`), confirm
transitive dependencies, and confirm worker-compatibility. Any package needing DOM access must be
wrapped to run on the main thread only, documented as a performance exception.

**The licence rule that drives the table above:** `packages/engine` is Apache-2.0 (§25.2), so it can
take MIT / BSD / Apache-2.0 / ISC / Zlib / IJG / MPL-2.0 / Unlicense / CC0 — and **cannot** take GPL, LGPL,
or AGPL. That single constraint is why `wasm-vips` (LGPL-2.1), `gifsicle` (GPL-2.0), `libheif`
(LGPL-3.0), `LibRaw` (LGPL-2.1), `potrace` (GPL-2.0), `ffmpeg` (LGPL-2.1), and Ghostscript (AGPL-3.0)
are all absent. Every one of them was in an earlier draft of this plan; every one is now replaced by a
permissive library, a platform API, or our own implementation. The full accounting is §25.3.

LGPL deserves a specific note, because "just dynamically link it" is the usual hand-wave: LGPL's
relinking obligation maps poorly onto a WASM module bundled into a web app, and the analysis is
genuinely unsettled. We do not want to be the test case, and we do not want to hand our users an
ambiguity. Treating LGPL as excluded is a deliberate, conservative call — recorded as an ADR rather
than left implicit.

### 7.4 Styling and UI

- **Tailwind CSS 4** with a design-token layer (§12). No component library — the editor's needs are
  too specific and a library would cost more in overrides than it saves.
- **Headless primitives:** `bits-ui` (Svelte) for dialog, popover, select, slider, tabs, tooltip —
  chosen because it is unstyled and accessibility-complete.
- **Icons:** `lucide-svelte`, tree-shaken, inlined at build.
- **Fonts:** self-hosted, subset, `font-display: swap`, variable where available.

### 7.5 What we deliberately do not use

| Not used | Reason |
| --- | --- |
| Any analytics SDK | P5. Use privacy-preserving server-log aggregation at the CDN edge instead (§24.5) |
| Any error-reporting SDK (Sentry etc.) | P5 + P2. Errors are surfaced to the user with a copy-to-clipboard diagnostic bundle they choose to share |
| Any CSS/JS CDN | P5, P6, and it breaks the CSP posture |
| Cookies | Nothing to track. `localStorage`/IndexedDB only, all user-visible and user-clearable |
| A backend | P7. There is no server that could receive a key or a pixel |
| Service-side image processing | The entire thesis |

### 7.6 Per-page delivery architecture

**Every tool is its own standalone HTML document.** This is normative, and it is the reason the SEO
strategy in §24 and the speed budgets in §19 are simultaneously achievable — they are the same
architectural decision viewed from two angles.

| # | Rule | Why |
| --- | --- | --- |
| D1 | **One prerendered `.html` file per route**, generated at build time via `adapter-static` with `export const prerender = true`. No SSR at runtime, no client-side-only routes for anything indexable | A crawler receives complete HTML with zero JS execution. A user receives paintable content in one round trip |
| D2 | **Route-level code splitting.** A tool page loads its own tool's JS and nothing else. There is no global app bundle | `/heic-converter` must not pay for the layered editor, the AI subsystem, or 80 other tools |
| D3 | **The engine core is a separate long-cached chunk**, shared across pages. Per-tool ops are separate chunks again | First visit to any tool warms the core for every other tool; each tool's marginal cost is small |
| D4 | **Codec WASM is fetched per *use*, never per page load.** Landing on `/avif-converter` does not download the AVIF encoder until a file is dropped | §19.1's 1 MB first-visit budget survives contact with 90 formats |
| D5 | **The page is useful before JS runs.** H1, description, option explanations, format notes, FAQ, and internal links are static HTML. Only the tool surface hydrates | Content ranks and reads even if JS fails, is blocked, or is still loading |
| D6 | **Progressive enhancement on the entry point.** The file input is a real `<input type="file">` in the served HTML; drag-drop, paste, and folder support are layered on at hydration | The core action never depends on a bundle finishing |
| D7 | **Each page is independently loadable and independently cacheable.** Deep-linking to any of the ~680 pages must work on a cold cache with no prior visit | Every page is a landing page — that is the entire acquisition model |
| D8 | **Client-side routing is an enhancement, not a dependency.** Once hydrated, SvelteKit's router makes subsequent navigation instant with intent-based prefetch; before hydration, plain links work | App-like speed for repeat users, document semantics for crawlers and first-time visitors |
| D9 | **Per-page budgets are enforced individually**, not as an average (§19.1). `size-limit` has one entry per route archetype | An average lets one bloated page hide behind 80 lean ones |
| D10 | **No page imports another page's module graph.** Shared code goes to `packages/ui` or `packages/engine` | Prevents the slow collapse into a monolith as tools start reusing each other's panels |

**Route archetypes** — every one of the ~680 pages is an instance of one of these, so there are only
five things to optimize and five things to test:

| Archetype | Count | Hydration | JS budget |
| --- | --- | --- | --- |
| Tool page (T01–T81) | 81 | Tool surface only | ≤ 90 kB |
| Format-pair page (`/convert/heic-to-jpg`) | ~600 | Same as tool page, options preset from the route | ≤ 90 kB |
| Reference page (`/docs/formats/*`, guides) | ~120 | **None** — pure static HTML + CSS | ≤ 0 kB |
| Connect-AI page (`/connect-ai/*`) | ~12 | Credential form only | ≤ 45 kB |
| App shell (`/editor`, `/batch`, `/recipe`) | 3 | Full | ≤ 220 kB |

The reference pages shipping **zero JavaScript** is deliberate: roughly a fifth of the site is pure
documentation, and it should be as fast as a text file, because that is what it is.

---

## 8. Architecture

### 8.1 Layers

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/web  (SvelteKit, prerendered)                              │
│  ├─ routes/            76 tool pages + docs + connect-ai         │
│  ├─ lib/components/    presentational, no engine logic           │
│  └─ lib/stores/        UI state only (selection, panels, theme)  │
└───────────────────────────┬──────────────────────────────────────┘
                            │ typed, async, cancellable
┌───────────────────────────▼──────────────────────────────────────┐
│  packages/engine  (framework-free, isomorphic, npm-published)    │
│  ├─ pipeline/     Recipe → Plan → Execution                      │
│  ├─ ops/          one module per operation (pure, testable)       │
│  ├─ codecs/       decode/encode registry + lazy loaders           │
│  ├─ capabilities/ runtime probing                                 │
│  ├─ metadata/     read / write / strip                            │
│  ├─ color/        spaces, ICC, LUTs                               │
│  ├─ ai/            provider registry + adapters (§14)             │
│  └─ scheduler/    worker pool, memory governor, cancellation      │
└───────────────────────────┬──────────────────────────────────────┘
                            │ postMessage + transferables
┌───────────────────────────▼──────────────────────────────────────┐
│  Worker pool  (N = hardwareConcurrency − 1)                      │
│  each worker lazily instantiates only the WASM modules it needs   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 The pipeline model

Everything is a **Recipe**: an ordered list of steps plus an export spec. A single-purpose tool page is
a Recipe with one step and a constrained UI. The Batch Runner is the same Recipe applied to N inputs.
This is the core structural decision — it is why 81 tools do not mean 81 implementations.

```ts
interface Recipe {
  version: 1;
  id: string;
  name?: string;
  steps: Step[];
  export: ExportOptions;   // §6.1
}

type Step =
  | { op: 'decode';      options: DecodeOptions }
  | { op: 'resize';      options: ResizeOptions }
  | { op: 'crop';        options: CropOptions }
  | { op: 'rotate';      options: RotateOptions }
  | { op: 'adjust';      options: AdjustOptions }
  | { op: 'filter';      options: FilterOptions }
  | { op: 'enhance';     options: EnhanceOptions }
  | { op: 'watermark';   options: WatermarkOptions }
  | { op: 'metadata';    options: MetadataOptions }
  | { op: 'mask';        options: MaskOptions }
  | { op: 'composite';   options: CompositeOptions }
  | { op: 'ai';          options: AiStepOptions }     // §13
  | { op: 'custom';      options: Record<string, unknown> };
```

**Invariants:**

1. A Recipe is **pure data** — JSON-serializable, no functions, no blobs. Binary inputs (a watermark
   image, a LUT file, a mask) are referenced by content hash into an `AssetStore`, never inlined.
2. Steps operate on a single canonical intermediate: `RasterImage` (§10.1). Every op takes one and
   returns one.
3. Order is meaningful and never reordered silently. The planner may *fuse* adjacent ops for
   performance but must produce pixel-identical output; fusion is verified by a property test (§22.4).
4. A Recipe is versioned. A future breaking change bumps `version` and ships a migration function;
   old shared links must keep working forever.

### 8.3 Plan compilation

`compile(recipe, inputMeta) → Plan` resolves the abstract recipe against reality:

- picks the execution tier per step (`webgpu` → `webgl2` → `wasm-simd` → `wasm` → `js`)
- resolves lazy codec loads and reports total download cost up front
- fuses adjacent pixel-local ops into one pass (all `adjust` + `filter` steps become one shader/kernel)
- computes peak memory and, if it exceeds the governor's ceiling, switches to a **tiled** strategy
- decides whether the operation can run on a downscaled proxy for preview (§8.5)
- returns `{ steps, tier, estimatedPeakBytes, lazyDownloads, warnings }` — all surfaced in the UI
  before the user commits

### 8.4 Worker pool and cancellation

- One pool, `N = clamp(hardwareConcurrency − 1, 1, 16)`, created lazily on first use.
- Workers are **specialized on demand**: a worker that has instantiated libvips is preferred for the
  next libvips job (affinity scheduling) to avoid repeated instantiation cost.
- Every job carries an `AbortSignal`. Cancellation is cooperative: WASM calls are chunked so a signal
  is observed within 50 ms. A cancelled job's memory is freed before the next job starts.
- The pool exposes backpressure: `pool.pressure` ∈ `0..1`, which the UI uses to throttle live preview
  updates rather than queueing them.

### 8.5 Preview vs. export (the responsiveness trick)

The single most important UX mechanism. Two resolutions, one recipe:

| Path | Resolution | Tier | Target latency |
| --- | --- | --- | --- |
| **Live preview** | Proxy, longest edge ≤ 2048 px (≤ 1024 on low-memory devices) | GPU if available | < 16 ms per frame while dragging |
| **Committed preview** | Proxy at full display size, debounced 120 ms | GPU or WASM | < 300 ms |
| **Export** | Full resolution, tiled if needed | Highest-fidelity tier | Progress-reported, cancellable |

The proxy is generated once per input and cached. Adjustments and filters render to the proxy in
real time; the export re-runs the identical recipe at full resolution. A property test asserts that
proxy and full-resolution paths produce visually equivalent results (SSIM ≥ 0.99 after downscaling the
full result to proxy size) so the preview never lies.

### 8.6 Memory governor

Large images are the primary crash source in browser image tools. The governor:

1. Estimates `peakBytes` per plan: `w × h × channels × bytesPerChannel × (1 + concurrentBuffers)`.
2. Compares against a budget: `min(deviceMemoryHint × 0.25, 1.5 GB)` on 64-bit,
   `min(…, 512 MB)` where `WebAssembly.Memory` growth is constrained.
3. If over budget, in order: reduce batch concurrency → switch to tiled processing
   (512×512 tiles with a halo sized to the largest kernel radius) → spill intermediates to OPFS →
   finally refuse with a specific message naming the limit and the largest dimension that would work.
4. Never silently downsamples the user's image to fit. That would violate P9 and P8.

### 8.7 Error model

```ts
type EngineError =
  | { kind: 'unsupported-format';    format: string; remedy: string }
  | { kind: 'codec-unavailable';     format: string; reason: string; remedy: string }
  | { kind: 'decode-failed';         format: string; detail: string; remedy: string }
  | { kind: 'out-of-memory';         neededBytes: number; budgetBytes: number; remedy: string }
  | { kind: 'dimension-limit';       limit: number; actual: number; remedy: string }
  | { kind: 'cancelled' }
  | { kind: 'ai-not-configured';     capability: AiCapability; remedy: string }
  | { kind: 'ai-provider-error';     provider: string; status?: number; providerMessage?: string; remedy: string }
  | { kind: 'ai-cors-blocked';       provider: string; remedy: string }
  | { kind: 'ai-rate-limited';       provider: string; retryAfterMs?: number; remedy: string }
  | { kind: 'ai-auth-failed';        provider: string; remedy: string }
  | { kind: 'internal';              detail: string; remedy: string };
```

Every variant carries `remedy` — a plain-language, actionable next step rendered verbatim in the UI.
This is the enforcement mechanism for P8. A code review that adds an error without a useful `remedy`
is rejected.

---

## 9. Repository layout

```
image.complianttools.com/
├── README.md                        ← this file (the spec)
├── package.json                     ← pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json                       ← task graph (build, test, lint, typecheck)
├── tsconfig.base.json
├── .editorconfig  .gitattributes  .gitignore
├── .github/workflows/
│   ├── ci.yml                       ← lint, typecheck, unit, fixture, a11y, budget
│   ├── e2e.yml                      ← Playwright across Chromium/Firefox/WebKit
│   ├── provider-contract.yml        ← nightly BYOK adapter contract tests (§22.7)
│   └── deploy.yml
├── docs/
│   ├── ARCHITECTURE.md              ← expanded §8, kept in sync
│   ├── ADR/                         ← one file per architecture decision record
│   ├── THIRD-PARTY-LICENSES.md
│   ├── PROVIDERS.md                 ← generated from the adapter registry
│   ├── SECURITY.md
│   └── CONTRIBUTING.md
├── packages/
│   ├── engine/                      ← the product. framework-free, published to npm
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts             ← RasterImage, Recipe, Step, errors
│   │   │   ├── capabilities.ts
│   │   │   ├── pipeline/
│   │   │   │   ├── compile.ts       ← Recipe → Plan
│   │   │   │   ├── execute.ts
│   │   │   │   ├── fuse.ts
│   │   │   │   ├── tile.ts
│   │   │   │   └── migrate.ts       ← recipe version migrations
│   │   │   ├── scheduler/
│   │   │   │   ├── pool.ts
│   │   │   │   ├── worker.ts
│   │   │   │   └── memory-governor.ts
│   │   │   ├── codecs/
│   │   │   │   ├── registry.ts
│   │   │   │   ├── jpeg.ts  png.ts  webp.ts  avif.ts  jxl.ts
│   │   │   │   ├── tiff.ts  svg.ts  pdf.ts  psd.ts
│   │   │   │   ├── heic.ts          ← thin wrapper over platform ImageDecoder
│   │   │   │   ├── video.ts         ← thin wrapper over platform VideoDecoder
│   │   │   │   ├── gif/             ← OURS: LZW, quantize, frame-diff, optimize
│   │   │   │   ├── raw/             ← OURS: preview extract → demosaic pipeline
│   │   │   │   ├── eps/             ← OURS: preview extract + PS operator subset
│   │   │   │   ├── simple/          ← OURS: bmp tga pcx pnm pam wbmp xbm ico cur
│   │   │   │   │                       dds qoi sgi ras hdr pfm fits apng
│   │   │   │   │   ├── _framework/  ← BitReader/Writer + header-descriptor DSL
│   │   │   │   │   └── <format>.ts
│   │   │   │   └── embedded/        ← LVGL + generic C-array emitters
│   │   │   ├── ops/                 ← one file per op, pure functions
│   │   │   │   ├── inpaint/exemplar/  ← OURS: Efros-Leung + quilting + priority
│   │   │   │   ├── retarget/          ← OURS: saliency-weighted warp (not seam carving)
│   │   │   │   ├── matting/refine/    ← OURS: joint bilateral + alpha-band trim
│   │   │   │   └── upscale/pixelart/  ← OURS: 3x3 rule tables, our own design
│   │   │   ├── cv/                  ← OURS: ~25 classical primitives (§7.3)
│   │   │   ├── filters/
│   │   │   │   ├── primitives.ts
│   │   │   │   └── presets.ts       ← the 24 named looks, declaratively, own names
│   │   │   ├── metadata/
│   │   │   ├── color/               ← spaces, LUT, culori wrappers
│   │   │   │   └── icc/build.ts     ← OURS: synthesize profiles from primaries
│   │   │   ├── analysis/            ← phash, ssim, psnr, saliency, histogram
│   │   │   ├── gpu/                 ← WebGPU + WebGL2 backends
│   │   │   └── ai/                  ← §13, §14
│   │   │       ├── registry.ts
│   │   │       ├── types.ts
│   │   │       ├── transport.ts     ← fetch wrapper, retry, relay, CORS probe
│   │   │       ├── keystore.ts      ← §16
│   │   │       └── adapters/
│   │   │           ├── anthropic.ts     openai.ts        google.ts
│   │   │           ├── stability.ts     bfl.ts           fal.ts
│   │   │           ├── replicate.ts     removebg.ts      clipdrop.ts
│   │   │           └── openai-compatible.ts
│   │   └── test/
│   │       ├── fixtures/            ← one real file per supported format
│   │       ├── golden/              ← reference outputs, hash-pinned
│   │       └── contract/            ← recorded provider fixtures
│   ├── ui/                          ← shared Svelte primitives + design tokens
│   ├── cli/                         ← `ctimg` — runs a Recipe JSON in Node
│   └── extension/                   ← MV3 browser extension (right-click → open here)
├── apps/
│   ├── web/                         ← the SvelteKit app
│   │   ├── src/routes/
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte                 ← home
│   │   │   ├── (tools)/[...tool]/            ← 76 tool routes, config-driven
│   │   │   ├── connect-ai/                   ← §17, the teaching page
│   │   │   │   ├── +page.svelte
│   │   │   │   └── [provider]/+page.svelte   ← one walkthrough per provider
│   │   │   ├── recipe/[hash]/                ← shared recipe loader
│   │   │   ├── docs/                         ← format pages, guides
│   │   │   ├── privacy/  terms/  about/
│   │   │   └── sitemap.xml/+server.ts
│   │   ├── src/lib/
│   │   │   ├── tools/registry.ts             ← the 81 tool definitions
│   │   │   ├── components/
│   │   │   └── stores/
│   │   └── static/                           ← wasm/, models/, fonts/, icons/
│   └── relay/                       ← optional Cloudflare Worker CORS relay (§15)
│       ├── src/index.ts
│       ├── wrangler.toml
│       └── README.md                ← one-click deploy instructions
└── e2e/                             ← Playwright specs + test assets
```

**Rule:** `apps/web` may import from `packages/engine` and `packages/ui`. `packages/engine` may import
from nothing in this repo. Any engine file that references `window`, `document`, or `navigator` outside
a guarded capability probe fails lint.

---

## 10. The engine API

### 10.1 Canonical image type

```ts
/** The single intermediate representation. Every op consumes and produces this. */
export interface RasterImage {
  data: Uint8Array;            // interleaved, row-major, no padding
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;     // gray, gray+alpha, rgb, rgba
  depth: 8 | 16 | 32;          // bits per channel; 32 = float
  premultiplied: boolean;
  colorSpace: ColorSpaceId;    // 'srgb' | 'display-p3' | 'linear-srgb' | 'gray' | 'cmyk' | ...
  icc?: Uint8Array;            // raw profile, preserved verbatim unless converted
  metadata?: ImageMetadata;    // §6.9
  /** Present for animations. Frame 0 duplicates the top-level fields. */
  frames?: Frame[];
  /** Source-format hints kept for lossless passthrough decisions. */
  source?: { format: FormatId; bytes: number; quantTables?: Uint8Array[] };
}

export interface Frame {
  data: Uint8Array;
  delayMs: number;
  dispose: 'unspecified' | 'none' | 'background' | 'previous';
  blend: 'source' | 'over';
  x: number; y: number; width: number; height: number;
}
```

**Rule:** `data` is always transferable. Ops must not retain a reference to an input buffer after
returning; the scheduler transfers ownership and will neuter it.

### 10.2 Option schemas

Every option group is a Zod schema in `packages/engine/src/ops/<op>/schema.ts`, and the schema is the
**single source of truth** for: TypeScript types (inferred), runtime validation, UI control generation
(§11.7), URL serialization, CLI flag parsing, and documentation generation. Adding an option means
editing one file.

```ts
export const ResizeOptions = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('pixels'), width: z.number().int().positive().optional(),
             height: z.number().int().positive().optional(), lockAspect: z.boolean().default(true) }),
  z.object({ mode: z.literal('percent'),  scale: z.number().min(1).max(1000) }),
  z.object({ mode: z.literal('reduceBy'), percent: z.number().min(1).max(99) }),
  z.object({ mode: z.literal('targetBytes'), value: z.number().positive(),
             unit: z.enum(['KB','MB']), allowUpscale: z.boolean().default(false) }),
  z.object({ mode: z.literal('fit'), width: z.number().int().positive(),
             height: z.number().int().positive(),
             fitMode: z.enum(['contain','cover','fill','inside','outside','pad']).default('contain'),
             padColor: z.string().default('#00000000'),
             padAnchor: z.enum(['top-left','top','top-right','left','center',
                                'right','bottom-left','bottom','bottom-right']).default('center') }),
]).and(z.object({
  algorithm: z.enum(['lanczos3','lanczos2','mitchell','catmull-rom','bicubic',
                     'bilinear','box','nearest','magic-kernel']).default('lanczos3'),
  sharpenAfterResize: z.number().min(0).max(100).default(0),
  allowUpscale: z.boolean().default(false),
  roundTo: z.number().int().min(1).default(1),
  maxPixels: z.number().int().default(268_435_456),
}));

export type ResizeOptions = z.infer<typeof ResizeOptions>;
```

Each option additionally carries UI metadata via a companion `describe` map — label, help text,
unit, control hint (`slider` / `number` / `select` / `color` / `toggle` / `segmented`), grouping, and
`advanced: boolean` (controls whether it lives under "Advanced"). The UI is generated from this, which
is what keeps 400+ options maintainable.

### 10.3 Public surface

```ts
// packages/engine/src/index.ts
export function probeCapabilities(): Promise<FormatCapability[]>;

export function compile(recipe: Recipe, input: InputMeta): Promise<Plan>;

export function run(
  recipe: Recipe,
  inputs: EngineInput[],                // File | Blob | ArrayBuffer | RasterImage
  opts?: {
    signal?: AbortSignal;
    onProgress?: (p: Progress) => void;
    onItemDone?: (r: ItemResult) => void;
    concurrency?: number;
    assets?: AssetStore;                // watermark images, LUTs, masks
    ai?: AiRuntime;                     // §13.3 — required only if a step has op:'ai'
  },
): Promise<RunResult>;

export function preview(
  recipe: Recipe,
  proxy: RasterImage,
  opts?: { signal?: AbortSignal; tier?: ExecutionTier },
): Promise<RasterImage>;

export function serializeRecipe(r: Recipe): string;   // URL-safe, compressed
export function parseRecipe(s: string): Recipe;       // with version migration
export function migrateRecipe(r: unknown): Recipe;

export interface Progress {
  itemIndex: number; itemCount: number;
  stepIndex: number; stepCount: number;
  fraction: number;                 // 0..1 overall
  phase: 'decoding' | 'processing' | 'encoding' | 'ai-request' | 'packaging';
  label: string;                    // human-readable, i18n key resolved by caller
  bytesProcessed?: number;
  etaMs?: number;
}
```

### 10.4 Determinism guarantee

Given the same engine version, same inputs, same recipe, and same execution tier, output bytes are
identical. Cross-tier (GPU vs. CPU) results may differ in the last bit; the export path therefore
**always uses the CPU/WASM tier for final encoding** unless the user explicitly opts into GPU export.
This is what makes the golden-file tests in §22.4 possible.

### 10.5 Target-size search

For `targetSize` / `targetBytes`, the encoder runs a bounded search rather than a guess:

1. Encode at `quality = 82`. Measure.
2. Binary search quality over `[1, 100]`, max 8 iterations, tolerance ±2 % of target.
3. If the target is unreachable at `quality = 1` and strategy allows, scale dimensions by
   `sqrt(target / achieved)` and repeat the quality search (max 3 outer iterations).
4. If still unreachable, return the closest achievable result **plus a warning stating the actual
   size and why the target was impossible**. Never silently miss the target (P8).

Every candidate encode runs on a worker and is cancellable. The UI shows the search live
("trying quality 64 → 210 KB…") because a visible search reads as competence, not as slowness.

### 10.6 Cancellation contract

`AbortSignal` propagates to: the worker pool (job dequeued or in-flight WASM chunk loop broken),
lazy module downloads (`fetch` aborted), AI requests (`fetch` aborted, and where the provider supports
it, a cancel call issued), and the ZIP writer (partial archive discarded). After abort,
`run()` rejects with `{ kind: 'cancelled' }` and all buffers are released before the promise settles.

---

## 11. UX specification

UX is the growth strategy, so this section is normative, not advisory.

### 11.1 The five UX laws

| # | Law | Consequence |
| --- | --- | --- |
| L1 | **Zero steps before value.** The file input is the first thing on the page, focused, and accepts a drop anywhere on the viewport. No cookie banner, no modal, no tour, no "choose a plan". | Landing page is a drop target with a headline, nothing else above it |
| L2 | **The result is visible before it is downloaded.** Never a bare "Download" button with an unseen result. | Every tool shows a live preview with before/after |
| L3 | **Defaults are correct; options are optional.** A user who touches nothing gets a good result. | §6 defaults are no-ops; each tool has one sensible non-default preset applied on load, shown as a removable chip |
| L4 | **Nothing is modal that does not have to be.** Options live beside the image, not on top of it. | One panel, right side (or bottom sheet on mobile). Dialogs only for destructive confirmation and key entry |
| L5 | **Every wait is explained and escapable.** Progress with a phase label, an ETA once measurable, and a Cancel that works instantly. | §10.3 `Progress`, §10.6 cancellation |

### 11.2 Primary layout (desktop ≥ 1024 px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ▌ ctimg    Convert  Compress  Resize  Crop  Edit  AI ▾   Tools ▾    ⌘K  ☾ │  56px
├──────────┬─────────────────────────────────────────────┬───────────────────┤
│          │                                             │                   │
│  FILES   │              CANVAS                         │   OPTIONS         │
│  240px   │              flex                           │   320px           │
│          │   ┌───────────────────────────────────┐     │  ┌─────────────┐  │
│ ▸ img1 ✓ │   │                                   │     │  │ Output      │  │
│ ▸ img2 ⟳ │   │      before │ after   (slider)    │     │  │  Format ▾   │  │
│ ▸ img3   │   │                                   │     │  │  Quality ▬▬ │  │
│          │   └───────────────────────────────────┘     │  │  1.2 MB→310K│  │
│ + Add    │    fit ⤢  100%  ⊕ ⊖   ⟲ ⟳   ⇄  □         │  ├─────────────┤  │
│          │                                             │  │ Resize      │  │
│ ── Steps │                                             │  │ Adjust      │  │
│ 1 Resize │                                             │  │ Filters     │  │
│ 2 Sharpen│                                             │  │ Watermark   │  │
│ + Add    │                                             │  │ Metadata    │  │
│          │                                             │  │ ▸ Advanced  │  │
├──────────┴─────────────────────────────────────────────┴───────────────────┤
│ 3 files · 4.1 MB → 0.9 MB (−78%)   [Reset] [Copy] [Save recipe] [Download ▾]│  64px
└────────────────────────────────────────────────────────────────────────────┘
```

Regions:

- **Files rail** — thumbnails, per-file status (`queued` / `running` / `done` / `error`), size delta,
  remove, reorder. Doubles as the Steps list below a divider so the whole recipe is visible at a glance.
- **Canvas** — the before/after comparison surface. Modes: split slider (default), side-by-side,
  onion-skin with opacity, difference blend, output-only. Pan with space-drag or middle-drag, zoom with
  ⌘/Ctrl+scroll, `0` = fit, `1` = 100 %, `Shift+drag` on the slider snaps to 50 %.
- **Options panel** — accordion sections in a fixed order (Output, Resize, Crop, Adjust, Filters,
  Effects, Watermark, Text, Metadata, AI, Advanced). Only sections relevant to the current tool are
  expanded; the rest are collapsed but present, because discovering that "this converter can also
  watermark" is how a single-purpose visitor becomes a repeat user.
- **Action bar** — always visible, always shows the aggregate size delta. `Download ▾` offers
  *Download*, *Download as ZIP*, *Save to folder…* (FSA), *Copy to clipboard*, *Share…*.

### 11.3 Mobile layout (< 768 px)

Canvas fills the viewport. Options become a **bottom sheet** with three snap points (peek 88 px →
half 50 % → full 92 %), drag-to-resize, and a persistent summary row at the peek height showing the
one or two most-used controls for the current tool (e.g. Quality + predicted size on Compress).
Files become a horizontal filmstrip above the action bar. All hit targets ≥ 44 × 44 px. Pinch-zoom and
two-finger pan on the canvas. The action bar is fixed above the safe-area inset.

### 11.4 Canonical flows

**Flow A — single conversion (the 80 % case), target: 3 interactions, < 5 s**

1. Land on `/heic-converter`. H1 states the job. Drop zone is focused.
2. Drop / pick / paste a file. Decode + proxy generation start immediately; preview appears.
   Output format is preselected from the route (`heic → jpg`).
3. Preview renders with the default quality and a live predicted size. Optionally drag Quality.
4. `Download`. Filename follows the template. Done.

No page navigation. No spinner longer than the decode. No upload.

**Flow B — batch, target: linear time, zero babysitting**

1. Drop 40 files (or a folder). All enqueue; the first decodes and previews immediately.
2. Adjust the recipe once — it applies to all. The preview follows the selected file; selecting a
   different file re-previews without re-running the batch.
3. `Download as ZIP`. Progress shows `12/40 · encoding · ~18 s left`. Per-file errors are inline and
   non-blocking; the ZIP contains everything that succeeded plus a `_errors.txt` listing what did not
   and why.

**Flow C — escalation, target: the local result is good enough most of the time**

This is now the common AI interaction, and its shape is deliberate: the free path runs first and the
user judges whether paying is worth it.

1. On T66 Remove Object, the user brushes over a lamp post. **The local result appears immediately**
   (Telea for the thin pole, exemplar synthesis where it crosses foliage) — typically in under a second,
   with no key and no network.
2. If it is good, they are done. No AI, no cost, no account. This is the expected outcome for most
   inputs, and the UI does nothing to discourage it.
3. If the fill is visibly wrong — say the pole crossed a window frame that must be reconstructed —
   a labelled control offers: *"Try with AI · ≈ $0.04 · Stability inpaint"*. It is a button, never a
   default, never preselected (P12).
4. Clicking it produces the AI result **in the compare view, against the local result**, with the cost
   that was actually incurred. The user picks the one they want. If they cannot see a difference, they
   have learned something useful about when to spend.

**Flow C′ — first connection, target: the key is entered once and never again**

Reached from an escalation control or from one of the three AI-only tools.

1. The empty state is a setup step, not a wall (copy in §17.7).
2. `Connect a provider` opens `/connect-ai` (§17) — a real page, not a modal, so it is bookmarkable,
   shareable, and indexable.
3. Pick a provider → follow the 4-step walkthrough → paste the key → `Test connection` runs a real,
   minimal, cheap probe and reports exactly what worked and which capabilities are now available.
4. Return to the tool. The escalation control is live. The key is stored per §16.

**Flow D — recipe reuse, the growth loop**

1. Build a multi-step recipe. `Save recipe` names it and stores it locally.
2. `Share` produces a URL whose fragment encodes the recipe (`/recipe#<compressed>`). The fragment
   never reaches a server — it is not sent in the HTTP request.
3. A recipient opens the link, sees the recipe described in plain language
   ("Resize to 1200 px wide → strip metadata → WebP quality 80"), drops their own files, and runs it.
   They never had to trust the sender with a file.

### 11.5 Micro-interactions that carry the product

These are not polish; they are the reasons people come back.

| Interaction | Behaviour |
| --- | --- |
| **Live predicted output size** | Updates within 250 ms of any option change, computed by encoding the proxy and extrapolating, then corrected by a real full-size encode in the background. Shown as `1.2 MB → 310 KB (−74%)` |
| **Quality slider with visual diff** | While dragging, the canvas shows the *difference* between the current quality and lossless, amplified, so the user can *see* where artefacts appear. Nobody else does this |
| **Paste anywhere** | ⌘/Ctrl+V with an image on the clipboard loads it, from any focus position |
| **Drag anywhere** | The entire viewport is a drop target, with a full-bleed overlay showing the detected file count and total size |
| **Drag out** | Dragging the result thumbnail out of the browser writes the processed file to the OS (`DataTransfer` with a real `File`) |
| **Undo/redo** | ⌘Z / ⌘⇧Z across every recipe change, unbounded within the session, with a visible history list |
| **Optimistic step add** | Adding a step renders its effect on the proxy before the full pipeline recompiles |
| **Command palette** | ⌘K searches tools, options, formats, and recipes. Typing `webp 80` jumps straight to a configured export |
| **Keyboard-complete** | Every action reachable without a mouse; the crop rectangle is nudgeable with arrows (1 px, 10 px with Shift) |
| **Sticky preferences** | Last-used format, quality, and metadata policy are remembered per tool and shown as "your usual" chips |
| **Honest empty states** | Every empty/error state names the cause and the fix. No "Something went wrong" |
| **Zero-flash theme** | Theme resolved before first paint from a tiny inline script; respects `prefers-color-scheme` and a stored override |
| **Offline badge** | When offline, a small badge reads "Offline — all local tools still work." AI tools grey out with that reason |

### 11.6 Comparison surface detail (T60)

The `/compare` route provides split, side-by-side, onion, difference, and output views. The split
range and onion opacity controls are keyboard-operable; the difference view has an adjustable gain.
Fit, 100% and incremented zoom, plus directional pan controls are available in the preview.

The route calculates approximate SSIM, PSNR, average-hash, difference-hash, and pHash metrics in a
local worker from proxies whose longest edge is at most 256 pixels. Pixel metrics require matching
source dimensions. These scores describe selected similarity features, not human quality judgments
or proof that two files are identical.

### 11.7 Generated option controls

Because every option is a Zod schema plus UI metadata (§10.2), controls are generated. Rules the
generator follows:

- Bounded numeric with a range ≤ 200 → slider + numeric input, both bound to the same value.
- Bounded numeric with a wide range → numeric input with stepper and unit suffix.
- Enum ≤ 4 options → segmented control. > 4 → select. > 12 → searchable combobox.
- Boolean → switch, with the label describing the *on* state affirmatively.
- Colour → swatch button opening a picker with eyedropper (EyeDropper API), hex/RGB/HSL input, and
  an alpha track when the target supports alpha.
- Discriminated union → segmented control for the discriminant, then the variant's fields below,
  animated by height only (no fade, no layout shift).
- Any option marked `advanced` → inside a collapsed "Advanced" disclosure, never in the primary flow.
- Every control has: a label, an optional one-line help, a "reset to default" affordance visible on
  hover/focus when the value differs from default, and a `data-testid` derived from its schema path.

### 11.8 Copy guidelines

- Verbs, not nouns: "Resize", not "Resizing options".
- Never say "Pro", "Upgrade", "Credits", "Free tier", or "Unlimited" (the last is implied; saying it
  invites doubt).
- State the privacy fact once per page, factually, near the drop zone:
  *"Processed on your device. Nothing is uploaded."* Not a badge, not a boast.
- Errors follow: **what happened · why · what to do**. Example:
  > **Couldn't decode this HEIC file.** It uses the HEVC 10-bit profile, which the browser decoder in
  > use doesn't support. Try exporting it from Photos as JPEG, or open it on a device with a newer
  > browser.
- Never blame the user, never use "invalid", never use exclamation marks in errors.

### 11.9 Onboarding, such as it is

There is no tour and no wizard. Discoverability comes from:

1. The collapsed-but-visible option sections (§11.2) that reveal adjacent capability.
2. A single "You can also…" suggestion row under the action bar, contextual and dismissible
   (e.g. after a resize: *"Also strip EXIF?"* · *"Save as a reusable recipe?"*).
3. The `⌘K` hint in the header.

---

## 12. Design system

### 12.1 Tone

Precise, quiet, technical-but-warm. The visual identity should read as *instrument*, not *toy* and not
*enterprise SaaS*. The image is the hero; the chrome recedes. Reference points: a well-made darkroom
timer, a Nord/Zed-adjacent restraint, Figma's canvas discipline. Explicitly avoid: purple gradients,
glassmorphism, floating 3D blobs, oversized rounded cards, stock illustrations, emoji in UI chrome.

### 12.2 Tokens

Defined once in `packages/ui/src/tokens.css` as CSS custom properties, consumed by Tailwind 4's
`@theme`. Light and dark are both first-class; neither is a filter over the other.

```css
@layer base {
  :root {
    /* Neutrals — warm-shifted grey so photos don't look colour-cast against it */
    --c-bg:            oklch(98.5% 0.004 80);
    --c-surface:       oklch(100%  0     0);
    --c-surface-sunk:  oklch(96.5% 0.005 80);
    --c-border:        oklch(90%   0.006 80);
    --c-border-strong: oklch(80%   0.008 80);
    --c-text:          oklch(24%   0.012 80);
    --c-text-muted:    oklch(52%   0.010 80);
    --c-text-subtle:   oklch(65%   0.008 80);

    /* Accent — a single restrained teal. Used for focus, active state, and progress. Nothing else. */
    --c-accent:        oklch(58%   0.115 195);
    --c-accent-hover:  oklch(52%   0.120 195);
    --c-accent-subtle: oklch(95%   0.030 195);
    --c-on-accent:     oklch(99%   0     0);

    /* Semantic */
    --c-success:  oklch(60% 0.13 145);
    --c-warning:  oklch(72% 0.14  75);
    --c-danger:   oklch(56% 0.17  25);
    --c-info:     var(--c-accent);

    /* Canvas — the checkerboard for transparency, and the neutral surround */
    --c-canvas:        oklch(93% 0.003 80);
    --c-checker-a:     oklch(88% 0.003 80);
    --c-checker-b:     oklch(95% 0.003 80);

    /* Type */
    --font-sans: 'InterVariable', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    --fs-xs: 0.75rem;  --fs-sm: 0.8125rem; --fs-base: 0.875rem;
    --fs-md: 1rem;     --fs-lg: 1.125rem;  --fs-xl: 1.375rem;
    --fs-2xl: 1.75rem; --fs-3xl: 2.25rem;  --fs-4xl: 3rem;
    --lh-tight: 1.15;  --lh-normal: 1.5;   --lh-relaxed: 1.65;

    /* Space — 4px base, 8px rhythm */
    --sp-1: 0.25rem; --sp-2: 0.5rem;  --sp-3: 0.75rem; --sp-4: 1rem;
    --sp-5: 1.25rem; --sp-6: 1.5rem;  --sp-8: 2rem;    --sp-10: 2.5rem;
    --sp-12: 3rem;   --sp-16: 4rem;   --sp-20: 5rem;   --sp-24: 6rem;

    /* Radii — small. This is an instrument, not a pill factory. */
    --r-sm: 3px; --r-md: 5px; --r-lg: 8px; --r-xl: 12px; --r-full: 999px;

    /* Elevation — borders first, shadow sparingly */
    --sh-sm: 0 1px 2px oklch(24% 0.012 80 / 0.06);
    --sh-md: 0 2px 8px oklch(24% 0.012 80 / 0.08), 0 1px 2px oklch(24% 0.012 80 / 0.06);
    --sh-lg: 0 8px 32px oklch(24% 0.012 80 / 0.12), 0 2px 8px oklch(24% 0.012 80 / 0.06);

    /* Motion — fast, and honest about being fast */
    --dur-instant: 80ms;  --dur-fast: 140ms; --dur-base: 200ms; --dur-slow: 320ms;
    --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

    /* Layout */
    --w-rail: 240px; --w-panel: 320px; --h-header: 56px; --h-actionbar: 64px;
    --z-canvas: 0; --z-panel: 10; --z-header: 20; --z-sheet: 30;
    --z-dialog: 40; --z-toast: 50; --z-dropzone: 60;
  }

  :root[data-theme='dark'] {
    --c-bg:            oklch(17%   0.008 250);
    --c-surface:       oklch(21%   0.010 250);
    --c-surface-sunk:  oklch(14%   0.008 250);
    --c-border:        oklch(29%   0.012 250);
    --c-border-strong: oklch(40%   0.014 250);
    --c-text:          oklch(94%   0.004 250);
    --c-text-muted:    oklch(70%   0.008 250);
    --c-text-subtle:   oklch(56%   0.008 250);
    --c-accent:        oklch(72%   0.115 195);
    --c-accent-hover:  oklch(78%   0.115 195);
    --c-accent-subtle: oklch(28%   0.045 195);
    --c-on-accent:     oklch(15%   0.010 250);
    --c-canvas:        oklch(12%   0.006 250);
    --c-checker-a:     oklch(16%   0.006 250);
    --c-checker-b:     oklch(20%   0.006 250);
    --sh-sm: 0 1px 2px oklch(0% 0 0 / 0.3);
    --sh-md: 0 2px 8px oklch(0% 0 0 / 0.4), 0 1px 2px oklch(0% 0 0 / 0.3);
    --sh-lg: 0 8px 32px oklch(0% 0 0 / 0.5), 0 2px 8px oklch(0% 0 0 / 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    :root { --dur-instant: 0ms; --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
  }
}
```

**Rules:** one accent colour only; a second hue appears only for semantic state. Elevation is
communicated by border and background-step first, shadow second. Radii stay small. Dark mode is a
distinct palette (cool-shifted, to make warm photo content pop), not an inversion.

### 12.3 Component inventory

`packages/ui` provides, each with a Storybook-equivalent visual test:

Button (primary/secondary/ghost/danger, 3 sizes, loading, icon-only) · IconButton · Toggle · Switch ·
Slider (with fill, ticks, keyboard, and a paired numeric input) · NumberInput (stepper, unit suffix,
scrub-on-drag) · Select · Combobox · SegmentedControl · ColorSwatch + ColorPicker (with EyeDropper) ·
Checkbox · Radio · TextInput · Textarea · FileDrop · Accordion · Tabs · Dialog · Sheet ·
Popover · Tooltip · Toast · ProgressBar · ProgressRing · Spinner (used only where progress is
genuinely unknown) · Badge · Chip (removable) · Thumbnail · FileRow · StepRow · CompareView ·
CanvasViewport · Histogram · CurveEditor · CropOverlay · MaskBrush · TrimapBrush (3-state:
foreground / background / unknown) · KeyValueTable · CodeBlock (with copy) · CommandPalette ·
EmptyState · ErrorState · KeyBadge (masked secret display) · CapabilityBadge (local / lazy /
unavailable) · **TierBadge** (`Local` / `On-device model` / `{Provider}` — attached to every result and
every recipe step, per §13.1.2) · **EscalationControl** (the *"Try with AI"* affordance: states the
provider, the capability, and the estimated cost before it is pressed; never rendered as a primary
button; never focused by default) · **AlgorithmPicker** (for T66/T67, where several Tier 1 algorithms
produce different results and the user should choose from thumbnails rather than read a dropdown).

### 12.4 The canvas surface

- Transparency is a 8 px checkerboard using `--c-checker-a/b`, never white — so users can tell
  transparent from white, the single most common confusion in image tools.
- A 1 px `--c-border-strong` outline marks the image bounds, so a white image on a light canvas is
  still legible.
- Zoom above 400 % switches to nearest-neighbour sampling and shows a pixel grid at ≥ 800 %.
- The canvas never animates position on option change; only pixel content updates. Layout stability
  during rapid slider dragging is essential to the feeling of directness.

---

## 13. Capability escalation and BYOK AI

### 13.1 The escalation policy

#### 13.1.1 The rule

**AI is the last resort, not the first tool.** A feature may only reach an external model when no
deterministic algorithm, no classical computer-vision method, and no on-device model can produce an
acceptable result. This is principle P11, and it is enforced structurally by the register in §13.1.3.

The reasoning is not ideological. Programmatic implementations are better on almost every axis that
matters here:

| | Programmatic | External model |
| --- | --- | --- |
| Cost to the user | Zero | Per call, forever |
| Latency | 10 ms – 2 s | 3 – 60 s plus network |
| Works offline | Yes | No |
| Deterministic / reproducible | Yes | Rarely, even with a seed |
| Privacy | Image never leaves the device | Image leaves the device |
| Setup | None | Account, key, billing, CORS |
| Fails predictably | Yes | No — fails plausibly, which is worse |
| Auditable | Read the source | Opaque |

An external model wins on exactly one axis: **semantic understanding of content that is not present in
the image.** That is the entire legitimate domain for AI in this product. Inventing pixels that have no
basis in the source, or describing an image in natural language, requires a model. Everything else —
resampling, matting, filling from surrounding texture, segmentation from user hints, compositing,
colour harmonization — has a classical solution that is faster, free, and reproducible.

#### 13.1.2 The four-tier ladder

Every capability is implemented at the lowest tier that works, and higher tiers are only added when the
lower ones demonstrably fall short on a documented class of input.

| Tier | Name | Definition | Key required | Offline | Deterministic |
| :-: | --- | --- | :-: | :-: | :-: |
| **0** | **Deterministic** | Closed-form maths / DSP. Resampling, colour transforms, convolution, quantization, geometry, encoding, metadata, compositing | No | Yes | Yes |
| **1** | **Classical CV** | Cleared local algorithms only: colour-range/watershed segmentation, Telea and Navier–Stokes inpainting, band-limited alpha matting, joint-bilateral matte refinement, and edge-directed interpolation. The current composite blend is per-pixel alpha blending; Poisson remains excluded and a full multi-scale Laplacian pyramid is not implemented. GrabCut, closed-form matting, guided filter, and non-local means remain excluded pending counsel | No | Yes | Yes¹ |
| **2** | **On-device model** | Learned weights executed locally via ONNX Runtime Web. The engine requires explicit consent and caller-supplied model bytes/path; size disclosure, persistent cache, and offline reuse are loader responsibilities and remain unverified for the current production path. No network is needed during inference after bytes are available locally | No | Conditional² | Yes |
| **3** | **External model** | A provider API the user configured (BYOK) | **Yes** | No | No |

¹ Deterministic given a fixed seed for the randomized ones (PatchMatch-family search order).
² Inference can run offline once model bytes are available locally. This is conditional, not a verified production guarantee; consented size disclosure, persistent caching, and repeat-offline browser delivery remain open under P4-14.

**Rules of the ladder:**

- **Tier 0 and 1 are the product.** They ship in `packages/engine`, need no key, work offline, and are
  where implementation effort goes first.
- **Tier 2 requires justification** against Tier 1 — a model that is not meaningfully better than a
  classical method is a 40 MB download for nothing.
- **Tier 3 requires a register entry** (§13.1.3) proving Tiers 0–2 cannot do the job.
- **Escalation is explicit** (P12). The lower tier runs, its result is shown, and the higher tier is
  offered as a labelled control stating what it costs and what it will do differently. There is no
  silent fallback and no preselected AI.
- **A tier is never removed.** Adding Tier 3 to a feature does not retire its Tier 1 path; users
  offline, without a key, or wanting reproducibility keep it permanently.
- **The tier used is always visible.** Every result carries a badge — `Local` / `On-device model` /
  `{Provider}` — and the recipe records it, so a user always knows how a pixel was produced.

#### 13.1.3 The AI Justification Register

**A Tier 3 code path may not be merged without a row in this table.** Each row states what was tried at
Tiers 0–2, precisely where it fails, and what a model adds. This is the artefact that keeps the AI
surface from creeping.

| Capability | Tier 0–2 implementation | Where it genuinely fails | What a model adds | Verdict |
| --- | --- | --- | --- | --- |
| **Text → image** (T64) | Procedural generation: gradients, Perlin/simplex/Worley noise, geometric patterns, QR/barcodes, identicons, initials avatars, placeholder frames, data charts (T79) | Cannot synthesize a photograph, illustration, or any depicted subject. There is no algorithm that turns "a golden retriever on a beach" into pixels | Everything. This is the only capability with no classical analogue whatsoever | **Tier 3 justified — AI-only** |
| **Prompt edit** (T65) | Adjustments, filters, LUTs, recolour, gradient maps, local edits (T37, T38, T46) can perform any *specified* transformation | Cannot interpret intent. "Make it look like winter" requires knowing that grass becomes snow, leaves fall, and light goes blue — semantic knowledge absent from the pixels | Semantic interpretation of an instruction | **Tier 3 justified — AI-only** |
| **Describe / alt text / caption / tags** (T71) | Metadata and T62 OCR supply literal image facts/text; the cleared T57 cascade can supply face regions when used. These signals are not a natural-language scene description | Cannot describe depicted actions, objects, or relationships | Recognition and language generation | **Tier 3 justified — AI-only** |
| **Object removal / inpaint** (T66) | **Tier 1 engine path:** Telea, Navier–Stokes, confidence-priority, Efros–Leung, and quilting are exposed by `removeObject`. The original three generated 48×48 textures remain recorded. An additive eight-case proxy uses four registered CC0 photos cropped/resampled to 32×32, with a known 6×6 interior rectangle or irregular left-edge mask per source; the hidden source pixels are restored as the metric reference. Across these synthetic occlusions, Telea had the highest mean masked-region PSNR (25.3583 dB) and SSIM (0.610996); Navier–Stokes was fastest by median latency (0.320 ms). See [`T66 measurements`](packages/engine/bench/escalation/p4-21-t66-inpaint.md). | Synthetic occlusions do not establish real object-removal quality; large fills and plausible structural reconstruction remain unmeasured | Plausible novel structure over large areas | **Tier 1 remains available; any Tier 3 escalation requires a measured failing case** |
| **Generative expand / outpaint** (T67) | The current `expandImage` is a mask-inpaint stub: without a mask it returns the input unchanged; with a mask it applies Telea at the same dimensions. It does not expand the canvas or synthesize new-area content | Any request that requires a larger canvas or scene continuation; no useful outpaint comparison exists yet | New canvas area and semantic scene continuation | **Implementation incomplete; defer model justification until the local path and corpus exist** |
| **Background removal** (T68) | **Tier 1:** user-trimap band-limited colour-unmixing matte, joint-bilateral refinement, alpha-band trim, and defringe. GrabCut, closed-form matting, and guided filter are excluded. No cleared Tier 2 segmentation weights or shipped zero-hint model path are available | Requires a user-provided trimap; hair/fur/veil accuracy has no registered reference corpus yet | Zero-hint segmentation or a measured quality improvement | **Tier 1 hinted path only; Tier 2 remains blocked pending exact asset clearance and measurement** |
| **Background replace** (T69) | Local cutout/compositing primitives include alpha-mask blending, colour transfer, and shadow synthesis. A function named for Laplacian-pyramid blending currently performs a simplified per-pixel alpha blend, not a full multi-scale pyramid. Poisson blending remains excluded pending counsel; no measured product comparison is recorded | Cannot generate a backdrop the user does not have; the composite quality gap is not yet measured | A synthesized backdrop or physically plausible relighting | **Local composition path only; no Tier 3 case admitted without a measured failing fixture** |
| **Upscale** (T32; T70 is pixel-art-only) | **Tier 0:** Lanczos3, Mitchell, Catmull-Rom (T31). **Tier 1:** DCCI and NEDI edge-directed interpolation for photographs. Four CC0-derived synthetic 2× pairs measured DCCI at 29.6861 dB / 0.827896 mean SSIM and NEDI at 26.2109 dB / 0.766985. The pinned Real-ESRGAN x2 ONNX scored 26.6370 dB / 0.765509 on the same inputs; this did not beat Lanczos3 or DCCI. On 16 CC0-derived synthetic x4 blur/grain/JPEG cases, Real-ESRGAN averaged 22.9689 dB / 0.591359 versus Tier 1 at 25.5075 dB / 0.635145; a separate exploratory Swin2SR q4f16 record averaged 25.6881 dB / 0.666381, with lower clean-class PSNR and a 13.05 s Chromium WASM startup-plus-first-inference smoke. It has a publisher-declared Apache-2.0 card, but no separate per-file notice or training-data provenance was found; these measurements are not asset-cleared and do not support product selection. The `/upscale` route supports bounded still-PNG preview/export and an experimental, explicit Tier 2 download; the model is size/hash checked, cached in IndexedDB, and runtime-probed before use. Docker carries URLs only, with per-model fallback envs. T70's clean-room 3×3-neighbourhood scaler remains local; four synthetic fixtures do not establish representative sprite quality | Tier 0/1 remains the measured default; the synthetic Swin2SR gain does not establish real-photo quality or acceptable interactive runtime. Real camera restoration and full Tier 2 route STCC remain unmeasured. Beyond ×4 or severe degradation remain candidate escalation cases | Invented plausible detail at high factors | **Tier 0/1 primary; Tier 2 experimental opt-in; Tier 3 remains unmeasured** |
| **Segment / click-to-select** (T27 assist) | **Tier 1:** colour range, watershed, flood fill, contours, and saliency. GrabCut is excluded. No cleared MediaPipe `.task` detector or segmentation weights are available | Selecting an arbitrary named object without a usable colour or edge boundary; no comparative fixture is recorded yet | Semantic object identity | **Tier 1 hinted path; Tier 2 is blocked; no Tier 3 case admitted yet** |
| **Smart crop** (T27) | **Tier 0/1:** center, rule-of-thirds, and approximate edge-energy/colour-variation saliency placements. A reproducible 12-case comparison over four CC0 images measures mean subjective target-box retention of 89.82% center, 76.70% thirds, and 71.97% approximate saliency. The center method leads on this small corpus; no method is established as visually preferred | Four subjective boxes at one square aspect ratio do not establish visual quality, user preference, semantic subject detection, or general performance | No model is selected; broader failure evidence is needed first | **Keep the inspectable local choices; no Tier 3 case is justified by this limited corpus** |
| **OCR** (T62) | All 163 official recursive `tessdata_fast` entries are pinned and hash-registered: 123 language/variant binaries, one deprecated `frk` alias pointer to `deu_latf`, 37 script-model binaries, and two helpers (`osd` for orientation/script detection and `equ` for equations). Models load only after selection: local static data when present, otherwise the exact pinned jsDelivr file, except the 89,384,811-byte Latin script model which uses its exact pinned GitHub raw source because jsDelivr returns 403. Only `script/Cyrillic.traineddata` is bundled. The catalogue HEAD check passes for 161 other jsDelivr entries; a browser delivery smoke reached the pinned Latin fallback and returned OCR output; an independent streamed source check verified the registered byte length and SHA-256. The page recommends upright images and makes OSD optional. Eight exact generated-print PNG fixtures and their hashes are persisted; accuracy measured 7/8 exact, Hindi CER 0.0588, mean CER 0.00735. After online warm-up, same-page offline E2E repeated all eight language fixture recognitions with identical output and zero external requests. Arabic and pseudo-locale selector labels were also browser-checked. Hausa is absent upstream. See [`OCR measurements`](packages/engine/bench/escalation/p4-21-t62-ocr.md). | The accuracy corpus is limited to eight simple generated print samples, not the expanded catalogue, handwriting, artistic type, tables, photos, or skewed captures. Offline opening/reloading of a fresh app page remains unverified because app-shell/worker/core caching is not guaranteed. | Better recognition on those unmeasured classes | **OCR selects one model at a time from the pinned catalogue, fetching missing files directly from their registered public sources; accuracy covers eight languages and warmed-cache same-page offline reuse passed; broader accuracy and offline fresh-start evidence remain open** |
| **Denoise** | **Tier 0/1:** On four registered CC0-derived 128×128 crops per class, bilateral improved Gaussian-noise metrics at σ12 (+4.6677 dB PSNR, +0.074499 SSIM) and σ24 (+5.9281 dB, +0.139999); median improved the 2% impulse case (+6.3945 dB, +0.045582), while bilateral regressed there. See [T44 measurements](packages/engine/bench/escalation/t44-denoise/README.md). Median and bilateral are the only implemented methods; wavelet/BayesShrink is not implemented, and non-local means remains excluded pending counsel | These are deterministic synthetic corruptions of small CC0-derived crops, not sensor captures, low-light camera noise, or a representative photo corpus | Learned denoising is a candidate only if a compliant fixture shows a material failure | **No Tier 3 until a user need and measured gap are demonstrated** |
| **Colour / tone** | T80 local benchmark: on three self-generated texture pairs, mean normalized RGB 1D Wasserstein distance was 0.065537 unchanged, 0.014468 with Reinhard, and 0.002413 with histogram matching. See [T80 measurements](packages/engine/bench/escalation/p4-21-t80-colour-match.md). | This measures global color distribution only; it does not measure spatial preservation, photo composites, or user preference | — | **No Tier 3 justification from current evidence; retain the local path while photo preference and route STCC remain open** |

**Adding a row requires:** a working Tier 0–2 implementation already merged, a named class of input where
it measurably fails, a reproducible comparison in `packages/engine/bench/escalation/` showing both
outputs, and reviewer sign-off. "The model is probably better" is not a justification; a failing
fixture is.

#### 13.1.4 What this means for the product

The current implementation evidence is narrower than the target product design. T64, T65, and T71
remain AI-only by design. T32 has a local DCCI/NEDI Tier 1 route plus a user-started Real-ESRGAN Tier 2 download that verifies, caches, and smoke-tests its registered model. Focused Chromium E2E verifies registered x2 delivery and host-unavailable IndexedDB reuse, registered x2 and x4 inference on odd-sized images, and fail-closed hash-mismatch/cancellation behavior. A full browser-offline app-shell/worker start, deployed-origin availability, real degraded-photo quality, and full route STCC remain open. The project-owner BSD-3 label acceptance applies to the two exact `.pth` checkpoints, not as an upstream per-file statement; the ONNX exports carry a separate publisher-declared BSD-3 model-card label.
T62 has a local Tesseract path; T66 has local inpainting primitives. T67 remains an
expand-image stub, T68 requires a user trimap and has no cleared model path, and T69's model need is
not measured. Route wiring and STCC acceptance are tracked separately in `feature-audit.csv` and
`PLAN.md`; a register row or engine export alone does not mean the app flow is complete.

This also shortens the BYOK story from an obligation to an option, which is the correct framing for
§17: the connect page is for the minority who want the last few percent, not a gate the majority must
pass.

#### 13.1.5 BYOK terms, when Tier 3 is reached

When a feature does legitimately reach Tier 3, **the user supplies the endpoint and the secret.** We
ship no keys, proxy nothing, resell nothing, and bill nothing. The user's account, quota, and
data-handling agreement with their provider.

- It is why the rest of the product is free forever — external inference is the only real marginal cost
  in an image tool, and pushing it to the user's own account removes the reason to charge.
- The image goes to a provider the user chose and can audit, not to us.
- The user gets provider-tier quality and model choice, not whatever we could afford to bundle.
- Power users can point Tier 3 at a **self-hosted** model (§14.10) and keep the image on their LAN,
  which makes even Tier 3 privacy-preserving if they want it to be.

### 13.2 Capability model

Adapters declare capabilities, not models. The UI binds tools to capabilities, so adding a provider
lights up existing tools with no UI change.

```ts
export type AiCapability =
  | 'generate'          // text → image
  | 'edit'              // image + instruction → image (no mask)
  | 'inpaint'           // image + mask + prompt → image
  | 'outpaint'          // image + target canvas → image (generative expand)
  | 'erase'             // image + mask → image, object removed (no prompt needed)
  | 'upscale'           // image + factor → larger image
  | 'removeBackground'  // image → image with alpha
  | 'replaceBackground' // image + prompt → image, subject preserved
  | 'describe'          // image (+question) → text
  | 'segment';          // image (+point/prompt) → mask
```

Read this table as **primary first, escalation second** — the opposite of how competitors structure the
same features:

| Tool | Primary path (always available) | Escalation capability | Escalation trigger |
| --- | --- | --- | --- |
| T66 Remove Object | Telea / Navier–Stokes / confidence-priority / Efros–Leung / quilting (synthetic benchmark only) | `erase`, else `inpaint` | User clicks *"Try with AI"* after seeing the local result, or the masked region exceeds the configured area threshold and the UI *suggests* it |
| T67 Expand Image | Current engine stub applies Telea inpaint to a supplied mask; canvas expansion is not implemented | `expandImage` | No shipped AI action; local implementation gap remains |
| T68 Remove Background | User-trimap colour-unmixing matte with joint-bilateral refinement; no cleared Tier 2 model | `removeBackground` | Model path blocked pending exact asset approval |
| T69 Replace Background | Local alpha composite; the Laplacian-named function is currently a simplified per-pixel alpha blend; Poisson excluded | `replaceBackground` | Only if a user asks for a generated backdrop and the measured gap supports escalation |
| T32 Upscale | DCCI / NEDI (Tier 1) or ONNX ×2/×4 (Tier 2) | `upscale` | Factor > 4, or user clicks *"Try with AI"* |
| T62 OCR | Tesseract on-device | `describe` in `ocr` mode | User clicks *"Try with AI"* — suggested when local confidence is low |
| T64 Generate | — (T79 procedural generator is the adjacent local tool) | `generate` | Inherent |
| T65 Prompt Edit | — (T37/T38/T46 for specified transforms) | `edit` | Inherent |
| T71 Describe | Descriptive skeleton (§4.9) | `describe` | Inherent |
| T27 Smart Crop | Center, rule-of-thirds, or approximate saliency placement; user reviews the result | — | No Tier 3 path is selected; current four-image geometry evidence does not show a model gap |

**Design consequences, stated so they are not eroded later:**

1. **No tool is disabled for lack of a key except T64, T65, and T71.** Everything else works fully.
2. **No escalation is automatic.** Even when the UI *suggests* escalating (large mask, low OCR
   confidence), the suggestion is a button, not a behaviour. P12 is tested, not merely asserted.
3. **The local result is always produced and shown first.** A user must be able to see what they get
   for free before deciding to spend money. Escalating without showing the local result would make the
   free path invisible, which is how competitors manufacture the need to upgrade.
4. **Escalation shows a diff.** The AI result appears in the compare view *against* the local result,
   with the cost that was incurred. If the difference is not visible, the user learns to stop paying —
   and that is the correct outcome.
5. **The recipe records which tier produced each step**, so a shared or re-run recipe is honest about
   whether it needs a key.

### 13.3 The adapter interface

```ts
// packages/engine/src/ai/types.ts

export interface ProviderDescriptor {
  id: string;                       // 'anthropic' | 'openai' | ...
  name: string;                     // 'Anthropic (Claude)'
  homepage: string;
  keysUrl: string;                  // deep link to where the user creates a key
  pricingUrl: string;
  docsUrl: string;
  /** What the user pastes. Multiple fields for providers needing project/region/etc. */
  credentialFields: CredentialField[];
  /** Optional user-supplied base URL (self-hosted / proxy / gateway). */
  allowsCustomBaseUrl: boolean;
  defaultBaseUrl: string;
  capabilities: AiCapability[];
  models: ModelDescriptor[];
  /** Honest CORS posture, verified by the nightly contract test (§22.7). */
  browserDirect: 'yes' | 'yes-with-header' | 'no' | 'unknown';
  browserDirectNote?: string;
  /** Rough cost hint shown in the UI. Never presented as authoritative. */
  costHint?: string;
  /** Provider's stated data-retention/training policy, with a link. Displayed verbatim. */
  dataPolicy: { summary: string; url: string };
}

export interface CredentialField {
  key: string;                      // 'apiKey' | 'projectId' | 'region' | ...
  label: string;
  placeholder: string;
  secret: boolean;                  // masked input + never logged
  required: boolean;
  pattern?: string;                 // client-side sanity check only, never a hard gate
  help?: string;
}

export interface ModelDescriptor {
  id: string;
  label: string;
  capabilities: AiCapability[];
  /** Constraints we must respect when building the request. */
  maxInputPixels?: number;
  maxInputBytes?: number;
  supportedInputMime?: string[];
  supportedSizes?: string[];        // e.g. ['1024x1024','1536x1024','1024x1536']
  supportsMask?: boolean;
  supportsSeed?: boolean;
  supportsNegativePrompt?: boolean;
  notes?: string;
}

export interface AiRequest {
  capability: AiCapability;
  model: string;
  prompt?: string;
  negativePrompt?: string;
  image?: RasterImage;
  mask?: RasterImage;              // white = edit region, per our convention (adapters convert)
  targetCanvas?: { width: number; height: number; anchorX: number; anchorY: number };
  size?: string;
  aspectRatio?: string;
  count?: number;
  seed?: number;
  scaleFactor?: number;            // upscale
  question?: string;               // describe
  describeMode?: 'alt-text' | 'caption' | 'tags' | 'detailed' | 'ocr';
  outputFormat?: 'png' | 'jpeg' | 'webp';
  extra?: Record<string, unknown>; // provider-specific escape hatch, surfaced in Advanced
}

export interface AiResult {
  images?: RasterImage[];
  text?: string;
  /** Everything needed for the cost ledger (§13.6) and for user trust. */
  usage?: { inputTokens?: number; outputTokens?: number; images?: number;
            providerCost?: string; requestId?: string };
  raw?: unknown;                    // retained only in dev builds
}

export interface ProviderAdapter {
  descriptor: ProviderDescriptor;
  /** Cheap, low-cost call proving credentials work. Must not generate a billable image
   *  where a free/metadata endpoint exists. Returns which capabilities were confirmed. */
  test(ctx: AdapterContext): Promise<{ ok: true; confirmed: AiCapability[]; detail: string }
                                   | { ok: false; error: EngineError }>;
  /** Optional: fetch the live model list so we never show a stale hard-coded model. */
  listModels?(ctx: AdapterContext): Promise<ModelDescriptor[]>;
  run(req: AiRequest, ctx: AdapterContext): Promise<AiResult>;
}

export interface AdapterContext {
  credentials: Record<string, string>;   // resolved from the keystore, in memory only
  baseUrl: string;
  fetch: typeof fetch;                   // the instrumented transport (§13.5)
  signal?: AbortSignal;
  onProgress?: (p: { phase: string; fraction?: number; message?: string }) => void;
}
```

### 13.4 Mask convention

Providers disagree on mask polarity: some treat transparent pixels as the edit region (OpenAI), some
treat white as the region (Stability), some use a separate alpha channel. **Our internal convention is
one canonical form — 8-bit grayscale, white (255) = the area to change** — and each adapter converts
in `run()`. The conversion is unit-tested per adapter. The UI only ever speaks our convention, and the
brush always paints "the part I want changed", which is what users expect.

### 13.5 Transport

`packages/engine/src/ai/transport.ts` wraps `fetch` and is the only place network egress happens for AI:

1. **Origin allowlist.** The request URL's origin must be in the user's configured provider set, or the
   request is refused locally before it is issued. Defence in depth alongside the CSP (§16.4).
2. **Timeout.** Default 120 s, 300 s for generative image calls, user-overridable.
3. **Retry.** Only on `408 / 429 / 5xx` and network errors. Exponential backoff with jitter, honouring
   `Retry-After`. Max 3 attempts. **Never retried:** `4xx` other than 408/429, and any request that may
   have already been billed (i.e. no retry after a response has started streaming).
4. **Async job polling.** Providers that return a job handle (BFL, Replicate, some Stability endpoints)
   are polled by a shared helper with backoff, progress reporting, and cancellation that issues the
   provider's cancel call where one exists.
5. **CORS pre-flight probe.** Before the first real call to a provider, a cheap probe determines
   whether the browser can reach it directly. On failure the error is
   `{ kind: 'ai-cors-blocked' }` with a remedy pointing at the Relay (§15) — never a generic
   "network error", which is the single most confusing failure mode in BYOK products.
6. **Redaction.** Credentials are injected at the last moment and are never included in any log, any
   error object, any diagnostic bundle, or any `raw` field. A lint rule forbids interpolating a value
   from `ctx.credentials` into a template literal outside `transport.ts`.
7. **No telemetry.** The transport reports nothing to us. Ever.

### 13.6 Cost transparency

Users are spending their own money, so the app must be scrupulous about it.

- Before any AI call, show an estimate: *"≈ $0.04 · 1 image · gpt-image-1 1024×1024 quality high"*,
  derived from a locally stored, versioned price table with a "last updated" date and a link to the
  provider's pricing page. The estimate is always labelled an estimate.
- A **local, private cost ledger** in IndexedDB records `{ timestamp, provider, model, capability,
  usage, estimatedCost }`. Shown at `/connect-ai#usage` with per-provider totals and a CSV export.
  Never transmitted.
- A user-settable **spend guard**: soft warning and hard stop thresholds per session and per day. On
  hitting the hard stop, AI steps refuse locally with a clear message and a one-click raise.
- Batch AI runs show total projected cost and require an explicit confirmation above a configurable
  threshold (default $1.00). A 200-file AI batch must never be one accidental click.

### 13.7 Provider-agnostic behaviours

- **Model list is live where possible.** `listModels()` is called on connect and cached for 24 h, so a
  newly released model appears without us shipping a release. Hard-coded lists in §14 are fallbacks and
  are labelled as such in the UI ("offline list — connect to refresh").
- **Graceful capability discovery.** If a provider adds a capability we don't map, the Advanced section
  exposes a raw passthrough so power users are never blocked by our schema.
- **Deterministic where offered.** `seed` is surfaced whenever the model supports it, plus a
  "reuse last seed" button, because reproducibility is what makes generative editing usable.
- **Every result is a normal image in the pipeline.** An AI step returns a `RasterImage`, so it can be
  followed by resize, compress, watermark — no special-casing downstream.

---

## 14. Provider adapter specifications

> **⚠ VERIFY — mandatory before writing any adapter.** Provider APIs change faster than this document.
> For each adapter, the implementing agent must (1) fetch the provider's current API reference from the
> `docsUrl` below, (2) reconcile every endpoint, header, field name, and model ID against what it finds,
> (3) record the verification date and any deltas in `docs/PROVIDERS.md`, and (4) write the contract
> test (§22.7) against the live shape. **The shapes below are the design intent and the starting point,
> not a substitute for verification.** Where this document and the provider's live docs disagree, the
> live docs win, and this document must be updated in the same PR.

### 14.0 Adapter roster

| Provider | Capabilities | Auth header | Browser-direct |
| --- | --- | --- | --- |
| Anthropic (Claude) | `describe`, `segment`* | `x-api-key` | yes-with-header |
| OpenAI | `generate`, `edit`, `inpaint`, `describe` | `Authorization: Bearer` | yes |
| Google (Gemini) | `generate`, `edit`, `describe` | `x-goog-api-key` | yes |
| Stability AI | `inpaint`, `outpaint`, `erase`, `upscale`, `removeBackground`, `replaceBackground` | `Authorization: Bearer` | unknown → probe |
| Black Forest Labs (FLUX) | `generate`, `inpaint`, `outpaint` | `x-key` | unknown → probe |
| fal.ai | all, model-dependent | `Authorization: Key` | yes |
| Replicate | all, model-dependent | `Authorization: Bearer` | unknown → probe |
| remove.bg | `removeBackground` | `X-Api-Key` | unknown → probe |
| Clipdrop | `removeBackground`, `upscale`, `erase`, `replaceBackground` | `x-api-key` | unknown → probe |
| OpenAI-compatible (custom) | user-declared | user-declared | user's responsibility |

\* `segment` via bounding-box reasoning rather than pixel masks — implemented as an optional
smart-crop assist, not a precise matting path.

### 14.1 Anthropic (Claude) — `describe`

Vision-only. This is the highest-quality path for alt text, captions, keywording, and reading
handwriting or complex layouts.

```
POST {baseUrl}/v1/messages          baseUrl default: https://api.anthropic.com
Headers:
  x-api-key: <key>
  anthropic-version: 2023-06-01
  content-type: application/json
  anthropic-dangerous-direct-browser-access: true   ← required for browser calls
```

Body:

```json
{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "system": "<task-specific instruction, see below>",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image",
        "source": { "type": "base64", "media_type": "image/png", "data": "<base64, no newlines>" } },
      { "type": "text", "text": "<user question or mode instruction>" }
    ]
  }]
}
```

Implementation notes:

- **Models:** default `claude-opus-5`; offer `claude-sonnet-5` (balanced) and `claude-haiku-4-5`
  (fastest/cheapest, good enough for bulk alt text). Model IDs are exact strings with no date suffix.
- **Image block precedes the text block** — this ordering measurably improves results.
- Base64 must contain **no newlines**. Request ceiling is 32 MB; downscale the image to
  `maxInputPixels ≈ 1.15 M` (roughly 1092×1092) before encoding, since larger inputs cost more tokens
  without improving alt text. Log the downscale in the UI as *"sent at 1092×1092 to reduce cost"*.
- **Thinking:** for `describeMode: 'ocr'` and `'detailed'`, omit the `thinking` parameter (Claude Opus 5
  runs adaptive thinking by default). For `'alt-text'` and `'tags'`, add
  `"output_config": { "effort": "low" }` to cut latency and cost. Do **not** send `budget_tokens` —
  it returns 400 on current models.
- **Structured output for tags:** use `output_config.format` with a JSON schema
  (`{ tags: string[], primarySubject: string }`) so parsing is guaranteed rather than regex-scraped.
- **Check `stop_reason` before reading `content`.** A value of `"refusal"` means the request was
  declined (HTTP 200, possibly empty `content`); surface that specifically rather than crashing on
  `content[0]`. Also handle `"max_tokens"` by raising the limit and noting the truncation.
- **Per-mode system prompts** (in `adapters/anthropic/prompts.ts`, user-editable in Advanced):
  - `alt-text` — "Write a single sentence of alt text under 125 characters describing this image for a
    screen-reader user. Describe what is shown, not that it is an image. No preamble."
  - `caption` — one or two sentences, natural, publication-ready.
  - `tags` — 8–15 keywords, most specific first, JSON schema enforced.
  - `detailed` — structured description: subject, setting, composition, lighting, colour, mood, text.
  - `ocr` — "Transcribe all text in this image exactly, preserving line breaks and reading order.
    Output only the transcription."
- `test()`: a 1-token `max_tokens: 1` text-only message. Cheap, proves auth, no image cost.
- **Usage:** read `usage.input_tokens` / `usage.output_tokens` for the ledger.
- Docs: `https://platform.claude.com/docs/en/build-with-claude/vision`

### 14.2 OpenAI — `generate`, `edit`, `inpaint`, `describe`

```
Base URL: https://api.openai.com/v1        Header: Authorization: Bearer <key>
```

| Capability | Endpoint | Content type |
| --- | --- | --- |
| `generate` | `POST /images/generations` | `application/json` |
| `edit`, `inpaint` | `POST /images/edits` | `multipart/form-data` |
| `describe` | `POST /responses` (preferred) or `POST /chat/completions` | `application/json` |

`generate` body: `{ model: 'gpt-image-1', prompt, size, quality, n, background, output_format,
output_compression, moderation }`.

`edits` multipart fields: `model`, `image` (repeatable — supports multiple reference images),
`mask` (PNG, **same dimensions as the first image**, fully transparent pixels mark the edit region),
`prompt`, `size`, `quality`, `background`, `output_format`, `n`.

Implementation notes:

- **Model:** `gpt-image-1`. Also offer the DALL·E models if the account has them, discovered via
  `GET /models`.
- **Sizes:** `1024x1024`, `1536x1024`, `1024x1536`, `auto`. Our UI must snap the user's requested
  aspect to the nearest supported size and say so, rather than silently changing it.
- **`background: 'transparent'`** is required for a cut-out result and only works with
  `output_format: 'png'` or `'webp'`. Wire the UI toggle to both fields together.
- **Mask polarity conversion:** our white-is-edit grayscale mask becomes an RGBA PNG where
  `alpha = 255 − maskValue` (our white → their transparent). Must match the base image's exact pixel
  dimensions; resample the mask with **nearest-neighbour** so no intermediate alpha values are
  introduced at the boundary.
- **Honest UX caveat:** masking on this model is guidance, not a hard boundary — the model may alter
  pixels outside the mask. Show this once, near the mask brush: *"The model uses your mask as a strong
  hint but may adjust nearby areas."* Offer a **local re-composite** post-step that pastes the original
  outside the mask (feathered) so users who need a hard boundary can get one. This turns a provider
  limitation into a feature we handle.
- Input images: PNG / WebP / JPEG, < 25 MB each.
- Response: `{ data: [{ b64_json }] }` by default for `gpt-image-1`; handle a `url` variant too.
- `describe`: `POST /responses` with `input: [{ role: 'user', content: [{ type: 'input_text', text },
  { type: 'input_image', image_url: 'data:image/png;base64,...' }] }]`. **⚠ VERIFY** the exact
  content-part field names against the live reference — this shape has changed before.
- `test()`: `GET /models` — free, proves auth, and doubles as `listModels()`.
- Errors: `401` → `ai-auth-failed`; `429` → `ai-rate-limited` with `Retry-After`;
  `400` with `error.code === 'content_policy_violation'` → surface the provider's message verbatim,
  since only the provider knows why.
- Docs: `https://developers.openai.com/api/docs/guides/image-generation`

### 14.3 Google Gemini — `generate`, `edit`, `describe`

```
POST {baseUrl}/v1beta/interactions     baseUrl default: https://generativelanguage.googleapis.com
Header: x-goog-api-key: <key>
```

Body (generate):

```json
{
  "model": "gemini-3.1-flash-image",
  "input": [{ "type": "text", "text": "<prompt>" }],
  "response_format": { "type": "image", "mime_type": "image/png",
                       "aspect_ratio": "16:9", "image_size": "2K" }
}
```

Body (edit — image + instruction):

```json
{
  "model": "gemini-3.1-flash-image",
  "input": [
    { "type": "text",  "text": "<edit instruction>" },
    { "type": "image", "mime_type": "image/png", "data": "<base64>" }
  ],
  "response_format": { "type": "image", "mime_type": "image/png" }
}
```

Implementation notes:

- **Models:** `gemini-3.1-flash-image` (default — best balance), `gemini-3.1-flash-lite-image`
  (fastest/cheapest), `gemini-3-pro-image` (highest quality, best text rendering inside images),
  `gemini-2.5-flash-image` (legacy). Offer all four; default to flash.
- **Multi-turn editing** is a first-class strength: pass `previous_interaction_id` from the prior
  response to iterate on a result conversationally. Our editor should expose this as
  *"Continue editing this result"*, keeping the interaction chain — this makes Gemini the best provider
  for iterative work, and the UI should let users feel that.
- **No mask parameter.** Region editing is expressed in the prompt. For our `inpaint` UI we therefore:
  (a) send the full image plus an instruction, and (b) apply the local feathered re-composite so the
  user's mask is respected as a hard boundary on our side. Label the path
  *"prompt-guided (mask applied locally)"* so behaviour is never misrepresented.
- **`aspect_ratio`** accepts standard ratios; `image_size` accepts `1K` / `2K` / `4K`
  (**⚠ VERIFY** the enumerated values and per-model support).
- **SynthID:** all output carries an invisible watermark identifying it as AI-generated. **State this
  in the UI before generation.** Users publishing images need to know, and hiding it would be
  dishonest.
- `describe`: same `interactions` endpoint with `response_format: { type: 'text' }`, or the
  `generateContent` endpoint. Prefer `interactions` for consistency. **⚠ VERIFY.**
- `test()`: `GET {baseUrl}/v1beta/models` with the same header — free, and serves `listModels()`.
- Docs: `https://ai.google.dev/gemini-api/docs/image-generation`

### 14.4 Stability AI — the editing workhorse

The broadest set of *precise, mask-based* editing operations, and the best fit for our masking UI
because its endpoints are purpose-built rather than prompt-only.

```
Base URL: https://api.stability.ai        Header: Authorization: Bearer sk-...
Accept: image/*   (returns raw bytes)  |  application/json (returns base64 + metadata)
Content type: multipart/form-data
```

| Capability | Endpoint |
| --- | --- |
| `inpaint` | `POST /v2beta/stable-image/edit/inpaint` |
| `erase` | `POST /v2beta/stable-image/edit/erase` |
| `outpaint` | `POST /v2beta/stable-image/edit/outpaint` |
| `removeBackground` | `POST /v2beta/stable-image/edit/remove-background` |
| `replaceBackground` | `POST /v2beta/stable-image/edit/replace-background-and-relight` |
| `upscale` (fast) | `POST /v2beta/stable-image/upscale/fast` |
| `upscale` (conservative) | `POST /v2beta/stable-image/upscale/conservative` |
| `upscale` (creative) | `POST /v2beta/stable-image/upscale/creative` |
| `generate` | `POST /v2beta/stable-image/generate/{core\|sd3\|ultra}` |
| search & replace | `POST /v2beta/stable-image/edit/search-and-replace` |
| search & recolour | `POST /v2beta/stable-image/edit/search-and-recolor` |

Implementation notes:

- **Mask polarity matches ours** (white = edit region) for `inpaint` / `erase`, so conversion is a
  channel extraction rather than an inversion. **⚠ VERIFY** per endpoint — polarity differs between
  some of them, and getting it backwards produces a spectacularly wrong result that looks like a bug
  in our app.
- **`outpaint`** takes directional pixel counts (`left`, `right`, `up`, `down`) rather than a target
  canvas. Our `targetCanvas` must be translated into those four numbers, and the adapter must clamp to
  the endpoint's per-direction maximum, reporting any clamp to the user.
- **Async endpoints:** `upscale/creative` and some others return `{ id }` and require polling
  `GET /v2beta/results/{id}` until `200`. Use the shared polling helper (§13.5). A `202` means
  in-progress. Surface real progress, not a fake bar.
- **`search-and-replace` / `search-and-recolor`** are strong differentiators — the user types
  *"the red car"* instead of masking. Expose them as a distinct **Find & Replace Object** tool
  (an addition to T66's panel), because they are genuinely easier than brushing a mask.
- Common fields: `prompt`, `negative_prompt`, `seed`, `output_format` (`png` / `jpeg` / `webp`),
  `style_preset`, `grow_mask`, `creativity` (upscale/outpaint).
- `test()`: `GET /v1/user/account` (returns account info without generating) or
  `GET /v1/user/balance` — pick whichever is free and confirms the key. **⚠ VERIFY.** Also surface the
  returned credit balance in the UI, which is genuinely useful.
- Errors return a JSON body with `errors: string[]` even when `Accept: image/*` — parse the body on
  non-2xx and surface those strings verbatim.
- Docs: `https://platform.stability.ai/docs/api-reference`

### 14.5 Black Forest Labs (FLUX) — `generate`, `inpaint`, `outpaint`

```
Base URL: https://api.bfl.ai            Header: x-key: <key>
```

Flow is asynchronous in two steps:

1. `POST /v1/{model}` with a JSON body → `{ id, polling_url }`.
2. Poll `GET {polling_url}` (or `GET /v1/get_result?id=...`) until `status === 'Ready'`, then read
   `result.sample` (a signed URL, short-lived — download immediately and convert to a `RasterImage`).

| Capability | Model path |
| --- | --- |
| `generate` | `/v1/flux-pro-1.1`, `/v1/flux-pro-1.1-ultra`, `/v1/flux-dev` |
| `inpaint` / `outpaint` | `/v1/flux-pro-1.0-fill` |
| structural edit | `/v1/flux-pro-1.0-canny`, `/v1/flux-pro-1.0-depth` |

Implementation notes:

- **⚠ VERIFY** model paths and the current model generation — BFL renames aggressively.
- `fill` takes `image` and `mask` as **base64 strings in JSON** (not multipart). Polarity **⚠ VERIFY**.
- Poll with backoff (500 ms → 2 s, cap 5 s), max 5 minutes, cancellable. `status` values include
  `Pending`, `Ready`, `Error`, `Content Moderated`, `Request Moderated` — map each to a distinct,
  specific user-facing message. "Content Moderated" must not be reported as a generic failure.
- The result URL expires (minutes). Fetch it inside the same user gesture window and never store the
  URL as a durable reference.
- `test()`: **⚠ VERIFY** whether a free credits/account endpoint exists. If not, `test()` must state
  honestly that verification requires a minimal billable generation, and ask for explicit consent
  showing the estimated cost before proceeding. Never silently spend the user's money to "test".
- Docs: `https://docs.bfl.ai`

### 14.6 fal.ai — the breadth provider

Hundreds of models behind one uniform interface, and browser-friendly.

```
POST https://fal.run/{model-path}        Header: Authorization: Key <FAL_KEY>
Content-Type: application/json
```

Queue variant for long jobs: `POST https://queue.fal.run/{model-path}` → `{ request_id }`, then
`GET https://queue.fal.run/{model-path}/requests/{request_id}/status` and `/…/{request_id}`.

Curated model map shipped as the default (user can add any model path):

| Capability | Model path | Notes |
| --- | --- | --- |
| `removeBackground` | `fal-ai/birefnet/v2` | Best general quality |
| `removeBackground` | `fal-ai/imageutils/rembg` | Fastest / cheapest |
| `upscale` | `fal-ai/esrgan` | Classic ×2/×4 |
| `upscale` | `fal-ai/clarity-upscaler` | Detail-adding |
| `generate` | `fal-ai/flux/schnell` | Fast, cheap |
| `generate` | `fal-ai/flux-pro/v1.1` | High quality |
| `edit` | `fal-ai/gemini-3-pro-image-preview/edit` | Gemini via fal, no Google account needed |
| `inpaint` | `fal-ai/flux-pro/v1/fill` | Mask-based |
| `erase` | `fal-ai/object-removal` | **⚠ VERIFY** exact path |
| `segment` | `fal-ai/sam2` | Point/box prompted masks — feeds our mask brush |

Implementation notes:

- **Input images:** each model accepts `image_url`, which may be a `data:` URI. That keeps everything
  browser-side with no upload step. For large images, fal's storage upload endpoint is an alternative —
  but prefer `data:` URIs to avoid a second network hop and a second copy of the user's image.
- **Per-model schemas differ.** Do not hard-code fields. Fetch the OpenAPI schema for a model path and
  generate the Advanced controls from it; keep a curated subset of well-known fields in the primary UI.
  **⚠ VERIFY** the schema-discovery endpoint.
- `sam2` is strategically valuable: it turns our mask brush into a **click-to-select-object** tool,
  which is a large UX win for T66/T69.
- `test()`: **⚠ VERIFY** for a free account/balance endpoint; otherwise use the cheapest model
  (`imageutils/rembg` on a 64×64 image) and disclose the negligible cost.
- Docs: `https://docs.fal.ai`

### 14.7 Replicate — the escape hatch

Any public model, including community models that do things no first-party API does.

```
POST https://api.replicate.com/v1/models/{owner}/{name}/predictions
Headers: Authorization: Bearer r8_...
         Content-Type: application/json
         Prefer: wait=60            ← synchronous up to 60s, avoids polling entirely
Body: { "input": { ... } }
```

Implementation notes:

- **`Prefer: wait`** is the key detail: it turns most calls into a single synchronous request. Fall back
  to polling `GET /v1/predictions/{id}` when the job exceeds the wait window.
- **⚠ VERIFY CORS.** Replicate has historically not sent permissive CORS headers for all endpoints. If
  the probe fails, the UI must route users to the Relay (§15) rather than presenting an inscrutable
  failure. Set `browserDirect: 'unknown'` until the nightly contract test proves otherwise.
- Model versions are content-addressed. Prefer the `/models/{owner}/{name}/predictions` form (always
  latest) but let advanced users pin a `version` hash for reproducibility.
- Curated defaults: `nightmareai/real-esrgan` (upscale), `lucataco/remove-bg`,
  `black-forest-labs/flux-fill-pro` (inpaint), `andreasjansson/blip-2` or a current VLM (describe).
  **⚠ VERIFY** each slug still exists; community models disappear.
- Cancellation: `POST /v1/predictions/{id}/cancel` — wire this to our `AbortSignal` so a cancelled job
  stops being billed.
- `test()`: `GET /v1/account` — free, proves auth.
- Docs: `https://replicate.com/docs/reference/http`

### 14.8 remove.bg — `removeBackground`

Single-purpose, best-in-class for hair and fur edges.

```
POST https://api.remove.bg/v1.0/removebg
Header: X-Api-Key: <key>
Content-Type: multipart/form-data
Fields: image_file, size (preview|full|auto|hd|4k), type (auto|person|product|car),
        format (auto|png|jpg|zip), bg_color, crop, crop_margin, scale, position,
        add_shadow, semitransparency, roi, channels (rgba|alpha)
```

Implementation notes:

- `X-Rate-Limit-*` and `X-Credits-Charged` response headers feed the ledger and the spend guard —
  read and display them.
- `channels: 'alpha'` returns the matte only, which lets us composite locally at full original
  resolution even when the API returns a smaller cutout. Use this when the source exceeds the account's
  size tier — it preserves the user's full resolution, which the naive integration loses.
- `size: 'preview'` is free or cheap on most plans: use it for the interactive preview, then charge
  once for `full` on export. Show this behaviour explicitly ("preview is low-cost; export uses one
  credit").
- `test()`: `GET https://api.remove.bg/v1.0/account` — free, returns credit balance.
- Docs: `https://www.remove.bg/api`

### 14.9 Clipdrop — multi-op

```
Base URL: https://clipdrop-api.co        Header: x-api-key: <key>
Content-Type: multipart/form-data
```

| Capability | Endpoint | Fields |
| --- | --- | --- |
| `removeBackground` | `POST /remove-background/v1` | `image_file` |
| `erase` | `POST /cleanup/v1` | `image_file`, `mask_file`, `mode` (`fast` / `quality`) |
| `upscale` | `POST /image-upscaling/v1/upscale` | `image_file`, `target_width`, `target_height` |
| remove text | `POST /remove-text/v1` | `image_file` |
| `replaceBackground` | `POST /replace-background/v1` | `image_file`, `prompt` |
| reimagine | `POST /reimagine/v1/reimagine` | `image_file` |

Implementation notes: `cleanup` mask is **white = remove** (matches our convention — **⚠ VERIFY**).
Upscaling takes explicit target dimensions rather than a factor, so translate `scaleFactor` and clamp
to the documented maximum. `x-remaining-credits` response header feeds the ledger.
`test()`: **⚠ VERIFY** for an account endpoint. Docs: `https://clipdrop.co/apis/docs`

### 14.10 OpenAI-compatible / self-hosted — the sovereignty option

The most important adapter for the privacy-motivated user, and the one that makes the BYOK story
compelling rather than merely tolerable: **your images never leave your machine.**

```
Base URL: user-supplied     e.g. http://localhost:11434/v1        (Ollama)
                                 http://localhost:1234/v1         (LM Studio)
                                 http://localhost:8000/v1         (vLLM)
                                 https://openrouter.ai/api/v1     (OpenRouter)
                                 https://<your-litellm>/v1        (LiteLLM proxy)
Header: Authorization: Bearer <key or 'not-needed'>
```

Implementation notes:

- Speaks the OpenAI shape: `GET /models`, `POST /chat/completions` (vision for `describe`),
  `POST /images/generations`, `POST /images/edits`. Capabilities are **probed**, not assumed: call
  `GET /models`, then offer only the capabilities whose endpoints respond to an `OPTIONS`/minimal probe.
- **Localhost and mixed content:** a page served over HTTPS may block requests to `http://localhost`.
  Chrome treats `http://localhost` as a secure context and generally permits it; Safari and Firefox
  vary. The connect page must explain this precisely per browser and offer the documented workarounds
  (run the local server with TLS, or use `127.0.0.1` where treated as potentially-trustworthy).
  **⚠ VERIFY current browser behaviour at implementation time** and write the guidance from the
  observed result, not from memory.
- **CORS on local servers:** Ollama needs `OLLAMA_ORIGINS` to include our origin; LM Studio has a CORS
  toggle; vLLM takes `--allowed-origins`. Give the exact command for each on the connect page —
  copy-pasteable, per-OS. This is the single highest-value piece of documentation in §17.
- The CSP `connect-src` must be extended at runtime to include the user's base URL (§16.4).
- `test()`: `GET {baseUrl}/models`, then report exactly which models were found and which capabilities
  we could confirm.

### 14.11 Adding a provider

The whole point of the registry is that this is small. To add one:

1. Create `packages/engine/src/ai/adapters/<id>.ts` exporting a `ProviderAdapter`.
2. Register it in `adapters/index.ts`.
3. Add a contract fixture in `test/contract/<id>/` (recorded request/response pairs).
4. Add a walkthrough at `apps/web/src/routes/connect-ai/[provider]/` with the four steps from §17.3.
5. Run `pnpm docs:providers` to regenerate `docs/PROVIDERS.md` from the registry.

No UI change is required. If the adapter declares `upscale`, the Upscale tool offers it automatically.

---

## 15. The CORS problem and the Relay

### 15.1 State the problem plainly

A browser can only call a third-party API directly if that API returns permissive CORS headers. Some
providers do (OpenAI, Google, fal.ai). Some require an explicit opt-in header (Anthropic's
`anthropic-dangerous-direct-browser-access`). Some do not support browser origins at all, because their
threat model assumes a server holds the key.

**Most BYOK web tools handle this badly** — the request fails, the browser reports a generic network
error with no detail (CORS failures are deliberately opaque to JavaScript), and the user concludes the
app is broken or their key is wrong. Handling this well is a genuine differentiator.

### 15.2 What we do about it

1. **Probe, don't guess.** Before the first real call to a provider, run a cheap probe. Classify the
   outcome into: `ok`, `auth-failed`, `cors-blocked`, `network-unreachable`, `provider-error`. A CORS
   failure is distinguishable in practice: `fetch` rejects with a `TypeError` while the network panel
   shows the request was made. We use that signal plus a same-origin control request to disambiguate a
   CORS block from a genuine offline state.
2. **Never show a bare network error.** `ai-cors-blocked` renders a specific explanation:
   > **Your browser can't call {Provider} directly.** {Provider} doesn't allow requests from web pages
   > — this is a restriction on their side, not a problem with your key. Two options:
   > **(a)** use a provider that supports browser access ({list of the user's configured alternatives
   > that have this capability}), or **(b)** deploy your own relay in about two minutes — it's a single
   > file, runs on Cloudflare's free tier, and your key still never touches our servers.
3. **Record the truth.** The nightly contract test (§22.7) calls every provider from a browser context
   and updates each adapter's `browserDirect` field. `docs/PROVIDERS.md` therefore always reflects
   reality, and the connect page can warn *before* the user pastes a key.

### 15.3 The Relay

`apps/relay` is an optional, **user-deployed** Cloudflare Worker (or Deno Deploy / Vercel Edge /
Netlify Function — templates for each). It exists solely to add CORS headers to a request the browser
could otherwise not make.

**Design constraints, all of which are trust-critical:**

| Constraint | Rationale |
| --- | --- |
| **Deployed by the user, to the user's own account.** We host no relay and offer no shared instance. | If we ran one, keys would pass through our infrastructure. That would break P7, and the promise would be worthless |
| **Stateless.** No storage, no KV, no D1, no logs of request bodies or headers. | Nothing to leak, nothing to subpoena |
| **Destination allowlist**, compiled in at deploy time. | Prevents the relay becoming an open proxy that anyone can abuse |
| **Origin allowlist**, defaulting to the user's own deployment plus `https://image.complianttools.com`. | Prevents third parties using the user's relay and quota |
| **No key storage.** The key rides in the request the browser sends, is forwarded, and is never persisted. | The relay is a pipe, not a vault |
| **Optional shared secret** (`RELAY_TOKEN`) so only the user's browser can use their relay. | Defence against someone finding the URL |
| **Single file, under 200 lines, readable in one sitting.** | A security component nobody can read is a security component nobody trusts. Auditability is the feature |

Sketch (`apps/relay/src/index.ts`):

```ts
const ALLOWED_DESTINATIONS = [
  'api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com',
  'api.stability.ai', 'api.bfl.ai', 'fal.run', 'queue.fal.run',
  'api.replicate.com', 'api.remove-bg.com', 'api.remove.bg', 'clipdrop-api.co',
];

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? 'https://image.complianttools.com').split(',');
    if (!allowedOrigins.includes(origin)) return new Response('Forbidden origin', { status: 403 });

    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') ?? '*',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (env.RELAY_TOKEN && req.headers.get('X-Relay-Token') !== env.RELAY_TOKEN)
      return new Response('Unauthorized relay', { status: 401, headers: cors });

    // Target is passed as ?url= (absolute). Validate strictly.
    const target = new URL(req.url).searchParams.get('url');
    if (!target) return new Response('Missing url', { status: 400, headers: cors });
    let t: URL;
    try { t = new URL(target); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
    if (t.protocol !== 'https:') return new Response('HTTPS only', { status: 400, headers: cors });
    if (!ALLOWED_DESTINATIONS.includes(t.hostname))
      return new Response(`Destination not allowed: ${t.hostname}`, { status: 403, headers: cors });

    // Forward verbatim minus hop-by-hop and relay-specific headers. Never log.
    const fwd = new Headers(req.headers);
    ['host','origin','referer','x-relay-token','cf-connecting-ip','cf-ipcountry',
     'x-forwarded-for','x-real-ip'].forEach(h => fwd.delete(h));

    const upstream = await fetch(t.toString(), {
      method: req.method,
      headers: fwd,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      redirect: 'follow',
    });

    const out = new Headers(upstream.headers);
    Object.entries(cors).forEach(([k, v]) => out.set(k, v));
    out.delete('set-cookie');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
```

`apps/relay/README.md` must contain: a one-click deploy button, the manual `wrangler` commands, how to
set `ALLOWED_ORIGINS` and `RELAY_TOKEN`, how to verify it works, how to tear it down, and an explicit
statement of what the relay can and cannot see. Equivalent templates for Deno Deploy, Vercel Edge, and
Netlify go in the same directory.

### 15.4 Relay configuration in the app

Per-provider, in the connect UI: `Connection: Direct (recommended) | Via my relay`. When "via my relay"
is selected the user supplies the relay URL and optional token; the transport rewrites the request as
`{relayUrl}?url={encodeURIComponent(target)}` and adds `X-Relay-Token`. The relay URL is added to the
runtime CSP `connect-src` (§16.4). The UI must always show which path a request took, so there is never
ambiguity about where an image went.

---

## 16. Key storage and security model

### 16.1 Threat model, stated honestly

| Threat | Mitigated? | How, or why not |
| --- | --- | --- |
| We exfiltrate the user's key | **Yes, structurally** | No server exists. Static hosting only. There is no endpoint that could receive it |
| A third-party script exfiltrates the key | **Yes** | No third-party runtime scripts (P5). CSP forbids them. No analytics, no ads, no CDN |
| A supply-chain compromise in a dependency | **Partially** | Strict CSP `connect-src` allowlist means an injected script cannot reach an arbitrary host. Lockfile pinning, `pnpm audit` in CI, Subresource Integrity on all self-hosted assets, and a review requirement for dependency bumps. **This is the residual risk and we say so in `docs/SECURITY.md`** |
| XSS in our own code reads the key | **Partially** | No `innerHTML` with untrusted data (lint-enforced), Trusted Types where supported, CSP without `unsafe-inline`/`unsafe-eval`. A successful XSS could read a decrypted in-memory key — this is inherent to any browser BYOK design and is disclosed |
| Another site reads the key | **Yes** | Origin-isolated storage. No `postMessage` listener accepts commands. No permissive `frame-ancestors` |
| Someone with the user's device reads stored keys | **Mitigated by default** | Session-only storage is the default. Persistent storage is encrypted with a passphrase-derived key and requires unlocking |
| A malicious browser extension | **No** | Extensions with host permissions can read page memory. Nothing a web app can do. Disclosed plainly in `docs/SECURITY.md` |
| Network observer sees the key | **Yes** | HTTPS-only enforced; the transport refuses non-HTTPS targets except explicit localhost |

### 16.2 Storage modes

The user chooses, and the choice is explained in one sentence each, with the default preselected:

| Mode | Storage | Survives | Default |
| --- | --- | --- | --- |
| **Session only** | In-memory + `sessionStorage` | Tab reload; cleared on tab close | **✔ default** |
| **This browser, encrypted** | IndexedDB, AES-GCM-256 | Restart; requires a passphrase to unlock each session | opt-in |
| **This browser, unencrypted** | IndexedDB, plaintext | Restart; no passphrase | opt-in, with a clear warning |
| **Never store** | Prompted per request | Nothing | opt-in (for shared machines) |

### 16.3 Encryption detail

```
passphrase ──PBKDF2-SHA-256, 600 000 iterations, 16-byte random salt──▶ 256-bit key
                                                                          │
credentials JSON ──AES-GCM, 12-byte random IV, no AAD reuse──────────────▶ ciphertext
                                                                          │
IndexedDB record: { v: 1, salt, iv, ciphertext, createdAt, hint? }
```

Rules: the derived key lives in a non-extractable `CryptoKey` and is never written anywhere.
It is zeroed and dropped on lock, on tab visibility loss beyond a configurable idle timeout
(default 30 minutes), and on explicit lock. Use Argon2id via WASM instead of PBKDF2 if the bundle
budget allows — **⚠ VERIFY** cost and record the decision as an ADR. A wrong passphrase produces an
AES-GCM authentication failure, reported as "That passphrase didn't work" with no lockout and no
counter (there is nothing to brute-force remotely).

### 16.4 Content Security Policy

Base policy, served as a header (and duplicated as a `<meta>` for the static-host case):

```
default-src 'none';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' blob: https://cdn.jsdelivr.net https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/script/Latin.traineddata;
worker-src 'self' blob:;
child-src 'self' blob:;
manifest-src 'self';
form-action 'none';
frame-ancestors 'none';
base-uri 'none';
object-src 'none';
upgrade-insecure-requests;
require-trusted-types-for 'script';
```

Notes:

- `'wasm-unsafe-eval'` is required for WebAssembly and is strictly narrower than `'unsafe-eval'`.
- `https://cdn.jsdelivr.net` is permitted only for the selected Apache-2.0 `tessdata_fast` model at
  the pinned commit when that model is not available locally. The pinned
  `script/Latin.traineddata` file uses its exact `raw.githubusercontent.com` path because jsDelivr
  returns 403 for that 89 MB file. These requests fetch model binaries only; OCR pixels stay in the
  browser and are never sent to either host. The worker and runtime remain same-origin. Do not
  broaden either source to a host wildcard without a separate review.
- Other provider hosts are not part of the base `connect-src`. When the user connects a provider, the app cannot
  widen a header-delivered CSP at runtime — so provider requests are issued from a **dedicated worker
  whose own CSP is derived from the user's configured provider set**, delivered via a
  `Content-Security-Policy` on the worker script response, or (where that is not possible on the host)
  enforced by the transport's own origin allowlist (§13.5 item 1) with the CSP kept maximally tight for
  the document. **⚠ VERIFY** what the chosen host supports and pick the strictest workable arrangement;
  record it as an ADR. Do not silently fall back to `connect-src *`.
- COOP/COEP are also required for `SharedArrayBuffer` (WASM threads). See §23.4 — these interact with
  CSP and with cross-origin isolation, and the combination must be tested, not assumed.

### 16.5 Additional headers

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(),
                    interest-cohort=(), browsing-topics=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 16.6 Code-level rules (lint-enforced)

- A value read from `ctx.credentials` may only be used inside `transport.ts` and an adapter's header
  construction. It must never be interpolated into a template literal, appended to a URL query string,
  written to `console`, stored in a store, included in an error, or serialized.
- No `eval`, `new Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or
  `document.write` anywhere in the repo. `{@html}` in Svelte is banned except for a single audited
  Markdown renderer applied to our own build-time content.
- All `fetch` calls in `packages/engine` must route through `transport.ts`. A direct `fetch` elsewhere
  in the engine fails lint.
- The diagnostic bundle (§11.8) is assembled by a single function with an explicit allowlist of fields;
  a test asserts that no credential value can appear in its output.

---

## 17. "Connect your AI" teaching page

Route: `/connect-ai`, with `/connect-ai/[provider]` per-provider walkthroughs. This is a **real,
indexable, linkable page**, not a modal — because it is also a genuinely useful piece of public
documentation, and it will attract search traffic in its own right ("how to use my own OpenAI key",
"anthropic api key browser cors", "ollama cors localhost").

### 17.1 Page structure

```
/connect-ai
├─ Hero            What this is, in three sentences. No marketing.
├─ Why BYOK        Four short reasons (§13.1), plainly stated.
├─ Choose provider Comparison table + a "help me choose" flow
├─ Your providers  Connected providers, status, capabilities, usage, edit/remove
├─ #usage          The local cost ledger (§13.6) with CSV export
├─ #relay          When and how to deploy a relay (§15)
├─ #security       Exactly what we do and don't do with the key (§16), verifiable claims only
└─ #faq            The 14 questions in §17.6
```

### 17.2 The chooser

A table the user can actually decide from — no "contact us", no feature-gating asterisks:

| Provider | Best for | Capabilities | Works in browser | Free tier | Rough cost | Setup |
| --- | --- | --- | --- | --- | --- | --- |
| Anthropic | Alt text, captions, reading text in images | Describe | Yes | No | ~$0.003 / image | 2 min |
| OpenAI | Generating and editing images from prompts | Generate, Edit, Inpaint, Describe | Yes | No | ~$0.02–0.19 / image | 2 min |
| Google Gemini | Iterative editing, text inside images | Generate, Edit, Describe | Yes | Yes (limited) | ~$0.03–0.13 / image | 2 min |
| Stability AI | Precise mask-based editing, erase, expand, upscale | Inpaint, Erase, Outpaint, Upscale, Remove BG | Verify | No | credits | 3 min |
| Black Forest Labs | Highest-quality generation and fill | Generate, Inpaint, Outpaint | Verify | No | ~$0.04–0.06 | 3 min |
| fal.ai | Widest model choice, click-to-select masks | Everything | Yes | Small credit | per-model | 2 min |
| Replicate | Any community model | Everything | Verify | No | per-second | 3 min |
| remove.bg | Best background removal on hair and fur | Remove BG | Verify | 1 free credit/mo | ~$0.20 / image | 2 min |
| Clipdrop | Cleanup and upscale | Remove BG, Erase, Upscale | Verify | Limited | credits | 2 min |
| Your own server | Total privacy — nothing leaves your machine | Depends on your model | Yes¹ | Free | electricity | 10 min |

¹ Needs a CORS setting on your server — we give you the exact command.

"Works in browser" is populated from each adapter's `browserDirect` field, updated nightly (§15.2), so
it is never stale. "Rough cost" links to the provider's own pricing page and carries a
"checked {date}" stamp.

**"Help me choose"** — three questions, one recommendation:

1. *What do you want to do?* → Describe images · Generate images · Remove or replace backgrounds ·
   Erase objects · Expand images · Upscale
2. *What matters most?* → Cheapest · Best quality · Most private · Easiest setup
3. *Do you already have an account anywhere?* → checkbox list

Output: one recommended provider with a one-sentence reason, plus two alternatives. Never a ranked list
of ten — the point is to remove a decision, not to present one.

### 17.3 Per-provider walkthrough (the template)

Every `/connect-ai/[provider]` page follows the same four steps. Consistency is what makes the second
provider take 30 seconds instead of two minutes.

**Step 1 — Create an account and a key.**
Numbered instructions with the exact UI labels the user will see on the provider's site (e.g.
*"Click **API keys** in the left sidebar → **Create new secret key** → name it `image-tools`"*), a
direct deep link to the key page, a note on whether billing setup is required before the key works,
and a screenshot placeholder with a caption describing what the user should see (screenshots must be
recaptured on a schedule — a stale screenshot is worse than none, so each carries a `verified: date`
and CI warns after 180 days).

**Step 2 — Paste it here.**
An inline, masked credential form — the user does not navigate away. Fields come from
`descriptor.credentialFields`. Behaviours: paste-only-friendly (no autocomplete, no spellcheck,
`type=password` with a reveal toggle), a soft format check that *warns* but never blocks
(a provider may change its key format at any time and we must not lock users out), and the storage-mode
selector from §16.2 with the default preselected and each option explained in one line.

**Step 3 — Test the connection.**
A `Test connection` button that runs `adapter.test()` and reports a **real** result:

> ✅ **Connected to OpenAI.**
> Found 34 models. Confirmed: Generate, Edit, Inpaint, Describe.
> This test was free — no image was generated.

Failure is equally specific, one message per failure class:

> ❌ **That key was rejected (HTTP 401).** Double-check you copied the whole key, including the `sk-`
> prefix. If you just created it, keys occasionally take a minute to activate.

> ⚠️ **Your key works, but your browser can't reach Stability AI directly.** That's a restriction on
> their side. [Deploy a relay (2 min)] or [use a different provider for this].

> ⚠️ **Connected, but this account has no credits.** Stability AI returned a balance of 0. Add credits
> at {link}, then test again.

Where `test()` would necessarily cost money (§14.5), the button says so *before* it is pressed, with
the estimated amount, and requires a second confirming click.

**Step 4 — What you can now do.**
A capability grid showing which tools just became available, each a direct link. This is the payoff
moment and it should feel like one: the user sees four tools light up and lands in one of them with one
click.

### 17.4 Special guidance sections

These are the pages that earn links, because nobody else writes them well.

- **`/connect-ai/self-hosted`** — the flagship. Exact, copy-pasteable setup for each runtime, per OS:

  | Runtime | The command that matters |
  | --- | --- |
  | Ollama (macOS) | `launchctl setenv OLLAMA_ORIGINS "https://image.complianttools.com"` then restart Ollama |
  | Ollama (Linux) | `Environment="OLLAMA_ORIGINS=https://image.complianttools.com"` in the systemd unit, then `systemctl daemon-reload && systemctl restart ollama` |
  | Ollama (Windows) | `setx OLLAMA_ORIGINS "https://image.complianttools.com"`, then restart |
  | LM Studio | Server tab → enable CORS → set the allowed origin |
  | vLLM | `--allowed-origins '["https://image.complianttools.com"]'` |
  | LiteLLM | `--config` with `general_settings.cors_origins` |

  Plus: which local models are actually good at vision (with honest quality caveats), the mixed-content
  caveat per browser (§14.10), how to verify with `curl` before blaming us, and a troubleshooting
  decision tree. **⚠ VERIFY every command against the current release of each tool** before publishing;
  a wrong command here destroys trust faster than any bug.

- **`/connect-ai/relay`** — what a relay is, when you need one, the one-click deploys, what it can and
  cannot see, how to verify it, how to remove it.

- **`/connect-ai/cost`** — how image-model pricing actually works (per-image vs. per-token vs.
  per-second), what drives cost (resolution, quality tier, step count), how to spend less
  (preview at low cost then export once; batch describe with the cheap model; use local tools for
  everything that isn't generative), and how to read the ledger. Include a worked example:
  *"200 product photos: background removal locally = $0. Alt text with Haiku = about $0.60.
  Generative background replacement with Stability = about $8."*

- **`/connect-ai/privacy`** — a per-provider table of stated data-retention and training policies with
  links and a "checked {date}", presented as **their** claims, quoted, not our summary. Plus the one
  thing we can state as fact: *the request goes from your browser to them; it does not pass through us.*

### 17.5 Managing connections

The "Your providers" section lists each connected provider with: status dot (verified / untested /
failing), confirmed capabilities, model count, storage mode, last used, session spend, and actions
(Test again · Edit · Change storage mode · Remove · Export config). `Export config` writes a JSON file
containing everything **except** secrets, so a user can move their setup between machines without
moving keys. `Remove` deletes the record and any cached model list, and confirms what was deleted.

### 17.6 FAQ (write all fourteen)

1. Why do I need my own API key?
2. Does the key ever go to your servers? *(No. There are no servers. Here's how to verify that.)*
3. What does this cost me?
4. Which provider should I pick?
5. Is my image sent anywhere?
6. What if I don't want to connect anything? *(Everything except four tools still works.)*
7. Where is my key stored, and how do I delete it?
8. Can I use a local model with no internet?
9. Why did I get a CORS error?
10. What's a relay and do I need one?
11. Can I use one key across several devices?
12. What happens if my key leaks?
13. Do you rate-limit or queue my requests? *(No. Your provider's limits are the only limits.)*
14. Can I use my company's Azure / Bedrock / Vertex deployment? *(Yes — via the OpenAI-compatible
    adapter or a LiteLLM proxy. Here's how.)*

### 17.7 In-app entry points

The connect page is reachable from an escalation control, the three AI-only tools, the `AI ▾` header
menu, `⌘K → "connect"`, and the settings panel. There are **two** distinct empty states, and conflating
them would misrepresent the product.

**On an escalation control** (T32, T62, T66–T69) — the local result is already on screen, so this is an
offer, not a blocker:

> **Want to try this with an AI model?**
> The result above was produced on your device, free. If it isn't good enough, an AI model may do
> better on this image — that needs your own provider account (about two minutes to set up, and you
> pay them directly, roughly $0.04 for this operation).
> [Connect a provider] [Not now]

**On one of the three AI-only tools** (T64, T65, T71) — there is genuinely no local path, so say so
plainly and point at the nearest thing that does work:

> **This one needs an AI model.**
> Generating an image from a description is the one thing no algorithm can do, so it needs your own
> provider account — that's how it stays free here, and it means your images go to a provider you
> chose, not to us. Setup takes about two minutes.
> [Connect a provider] [How this works] [Make patterns, QR codes, and placeholders instead →]

Copy rules for both:

- Never imply the product is limited without a key. It is not — 78 of 81 tools work.
- Never use "Upgrade", "Unlock", "Pro", or "Premium". This is not a paywall and must not borrow its
  vocabulary.
- Always name the cost and the provider before the request, never after.
- Always offer the local alternative as a real link, not as consolation text.

---

## 18. Persistence and state

### 18.1 What is stored, where, and why

| Data | Store | Lifetime | User-visible control |
| --- | --- | --- | --- |
| Theme, locale, units | `localStorage` | Forever | Settings |
| Per-tool last-used options | `localStorage` (keyed by tool id) | Forever | Settings → "Forget my preferences" |
| Saved recipes | IndexedDB `recipes` | Forever | Recipe manager: rename, duplicate, export, delete |
| Provider config (non-secret) | IndexedDB `providers` | Forever | §17.5 |
| Credentials | Per §16.2 | Per mode | §17.5, plus a global "Delete all keys" |
| Cost ledger | IndexedDB `ledger` | Rolling 365 days | `/connect-ai#usage`: export CSV, clear |
| Cached model lists | IndexedDB `modelCache` | 24 h TTL | Auto; "Refresh models" button |
| WASM modules + ONNX models | Cache Storage (`assets-v{n}`) | Until version change | Settings → "Clear downloaded modules" with sizes shown |
| Large intermediates / batch spill | OPFS `scratch/` | Deleted on completion or next load | Auto; "Clear scratch" if orphaned |
| Undo history | Memory only | Session | — |
| Input files, output files, pixels | **Memory / OPFS scratch only, never persisted** | Until tab close | — |

A single **Settings → Data** screen lists every store with its actual measured size
(`navigator.storage.estimate()` plus per-store counts) and a delete button for each, plus one
**"Delete everything and reset"**. No dark patterns, no confirmation mazes — one confirm, then done.

### 18.2 Recipe serialization

```ts
// Wire format: URL fragment, so it is never transmitted to a server.
// /recipe#r1.<base64url(deflate-raw(JSON))>
//   r1 = format version, enabling migration of every link ever shared.
```

Rules: assets referenced by hash (a watermark image, a LUT) are **not** embedded — the recipe records
`{ assetHash, name, kind, bytes }` and the recipient is prompted to supply the missing asset with a
clear description of what is needed. This keeps links short and, more importantly, means sharing a
recipe never accidentally shares an image. If the fragment exceeds 8 KB the UI offers a downloadable
`.ctimg-recipe.json` file instead and says why.

A recipe page renders a **plain-language description** before anything runs:

> This recipe will: resize to 1200 px wide (keeping aspect ratio) → sharpen slightly →
> strip all metadata → export as WebP at quality 80.
> It needs 1 file you provide. Nothing is uploaded.

### 18.3 PWA and offline

- `manifest.webmanifest`: name, short name, icons (192/512/maskable), `display: standalone`,
  `start_url: /?source=pwa`, theme colours per scheme, shortcuts to the five most-used tools, and
  **`file_handlers`** so the OS can open images directly in the app, plus `share_target` (POST,
  multipart) so images can be shared to it from a phone.
- Service worker (Workbox or hand-rolled; hand-rolled preferred for auditability):
  - App shell and route HTML: stale-while-revalidate.
  - Hashed JS/CSS/fonts: cache-first, immutable.
  - WASM and ONNX: cache-first with explicit versioning; **never** fetched speculatively.
  - Anything cross-origin: **never cached, never intercepted.** AI requests bypass the service worker
    entirely — a service worker that touched a request carrying a credential would be an unnecessary
    trust surface.
- Update flow: on new version detected, show a non-blocking toast — *"A new version is ready.
  [Reload]"* — never auto-reload mid-edit. Work in progress is never lost to an update.
- Offline state is reflected in a badge and in every AI tool's disabled reason (§11.5).

---

## 19. Performance budgets

Numbers are targets on a mid-range 2021 laptop (4 cores) and a mid-range Android phone
(Moto G-class), on a throttled Fast 3G / 4× CPU profile where marked. **CI fails on regression**, so
these are contracts, not aspirations.

### 19.1 Loading

| Metric | Budget |
| --- | --- |
| Initial HTML (any tool route) | ≤ 14 kB compressed (fits the first TCP window) |
| Critical CSS, inlined | ≤ 9 kB |
| Initial JS (parse+exec to interactive) | ≤ 90 kB compressed |
| Eager WASM (jpeg+png+webp+resize) | ≤ 700 kB compressed, fetched **in parallel with** first paint, never blocking it |
| LCP (throttled) | ≤ 1.8 s |
| INP | ≤ 120 ms |
| CLS | ≤ 0.01 |
| TTI (throttled) | ≤ 2.5 s |
| Lighthouse Performance, mobile | ≥ 95 |
| Total transferred, first visit to a tool page | ≤ 1.0 MB |
| Total transferred, repeat visit | ≤ 20 kB |

Enforcement: `size-limit` per entry point in CI, plus Lighthouse CI with assertions on the five tool
pages that matter most.

### 19.2 Operation latency

| Operation | Input | Budget |
| --- | --- | --- |
| Decode JPEG + generate proxy | 12 MP | ≤ 400 ms |
| Live adjustment (GPU tier) | 2048 px proxy | ≤ 16 ms/frame |
| Live adjustment (WASM tier) | 2048 px proxy | ≤ 50 ms/frame |
| Live filter with LUT | proxy | ≤ 16 ms/frame (GPU) |
| Resize 12 MP → 1920 px, lanczos3 | | ≤ 250 ms |
| Encode JPEG q82, 12 MP | | ≤ 700 ms |
| Encode WebP q80, 12 MP | | ≤ 900 ms |
| Encode AVIF speed 6, 12 MP | | ≤ 4 s (and the UI says AVIF is slow, with the reason) |
| T27 square-crop preview + PNG output | 12 MP still PNG | ≤ 3 s (click to visible preview; Chromium gate) |
| T57 one-region blur preview | 6 MP still PNG | ≤ 3 s (manual selection to visible preview; Chromium route E2E gate) |
| T63 image selection + decoded preview | 6 MP still image | ≤ 3 s (selection to visible preview; route E2E gate) |
| Predicted-size update after an option change | | ≤ 250 ms |
| Target-size search, 8 iterations | 12 MP | ≤ 4 s, with per-iteration progress |
| Metadata read | any | ≤ 40 ms |
| Local background removal | 12 MP | ≤ 6 s (after model cached) |
| Local upscale ×2 | 1 MP → 4 MP | ≤ 12 s (after model cached), tiled with progress |
| Batch of 50 × 4 MP JPEG → WebP | 4 cores | ≤ 45 s |

### 19.3 Interaction rules

- Any operation projected to exceed **400 ms** shows determinate progress. Never a bare spinner where
  progress is knowable.
- Any operation projected to exceed **2 s** shows a Cancel button.
- Slider drags never queue work: the scheduler coalesces to the latest value and drops intermediates
  (`requestAnimationFrame` + in-flight guard).
- The main thread is never blocked for more than **50 ms** by our own code. Enforced by a long-task
  observer that fails the E2E suite on violation.

### 19.4 Memory

| Constraint | Value |
| --- | --- |
| Peak heap during a single 24 MP RGBA operation | ≤ 400 MB |
| Tiled processing threshold | > 40 MP, or when the governor projects > 60 % of budget |
| Tile size / halo | 512 × 512, halo = largest kernel radius, rounded up to 8 |
| Batch concurrency reduction trigger | projected peak > 70 % of budget |
| Hard refusal threshold | projected peak > 95 % of budget, with a message naming the largest dimension that *would* work |

### 19.5 Measurement

`packages/engine/bench/` holds reproducible benchmarks over a fixed fixture corpus, run in CI on a
pinned runner image, with results committed to `bench/history.json` and a regression gate at **+10 %**
on any tracked operation. Benchmarks are the only defence against slow decay across dozens of small PRs.

---

## 20. Accessibility

Target: **WCAG 2.2 Level AA**, with the AAA contrast target for body text. This is not optional
compliance theatre — an image tool that generates alt text has an obvious obligation to be usable by
the people who read alt text.

### 20.1 Requirements

| Area | Requirement |
| --- | --- |
| Keyboard | Every action reachable and operable. Logical tab order. No traps. Visible focus at ≥ 3:1 against both adjacent colours, using `:focus-visible` |
| Skip links | "Skip to canvas", "Skip to options", "Skip to actions" |
| Landmarks | `banner`, `navigation`, `main`, `complementary` (options), `contentinfo`; the canvas is a labelled `region` |
| Screen reader | Every control has an accessible name and, where the effect is non-obvious, a description. Option groups are `fieldset`/`legend` or `role=group` with `aria-labelledby` |
| Live regions | `aria-live="polite"` for progress, size deltas, and completion; `assertive` reserved for errors. Progress announces at 0/25/50/75/100 %, never on every tick |
| Canvas | The image has a meaningful `alt`; the comparison slider is a real `role=slider` with `aria-valuetext` ("showing 40 % of the edited image") |
| Crop / mask | Fully keyboard-operable: arrows nudge 1 px, Shift+arrows 10 px, Tab cycles handles, values are announced. A numeric-entry alternative exists for every direct-manipulation control |
| Colour | Never the sole carrier of meaning. Status uses icon + text + colour |
| Contrast | Body text ≥ 7:1 where achievable, ≥ 4.5:1 minimum; UI components and graphical objects ≥ 3:1 |
| Motion | `prefers-reduced-motion` zeroes all durations (§12.2) and disables parallax, auto-playing animated previews, and the canvas zoom transition |
| Target size | ≥ 24 × 24 px minimum (WCAG 2.2 SC 2.5.8); ≥ 44 × 44 px on touch |
| Zoom | Usable at 400 % zoom and at 320 px width with no loss of function and no horizontal scroll of the page body |
| Forms | Errors identified in text, associated via `aria-describedby`, and never conveyed by colour alone. No timeouts |
| Transparency | The checkerboard is supplemented by a textual "has transparency" indicator, since the pattern is meaningless to a screen reader |
| Dialogs | Focus trapped while open, restored on close, `Escape` closes, `aria-modal`, labelled |
| Reduced data | `prefers-reduced-data` suppresses speculative module prefetch |

### 20.2 Verification

- `axe-core` via `@axe-core/playwright` on every route in CI; **zero violations** gates the merge.
- Manual screen-reader passes each release: NVDA + Firefox, VoiceOver + Safari, TalkBack + Chrome.
  Results recorded in `docs/a11y/audit-{date}.md`.
- Keyboard-only walkthrough of the five canonical flows (§11.4) as a Playwright spec that uses only
  keyboard events.
- Contrast is asserted programmatically against the token file, so a token change cannot silently break
  it.

---

## 21. Internationalization

### 21.1 Approach

- Library: `@inlang/paraglide-js` (compile-time message extraction, tree-shaken, zero runtime
  dictionary download for the active locale). Rationale: an i18n runtime that ships all locales would
  breach the JS budget in §19.1.
- Message keys are namespaced by feature: `tool.resize.mode.pixels.label`.
- Locale detection: URL prefix (`/es/resize`) → stored preference → `navigator.languages` → `en`.
  The URL is authoritative so links are shareable and indexable.
- `hreflang` alternates and a per-locale sitemap (§24).

### 21.2 Launch locales

Phase 1: `en`. Phase 2: `es`, `pt-BR`, `de`, `fr`, `id`, `hi`, `ru`. Phase 3: `ja`, `ko`, `zh-Hans`,
`zh-Hant`, `ar` (RTL), `tr`, `vi`, `it`, `pl`, `nl`, `th`, `fa` (RTL), `bn`.

Chosen for actual search volume on image-conversion queries, not for market prestige.

### 21.3 Rules

- **No concatenation.** Every user-visible string is one message with named parameters.
- ICU MessageFormat for plurals and selects; `Intl.NumberFormat` for sizes and percentages;
  `Intl.DateTimeFormat` for dates; `Intl.RelativeTimeFormat` for "2 minutes ago".
- File sizes respect locale digit grouping and a unit preference (`KB`/`KiB` toggle in settings,
  default `KB` = 1000 bytes, with the definition stated in Settings because this genuinely confuses
  people).
- Units: px always; physical dimensions switch between in/cm by locale default, user-overridable.
- **RTL** is a first-class layout: logical CSS properties throughout (`margin-inline-start`, not
  `margin-left`), `dir` on `<html>`, mirrored icons where directional, and the canvas comparison slider
  direction flipped. An RTL screenshot test runs in CI.
- Layout tolerates **+40 % string expansion** (German, Finnish) without truncation or overflow; a
  pseudo-locale (`en-XA`, expanded and accented) is used in CI screenshot tests to catch this.
- Translator context: every message carries a `# comment` describing where it appears and any
  constraints (max length, that it appears in a button, etc.).
- Untranslated messages fall back to `en` **visibly flagged in development** and silently in production.
  A CI report lists per-locale completeness.

### 21.4 Content localization

Tool landing-page prose is translated, not machine-generated, for Phase 2 locales. Format documentation
pages remain `en` initially with a clear notice, because a wrong technical translation is worse than
English for this audience. The `/connect-ai` walkthroughs are translated, but the copy-pasteable
commands never are.

---

## 22. Testing strategy

### 22.1 Layers

| Layer | Tool | Scope | Gate |
| --- | --- | --- | --- |
| Static | `tsc --strict`, ESLint, `svelte-check`, custom lint rules (§16.6) | whole repo | blocking |
| Unit | Vitest | pure ops, schemas, colour maths, metadata, mask conversion | ≥ 90 % line coverage in `packages/engine/src/ops` and `/metadata` |
| Fixture | Vitest + real files | one file per supported format, decode + re-encode round-trip | blocking; every §5 row must have one |
| Golden | Vitest + hash-pinned outputs | pixel-exact regression on the CPU tier | blocking |
| Property | fast-check | invariants (§22.4) | blocking |
| Contract | Vitest + recorded fixtures, nightly live run | AI adapters (§22.7) | recorded: blocking. live: reports, does not block |
| Component | Vitest + Testing Library | generated controls, compare view, crop overlay | blocking |
| Visual | Playwright screenshots | all routes, both themes, en + en-XA + ar | blocking on diff > 0.1 % |
| E2E | Playwright (Chromium, Firefox, WebKit) | the five canonical flows + offline | blocking |
| A11y | axe-core via Playwright | all routes | zero violations, blocking |
| Perf | Lighthouse CI + `size-limit` + engine benches | §19 budgets | blocking |
| Security | `pnpm audit`, CSP evaluation, credential-leak test | whole repo | blocking on high/critical |

### 22.2 Fixture corpus

`packages/engine/test/fixtures/` contains, checked in (small) or fetched from a pinned release asset
(large, with hashes verified):

- One minimal valid file per format in §5, plus for each: a large variant, a CMYK variant where
  applicable, a 16-bit variant, an ICC-tagged variant, an animated variant, an EXIF-heavy variant, and
  a stripped variant.
- **Adversarial corpus:** truncated files, wrong magic bytes, a 1×1 image, a 30000×1 image, a
  0-byte file, a PNG with a 4 GB declared dimension, a decompression-bomb GIF, a deeply-nested SVG, an
  SVG with an external reference (must be refused — no network from a decoder), an EXIF field with an
  invalid offset, a JPEG with 12 000 EXIF entries, a file with a mismatched extension. **Every one of
  these must produce a typed error with a useful `remedy`, never a crash, never a hang.** This corpus is
  the difference between a tool that works on your photos and a tool that works.
- Licence provenance for every fixture in `fixtures/PROVENANCE.md`. Prefer self-generated and
  CC0 material; no fixture may be a real person's photograph.

### 22.3 Round-trip assertions

For each format that supports lossless encoding: `decode(encode(decode(f)))` must equal `decode(f)`
pixel-for-pixel. For lossy formats: SSIM ≥ 0.98 at quality 95, and the assertion is on *stability*
across engine versions rather than on absolute similarity.

### 22.4 Property tests

| Invariant | Statement |
| --- | --- |
| Resize identity | Resizing to the input's own dimensions is a no-op (byte-identical) |
| Rotation cycle | Four × 90° rotations return the original exactly |
| Flip involution | Two identical flips return the original exactly |
| Crop composition | Cropping A then B equals cropping the composed rectangle |
| Default no-op | A recipe whose every option is default produces byte-identical output for a lossless format |
| Fusion equivalence | A fused adjust+filter chain equals the unfused chain (§8.2 rule 3) |
| Tile equivalence | Tiled execution equals whole-image execution for every kernel op |
| Proxy fidelity | Downscaling the full-resolution result to proxy size yields SSIM ≥ 0.99 against the proxy preview (§8.5) |
| Metadata preservation | With `stripMetadata: 'none'`, every readable tag survives a re-encode |
| Mask polarity | For every adapter, our white-is-edit mask maps to the provider's convention (asserted against a recorded request) |
| Recipe round-trip | `parseRecipe(serializeRecipe(r))` deep-equals `r` for arbitrary valid `r` |
| Migration stability | Every historical recipe version migrates to current without loss (a corpus of every shipped version is kept) |
| **Tier independence** | Every `Local ⇗AI` tool produces a complete, valid result with `ai: undefined` passed to `run()`. Asserted for T32, T62, T66, T67, T68, T69 across the full fixture corpus |
| **No implicit escalation** | For any recipe containing no explicit `tier: 'external'` step, `run()` issues zero requests through `transport.ts`. Asserted by injecting a throwing `fetch` into `AdapterContext` |
| **Tier provenance** | Every step in a `RunResult` carries the tier that produced it, and it matches what the plan predicted |
| **Register completeness** | A test enumerates every adapter capability referenced by any tool and asserts each has a row in the §13.1.3 register. **Adding a Tier 3 path without a register row fails CI** — this is what makes P11 structural rather than cultural |

### 22.5 Golden files

`test/golden/` holds `{ recipeId, fixtureId, sha256, dimensions, bytes }` records. A change requires an
explicit `pnpm test:golden --update` and shows a visual diff in the PR. This is what prevents an
innocuous-looking codec bump from silently changing everyone's output.

### 22.6 The no-network test

The load-bearing test for principle P1:

```ts
test('a full conversion pipeline makes zero network requests', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.origin !== new URL(page.url()).origin) requests.push(r.url());
  });
  await page.goto('/convert');
  await page.setInputFiles('[data-testid=file-input]', 'e2e/assets/photo-12mp.jpg');
  await page.getByTestId('option-format').selectOption('webp');
  await page.getByTestId('action-download').click();
  await expect(page.getByTestId('status-done')).toBeVisible();
  expect(requests).toEqual([]);            // no cross-origin request, at all
});
```

A second variant runs the same flow with `context.setOffline(true)` from the start (after a warm cache)
and asserts success — proving P6.

### 22.6a The no-implicit-escalation test

The load-bearing test for P11 and P12. It runs **with a provider fully configured**, which is the case
where an accidental automatic call would actually happen and would otherwise go unnoticed:

```ts
test('a configured provider is never called without an explicit gesture', async ({ page }) => {
  await seedProviderCredentials(page, { provider: 'stability', apiKey: 'sk-test-fake' });

  const aiCalls: string[] = [];
  page.on('request', r => {
    if (/api\.stability\.ai|api\.openai\.com|api\.anthropic\.com|fal\.run/.test(r.url()))
      aiCalls.push(r.url());
  });

  // Exercise every Local ⇗AI tool end to end, touching no escalation control.
  for (const tool of ['upscale', 'ocr', 'remove-object', 'expand-image',
                      'remove-background', 'replace-background']) {
    await page.goto(`/${tool}`);
    await page.setInputFiles('[data-testid=file-input]', 'e2e/assets/photo-4mp.jpg');
    await page.getByTestId('action-apply').click();
    await expect(page.getByTestId('status-done')).toBeVisible();
    // A local result must exist, and it must be labelled as local.
    await expect(page.getByTestId('tier-badge')).toHaveText(/Local|On-device/);
  }

  expect(aiCalls).toEqual([]);   // zero provider calls, despite a working key being present
});
```

A companion test presses the escalation control once and asserts that **exactly one** provider request
is issued, that the cost was displayed beforehand, and that the result renders in the compare view
against the local output.

### 22.7 AI adapter contract tests

Two modes, because live tests cannot gate a merge but stale adapters cannot ship either:

**Recorded (blocking, on every PR).** Each adapter has fixtures in `test/contract/<provider>/`:
recorded request/response pairs. The test asserts the adapter builds the exact expected request
(method, URL, headers with credentials **redacted to a placeholder**, body shape, mask polarity) and
correctly parses each recorded response — including every error response (401, 429, 400 content policy,
job-failed, moderation). Fully offline, deterministic, no keys needed.

**Live (nightly, non-blocking, reports).** `provider-contract.yml` runs against real endpoints using
repository secrets, from a real browser context via Playwright so CORS behaviour is genuinely observed.
It:

1. runs `adapter.test()` for each provider and records the outcome;
2. runs `listModels()` and diffs against the hard-coded fallback list, opening an issue on drift;
3. performs one minimal real operation per capability on a 64×64 fixture, with a hard spend cap;
4. updates each adapter's `browserDirect` field and regenerates `docs/PROVIDERS.md`;
5. opens a PR when anything changed, and files an issue when a provider breaks.

This is the mechanism that keeps §14's **⚠ VERIFY** markers from decaying into lies.

### 22.8 Manual test checklist

Per release, recorded in `docs/release/{version}.md`: real iPhone HEIC (multi-image), real Canon CR3 and
Sony ARW, a 60 MP TIFF, a 500-frame GIF, a 200-file batch, a 100 MB PSD, drag-out-to-desktop on macOS
and Windows, paste from Photoshop and from Figma, PWA install and file-handler open on Windows/macOS/
Android/iOS, a full AI flow per provider, and a keyboard-only pass of all five canonical flows.

---

## 23. Build, CI, and deployment

### 23.1 Toolchain

| Concern | Choice |
| --- | --- |
| Package manager | pnpm 9+, workspaces, `--frozen-lockfile` in CI |
| Task runner | Turborepo (remote cache optional, not required) |
| Node | 22 LTS, pinned in `.nvmrc` and `package.json#engines` |
| Bundler | Vite 6 (via SvelteKit) |
| Formatter | Prettier + `prettier-plugin-svelte`, `prettier-plugin-tailwindcss` |
| Linter | ESLint 9 flat config + `eslint-plugin-svelte` + custom rules for §16.6 |
| Commits | Conventional Commits, enforced by commitlint |
| Releases | Changesets → semver for `packages/engine` and `packages/cli` on npm |

### 23.2 Scripts

```jsonc
{
  "dev":            "turbo dev",
  "build":          "turbo build",
  "test":           "turbo test",
  "test:unit":      "vitest run",
  "test:fixture":   "vitest run --project fixture",
  "test:golden":    "vitest run --project golden",
  "test:contract":  "vitest run --project contract",
  "test:e2e":       "playwright test",
  "test:a11y":      "playwright test --project a11y",
  "test:visual":    "playwright test --project visual",
  "bench":          "vitest bench --run",
  "lint":           "turbo lint",
  "typecheck":      "turbo typecheck",
  "size":           "size-limit",
  "lighthouse":     "lhci autorun",
  "docs:providers": "tsx scripts/gen-providers-doc.ts",
  "docs:options":   "tsx scripts/gen-options-doc.ts",
  "wasm:fetch":     "tsx scripts/fetch-wasm.ts",     // pinned versions + sha256 verification
  "verify:licenses":"tsx scripts/verify-licenses.ts"
}
```

### 23.3 Hosting

**Cloudflare Pages** (static). Rationale: free tier is generous, edge cache is excellent for immutable
WASM assets, custom headers are configurable via `_headers`, and there is no server runtime — which is
the point (P7: no server can receive a key). Netlify or Vercel static are drop-in alternatives; the
build output is plain static files.

Cache policy:

| Path | `Cache-Control` |
| --- | --- |
| `/_app/immutable/*` | `public, max-age=31536000, immutable` |
| `/wasm/*`, `/models/*` (content-hashed filenames) | `public, max-age=31536000, immutable` |
| `/fonts/*` | `public, max-age=31536000, immutable` |
| `/ocr-runtime/*` (Tesseract runtime files under their package-version directory) | `public, max-age=31536000, immutable` |
| HTML routes | `public, max-age=0, must-revalidate` |
| `/sw.js` | `public, max-age=0, must-revalidate` |

Tesseract worker and core files use a `v<package-version>` URL directory. Updating either
`tesseract.js` or `tesseract.js-core` therefore changes the runtime URL before immutable browser caching
is applied. The preview server mirrors this path-scoped cache policy so same-page offline OCR tests
exercise the production header contract.

### 23.4 Cross-origin isolation

WASM threads (`SharedArrayBuffer`) need `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. This is desirable (libvips and libjxl are markedly faster
threaded) but has consequences:

- Every subresource needs CORP/CORS headers. Since everything is same-origin, this is satisfiable.
- Some browser APIs and any future embedded third-party content would break. We have no third-party
  content (P5), so the cost is low.
- **`credentialless` COEP** is a lighter alternative with narrower support.

**Decision:** ship `require-corp`, feature-detect `crossOriginIsolated`, and fall back to
single-threaded WASM builds when it is false. Record as an ADR. Verify with a test asserting
`crossOriginIsolated === true` in production and that the single-threaded fallback path also passes the
full fixture suite — the fallback must be a real, tested path, not a theoretical one.

### 23.5 WASM asset integrity

Third-party WASM is not fetched at build time from a live URL. `scripts/fetch-wasm.ts` downloads each
binary from a pinned release URL, verifies a `sha256` recorded in `wasm-lock.json`, and writes it to
`apps/web/static/wasm/<name>.<hash>.wasm`. A mismatch fails the build. The loader verifies the hash
again at runtime where `SubresourceIntegrity` is unavailable for `fetch`+`instantiate`
(**⚠ VERIFY** current SRI support for WASM streaming and use it if available).

ONNX Runtime Web 1.30.0 is installed from the exact lockfile-pinned npm package and is dynamically
imported only after an explicit model-open action. Its WASM binaries are emitted as package assets by
the production bundler and served same-origin; the app does not fetch them from a CDN or add a
`connect-src` origin. The threaded SIMD WASM binary is about 14.2 MB before compression and the
WebGPU/JSEP variant is about 28.3 MB, so deployment and cache budgets must account for them even
though the initial route does not load them. WASM is the broad-compatibility path; WebGPU is attempted
where available and requires a secure context. Model-specific WebGPU operator coverage still needs
validation. Model download, consent, size disclosure, and caching remain responsibilities of the
model loader.

### 23.6 CI pipeline

```
PR opened
 ├─ install (frozen lockfile, cached)
 ├─ lint · typecheck · svelte-check           ┐
 ├─ test:unit · test:fixture · test:golden    │ parallel
 ├─ test:contract (recorded)                  │
 ├─ verify:licenses · pnpm audit              ┘
 ├─ build
 ├─ size-limit            → comment budget delta on the PR
 ├─ test:e2e (3 browsers) · test:a11y · test:visual
 ├─ lighthouse CI (5 key routes, mobile)
 └─ bench (compare to bench/history.json, gate at +10%)

main merged → deploy preview → smoke test → promote to production
nightly     → provider-contract.yml (§22.7)
weekly      → dependency review PR, screenshot-staleness report
```

Required checks for merge: lint, typecheck, unit, fixture, golden, contract-recorded, e2e, a11y,
size-limit, lighthouse.

### 23.7 The CLI and the library

`packages/engine` publishes to npm as `@complianttools/image-engine`; `packages/cli` as
`@complianttools/ctimg`. The CLI takes the **same recipe JSON** the web app produces:

```bash
npx @complianttools/ctimg run recipe.json ./photos/*.jpg --out ./dist --concurrency 8
npx @complianttools/ctimg convert in.heic --to webp --quality 80 --resize 1600x
npx @complianttools/ctimg info photo.cr3 --json
```

This matters strategically: a user who builds a recipe in the browser can run it in CI on ten thousand
files with no re-specification, and the shared engine means the outputs are byte-identical. It also
makes the engine independently useful, which is the cheapest form of distribution.

---

## 24. SEO and growth

### 24.1 Page architecture

Three tiers, all statically prerendered:

1. **Tool pages** (76) — `/resize`, `/heic-converter`, … Primary conversion targets.
2. **Format-pair pages** (generated, ~600) — `/convert/heic-to-jpg`, `/convert/cr2-to-png`,
   `/convert/png-to-lvgl-c-array`. Generated from the format matrix (§5) as the cross-product of
   *supported* pairs only. Each is a **fully functional tool with both formats preselected** — not a
   doorway page. This is the distinction that keeps it legitimate and keeps it working.
3. **Reference pages** — `/docs/formats/[format]` (one per format: what it is, when to use it, support,
   trade-offs, our option surface), `/docs/guides/*` (task guides), `/connect-ai/*` (§17).

**Guardrail:** a generated page must offer real, differentiated utility — correct preselected options,
format-specific guidance, honest notes on what is lossy in that particular conversion. If a pair has
nothing specific to say beyond the template, it does not get a page. Thin-content pages are both a
ranking liability and a user disservice.

### 24.2 Per-page requirements

- One `<h1>` naming the exact job in the user's words.
- The tool itself **above the fold**, before any prose. The page is not an article with a widget; it is
  a tool with documentation beneath it.
- Below the tool: what the conversion does, what is lost, the relevant option explanations, and 3–6
  format-specific FAQs.
- `JSON-LD`: `SoftwareApplication` (with `offers.price: "0"`), `FAQPage`, `BreadcrumbList`,
  `HowTo` on guide pages.
- Unique `<title>` (≤ 60 chars) and `meta description` (≤ 155 chars), both templated but with
  per-format overrides for the top 50 pairs.
- Canonical URL, `hreflang` alternates, and cross-links to the 6 most-related tools.
- Open Graph and Twitter card images generated at build time per page (Satori → PNG), showing the tool
  name and the format pair.
- `sitemap.xml` split by tier, plus `robots.txt` allowing everything.

### 24.3 Target queries

Representative, by intent cluster:

| Cluster | Examples |
| --- | --- |
| Format conversion | `heic to jpg`, `webp to png`, `cr2 to jpeg`, `avif converter`, `jxl to png`, `svg to png`, `psd to jpg`, `pdf to image` |
| Size targets | `resize image to 200kb`, `compress jpeg to 100kb`, `reduce image size without losing quality`, `make image smaller mb` |
| Dimension targets | `resize image 1080x1080`, `passport photo size online`, `instagram image size`, `favicon generator` |
| Privacy | `remove exif data online`, `remove gps from photo`, `blur face in photo online`, `strip metadata` |
| Batch | `bulk image resizer`, `batch convert images`, `resize multiple images at once` |
| Embedded / dev | `image to c array`, `lvgl image converter`, `png to base64`, `image to srcset` |
| Editing | `remove background from image`, `upscale image`, `add watermark to photos`, `crop image online` |
| Local-first (uncontested) | `remove object from photo free no signup`, `content aware fill online`, `pixel art upscaler`, `xbrz scaler online`, `upscale image without ai`, `background remover no api key`, `alpha matting online`, `grabcut online`, `seam carving online`, `qr code generator png`, `identicon generator`, `perlin noise texture generator` |
| BYOK / technical | `use my own openai api key`, `ollama cors browser`, `anthropic api from browser` |
| Trust-differentiated | `image converter no upload`, `offline image converter`, `image editor without account`, `image tools no credits` |

That last cluster is small in volume but converts extremely well and is uncontested, because no
server-side competitor can honestly target it.

### 24.4 Content that earns links

Not blog filler — reference material we are uniquely positioned to write:

- **An interactive format comparison** — upload one image, see it encoded in every format at matched
  quality, with size, encode time, and butteraugli distance in a sortable table. This is genuinely
  useful and highly linkable.
- **"Which image format should I use?"** — a decision tree with real measured data from the corpus.
- **"What EXIF data is in your photos"** — a live, local demonstration. Nothing uploaded, which is the
  whole point and makes it safe to share.
- **AVIF vs. WebP vs. JPEG XL** — measured on a public corpus, methodology published, numbers
  reproducible via `pnpm bench`.
- **The BYOK guides** (§17.4), especially the self-hosted one.

### 24.5 Measurement without tracking

We need to know what works without violating P5:

- CDN access logs aggregated at the edge into daily counts per path and referrer. No cookies, no IDs,
  no cross-request correlation, no IP retention beyond the aggregation window.
- Google Search Console and Bing Webmaster for query data (no code on the page).
- Zero client-side analytics. If a metric requires client instrumentation, we do without the metric.
- This is stated on `/privacy` in these terms, so the claim is auditable.

### 24.6 Distribution

Launch surfaces where "no upload, actually free, open engine" is the story: Hacker News (Show HN),
r/photography · r/webdev · r/selfhosted · r/embedded (the LVGL tool specifically), Product Hunt,
Lobsters, the LVGL and Home Assistant forums (embedded converter), and awesome-list PRs
(`awesome-privacy`, `awesome-selfhosted`, `awesome-webassembly`). The npm engine and the CLI are their
own distribution channel. The browser extension (T76) creates a recurring surface. Ship a
`CONTRIBUTING.md` that makes adding a provider adapter or a format an obvious first contribution.

---

## 25. Legal, privacy, and trust

### 25.1 Privacy policy — the short version, verbatim

> **We don't collect anything.**
>
> Your images are processed by your browser, on your device. They are never uploaded to us — we don't
> operate a server that could receive them. You can verify this: open your browser's Network tab and
> use any tool. You'll see no requests carrying your image.
>
> We don't use cookies. We don't use analytics. We don't load third-party scripts. We don't have
> accounts, so we don't have your email.
>
> Settings, saved recipes, and (if you choose) API keys are stored in your own browser and are deleted
> when you clear site data. Settings → Data shows you everything stored and deletes any of it.
>
> **The one exception is AI tools.** If you connect an AI provider, your image and your prompt go from
> your browser directly to that provider, using your key. That request does not pass through us. What
> the provider does with it is governed by their policy, which we link to before you connect.
>
> Our hosting provider keeps standard web-server logs (page, time, referrer, coarse region). We use
> aggregate counts from those to see which tools people use. We do not build profiles.

The full policy expands each point and links to `docs/SECURITY.md`.

### 25.2 Licensing

- **Our code:** AGPL-3.0 for `apps/web` (so hosted forks stay open), Apache-2.0 for `packages/engine`
  and `packages/cli` (so the engine is freely embeddable, and because Apache-2.0 carries an express
  patent grant that MIT does not). Recorded as an ADR — dual licensing is a deliberate choice.
- **Dependency allowlist:** MIT, Apache-2.0, BSD-2, BSD-3, ISC, Zlib, **IJG, IJG-short**[^ijg], 0BSD,
  MPL-2.0, Unlicense, CC0.

[^ijg]: IJG approval is conditional on shipping its mandatory product-documentation attribution —
    “the work of the Independent JPEG Group” — and is not advisory. Modified source distributions
    must also retain notices and mark their modifications.
  `verify:licenses` fails the build on anything else, **including transitively**, and checks the
  licence at the pinned version rather than at `latest`.
- **Denylist, enforced:** GPL (any version), LGPL (any version), AGPL, SSPL, BUSL, CC-BY-NC, CC-BY-SA,
  "research only", "non-commercial", and any custom licence not reviewed. This applies to **model
  weights and data files as well as code** — see §25.5.
- **Fonts:** OFL or Apache-2.0 only, self-hosted, licence files shipped.
- **Fixtures:** §22.2 provenance rules; no fixture may be a real person's photograph.

Three distinct hazards get confused constantly, so we separate them and clear each on its own terms:

| Hazard | Attaches to | Cleared by |
| --- | --- | --- |
| **Copyright** | A specific *implementation* — source code, weights, artwork, fonts, profiles | Permissive licence, or writing our own from a published specification. Algorithms themselves are not copyrightable |
| **Patent** | An *algorithm or method*, regardless of who implements it | Expiry, an explicit royalty-free grant, or designing around it |
| **Trademark** | A *name*, look, or trade dress | Using our own names. Nominative reference is narrower than people assume |

### 25.3 Substitution register

**Every item below was in an earlier draft of this plan and has been replaced.** This table is the
record of what changed and why, and it is the answer to "did you check?".

#### 25.3.1 Copyleft dependencies removed

| Removed | Its licence | Replacement | Cost of the swap |
| --- | --- | --- | --- |
| `wasm-vips` (libvips) | LGPL-2.1 | Our own decoders for ~16 simple formats (§25.4), `UTIF.js` (MIT) for TIFF, `tinyexr` (BSD-3), `OpenJPEG` (BSD-2) | Real work — this was one dependency covering ~40 formats. But those formats are mostly trivial byte layouts, and we lose a 12 MB download |
| `gifsicle` | GPL-2.0 | Our own GIF encoder and optimizer (§25.4); `gifuct-js` (MIT) to decode | Moderate. LZW has been patent-free since 2004 |
| `libheif` + `x265` | LGPL-3.0 / GPL-2.0 | Platform image decoding (`ImageDecoder`, then native bitmap/image fallback). **HEIC encode dropped entirely** | Decode narrows to platforms with OS/browser support. Honest capability reporting handles it (P8) |
| `LibRaw` | LGPL-2.1 | Our own RAW pipeline (§25.4) — embedded-preview extraction first, then our own demosaic | Significant, phased. Preview extraction alone satisfies most users and is nearly free given our TIFF/EXIF parser |
| Ghostscript | AGPL-3.0 | Our own EPS preview extractor + minimal PS subset | Full PostScript rendering is gone. Reported honestly rather than half-working |
| `potrace` | GPL-2.0 | `imagetracerjs` (public domain) | None — comparable quality for our use |
| `ffmpeg.wasm` | LGPL-2.1 + codec patents | Platform `VideoDecoder` (WebCodecs) + `mp4box.js` (BSD-3) | **Negative cost.** Faster, no 25 MB download, no patent exposure |
| `xBRZ` / `HQx` / `Scale2x` | GPL-3 / LGPL-2.1 / GPL-2 | Our own pixel-art scaler (§25.4) | Moderate; the technique is well understood and we get to design our own rule set |
| `@imgly/background-removal` bundled weights | **BRIA RMBG-1.4 is non-commercial** | **U²-Net** (Apache-2.0), **ISNet/DIS** (Apache-2.0), or **BiRefNet** (MIT) | None material. This one is easy to miss — the npm package is MIT, the weights are not |

#### 25.3.2 Patent-encumbered algorithms

⚠ **Nothing in this column is a legal finding.** Filing dates and the 20-year rule are a *screening
heuristic* to prioritise counsel's time. Continuations, divisionals, jurisdiction, and maintenance
status all change the answer, and I have not read the claims.

| Algorithm | Screening note | Decision |
| --- | --- | --- |
| **PatchMatch** (Barnes et al. 2009, Adobe) | Filed ~2009 — plausibly **still in force** | **Excluded.** Not implemented, not linked, not referenced in the build |
| **Seam carving** (Avidan & Shamir 2007, MERL) | Filed ~2007 — plausibly **in force until ~2027** | **Excluded. We build our own** — saliency-weighted non-uniform warp (§25.4). Different mechanism, not a seam-removal implementation |
| **Guided filter** (He, Sun, Tang 2010, MSR) | Filed ~2010 — plausibly **in force** | **Excluded. Replaced by joint (cross) bilateral filtering** — Tomasi & Manduchi 1998, comfortably outside any term — plus our own alpha-band refinement |
| **Dark channel prior** dehaze (He 2009, MSR) | Filed ~2009 — plausibly **in force** | **Excluded. Replaced by Retinex / MSRCR** (Land, 1970s–80s) and local tone mapping |
| **Non-local means** (Buades et al. 2005) | Unclear | **Deferred.** Median and bilateral are implemented; wavelet/BayesShrink is not implemented in v1. NLM only if cleared, and it is not required for quality |
| **Criminisi exemplar inpainting** (2004, MSR) | Filed ~2003 — screening suggests **expired**, but the claims matter | **Design around it.** Our exemplar inpainter is built on **Efros–Leung (1999)** and **image quilting (2001)**, which *predate* Criminisi and are therefore prior art, with our own confidence-ordered fill priority. Clean either way |
| **GrabCut** (2004, Microsoft) | Filed ~2004 — screening suggests **expired**; ships in Apache-2.0 OpenCV | **Use, subject to clearance.** If not cleared: colour-range + watershed + our own iterative colour-model refinement, with the quality difference stated in the UI |
| **Poisson image editing** (2003, MSR) | Filed ~2003 — screening suggests **expired** | **Use only if cleared.** The planned fallback is a full Laplacian pyramid (Burt & Adelson 1983 — expired); the current function with that name is only a simplified per-pixel alpha blend and does not satisfy the planned method |
| **Simplex noise** (Perlin, US 6,867,776) | Filed 2001 — screening suggests expired | **Sidestepped entirely.** We ship **OpenSimplex2** (public domain), which was created specifically to avoid this patent |
| **LZW** (GIF) | Expired 2003–2004 worldwide | Clear |
| **S3TC / DXT** (DDS) | Expired ~2017–2018 | Clear |
| **JPEG, PNG, GIF, BMP, TIFF** baseline | Long expired | Clear |
| **WebP / VP8** | Google's royalty-free grant; BSD-3 | Clear |
| **JPEG XL** | Designed royalty-free; BSD-3 | Clear |
| **AV1 / AVIF** | AOMedia royalty-free patent licence. ⚠ A third-party pool (Sisvel) asserts otherwise; every major browser ships AV1 regardless | **Use.** Note the dispute in `docs/ADR/`; do not present it as settled |
| **HEVC / HEIC** | Multiple **active** pools, aggressive licensors | **Encode excluded outright.** Decode only via the platform's own decoder, where the OS vendor already holds the licence |
| **QR Code** | Denso Wave holds patents but has publicly declined to enforce for standard QR use | **Use.** Our own encoder from ISO/IEC 18004, or `qrcode-generator` (MIT) |

#### 25.3.3 Trademark and asset substitutions

| Removed | Why | Replacement |
| --- | --- | --- |
| Instagram filter names (Clarendon, Gingham, Juno, Lo-Fi, 1977, X-Pro II, …) | **Meta trademarks.** Widely copied by other tools; that does not make it lawful | 24 descriptive names of our own (§6.5) |
| "Polaroid" frame preset | **Live trademark**, and the frame trade dress is protected | "Instant print" — generic geometry |
| **Impact** font (meme captions) | Licensed Monotype face, not redistributable | **Anton** (OFL) |
| Bundled meme template gallery | Third-party copyrighted photographs | User upload only; optional CC0 starter set with recorded provenance |
| Platform emoji fonts (Apple, Segoe, Noto Color from a vendor build) | Not redistributable | **Noto Emoji** (OFL) or **Twemoji** (CC-BY 4.0, attributed in `/about`) |
| "Magic Eraser" / "Magic Edit" / "Magic Expand" | Google and Canva product names | "Remove Object", "Prompt Edit", "Expand Image" — already applied in §4 |
| "Content-Aware Fill" | Adobe product terminology | "Exemplar Fill" |
| "Magic Wand" | Adobe terminology | "Similar-Colour Select" |
| **Adobe RGB (1998)** ICC profile | Adobe-copyrighted, redistribution restricted | Our own profile generated from the published chromaticities, labelled "Adobe RGB compatible" |
| Vendor ICC profiles generally | Not redistributable | Synthesized from published primaries + TRC (§7.3) |
| Device mockup frames (T79) | Apple and others enforce trade dress on device silhouettes | Generic, non-branded frames |

#### 25.3.4 Cleared dependencies — the positive register

The three tables above record what was *removed*. This one records what we **keep**, and why it is
allowed. Without it a reviewer cannot tell "cleared" from "not yet examined", which is the failure mode
this whole section exists to prevent.

The register is split in two, because "cleared" and "not yet examined" are different states and a single
table cannot hold both without lying about one of them.

- **The shipping register** lists every dependency that is *actually installed* — present in
  `pnpm-lock.yaml` today. Each row states a licence confirmed by reading the installed package, not
  recalled. This table is enforced: `verify:licenses` fails if a direct dependency is missing from it.
- **The candidate register** lists dependencies we expect to adopt in later phases. They are **not
  installed**, so their licences **cannot** be verified and the values shown are hypotheses. Nothing in
  it is enforced, and nothing in it gates Phase 0.

A package graduates from candidate to shipping the moment it enters the lockfile, and the verifier
fails on any direct dependency that appears in **neither** table — so a package cannot arrive
unreviewed by being absent from both.

##### Shipping register — installed and verified

| Dependency | Licence | Role |
| --- | --- | --- |
| `svelte` 5.56.8, `@sveltejs/kit` 2.48.5, `@sveltejs/adapter-static` 3.0.10, `@sveltejs/vite-plugin-svelte` 6.2.4, `vite` 6.4.3 | **MIT — verified 2026-08-09** | UI runtime, prerendering, static adapter, and build system |
| `typescript` 5.7.2, `vitest` 4.1.10, `@playwright/test` 1.62.1, `eslint` 9.39.5, `prettier` 3.9.6 | **Apache-2.0 / MIT — verified 2026-08-09** | Toolchain and test runtime |
| `@eslint/js` 9.39.5, `typescript-eslint` 8.20.0, `eslint-plugin-svelte` 3.22.0, `svelte-eslint-parser` 1.8.0, `globals` 16.5.0 | **MIT — verified 2026-09-20** | Lint rule sets, parser, and environment-specific global definitions |
| `prettier-plugin-svelte` 4.1.1, `prettier-plugin-tailwindcss` 0.8.1 | **MIT — verified 2026-08-09** | Formatting plugins |
| `@commitlint/lint` 21.2.0, `@commitlint/config-conventional` 21.2.0 | **MIT — verified 2026-08-09** | Commit message linting |
| `lefthook` 2.1.10 | **MIT — verified 2026-08-09** | Git hooks |
| `turbo` 2.3.3, `tsx` 4.23.11 | **MPL-2.0 / MIT — verified 2026-08-09** | Task runner and TS execution |
| `tailwindcss` 4.3.3 | **MIT — verified 2026-08-09** | Styling |
| `zod` 4.4.3, `fast-check` 4.9.0, `fflate` 0.8.3 | **MIT — verified 2026-08-09** | Option schemas, property testing, and compressed recipe serialization |
| `svelte-check` 4.7.5, `@types/node` 26.2.0 | **MIT — verified 2026-08-09** | Component diagnostics and prerender types |
| `size-limit` 13.0.3, `@size-limit/file` 13.0.3 | **MIT — verified 2026-08-09** | Per-archetype delivery budgets |
| `@lhci/cli` 0.15.1 | **Apache-2.0 — verified 2026-08-09** | Lighthouse performance and accessibility acceptance |
| `@axe-core/playwright` 4.11.0 | **MPL-2.0 — verified 2026-08-09** | Blocking zero-violation accessibility checks on Phase 1 tool routes |
| `@jsquash/jpeg` 1.6.0 → MozJPEG | **Apache-2.0 wrapper + IJG, BSD-3, Zlib codec portions — verified 2026-08-09.** These licences apply to different portions; they are not an election. Mandatory IJG attribution is rendered at `/licenses` and build-enforced | JPEG codec |
| `@jsquash/png` 3.1.1, `@jsquash/oxipng` 2.3.0 → libpng, zlib, oxipng | **Apache-2.0 wrappers + BSD-3/MIT codec portions — verified 2026-08-09** | PNG codec + optimizer |
| `@jsquash/webp` 1.5.0 → libwebp | **Apache-2.0 wrapper + BSD-3 codec portion — verified 2026-08-09** | WebP codec |
| `@jsquash/avif` 2.1.1 → libavif + aom/dav1d | **Apache-2.0 wrapper + BSD-2 codec portion — verified 2026-08-18** | AVIF codec |
| `@jsquash/jxl` 1.3.0 → libjxl | **Apache-2.0 wrapper + BSD-3 codec portion — verified 2026-08-18** | JPEG XL codec + butteraugli |
| `utif` 3.1.0 (UTIF.js) | **MIT — verified 2026-08-18** | TIFF decode/encode. Upstream `photopea/UTIF.js`; the `utif2` fork was rejected in favour of the canonical package |
| `gifuct-js` 2.1.2 | **MIT — verified 2026-08-18** | GIF decode |
| `parse-exr` 1.0.2 | **MIT — verified 2026-08-18** | OpenEXR decode; ESM parser with bundled types, depends only on allowlisted `fflate` 0.8.3 |
| `imagetracerjs` 1.2.6 | **Unlicense — verified 2026-08-19** | Browser-local raster-to-SVG vectorization; no runtime network access |
| `@resvg/resvg-wasm` 2.6.2 | **MPL-2.0 — verified 2026-08-19** | Browser-local SVG rasterization. We use the upstream package unmodified through a local wrapper; its WASM only loads after an SVG is selected |
| `pdfjs-dist` 5.4.624 | **Apache-2.0 — verified 2026-08-19** | Browser-local PDF page rendering with a bundled local worker; no document content is sent to a service |
| `pdf-lib` 1.17.1 | **MIT — verified 2026-08-19** | Browser-local PDF creation for image-to-PDF output; generated documents remain on the device |
| `mp4box` 2.4.1 | **BSD-3-Clause — verified 2026-08-19** | Browser-local MP4 container demuxing before WebCodecs decoding; no bundled video codec |
| `mediabunny` 1.25.1 | **MPL-2.0 — verified 2026-08-19** | Browser-local MP4 and WebM container reading over platform WebCodecs; its TypeScript source is used unmodified and no media is uploaded |
| `ag-psd` 31.0.2 | **MIT — verified 2026-08-19** | Browser-local PSD/PSB read and write; no upload or external service |
| `dxf-parser` 1.1.2, transitive `loglevel` 1.9.2 | **MIT — verified 2026-08-22** | Browser-local DXF parsing; both installed manifests and bundled MIT licence files verified |
| `onnxruntime-web` 1.30.0 | **MIT — verified 2026-09-19** | Lazy browser ONNX inference. WebGPU is attempted when available, with WASM fallback; the model loader must obtain consent and provide a same-origin cached model URL or bytes |
| `tesseract.js` 7.0.0 | **Apache-2.0 — verified 2026-09-19** | Browser-local OCR engine; package and transitive dependencies are pinned and checked by `verify:licenses`. Language data is registered separately as model assets |
| `pako` 1.0.11 | **MIT AND Zlib — verified 2026-08-18** | Deflate, pulled in by `utif`. Both terms of the conjunction are allowlisted |

##### Candidate register — not installed, licences unverified

**Nothing in this table is cleared.** Every value is an expectation drawn from public metadata, not a
reading of an installed package. A row must be verified at its pinned version and moved into the
shipping register before the dependency may be used. These rows do **not** gate Phase 0, because
verifying a package we have not installed is not possible and pretending otherwise would make the gate
meaningless.

| Dependency | Expected licence | Role |
| --- | --- | --- |
| `bits-ui` | MIT | Headless UI primitives |
| `lucide-svelte` | ISC | Icons |
| `@inlang/paraglide-js` | MIT | i18n |
| `@jsquash/resize`, `pica` | Apache-2.0 / MIT | Resampling |
| `tinyexr` | BSD-3 | Superseded for browser decode by pinned `parse-exr` 1.0.2 (MIT); retain only as a possible future WASM implementation |
| JPEG 2000 decoder | — | **No usable npm distribution.** The `openjpeg` package (0.2.3) publishes **no licence field at all**, which the gate denies by rule, and is an unaffiliated personal fork. Upstream OpenJPEG is BSD-2; a vendored WASM build would clear. See P2-04a |
| `mp4box.js` | BSD-3 | MP4 demux |
| `pdf-lib` | MIT | PDF write |
| `imagetracerjs` | Unlicense (public domain) | Vectorize |
| `libarchive.js` → libarchive | BSD-2 | CBZ/CBR. ⚠ Confirm the RAR reader used is libarchive's own BSD implementation and **not** derived from the `unrar` source, whose licence forbids reuse |
| OpenCV (custom build: `core`, `imgproc`, `photo`) | Apache-2.0 (since 4.5.0) | Tier 1 CV heavy ops. Licence ✅; **algorithm patents cleared separately** in §25.3.2 |
| `@mediapipe/tasks-vision` | Apache-2.0 | Face detection runtime |
| `exifr` | MIT | Metadata read |
| `piexifjs` | MIT | Metadata write |
| `culori` | MIT | Colour maths |
| Inter, JetBrains Mono, Anton | OFL-1.1 | Fonts |
| Noto Emoji | OFL-1.1 | Emoji glyphs |

**Two font caveats.** OFL-1.1 carries a **Reserved Font Name** clause: a subset or modified build must
not be distributed under the original name. Our build pipeline subsets aggressively, so either keep the
files byte-identical or rename the modified ones (e.g. `CT-Sans`) and ship the OFL text alongside.
`@font-face` `local()` lookups must not be used to pull a user's licensed system font into a rendered
export — that would embed a font we have no right to.

**Data and model assets are cleared separately from their loaders.**
`docs/static-assets.json` records the exact shipped static path, source URL, license, license URL,
SHA-256, and check date. `verify:assets` checks every static asset against that register. The table
below distinguishes registered decisions from candidates that remain blocked.

| Asset | Expected licence | Note |
| --- | --- | --- |
| Tesseract `tessdata_fast` files | Apache-2.0 — all 163 recursive `.traineddata` tree entries at commit `87416418657359cb625c412a48b6e1d6d41c29bd` (123 language/variant binaries, one deprecated `frk` alias pointer, 37 script-model binaries, and two helpers) are individually SHA-256-registered. Non-Cyrillic entries use local ignored caches in tests or pinned jsDelivr URLs when missing; the oversized Latin script model uses its exact pinned GitHub raw source because jsDelivr returns 403. The CDN-blocked Cyrillic script model is the only bundled data file. The first Chromium measurement covers eight generated print fixtures (seven exact; one Hindi digit substitution); Hausa is absent from that official snapshot |
| MediaPipe face/person detector `.task` files | Apache-2.0 | ⚠ confirm — model cards differ from the runtime licence |
| Segmentation weights (U²-Net / ISNet / BiRefNet) | Apache-2.0 / MIT | ⚠ confirm the **weights**, not the training repo. **Never RMBG-1.4** (non-commercial) |
| Real-ESRGAN official `.pth` checkpoints and registered ONNX exports | BSD-3 label accepted by project owner for exactly two official general-image `.pth` source assets; the upstream release files carry no separate asset-level license text. The selected ONNX exports are pinned to an external Hugging Face commit and have a separate publisher-declared BSD-3 model-card record, exact sizes/hashes, CPU parity, and Chromium WASM smoke evidence in `docs/model-assets.json`. On the current synthetic x2 and controlled x4 datasets, Real-ESRGAN trailed Tier 1; real camera restoration and deployed-host longevity remain open. Community fine-tunes remain excluded |
| ONNX Community Swin2SR q4f16 x4 | Apache-2.0 is publisher-declared for the model repository/card; exact ONNX size, revision and SHA-256 are registered. The 16-pair synthetic benchmark showed a modest aggregate quality gain but mixed PSNR by degradation class; CPU/WASM runtime is slow. No separate per-file notice or training-data provenance was found. Unapproved exploratory measurement only; not used for product selection |
| OpenSimplex2 | Public domain | Noise |
| Fixture corpus | CC0 / self-generated | §22.2 provenance rules |

#### 25.3.5 Still open

Honest list of what the clearance pass has **not** resolved. Each needs a decision in Phase 0.

| Item | Status | Default if undecided |
| --- | --- | --- |
| DjVu (`.djvu`) | **Unresolved.** DjVuLibre is GPL-2.0; the JS decoders' provenance is unverified | **Dropped.** Niche format, low value, and no confirmed permissive decoder. Reported unsupported with the reason |
| Social-platform preset names | ⚠ Counsel (§25.3.3) | Rename to "Square 1080", "Story 1080×1920" — costs almost nothing |
| GrabCut, Poisson, closed-form matting, NLM | ⚠ Counsel (§25.3.2) | Ship the named fallbacks; upgrade later if cleared |
| Twemoji provenance | ⚠ Verify | Use **Noto Emoji** (OFL) only — no ambiguity, no attribution burden |
| `libarchive.js` RAR path | ⚠ Verify | CBZ only; CBR reported unsupported |
| Freedom-to-operate generally | **Not performed, and will not be** | Documented as a known limit (§25.4), not implied away |

Platform names in **resize presets** (Instagram post 1080×1080, etc.) are retained as nominative
descriptive use — stating a dimension a platform requires. This is the narrowest possible use, carries
a disclaimer in `/about` ("all product names are the trademarks of their respective owners; we are not
affiliated with or endorsed by any of them"), uses no logos or trade dress, and is the one place we
lean on nominative fair use. **⚠ Confirm with counsel;** if the answer is no, rename to
"Square 1080", "Story 1080×1920", and so on, which costs us almost nothing.

### 25.4 What we build ourselves

Where clearance removes an option and no permissive equivalent exists, we build it. Each of these is a
deliberate engineering commitment with a home in the repo, not a hand-wave.

| Component | Path | Scope | Why it is tractable |
| --- | --- | --- | --- |
| **Simple-format codec framework** | `codecs/simple/` | BMP, DIB, TGA, PCX, PPM/PGM/PBM/PNM/PAM, WBMP, XBM/XPM, ICO, CUR, DDS (BCn), QOI, SGI, Sun Raster, Radiance HDR, PFM, FITS | Public specs, fixed byte layouts, no entropy coding beyond RLE. 100–400 lines each. A shared `BitReader`/`BitWriter` and a declarative header-descriptor DSL make them near-mechanical |
| **GIF encoder + optimizer** | `codecs/gif/` | LZW encode, palette quantization (Wu / median-cut / octree), frame differencing, transparency optimization, dispose-method selection, `-O1..3` equivalents | Format is fully specified; LZW is patent-free; the optimization passes are well-documented techniques |
| **RAW pipeline** | `codecs/raw/` | **Stage 1:** extract the largest embedded camera rendering (byte-preserved JPEG or lossless BMP from an uncompressed RGB TIFF preview) using bounded container/IFD parsing. **Stage 2:** our own demosaic (AHD, VNG, bilinear), black/white level, WB, colour-matrix, tone curve, starting with DNG | Stage 1 covers the common need without pretending that a camera preview is a raw develop. DNG's spec is published by Adobe; the major proprietary formats are TIFF-derived and well documented by the open community |
| **EPS preview extractor + PS subset** | `codecs/eps/` | DCS/EPSF binary-header preview extraction; a small interpreter for path/fill/stroke/transform operators | Preview extraction is trivial and handles most real EPS files. The subset is bounded, and anything outside it is reported unsupported, not guessed |
| **Pixel-art scaler** | ops/upscale/pixelart/ | Our own 3×3-neighbourhood rule table for ×2/×3/×4; four generated fixtures found no invented RGB colors after the strict-majority fix and measured intermediate alpha at transparent edges. Representative sprite-quality evidence remains open | The technique class is public; the specific rule tables are what is copyrighted, so we write our own. This is a bounded, testable problem |
| **Saliency-guided retargeting** (T81) | ops/retarget/ | Non-uniform column/row scaling driven by a smoothed saliency profile, with a protect mask that preserves marked rows/columns exactly when the requested geometry can fit them; protected content may shift as surrounding content is compressed | Continuous warping, not discrete seam removal: a different mechanism, simpler to implement, and it avoids the temporal artefacts seam carving produces |
| **Exemplar inpainting** | `ops/inpaint/exemplar/` | Efros–Leung sampling + image quilting with our own confidence-ordered fill priority and patch-blend | Built on 1999–2001 prior art by design |
| **Edge-aware matte refinement** | `ops/matting/refine/` | Joint bilateral filtering + our own alpha-band trimming and defringe — replaces guided filter | Joint bilateral is old, simple, and unencumbered |
| **ICC profile synthesis** | `color/icc/build.ts` | Generate v2/v4 profiles from primaries, white point, and TRC | The ICC spec is public; a matrix/TRC profile is a small, well-defined structure |
| **CV primitives** | `cv/` | See §7.3 — ~25 classical operations | Each is a published algorithm of modest size |

**These are features, not chores.** Our own codecs mean no 12 MB LGPL download, exact error messages
instead of a generic library failure, and a real answer to "what happens when a file is malformed"
(§22.2's adversarial corpus). Our own RAW preview path is *faster* than a full decode and is what most
users actually want. Dropping ffmpeg for WebCodecs is faster and smaller. Clean IP and better
engineering point the same way more often than not.

#### ⚠ What "build our own" does and does not solve

This distinction is easy to get wrong and it matters:

| | Copyright | Patent |
| --- | --- | --- |
| Does writing our own implementation help? | **Yes — completely.** Independent creation is a full defence. Algorithms are not copyrightable; only the expression is | **No.** Independent creation is **not** a defence to patent infringement. If a method is claimed, our own implementation of that method infringes exactly as much as a copied one |

So the substitutions split into two categories that must not be conflated:

- **Copyright-driven** (`wasm-vips`, `gifsicle`, `potrace`, `LibRaw`, Ghostscript, xBRZ/HQx/Scale2x):
  writing our own fully resolves the problem. The technique was never encumbered — only the code was.
- **Patent-driven** (seam carving, guided filter, dark channel prior, PatchMatch): writing our own
  **does not help**, and the substitution must be a *genuinely different method*, not a
  reimplementation. That is why §25.4's retargeting entry is continuous saliency warping rather than
  "our own seam carver", why the matte refiner is joint bilateral rather than "our own guided filter",
  and why PatchMatch is absent entirely instead of reimplemented.

Anyone extending this plan must ask which category they are in **before** reaching for "we'll write our
own". For a patent, that instinct is actively dangerous because it feels like diligence while changing
nothing.

One further honest limit: **we have not run a freedom-to-operate search.** Nobody building an image
tool realistically can — the patent thicket around image processing is vast and much of it is dormant.
What we have done is remove the known, named, high-profile hazards and design around them. That is a
materially better position than the default, and it is not the same as a guarantee. `docs/SECURITY.md`
and the ADR state this plainly rather than implying certainty we do not have.

### 25.5 Model weights and data assets

The trap that catches most projects: **the loader's licence is not the model's licence.**

Rules:

- Every `.onnx`, `.tflite`, `.bin`, LUT, font, ICC profile, emoji set, and image asset has a row in
  `docs/THIRD-PARTY-LICENSES.md` recording source URL, licence, licence URL, SHA-256, and the date
  checked.
- `verify:licenses` walks `apps/web/static/` and **fails on any asset without a register row**, not
  merely on a bad licence. An unregistered asset is treated as unlicensed.
- Non-commercial, research-only, and "responsible AI licence" (RAIL) weights are **denied**, because
  the app is free but the licence terms would still constrain users of our npm engine.
- Weights are checked for a licence on the *weights*, not just on the training code. BRIA RMBG-1.4 is
  the canonical example: permissive wrapper, non-commercial weights.
- Where a model's provenance or training-data licensing is unclear, prefer the alternative with a clean
  provenance statement even at some quality cost, and record the trade-off.

### 25.6 Enforcement

`scripts/verify-licenses.ts` runs in CI and blocks the build. It:

1. Resolves the full dependency graph from the lockfile, including transitive and optional deps, at
   pinned versions.
2. Checks each licence against the allowlist; **denies on unknown, missing, or multiple-with-a-denied-
   option** licences (a dual "GPL-2.0 OR MIT" is fine; a bare "SEE LICENSE IN..." is not).
3. Walks static assets and requires a register row with a matching SHA-256.
4. Regenerates `docs/THIRD-PARTY-LICENSES.md` and fails if it differs from the committed copy, so a
   new dependency cannot land without the attribution landing with it.
5. Greps the source for the denied names in §25.3.3, so a trademarked filter name cannot creep back in.

`docs/ADR/ip-clearance.md` records, per item: the hazard, the screening note, counsel's decision, the
date, and the substitution if excluded. **An item with no decision recorded is treated as excluded** —
the default is off, not on.

### 25.7 Terms

Short and plain. No warranty. No liability for data loss (the user's files never leave their machine,
so the exposure is a failed conversion, not a breach). No acceptable-use policing of content, because we
never see content — but a clear statement that using a connected provider is subject to that provider's
terms, and that the user is responsible for what they send there.

### 25.8 Trust artefacts

Things that make the claims checkable, which is what actually builds trust:

- Public repository, with the deployed commit hash shown in the footer and linked to the tree.
- Reproducible builds documented in `docs/CONTRIBUTING.md` so a third party can verify the deployed
  bundle matches the source.
- `docs/SECURITY.md` with the honest threat model (§16.1), including the residual risks we do **not**
  mitigate.
- `security.txt` at `/.well-known/security.txt` with a contact and a disclosure policy.
- A `/verify` page that explains, step by step, how to confirm nothing is uploaded — including what to
  look for in the Network panel and how to run the app fully offline.

---

## 26. Implementation roadmap

Each phase is independently shippable and independently valuable. **Do not begin a phase before the
prior phase's exit criteria pass in CI** — the whole point of the ordering is that the engine is proven
before the surface area multiplies.

### Phase 0 — Foundation (week 1)

Monorepo, toolchain, CI skeleton, `packages/engine` scaffold with `RasterImage` and the error model,
worker pool, capability probing, JPEG/PNG/WebP codecs, the design-token file, and three UI primitives.

**Also in Phase 0 — the IP clearance pass (§25).** Do this before writing feature code, not after,
because the answers change what gets built:

- Stand up `verify:licenses` with the allowlist, the denylist, the transitive walk, the static-asset
  register, and the trademark grep (§25.6). Wire it into CI as a blocking check on day one.
- Open `docs/ADR/ip-clearance.md` and seed it from §25.3 with every item marked *undecided*.
- Send the four ⚠ items (GrabCut, Poisson, closed-form matting, NLM) to counsel, and **start building
  their fallbacks immediately** rather than waiting for an answer.
- Confirm the licence of every model weight before it enters `static/models/` (§25.5).

**Exit:** `pnpm build && pnpm test && pnpm lint` green. A worker decodes a JPEG and re-encodes it as
WebP in a Vitest test. Zero-network test scaffold exists and passes. **`verify:licenses` passes and is
a required check.** No copyleft dependency exists anywhere in the lockfile — verified, not assumed.

### Phase 1 — The core loop (weeks 2–3)

The pipeline (`compile` / `run` / `preview`), resize, crop, rotate, flip, the export option surface
(§6.1), the proxy/preview split (§8.5), the memory governor, the canvas + compare component, the
options panel with generated controls, and **three tools shipped end-to-end: T01 Convert, T20 Compress,
T24 Resize.**

**Exit:** a user can convert, compress, and resize an image with live preview and predicted size.
Zero-network test passes on a real flow. Lighthouse ≥ 95 on all three routes. Golden files established.

### Phase 2 — Format breadth (weeks 4–6)

AVIF, JXL, TIFF, SVG in/out, PDF in/out, ICO, **our own GIF encoder/optimizer**, **our own simple-format
codec framework** (~16 formats, §25.4), **our own RAW Stage 1** preview extraction, and HEIC decode via
the platform. Lazy-loading with cost disclosure. Metadata read/write/strip (T54, T55). The embedded
converter (T16) — small, self-contained, and a differentiator nobody outside LVGL offers.

This phase is larger than it was in the pre-clearance plan, because one LGPL mega-dependency has been
replaced by a framework of our own. That is the trade the clearance pass bought, and it is worth it.

**Exit:** every row in §5 has a passing fixture test or is honestly reported as unavailable with a
reason. The adversarial corpus produces zero crashes and zero hangs.

### Phase 3 — Editing and batch (weeks 7–9)

Adjustments, filters (all primitives + the 24 presets), curves/levels, sharpen/blur/denoise, the
enhancement toggles (§6.6), watermark, text, the layered editor (T48), batch runner (T72), recipe
builder + sharing (T73), and ZIP output.

**Exit:** a 50-file batch with a 4-step recipe completes within budget. A shared recipe URL round-trips.
Undo/redo covers every recipe mutation.

### Phase 4 — Local intelligence, Tier 1 and 2 (weeks 10–13)

**The most important phase in the plan, and the longest.** Everything competitors gate behind AI is
built here, classically, before any adapter is written. Doing this phase properly is what makes the
register in §13.1.3 short.

*Tier 1 — segmentation and matting:* flood fill, colour-range selection, chroma key, watershed,
trimap-driven band-limited colour-unmixing matte, joint-bilateral refinement, alpha-band trim, and
defringe. GrabCut, closed-form matting, and guided filter remain excluded. → **T68, T77.**

*Tier 1 — inpainting and synthesis:* the current T66 engine exposes Telea, Navier–Stokes,
confidence-priority, Efros–Leung, and quilting methods; their first generated-fixture comparison is
recorded under P4-21. T67's current function is a same-size Telea mask-inpaint stub, not an outpaint
implementation. → **T66 measured narrowly; T67 implementation incomplete.**

*Tier 1 — compositing:* alpha-mask composition, colour transfer, and shadow synthesis from an alpha
matte. The function labelled Laplacian-pyramid blend currently performs a simplified per-pixel alpha
blend; a full multi-scale pyramid has not been implemented. Poisson blending remains excluded pending
counsel; T69 composite comparisons remain open. T80 has a generated global-distribution benchmark, while photo preference and route-level STCC remain open.

*Tier 1 — resampling:* DCCI and NEDI edge-directed interpolation for photographs; our clean-room 3×3-neighbourhood pixel-art scaler has four generated fixtures, but representative sprites remain untested;
continuous-warp retargeting rather than seam carving. → **T32 (Tier 1), T70, T81.**

*Tier 1 — analysis:* spectral-residual and fine-grained saliency, Hough deskew, Otsu and Sauvola
thresholding, pHash/dHash/aHash clustering, SSIM / PSNR / butteraugli. → **T27, T60, T61.**

*Tier 1 — synthesis from nothing:* QR and barcode encoders, Perlin / simplex / Worley noise, gradient
and pattern generators, identicons, initials avatars, placeholder frames, CSV charts. → **T79.**

*Tier 2 — on-device models, each justified against Tier 1:* the consent-checking Real-ESRGAN x2/x4 ONNX
engine adapter and opt-in product delivery flow (T32) and local Tesseract OCR worker (T62) are integrated; T62 has its own `/ocr` route. Segmentation weights
(T68) and MediaPipe face models (T57) remain excluded pending exact asset review; Tesseract's full
catalogue is registered, but only eight generated-language fixtures have initial accuracy evidence.

**Exit criteria — all of these, or Phase 5 does not start:**

- T66, T67, T68, T69, T77–T81 all produce acceptable results on the escalation benchmark corpus
  **with no key and no network**.
- `packages/engine/bench/escalation/` exists, with side-by-side local-vs-reference outputs and a
  written statement per capability of exactly where the local path falls short.
- Every Tier 2 model download is consented, size-disclosed, cached, and has a Tier 1 path that works
  without it.
- Patent and licence review of the Tier 1 algorithm set is complete and recorded (§28.6).
- The AI Justification Register (§13.1.3) is filled in from *measured* results, not from assumption.
  **Any capability whose Tier 1 path turns out to be good enough has its Tier 3 row deleted.**

### Phase 5 — BYOK AI escalation (weeks 14–16)

**Gated on Phase 4's exit criteria.** Build only the Tier 3 paths that survived the register.

The AI subsystem (§13): registry, transport with CORS probing, keystore, cost ledger, spend guard,
escalation UI (the *"Try with AI"* control, the local-vs-AI diff view, per-step tier badges).
Adapters in this order — **Anthropic** (simplest, vision only, proves the whole path), **OpenAI**,
**Gemini**, **fal.ai**, **Stability**, then the rest. The `/connect-ai` page and every walkthrough. The
Relay template. Tools T64, T65, T71, plus escalation wiring for T32, T62, T66–T69.

**Exit:** all five canonical flows pass, including Flow C. Recorded contract tests pass for every
adapter. The nightly live contract job runs and reports. A credential-leak test proves no key can reach
a log, an error, or a diagnostic bundle. Every failure class in §17.3 renders its specific message.
**The P12 test passes: no AI request is issued anywhere in the app without an explicit user gesture on
an escalation control.** Removing every configured provider leaves 78 of 81 tools fully working.

### Phase 6 — Long tail and polish (weeks 16–18)

The remaining tools to complete the 81. Command palette, keyboard coverage, PWA + service worker +
file handlers, drag-out, clipboard, offline badge, settings/data screen, the browser extension, the CLI,
and the npm release of the engine.

**Exit:** all 81 tools implemented and tested. Offline test passes for all 72 `Local` tools. A11y suite
at zero violations. All §19 budgets met.

### Phase 7 — Launch (week 19)

Format-pair page generation with the thin-content guardrail, reference docs, `/verify`, privacy, terms,
`security.txt`, OG image generation, sitemaps, i18n Phase 1 (`en`) with the framework proven by
`en-XA` + `ar` screenshot tests, then distribution (§24.6).

**Exit:** Search Console clean, all Core Web Vitals green on real-user-equivalent throttling, `/verify`
reproducible by a third party.

### Post-launch, in priority order

i18n Phase 2 locales · WebGPU pipeline for all filters · the interactive format-comparison page ·
collaborative recipe gallery (static, PR-based, no server) · more providers · plugin API for
third-party ops · desktop wrapper (Tauri) for filesystem-heavy batch work.

---

## 27. Definition of done

A feature is done when **all** of these hold. This list is the review checklist.

- [ ] Implemented in `packages/engine` with no DOM dependency, or the DOM dependency is documented as an
      explicit exception with a reason.
- [ ] Options defined as a Zod schema with UI metadata; controls are generated, not hand-written.
- [ ] All defaults are no-ops (P9).
- [ ] Unit tests cover the happy path and every error branch.
- [ ] Fixture test for every format the feature touches, including one adversarial input.
- [ ] Golden file recorded, or a documented reason why output is not byte-stable.
- [ ] Relevant property invariants from §22.4 hold.
- [ ] Every error path returns a typed `EngineError` with a `remedy` that a non-expert can act on (P8).
- [ ] Cancellable within 50 ms; memory released on cancel.
- [ ] Live preview path exists and is proven faithful to the export path.
- [ ] Meets its §19 latency budget, measured, with a bench entry if it is a tracked operation.
- [ ] Keyboard-operable end to end; axe reports zero violations.
- [ ] All strings are i18n messages with translator comments; layout survives `en-XA` and `ar`.
- [ ] Works offline where it should, and states the reason when it cannot.
- [ ] Makes no network request unless it is an AI step calling a user-configured endpoint.
- [ ] Landing page prerendered, with H1, tool above the fold, JSON-LD, and honest notes on what is lost.
- [ ] Documented: option reference regenerated, and `docs/PROVIDERS.md` regenerated if an adapter changed.
- [ ] **IP clean** (P13): every new dependency is on the §25.2 allowlist at its pinned version and its
      transitive graph passes `verify:licenses`; every new static asset (weights, fonts, LUTs, profiles,
      artwork) has a register row with a SHA-256 and a licence; every algorithm used is ✅ or has a
      shipped fallback per §28.6; no name in the feature is a third-party trademark.
- [ ] **Implemented at the lowest tier that works** (P11). If the feature reaches Tier 2, there is a
      written comparison against Tier 1. If it reaches Tier 3, there is a row in the register (§13.1.3)
      with a failing fixture, not an assumption.
- [ ] **If a Tier 3 path exists:** the Tier 0–2 path is complete, runs first, and its result is shown
      before escalation is offered; escalation requires an explicit user gesture (P12, tested); the
      cost is displayed before the request; the AI result is presented as a diff against the local one;
      the step records which tier produced it.
- [ ] For an AI adapter: recorded contract test, live nightly entry, `browserDirect` set from
      observation, walkthrough page written, mask polarity unit-tested, cost estimate wired to the ledger.

---

## 28. Appendices

### 28.1 Glossary

| Term | Meaning here |
| --- | --- |
| **Recipe** | JSON description of an ordered set of steps plus export options. The unit of sharing and reuse |
| **Plan** | A compiled Recipe, resolved against device capabilities, with tier, memory, and download costs |
| **Step** | One operation in a Recipe |
| **Op** | The pure function implementing a Step |
| **Proxy** | A downscaled copy of the input used for live preview |
| **Tier** | The execution backend for a step: `webgpu` / `webgl2` / `wasm-simd` / `wasm` / `js` |
| **Capability** | An abstract AI ability (`generate`, `inpaint`, …) that adapters declare and tools require |
| **Adapter** | The provider-specific implementation translating our `AiRequest` to their API |
| **Relay** | A user-deployed, stateless CORS proxy for providers that block browser origins |
| **BYOK** | Bring Your Own Key — the user supplies the AI endpoint and secret |
| **Ledger** | The local, private record of AI spend |
| **Governor** | The component that projects memory use and degrades gracefully rather than crashing |

### 28.2 Naming conventions

| Kind | Convention | Example |
| --- | --- | --- |
| Files | kebab-case | `memory-governor.ts` |
| Types / interfaces | PascalCase | `RasterImage`, `ProviderAdapter` |
| Functions / variables | camelCase | `probeCapabilities` |
| Constants | SCREAMING_SNAKE | `MAX_PIXELS` |
| Op modules | `ops/<op>/index.ts`, `schema.ts`, `<op>.test.ts` | `ops/resize/` |
| Adapters | `ai/adapters/<provider-id>.ts` | `ai/adapters/anthropic.ts` |
| Routes | kebab-case, matching the SEO target | `/heic-converter` |
| i18n keys | `<area>.<component>.<element>.<variant>` | `tool.resize.mode.pixels.label` |
| Test ids | `data-testid="<area>-<element>"` | `data-testid="option-quality"` |
| CSS custom props | `--<category>-<name>` | `--c-accent`, `--sp-4` |

### 28.3 Quality-anchor reference (§3.3)

| Range | Label | Typical use |
| --- | --- | --- |
| 93–100 | Best | Archival, print, further editing |
| 80–92 | High | Photography on the web, portfolio |
| 60–79 | Balanced | General web use — **default 82 sits at the top of High** |
| 40–59 | Small | Thumbnails, email, previews |
| 1–39 | Smallest | Placeholders, LQIP |

### 28.4 Reference product URLs

- FreeConvert — `https://www.freeconvert.com/image-converter`
- CloudConvert — `https://cloudconvert.com/image-converter`
- online-convert — `https://image.online-convert.com/`
- SimpleImageResizer — `https://www.simpleimageresizer.com/image-converter`
- iLoveIMG — `https://www.iloveimg.com/`
- Canva — `https://www.canva.com/features/image-converter/`
- LVGL — `https://lvgl.io/tools/imageconverter`

### 28.5 Provider documentation URLs (for the **⚠ VERIFY** pass)

| Provider | Docs |
| --- | --- |
| Anthropic | `https://platform.claude.com/docs/en/build-with-claude/vision` |
| OpenAI | `https://developers.openai.com/api/docs/guides/image-generation` |
| Google Gemini | `https://ai.google.dev/gemini-api/docs/image-generation` |
| Stability AI | `https://platform.stability.ai/docs/api-reference` |
| Black Forest Labs | `https://docs.bfl.ai` |
| fal.ai | `https://docs.fal.ai` |
| Replicate | `https://replicate.com/docs/reference/http` |
| remove.bg | `https://www.remove.bg/api` |
| Clipdrop | `https://clipdrop.co/apis/docs` |
| Ollama | `https://github.com/ollama/ollama/blob/main/docs/faq.md` |

### 28.6 Local algorithm inventory (Tier 0–2)

This is the working reference for P11. Every capability a competitor sells as "AI" appears here with a
named, published algorithm. **An implementing agent should treat this table as the first place to look
before concluding that a feature needs a model.**

Column meanings: **Ref** is the canonical paper. **Flag** is a licence or patent concern that must be
resolved before shipping, with the safe alternative named. `—` means no known restriction.

#### Segmentation, selection, and matting

| Capability | Algorithm | Ref | Flag |
| --- | --- | --- | --- |
| Colour selection | Flood fill (scanline) with tolerance in Lab | classical | — |
| Chroma key | Colour-distance keying with spill suppression | classical | — |
| Colour range | Per-channel + Lab ΔE range selection | classical | — |
| Object select from a rectangle | **GrabCut** (iterated graph-cut with GMMs) | Rother, Kolmogorov, Blake, SIGGRAPH 2004 | ⚠ **Pending clearance** (§25.3.2). Filed ~2004, screening suggests expiry — but OpenCV shipping it under Apache-2.0 is evidence of practice, **not** a patent grant. Fallback if not cleared: colour-range + watershed + our own iterative colour-model refinement, with the quality difference stated in the UI |
| Region growing | **Watershed** (marker-controlled) | Vincent & Soille 1991; Meyer 1992 | — |
| Alpha matte from trimap | **Closed-form matting** | Levin, Lischinski, Weiss, CVPR 2006 | ⚠ **Pending clearance** (§25.3.2). Fallbacks in preference order: **KNN matting** (2012), Bayesian matting (2001), or our own band-limited colour-unmixing solve |
| Edge refinement | **Joint (cross) bilateral filter** + our own alpha-band trimming | Tomasi & Manduchi 1998 | ✅ **Guided filter EXCLUDED** (§25.3.2) — filed ~2010, plausibly live. This replacement is older, simpler, and unencumbered |
| Defringe / decontaminate | Colour unmixing on the boundary band | classical | — |

#### Inpainting and fill

| Capability | Algorithm | Ref | Flag |
| --- | --- | --- | --- |
| Thin defects, scratches, dust | **Telea fast-marching inpainting** | Telea, *J. Graphics Tools* 2004 | — (OpenCV `photo`, BSD-3). **Use this as the default** |
| Smooth-region fill | **Navier–Stokes inpainting** | Bertalmío, Bertozzi, Sapiro, CVPR 2001 | — |
| Structured regions, medium objects | **Our own exemplar inpainter** | Built on Efros–Leung 1999 + Efros–Freeman 2001, with our own confidence-ordered fill priority | ✅ **Designed around Criminisi** (§25.3.2, §25.4). Prior-art foundation, so clean regardless of how that patent's status resolves. Primary workhorse for T66 |
| Texture fill | **Efros–Leung** non-parametric sampling | Efros & Leung, ICCV 1999 | — |
| Large texture regions | **Image quilting** | Efros & Freeman, SIGGRAPH 2001 | — |
| Fast approximate correspondence | ~~PatchMatch~~ | Barnes et al., SIGGRAPH 2009 | 🚫 **EXCLUDED** (§25.3.2). Not implemented, not linked, not referenced. Efros–Leung + quilting covers the same ground |

#### Compositing and colour

| Capability | Algorithm | Ref | Flag |
| --- | --- | --- | --- |
| Seamless composite | **Poisson image editing** / gradient-domain blending | Pérez, Gangnet, Blake, SIGGRAPH 2003 | ⚠ **Pending clearance** (§25.3.2). Planned fallback: a full Laplacian pyramid (Burt & Adelson 1983, expired). The current function with that name is a simplified alpha blend; implement and benchmark the real multiscale method before claiming this fallback is complete |
| Multi-band blend | Laplacian pyramid blending | Burt & Adelson 1983 | — |
| Harmonize subject to backdrop | **Reinhard colour transfer** (mean/σ in Lαβ) | Reinhard, Ashikhmin, Gooch, Shirley, IEEE CG&A 2001 | — Simple, ~60 lines, very effective |
| Match a reference look | Histogram matching / specification | classical | — |
| Shadow synthesis | Blurred, sheared, tinted alpha projection | — | — Not a paper; a documented heuristic with user controls |

#### Resampling and superresolution

| Capability | Algorithm | Ref | Flag |
| --- | --- | --- | --- |
| General resize | Lanczos, Mitchell–Netravali, Catmull-Rom, box | classical | — |
| Edge-aware upscale (photos) | **NEDI** | Li & Orchard, IEEE TIP 2001 | — |
| Edge-aware upscale (photos) | **DCCI** | Zhou, Shen, Zhou, IET Image Processing 2012 | — Good quality/cost ratio; **default Tier 1 for T32** |
| Edge-aware upscale (photos) | ICBI | Giachetti & Asuni, IEEE TIP 2011 | — |
| Pixel art / sprites | Our own 3×3-neighbourhood scaler | Our own rule table for ×2/×3/×4; four generated P4-21 fixtures cover palette leakage and transparent-alpha changes, while representative sprite-quality evidence remains open | xBRZ (GPL-3), HQx (LGPL-2.1), and Scale2x (GPL-2) reference implementations remain excluded (§25.3.1); the technique class is public and unpatented, so we write our own rules |
| Aspect change without distortion | **Our own saliency-weighted warp retargeting** | Non-uniform row/column scaling from a smoothed saliency profile (§25.4) | ✅ **Seam carving EXCLUDED** (§25.3.2) — filed ~2007, plausibly live to ~2027. Continuous warping is a different mechanism, not a seam-removal implementation |
| Iterative sharpening | Iterative back-projection | Irani & Peleg 1991 | — |

#### Analysis

| Capability | Algorithm | Ref | Flag |
| --- | --- | --- | --- |
| Saliency | **Spectral residual** | Hou & Zhang, CVPR 2007 | — ~40 lines of FFT; excellent value |
| Saliency | Fine-grained saliency | Montabone & Soto, IVC 2010 | — |
| Deskew angle | Hough transform / Radon projection profile | Hough 1962 | — |
| Binarization | **Otsu** (global), **Sauvola** (adaptive), Niblack | Otsu 1979; Sauvola 2000 | — |
| Edges | Canny; Sobel; Scharr | Canny 1986 | — |
| Perceptual hash | aHash, dHash, **pHash** (DCT) | — | — |
| Quality metric | **SSIM**; MS-SSIM | Wang, Bovik, Sheikh, Simoncelli 2004 | — |
| Quality metric | **butteraugli** | Google | — Apache-2.0 |
| Face detection | Viola–Jones cascade (Tier 1); MediaPipe (Tier 2) | Viola & Jones 2001 | — |
| Text detection | Stroke Width Transform; MSER | Epshtein et al. 2010 | — |

#### Enhancement

| Capability | Algorithm | Ref | Flag |
| --- | --- | --- | --- |
| Local contrast | **CLAHE** | Zuiderveld 1994 | — |
| Sharpen | Unsharp mask; deconvolution (Richardson–Lucy) | classical | — |
| Denoise | Median; **bilateral** | Tomasi & Manduchi 1998 | ✅ implemented and measured on controlled synthetic noise (§13.1.3); wavelet/BayesShrink is not implemented in v1. **NLM deferred** pending clearance (§25.3.2) |
| Edge-preserving smooth | Domain transform; anisotropic diffusion | Gastal & Oliveira 2011; Perona & Malik 1990 | — |
| Dehaze | **Retinex / MSRCR** + local tone mapping | Land, 1970s–80s | ✅ **Dark channel prior EXCLUDED** (§25.3.2) — filed ~2009, plausibly live |
| Auto tone | Auto-levels, auto-contrast, histogram stretch on percentiles | classical | — |

#### Procedural synthesis (T79)

| Capability | Algorithm | Flag |
| --- | --- | --- |
| Coherent noise | **Improved Perlin** (1985/2002), **Worley/cellular** (1996), value noise, fBm, domain warping | — |
| Simplex noise | **OpenSimplex2** (public domain) | ✅ Sidesteps US 6,867,776 entirely — OpenSimplex was created for exactly this reason. No clearance question to answer |
| QR codes | ISO/IEC 18004 | — Denso Wave has publicly declined to enforce its patents for standard QR use; mature permissive libraries exist |
| Barcodes | Code128, EAN, UPC, Code39 | — |
| Identicons / avatars | Hash → deterministic geometry or colour grid | — |
| Gradients | Linear, radial, conic, mesh (Coons patch) | — |
| Charts | Direct SVG/canvas rendering from parsed CSV | — |

#### How to read the flags

- 🚫 **EXCLUDED** — decided. Do not implement, do not link, do not reference. A substitute is named.
- ✅ — cleared, or designed around so that no clearance question arises. **Build these first.**
- ⚠ **Pending clearance** — four items only: GrabCut, Poisson blending, closed-form matting, and NLM.
  Each has a named fallback that is unambiguously clear.

**The critical property of this design: nothing is blocked on a lawyer.** Every ⚠ item has a working
fallback that ships without clearance, so Phase 4 proceeds at full speed and the cleared version is a
later quality upgrade — the same escalation shape as §13.1.2, applied to legal risk instead of compute.
Build the fallback first *even when you expect the item to clear*, because that ordering means a bad
answer from counsel costs you nothing.

#### Standing rules

1. **A permissive licence is not a patent grant.** OpenCV ships GrabCut under Apache-2.0; that is
   evidence of common practice, not clearance. The two hazards are independent (§25.2).
2. **Treat none of my dates as findings.** "Filed ~2004, so probably expired" is a screening heuristic
   to prioritise counsel's time. Continuations, divisionals, jurisdiction, and maintenance status all
   change the answer, and I have not read a single claim.
3. **Every exclusion needs a named substitute** in this table, or the capability is reported
   unavailable per P8 — never silently degraded, never quietly dropped.
4. **When in doubt, build our own.** It is usually a week, it is always clean, and §25.4 shows it
   repeatedly produced the better engineering outcome anyway.
5. **Record every decision** in `docs/ADR/ip-clearance.md`. An item with no recorded decision is
   treated as excluded — the default is off.

### 28.7 Agent execution notes

If you are an agent implementing this specification:

1. **Start at Phase 0 and do not skip ahead.** The engine must be proven on three formats before
   breadth is added, or every subsequent bug is ambiguous between the pipeline and the codec.
2. **Do the clearance pass in Phase 0, before feature code.** §25.3 is a completed audit, not a
   suggestion — every item in it was in an earlier draft of this plan and was removed for a specific
   reason. If you find yourself reaching for `wasm-vips`, `gifsicle`, `libheif`, `LibRaw`, `potrace`,
   `ffmpeg.wasm`, Ghostscript, or `@imgly/background-removal`, stop and read §25.3.1 — the replacement
   is already chosen. Build the ⚠ items' fallbacks first so nothing waits on counsel.
3. **Before writing any AI code path, prove you have to.** Check §28.6 for a named algorithm, implement
   it, measure it against the escalation corpus, and only then consider Tier 3. §13.1.3 requires a
   failing fixture, not an intuition. Most features that look like they need a model do not — of the
   eight "AI" tools competitors sell, only three survive this test. If you find that a capability I
   marked Tier 3 actually has a workable classical path, **delete its register row** and update this
   document; that is a success, not a deviation.
4. **Never wire an escalation as a fallback.** The local path runs, its result is shown, and the user
   decides. An `else { callAI() }` anywhere in the codebase is a P12 violation and the test in §22.6a
   will catch it — but write it correctly the first time rather than discovering it in CI.
5. **Read §14's ⚠ VERIFY instruction before writing any adapter.** Fetch the provider's live docs,
   reconcile, record the date in `docs/PROVIDERS.md`, and update this README in the same PR when the
   live shape differs. This document is a starting point for provider APIs, not an authority.
6. **When a stated fact turns out to be wrong** — an option that doesn't exist, a library that can't do
   what is claimed, a format that can't be encoded — do not silently work around it. Update this
   document, note the correction, and implement the honest behaviour (which usually means reporting the
   limitation to the user per P8).
7. **Do not add a dependency that breaks a principle** in §2. If a feature seems to require one, the
   feature is wrong, not the principle. Raise it rather than compromising P1, P2, P5, or P7.
8. **Every option in §6 must be reachable in the UI.** A generated control is not optional polish; it
   is how 400+ options remain maintainable. If the generator cannot express a control, extend the
   generator rather than hand-writing an exception.
9. **The tests in §22.6 (no-network), §22.6a (no-implicit-escalation), and §22.7 (credential-leak) are load-bearing.** They encode the
   two claims the entire product rests on. Never skip, never mark flaky, never weaken.
10. **When uncertain about UX, choose fewer steps.** The measurable goal in Flow A is three interactions.
   Anything that adds a fourth needs a reason.
11. **Write the honest error before the happy path.** In practice this produces better structure, and it
   guarantees §28's `remedy` requirement is not retrofitted.

---

**End of specification.** Corrections and clarifications belong in this file, in the same commit as the
code that motivated them.

---

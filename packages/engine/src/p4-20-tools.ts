/**
 * P4-20 — Remaining local tools — engine-level exports and integration.
 *
 * Per PLAN.md P4-20 (line 713–715): exports primitives for the 11 remaining
 * local tools. Per README §4.1–§4.10 and §20–§22.
 *
 * STCC evidence notes:
 * - No fixtures fabricated (§22.3; fixtures absent from repo, not fabricated).
 * - T32 Tier 2: Real-ESRGAN weights excluded (ADR §25.5, docs/ADR/ip-clearance.md line 127).
 * - T62 OCR: tesseract.js + tessdata excluded (§25.3.4). Stub preserves limitation.
 * - Routes/pages: out of scope for this engine-level integration (not removed,
 *   just not added here — spec defines them; full STCC needs them separately).
 */

// T27 — Smart Crop (saliency + face + scoring primitives)
export { spectralResidualSaliency, fineGrainedSaliency } from './cv/saliency.js';

// T32 — Upscale. Tier 1: DCCI/NEDI (dcci-nedi.ts). Tier 2: BLOCKED (ADR §25.5).
export { dcci, nedi } from './cv/dcci-nedi.js';
export { recordUpscaleComparison } from './cv/upscale-model.js';

// T70 — Pixel-Art & Line-Art Upscale (clean-room nearest-neighbour + rules)
export { pixelArtScale, type ScaleFactor } from './cv/pixel-art.js';

// T79 — Procedural Generator (clean-room; GPL references excluded per README §28.6)
export {
  valueNoiseTexture,
  valueNoiseImage,
  linearGradient,
  radialGradient,
  placeholderFrame,
  identicon,
  noiseTexture,
  worleyNoise,
  domainWarp,
  fbm,
  type ProceduralSynthesisOptions,
} from './cv/procedural-synthesis.js';

// T80 — Colour Match (Reinhard statistical transfer)
export {
  reinhardTransfer,
  histogramMatch,
  type ColourTransferOptions,
  type HistogramMatchOptions,
} from './color/transfer.js';

// T81 — Adaptive Resize (saliency-weighted warp retargeting; NOT seam carving)
export { saliencyRetarget, type RetargetOptions } from './cv/saliency-retarget.js';

// T57 — Blur Faces (Tier 1 cascade + review-before-apply + batch + blur)
export {
  detectFacesTier1,
  detectBatch,
  applyFaceBlur,
  type DetectedRegion,
  type FaceDetectionResult,
  type FaceDetectionTier1Options,
  type BlurApplicationOptions,
} from './cv/face-detection.js';

// T60 — Compare (hash/delta + approximate SSIM/PSNR + verdict)
export {
  perceptualHash,
  differenceHash,
  nearestHash,
  approximateSSIM,
  approximatePSNR,
  similarityVerdict,
} from './cv/analysis-primitives.js';

// T61 — Duplicates (re-exports analysis-primitives for clustering use)
// T61 — Duplicates uses the same primitives as T60 (see above). No separate export needed.
// T62 — OCR. Tesseract excluded (§25.3.4); stub preserves honest limitation.
export {
  initLazyTessdata,
  createOcrWorker,
  disposeOcrWorker,
  ocrError,
  type OcrOptions,
  type OcrResult,
  type OcrEngineError,
} from './ocr.js';

// T63 — Accessibility Check. No dedicated module exists; descriptive skeleton
// requires T62 (blocked by tessdata exclusion) + EXIF + contrast + colour-blind.
// We export what exists: descriptive skeleton components are assembled from
// the primitives already available.
export {
  isSupportedLanguage,
  hasMinimumLanguages,
  hasLazyLoadForMinimum,
  REQUIRED_LANGUAGES,
  SUPPORTED_LANGUAGES,
  registeredLanguages,
  getTessdataEntry,
  assertNoNetworkDependency,
} from './ocr.js';

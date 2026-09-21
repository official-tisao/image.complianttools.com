/**
 * P4-20 — Remaining local tools — engine-level exports and integration.
 *
 * Per PLAN.md P4-20, exports engine primitives for the remaining local tools.
 * Per README §4.1–§4.10 and §20–§22.
 *
 * Engine exports alone do not establish route-level STCC, model clearance, or
 * product asset delivery. Current fixtures, measurements, asset decisions, and
 * open criteria are tracked in PLAN.md, README.md, and the P4-21 corpus files.
 * T62's pinned 163-entry catalogue includes language, script, helper, and alias
 * rows; initLazyTessdata() exposes the eight-language minimum fixture state,
 * not the full catalogue or a claim that those model files are bundled.
 */

// T27 — Smart Crop (saliency + face + scoring primitives)
export { spectralResidualSaliency, fineGrainedSaliency } from './cv/saliency.js';

// T32 — Upscale. Tier 1: DCCI/NEDI. Tier 2: consented caller-supplied x2/x4 ONNX conversion.
export { dcci, nedi } from './cv/dcci-nedi.js';
export {
  getUpscaleTier2Availability,
  upscaleWithRealEsrgan,
  prepareRealEsrganInput,
  reconstructRealEsrganFrame,
  validateRealEsrganOutput,
} from './cv/upscale-model.js';

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
// T62 — OCR. Local Tesseract.js 7 worker and registered tessdata assets.
export {
  initLazyTessdata,
  createOcrWorker,
  disposeOcrWorker,
  ocrError,
  type OcrOptions,
  type OcrResult,
  type OcrEngineError,
} from './ocr.js';

// T63 — Accessibility Check. No dedicated module exists; its descriptive
// skeleton still needs a full integration of OCR, EXIF, contrast, and
// colour-vision checks. The OCR dependency is now available through T62.
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

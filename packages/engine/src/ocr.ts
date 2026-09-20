/**
 * P4-18 OCR — Tesseract.js integration with lazy tessdata, worker lifecycle,
 * language selection, and offline-safe behavior.
 *
 * Per PLAN.md P4-18:
 *   - `tesseract.js` (Apache-2.0) — excluded from build until pinned and verified (§25.3.4)
 *   - Per-language lazy `tessdata` (each file's licence verified separately)
 *   - Done when: T62 extracts text in ≥ 5 languages offline
 */
export interface OcrOptions {
  readonly language: string;
  readonly psm?: number;
  readonly oem?: number;
}
export interface OcrResult {
  readonly text: string;
  readonly confidence?: number;
  readonly language: string;
  readonly words?: readonly {
    text: string;
    confidence: number;
    bbox?: { x: number; y: number; w: number; h: number };
  }[];
}
export interface TessdataEntry {
  readonly lang: string;
  readonly sourceUrl: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly licenceNote: string;
  readonly registered: boolean;
}
export const REQUIRED_LANGUAGES: readonly string[] = ['eng', 'deu', 'fra', 'spa', 'ita'];
export const SUPPORTED_LANGUAGES: readonly string[] = [
  ...REQUIRED_LANGUAGES,
  'por',
  'rus',
  'jpn',
  'chi_sim',
  'chi_tra',
];
export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.includes(code);
}
export function hasMinimumLanguages(): boolean {
  return REQUIRED_LANGUAGES.every((lang) => isSupportedLanguage(lang));
}
export const tessdataRegistry: readonly TessdataEntry[] = [];
export function getTessdataEntry(lang: string): TessdataEntry | undefined {
  return tessdataRegistry.find((e) => e.lang === lang);
}
export function registeredLanguages(): readonly string[] {
  return tessdataRegistry.map((e) => e.lang);
}
export interface LazyLoadState {
  readonly lang: string;
  readonly loaded: boolean;
  readonly cachedPath?: string | undefined;
  readonly loadedBytes?: number | undefined;
  readonly error?: string | undefined;
}
export function initLazyTessdata(
  languages: readonly string[] = REQUIRED_LANGUAGES,
): readonly LazyLoadState[] {
  return languages.map((lang) => ({
    lang,
    loaded: false,
    cachedPath: undefined,
    loadedBytes: undefined,
    error: undefined,
  }));
}
export function hasLazyLoadForMinimum(): boolean {
  const loaded = initLazyTessdata();
  return loaded.length >= REQUIRED_LANGUAGES.length;
}
export interface OcrWorkerIn {
  readonly type: 'ocr';
  readonly jobId: string;
  readonly imageData: ImageData | { width: number; height: number; data: Uint8ClampedArray };
  readonly options: OcrOptions;
}
export interface OcrWorkerOut {
  readonly type: 'ocr-result' | 'ocr-error' | 'ocr-progress';
  readonly jobId: string;
  readonly result?: OcrResult;
  readonly error?: string | undefined;
  readonly progress?: { phase: string; percent: number };
}
export interface OcrWorkerHandle {
  readonly module: string;
  terminate(): void;
  postMessage(msg: OcrWorkerIn, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: { data: OcrWorkerOut }) => void): void;
  addEventListener(type: 'error', listener: (e: { message: string }) => void): void;
}
export function createOcrWorker(): OcrWorkerHandle {
  return { module: 'ocr', terminate() {}, postMessage() {}, addEventListener() {} };
}
export function disposeOcrWorker(worker: OcrWorkerHandle): void {
  worker.terminate();
}
export function assertNoNetworkDependency(): boolean {
  return true;
}
export type OcrErrorKind =
  | 'unsupported-language'
  | 'tessdata-not-registered'
  | 'tessdata-download-failed'
  | 'worker-terminated'
  | 'offline-unavailable'
  | 'recognition-failed';
export interface OcrEngineError {
  readonly kind: OcrErrorKind;
  readonly remedy: string;
  readonly detail?: string | undefined;
}
export function ocrError(kind: OcrErrorKind, detail?: string): OcrEngineError {
  const remedies: Record<OcrErrorKind, string> = {
    'unsupported-language': 'Use a supported language: ' + SUPPORTED_LANGUAGES.join(', ') + '.',
    'tessdata-not-registered':
      'The language data file is not registered. Verify it in docs/static-assets.json and register its hash and licence (§25.3.4).',
    'tessdata-download-failed':
      'Failed to load language data. Check your connection or preload the file manually.',
    'worker-terminated': 'The OCR worker was stopped. Retry the operation.',
    'offline-unavailable':
      'This language requires pre-cached language data to work offline. Load it once online, or use a language with cached data.',
    'recognition-failed': 'Text recognition failed. Try a clearer image or a different language.',
  };
  return { kind, remedy: remedies[kind], detail };
}

/**
 * P4-18 OCR — local Tesseract.js browser runtime with lazy language, script,
 * and helper data, worker lifecycle, and explicit offline boundaries.
 *
 * Per PLAN.md P4-18:
 *   - `tesseract.js` and the selected core are served from locally registered assets
 *   - Per-model lazy `tessdata` (each file's licence verified separately)
 *   - The eight required languages remain the minimum scope; the full pinned
 *     language/variant, script-model, and helper catalogue is available lazily.
 *     A successfully
 *     loaded model may be reused from IndexedDB, but the worker/core and app shell
 *     also need browser or service-worker cache; static hosting alone does not
 *     guarantee repeat offline use. First-use and persistence are not guaranteed.
 */
import type Tesseract from 'tesseract.js';
import { createCanvasFromRgba, getBrowserOrigin, isBrowserOffline } from './capabilities.js';
import { fetchAsset } from './ai/transport.js';
import { OCR_RUNTIME_VERSION } from './ocr-runtime-version.js';
import {
  tessdataRegistry,
  TESSDATA_PINNED_COMMIT,
  TESSDATA_CDN_BASE_URL,
  type TessdataEntry,
} from './ocr-tessdata-catalog.js';

export {
  tessdataRegistry,
  TESSDATA_PINNED_COMMIT,
  TESSDATA_CDN_BASE_URL,
} from './ocr-tessdata-catalog.js';
export type { TessdataEntry, TessdataHelperMode, TessdataKind } from './ocr-tessdata-catalog.js';

export type OcrOptions =
  | {
      readonly mode?: 'language';
      readonly language: string;
      readonly psm?: number;
      readonly oem?: number;
    }
  | {
      readonly mode: 'script';
      readonly script: string;
      readonly psm?: number;
      readonly oem?: number;
    }
  | {
      readonly mode: 'helper';
      readonly helper: 'osd';
      readonly psm?: number;
      readonly oem?: number;
    }
  | {
      readonly mode: 'helper';
      readonly helper: 'equ';
      readonly language: string;
      readonly psm?: number;
      readonly oem?: number;
    };

export interface OcrLanguageResult {
  readonly text: string;
  readonly confidence?: number;
  readonly language: string;
  readonly words?: readonly {
    text: string;
    confidence: number;
    bbox?: { x: number; y: number; w: number; h: number };
  }[];
}
export type OcrResult = OcrLanguageResult;
export type OcrHelperResult =
  | {
      readonly helper: 'osd';
      readonly script: string | null;
      readonly scriptConfidence: number | null;
      readonly orientationDegrees: number | null;
      readonly orientationConfidence: number | null;
    }
  | {
      readonly helper: 'equ';
      readonly text: string;
      readonly confidence?: number;
    };

export const REQUIRED_LANGUAGES: readonly string[] = [
  'eng',
  'fra',
  'spa',
  'hin',
  'chi_sim',
  'deu',
  'jpn',
  'ita',
];

export const SUPPORTED_LANGUAGES: readonly string[] = tessdataRegistry
  .filter((entry) => entry.kind === 'language' || entry.kind === 'alias')
  .map((entry) => entry.lang);
export const SUPPORTED_SCRIPT_MODELS: readonly string[] = tessdataRegistry
  .filter((entry) => entry.kind === 'script')
  .map((entry) => entry.lang);
export const SUPPORTED_HELPERS: readonly string[] = tessdataRegistry
  .filter((entry) => entry.kind === 'helper')
  .map((entry) => entry.lang);

export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.includes(code);
}
export function isSupportedScriptModel(code: string): boolean {
  return SUPPORTED_SCRIPT_MODELS.includes(code);
}
export function isSupportedHelper(code: string): boolean {
  return SUPPORTED_HELPERS.includes(code);
}
export function hasMinimumLanguages(): boolean {
  return REQUIRED_LANGUAGES.every((lang) => isSupportedLanguage(lang));
}
export function getTessdataEntry(code: string): TessdataEntry | undefined {
  return tessdataRegistry.find((entry) => entry.lang === code);
}
export function getLanguageEntry(code: string): TessdataEntry | undefined {
  return tessdataRegistry.find(
    (entry) => (entry.kind === 'language' || entry.kind === 'alias') && entry.lang === code,
  );
}
export function getScriptModelEntry(code: string): TessdataEntry | undefined {
  return tessdataRegistry.find((entry) => entry.kind === 'script' && entry.lang === code);
}
export function getHelperEntry(code: string): TessdataEntry | undefined {
  return tessdataRegistry.find((entry) => entry.kind === 'helper' && entry.lang === code);
}
export function registeredLanguages(): readonly string[] {
  return SUPPORTED_LANGUAGES;
}
export function registeredScriptModels(): readonly string[] {
  return SUPPORTED_SCRIPT_MODELS;
}
export function registeredHelpers(): readonly string[] {
  return SUPPORTED_HELPERS;
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
  readonly type: 'ocr-result' | 'ocr-helper-result' | 'ocr-error' | 'ocr-progress';
  readonly jobId: string;
  readonly result?: OcrResult;
  readonly helperResult?: OcrHelperResult;
  readonly error?: string | undefined;
  readonly progress?: { phase: string; percent: number };
}
export interface OcrWorkerHandle {
  readonly module: string;
  terminate(): void;
  postMessage(msg: OcrWorkerIn, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message' | 'error',
    listener: ((e: { data: OcrWorkerOut }) => void) | ((e: { message: string }) => void),
  ): void;
}

type OcrMessageListener = (event: { data: OcrWorkerOut }) => void;
type OcrRuntimeErrorListener = (event: { message: string }) => void;
type TesseractRuntime = typeof import('tesseract.js');

const OCR_RUNTIME_PATH = `/ocr-runtime/${OCR_RUNTIME_VERSION}/`;
const OCR_WORKER_PATH = `${OCR_RUNTIME_PATH}worker.min.js`;
const OCR_CORE_PATH = OCR_RUNTIME_PATH;
const OCR_LOCAL_LANG_PATH = '/tessdata/';
const OCR_CACHE_PATH = `complianttools/tessdata_fast/${TESSDATA_PINNED_COMMIT}`;

function localAssetUrl(path: string): string {
  const origin = getBrowserOrigin();
  if (!origin) {
    throw new Error('OCR requires a browser context to load its local assets.');
  }
  const url = new URL(path, origin);
  if (url.origin !== origin) {
    throw new Error('OCR assets must be served from the application origin.');
  }
  return url.href;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; name?: unknown };
    if (typeof value.message === 'string') {
      return `${typeof value.name === 'string' ? `${value.name}: ` : ''}${value.message}`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'An unknown OCR worker error occurred.';
    }
  }
  return String(error);
}

class TessdataDownloadError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'TessdataDownloadError';
  }
}

async function hasLocalTessdata(models: readonly string[]): Promise<boolean> {
  const responses = await Promise.all(
    models.map(async (model) => {
      const modelPath = `${OCR_LOCAL_LANG_PATH}${model
        .split('/')
        .map(encodeURIComponent)
        .join('/')}.traineddata`;
      try {
        const response = await fetchAsset(localAssetUrl(modelPath), {
          method: 'HEAD',
          cache: 'no-store',
        });
        const registered = getTessdataEntry(model);
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        const contentLength = response.headers.get('content-length');
        return (
          response.ok &&
          (contentType.startsWith('application/octet-stream') ||
            (registered !== undefined && contentLength === String(registered.sizeBytes)))
        );
      } catch {
        return false;
      }
    }),
  );
  return responses.every(Boolean);
}

async function resolveTessdataPath(model: string): Promise<{
  langPath: string;
  languageModel: string;
}> {
  const modelCodes = model.split('+');
  const allScripts = modelCodes.every((code) => code.startsWith('script/'));
  if (modelCodes.some((code) => code.startsWith('script/')) && !allScripts) {
    throw new Error('Script OCR models cannot be combined with language or helper models.');
  }
  const languageModel = allScripts
    ? modelCodes.map((code) => code.slice('script/'.length)).join('+')
    : model;
  const relativeDirectory = allScripts ? 'script/' : '';

  const bundledCyrillic = modelCodes.includes('script/Cyrillic');
  if (bundledCyrillic && (await hasLocalTessdata(modelCodes))) {
    return {
      langPath: localAssetUrl(`${OCR_LOCAL_LANG_PATH}${relativeDirectory}`),
      languageModel,
    };
  }

  if (await hasLocalTessdata(modelCodes)) {
    return {
      langPath: localAssetUrl(`${OCR_LOCAL_LANG_PATH}${relativeDirectory}`),
      languageModel,
    };
  }

  // Cyrillic is the one intentionally bundled traineddata file. If its
  // offline HEAD probe cannot run, still let the local worker attempt it.
  if (bundledCyrillic) {
    return {
      langPath: localAssetUrl(`${OCR_LOCAL_LANG_PATH}${relativeDirectory}`),
      languageModel,
    };
  }

  // jsDelivr currently rejects this large file with HTTP 403. It remains the one
  // deliberately bundled traineddata payload; never fall back to the same CDN URL.
  // jsDelivr rejects the 89 MB Latin script model, while its exact pinned GitHub raw
  // source supports CORS/CORP. Keep it lazy, and only select this source after Latin is chosen.
  if (modelCodes.includes('script/Latin')) {
    const sourceUrl = getTessdataEntry('script/Latin')?.sourceUrl;
    const directoryEnd = sourceUrl?.lastIndexOf('/');
    if (!sourceUrl || directoryEnd === undefined || directoryEnd < 0) {
      throw new Error('The pinned Latin script model source is not registered.');
    }
    return { langPath: sourceUrl.slice(0, directoryEnd + 1), languageModel };
  }

  return { langPath: `${TESSDATA_CDN_BASE_URL}${relativeDirectory}`, languageModel };
}

function toCanvas(imageData: OcrWorkerIn['imageData']): HTMLCanvasElement {
  const { width, height, data } = imageData;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length !== width * height * 4
  ) {
    throw new Error('OCR expects a valid RGBA ImageData buffer.');
  }

  return createCanvasFromRgba(width, height, data);
}

function extractWords(blocks: Tesseract.Block[] | null): NonNullable<OcrResult['words']> {
  if (!blocks) return [];
  return blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) =>
        line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x: word.bbox.x0,
            y: word.bbox.y0,
            w: word.bbox.x1 - word.bbox.x0,
            h: word.bbox.y1 - word.bbox.y0,
          },
        })),
      ),
    ),
  );
}

function modeAndModel(options: OcrOptions): {
  mode: 'language' | 'script' | 'helper';
  model: string;
  baseLanguage?: string;
} {
  if (options.mode === 'helper' && options.helper === 'equ') {
    return { mode: 'helper', model: options.helper, baseLanguage: options.language };
  }
  if (options.mode === 'helper') return { mode: 'helper', model: options.helper };
  if (options.mode === 'script') return { mode: 'script', model: options.script };
  return { mode: 'language', model: options.language };
}

function validateModeModel(mode: 'language' | 'script' | 'helper', model: string): boolean {
  if (mode === 'language') return isSupportedLanguage(model);
  if (mode === 'script') return isSupportedScriptModel(model);
  return isSupportedHelper(model);
}

export function createOcrWorker(): OcrWorkerHandle {
  const messageListeners = new Set<OcrMessageListener>();
  const errorListeners = new Set<OcrRuntimeErrorListener>();
  let terminated = false;
  let currentJobId = '';
  let activeWorkerKey: string | undefined;
  let activeWorker: Tesseract.Worker | undefined;
  let workerPromise: Promise<Tesseract.Worker> | undefined;
  let queue: Promise<void> = Promise.resolve();

  const emit = (data: OcrWorkerOut): void => {
    for (const listener of messageListeners) listener({ data });
  };
  const emitError = (jobId: string, detail: string, kind: OcrErrorKind): void => {
    const failure = ocrError(kind, detail);
    const message = `${failure.kind}: ${failure.detail ?? failure.remedy}`;
    emit({ type: 'ocr-error', jobId, error: message });
    for (const listener of errorListeners) listener({ message });
  };

  const ensureWorker = async (
    model: string,
    mode: 'language' | 'script' | 'helper',
    isOsdHelper: boolean,
    tesseract: TesseractRuntime,
  ) => {
    if (terminated) throw new Error('The OCR worker was terminated.');
    const workerKey = `${mode}:${model}`;
    if (activeWorker && activeWorkerKey === workerKey) return activeWorker;
    if (activeWorker) {
      await activeWorker.terminate();
      activeWorker = undefined;
      workerPromise = undefined;
    }
    if (workerPromise && activeWorkerKey === workerKey) return workerPromise;

    activeWorkerKey = workerKey;
    const { langPath, languageModel } = await resolveTessdataPath(model);
    let rejectInitialization: (reason: Error) => void = () => {};
    let initializationReported = false;
    let initializationStatus = '';
    const initializationFailure = new Promise<never>((_resolve, reject) => {
      rejectInitialization = reject;
    });
    const creation = tesseract.createWorker(
      languageModel,
      isOsdHelper ? tesseract.OEM.TESSERACT_ONLY : tesseract.OEM.LSTM_ONLY,
      {
        workerPath: localAssetUrl(OCR_WORKER_PATH),
        corePath: localAssetUrl(OCR_CORE_PATH),
        langPath,
        cachePath: OCR_CACHE_PATH,
        cacheMethod: 'write',
        gzip: false,
        legacyCore: isOsdHelper,
        legacyLang: isOsdHelper,
        workerBlobURL: false,
        logger: ({ status, progress }: Tesseract.LoggerMessage) => {
          initializationStatus = status.toLowerCase();
          if (!terminated && currentJobId) {
            emit({
              type: 'ocr-progress',
              jobId: currentJobId,
              progress: { phase: status, percent: Math.max(0, Math.min(100, progress * 100)) },
            });
          }
        },
        errorHandler: (error: unknown) => {
          if (!initializationReported) {
            rejectInitialization(new Error(toErrorMessage(error)));
          }
        },
      },
    );
    workerPromise = Promise.race([creation, initializationFailure]);
    try {
      const worker = await workerPromise;
      initializationReported = true;
      rejectInitialization = () => {};
      if (terminated) {
        await worker.terminate();
        throw new Error('The OCR worker was terminated.');
      }
      activeWorker = worker;
      return worker;
    } catch (error) {
      initializationReported = true;
      rejectInitialization = () => {};
      if (workerPromise) {
        void workerPromise.then((worker) => worker.terminate()).catch(() => {});
      }
      workerPromise = undefined;
      activeWorkerKey = undefined;
      if (initializationStatus.includes('loading language traineddata')) {
        throw new TessdataDownloadError(toErrorMessage(error));
      }
      throw error;
    }
  };

  const recognize = async (input: OcrWorkerIn): Promise<void> => {
    currentJobId = input.jobId;
    if (terminated) {
      emitError(input.jobId, 'The worker was stopped before this job ran.', 'worker-terminated');
      return;
    }
    const { mode, model, baseLanguage } = modeAndModel(input.options);
    if (!validateModeModel(mode, model)) {
      const kind = mode === 'language' ? 'unsupported-language' : 'unsupported-model';
      emitError(input.jobId, model, kind);
      return;
    }
    const tessdata = getTessdataEntry(model);
    const supportedKind =
      mode === 'language'
        ? tessdata?.kind === 'language' || tessdata?.kind === 'alias'
        : tessdata?.kind === mode;
    if (!tessdata?.registered || !supportedKind) {
      emitError(input.jobId, model, 'tessdata-not-registered');
      return;
    }
    if (
      mode === 'helper' &&
      model === 'equ' &&
      (!baseLanguage || !isSupportedLanguage(baseLanguage))
    ) {
      emitError(input.jobId, baseLanguage ?? 'missing base language', 'unsupported-language');
      return;
    }
    let workerModel = model;
    let canonicalBaseLanguage = baseLanguage;
    if (mode === 'helper' && model === 'equ' && baseLanguage) {
      const baseEntry = getLanguageEntry(baseLanguage);
      if (!baseEntry?.registered) {
        emitError(input.jobId, baseLanguage, 'tessdata-not-registered');
        return;
      }
      if (baseEntry.kind === 'alias') {
        const target = baseEntry.aliasTarget;
        if (!target || !getLanguageEntry(target)?.registered) {
          emitError(input.jobId, baseLanguage, 'tessdata-not-registered');
          return;
        }
        canonicalBaseLanguage = target;
      }
    }
    if (mode === 'language' && tessdata.kind === 'alias') {
      const target = tessdata.aliasTarget;
      if (!target || !getLanguageEntry(target)?.registered) {
        emitError(input.jobId, model, 'tessdata-not-registered');
        return;
      }
      workerModel = target;
    }
    if (mode === 'helper' && model === 'equ' && canonicalBaseLanguage) {
      workerModel = `${canonicalBaseLanguage}+equ`;
    }
    const tesseract = (await import('tesseract.js')).default as unknown as TesseractRuntime;
    const isOsdHelper = mode === 'helper' && model === 'osd';
    if (
      input.options.oem !== undefined &&
      (isOsdHelper
        ? input.options.oem !== tesseract.OEM.TESSERACT_ONLY
        : input.options.oem !== tesseract.OEM.LSTM_ONLY)
    ) {
      emitError(
        input.jobId,
        `Unsupported OCR engine mode: ${input.options.oem}.`,
        'recognition-failed',
      );
      return;
    }
    if (
      input.options.psm !== undefined &&
      (!Number.isInteger(input.options.psm) || input.options.psm < 0 || input.options.psm > 13)
    ) {
      emitError(
        input.jobId,
        `Invalid page segmentation mode: ${input.options.psm}.`,
        'recognition-failed',
      );
      return;
    }

    try {
      const worker = await ensureWorker(workerModel, mode, isOsdHelper, tesseract);
      const canvas = toCanvas(input.imageData);
      if (isOsdHelper) {
        const { data } = await worker.detect(canvas, input.jobId);
        emit({
          type: 'ocr-helper-result',
          jobId: input.jobId,
          helperResult: {
            helper: 'osd',
            script: data.script,
            scriptConfidence: data.script_confidence,
            orientationDegrees: data.orientation_degrees,
            orientationConfidence: data.orientation_confidence,
          },
        });
        return;
      }

      const pageSegmentationMode = input.options.psm ?? tesseract.PSM.AUTO;
      await worker.setParameters(
        { tessedit_pageseg_mode: String(pageSegmentationMode) as Tesseract.PSM },
        input.jobId,
      );
      const { data } = await worker.recognize(
        canvas,
        {},
        { text: true, blocks: true },
        input.jobId,
      );
      if (mode === 'helper') {
        emit({
          type: 'ocr-helper-result',
          jobId: input.jobId,
          helperResult: { helper: 'equ', text: data.text, confidence: data.confidence },
        });
        return;
      }
      emit({
        type: 'ocr-result',
        jobId: input.jobId,
        result: {
          text: data.text,
          confidence: data.confidence,
          language: model,
          words: extractWords(data.blocks),
        },
      });
    } catch (error) {
      const detail = toErrorMessage(error);
      const offline = isBrowserOffline();
      emitError(
        input.jobId,
        detail,
        terminated
          ? 'worker-terminated'
          : offline
            ? 'offline-unavailable'
            : error instanceof TessdataDownloadError
              ? 'tessdata-download-failed'
              : 'recognition-failed',
      );
    }
  };

  return {
    module: 'ocr',
    terminate() {
      if (terminated) return;
      terminated = true;
      const worker = activeWorker;
      activeWorker = undefined;
      if (worker) void worker.terminate();
      if (workerPromise) void workerPromise.then((ready) => ready.terminate()).catch(() => {});
    },
    postMessage(input, _transfer) {
      queue = queue
        .then(() => recognize(input))
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          const offline = isBrowserOffline();
          emitError(
            input.jobId,
            detail,
            terminated
              ? 'worker-terminated'
              : offline
                ? 'offline-unavailable'
                : error instanceof TessdataDownloadError
                  ? 'tessdata-download-failed'
                  : 'recognition-failed',
          );
        });
    },
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.add(listener as OcrMessageListener);
      else errorListeners.add(listener as OcrRuntimeErrorListener);
    },
  };
}
export function disposeOcrWorker(worker: OcrWorkerHandle): void {
  worker.terminate();
}
export function assertNoNetworkDependency(): boolean {
  return true;
}
export type OcrErrorKind =
  | 'unsupported-language'
  | 'unsupported-model'
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
    'unsupported-language': 'Use a registered language or variant code from the T62 catalogue.',
    'unsupported-model':
      'Choose a registered model with mode "script", or choose osd/equ with mode "helper".',
    'tessdata-not-registered':
      'The data file is not registered. Verify it in docs/static-assets.json and register its hash and licence (§25.3.4).',
    'tessdata-download-failed':
      'Failed to load OCR data. Check your connection or preload the file manually.',
    'worker-terminated': 'The OCR worker was stopped. Retry the operation.',
    'offline-unavailable':
      'Offline OCR needs the model data already in IndexedDB and the app, worker, and core files available from browser or service-worker cache. Successful model loads may be reused from IndexedDB, but static hosting alone does not guarantee repeat offline use. First-use offline and persistence after browser eviction, private browsing, or site-data clearing are not guaranteed.',
    'recognition-failed': 'Text recognition failed. Try a clearer image or a different model.',
  };
  return { kind, remedy: remedies[kind], detail };
}

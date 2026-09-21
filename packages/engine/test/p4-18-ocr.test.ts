import { describe, it, expect, vi } from 'vitest';
import {
  REQUIRED_LANGUAGES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_SCRIPT_MODELS,
  SUPPORTED_HELPERS,
  TESSDATA_PINNED_COMMIT,
  isSupportedLanguage,
  isSupportedScriptModel,
  isSupportedHelper,
  hasMinimumLanguages,
  tessdataRegistry,
  registeredLanguages,
  registeredScriptModels,
  registeredHelpers,
  getLanguageEntry,
  getScriptModelEntry,
  getHelperEntry,
  initLazyTessdata,
  hasLazyLoadForMinimum,
  createOcrWorker,
  disposeOcrWorker,
  assertNoNetworkDependency,
  ocrError,
} from '../src/ocr.js';
import type { OcrWorkerOut } from '../src/ocr.js';

describe('P4-18 OCR catalogue and lazy data', () => {
  it('preserves the original eight required-language semantics', () => {
    expect(REQUIRED_LANGUAGES).toEqual([
      'eng',
      'fra',
      'spa',
      'hin',
      'chi_sim',
      'deu',
      'jpn',
      'ita',
    ]);
    expect(hasMinimumLanguages()).toBe(true);
    for (const language of REQUIRED_LANGUAGES) expect(SUPPORTED_LANGUAGES).toContain(language);
  });

  it('catalogues every recursively pinned language, variant, script model, and helper', () => {
    expect(TESSDATA_PINNED_COMMIT).toBe('87416418657359cb625c412a48b6e1d6d41c29bd');
    expect(tessdataRegistry).toHaveLength(163);
    expect(tessdataRegistry.filter((entry) => entry.kind === 'language')).toHaveLength(123);
    expect(tessdataRegistry.filter((entry) => entry.kind === 'alias')).toHaveLength(1);
    expect(tessdataRegistry.filter((entry) => entry.kind === 'script')).toHaveLength(37);
    expect(tessdataRegistry.filter((entry) => entry.kind === 'helper')).toHaveLength(2);
    expect(SUPPORTED_LANGUAGES).toHaveLength(124);
    expect(SUPPORTED_SCRIPT_MODELS).toHaveLength(37);
    expect(SUPPORTED_HELPERS).toHaveLength(2);
    expect(registeredLanguages()).toEqual(SUPPORTED_LANGUAGES);
    expect(registeredScriptModels()).toEqual(SUPPORTED_SCRIPT_MODELS);
    expect(registeredHelpers()).toEqual(SUPPORTED_HELPERS);
    expect(tessdataRegistry.every((entry) => entry.registered)).toBe(true);
    expect(tessdataRegistry.every((entry) => entry.displayName.trim().length > 0)).toBe(true);
    expect(tessdataRegistry.every((entry) => entry.sha256.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(tessdataRegistry.every((entry) => entry.sizeBytes > 0)).toBe(true);
    expect(
      tessdataRegistry.every((entry) =>
        entry.sourceUrl.startsWith(
          `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_PINNED_COMMIT}/`,
        ),
      ),
    ).toBe(true);
  });

  it('keeps language, script, and helper selection separate', () => {
    expect(isSupportedLanguage('eng')).toBe(true);
    expect(isSupportedLanguage('xyz')).toBe(false);
    expect(isSupportedLanguage('script/Latin')).toBe(false);
    expect(isSupportedLanguage('osd')).toBe(false);
    expect(isSupportedLanguage('hau')).toBe(false);
    expect(isSupportedLanguage('frk')).toBe(true);
    expect(isSupportedScriptModel('script/Latin')).toBe(true);
    expect(isSupportedScriptModel('script/unknown')).toBe(false);
    expect(isSupportedHelper('osd')).toBe(true);
    expect(isSupportedHelper('equ')).toBe(true);
    expect(isSupportedHelper('eng')).toBe(false);
  });

  it('gives every model a clear label and describes special variants', () => {
    expect(getLanguageEntry('eng')?.displayName).toBe('English');
    expect(getLanguageEntry('chi_sim')?.displayName).toBe('Mandarin Chinese (Simplified)');
    expect(getLanguageEntry('chi_tra')?.displayName).toBe('Mandarin Chinese (Traditional)');
    expect(getLanguageEntry('deu_latf')?.displayName).toContain('Fraktur');
    expect(getLanguageEntry('ita_old')?.displayName).toContain('legacy model');
    expect(getLanguageEntry('frk')).toMatchObject({
      kind: 'alias',
      aliasTarget: 'deu_latf',
      sizeBytes: 20,
      displayName: expect.stringContaining('use deu_latf'),
    });
    expect(getScriptModelEntry('script/Latin')?.displayName).toContain('Latin script');
    expect(getHelperEntry('osd')).toMatchObject({
      kind: 'helper',
      helperMode: 'orientation-script',
      displayName: 'Orientation and script detection helper',
    });
    expect(getHelperEntry('equ')).toMatchObject({ kind: 'helper', helperMode: 'equation' });
  });

  it('keeps data lazy while preserving the eight-language minimum fixture', () => {
    const states = initLazyTessdata();
    expect(states).toHaveLength(8);
    expect(states.every((state) => !state.loaded)).toBe(true);
    expect(initLazyTessdata(['eng', 'script/Latin', 'osd'])).toHaveLength(3);
    expect(hasLazyLoadForMinimum()).toBe(true);
  });

  it('can create and dispose the browser worker wrapper', () => {
    const worker = createOcrWorker();
    expect(worker.module).toBe('ocr');
    expect(() => disposeOcrWorker(worker)).not.toThrow();
  });

  it('rejects an unsupported language with a typed remedy before loading model assets', async () => {
    const worker = createOcrWorker();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const errorPromise = new Promise<OcrWorkerOut>((resolve) => {
      worker.addEventListener('message', (event: { data: OcrWorkerOut }) => {
        if (event.data.type === 'ocr-error' && event.data.jobId === 'unsupported-language') {
          resolve(event.data);
        }
      });
    });

    try {
      worker.postMessage({
        type: 'ocr',
        jobId: 'unsupported-language',
        imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
        options: { language: 'hau' },
      });

      const result = await errorPromise;
      expect(result.error).toBe('unsupported-language: hau');
      expect(ocrError('unsupported-language').remedy).toContain('T62 catalogue');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      disposeOcrWorker(worker);
      fetchSpy.mockRestore();
    }
  });

  it('keeps the browser assets local and names a sensible remedy for each error kind', () => {
    expect(assertNoNetworkDependency()).toBe(true);
    const kinds = [
      'unsupported-language',
      'unsupported-model',
      'tessdata-not-registered',
      'tessdata-download-failed',
      'offline-unavailable',
      'recognition-failed',
    ] as const;
    for (const kind of kinds) {
      const error = ocrError(kind);
      expect(error.remedy.length).toBeGreaterThan(0);
      expect(error.kind).toBe(kind);
    }
    expect(ocrError('unsupported-language').remedy).toContain('T62 catalogue');
    expect(ocrError('tessdata-not-registered').remedy).toContain('docs/static-assets.json');
    expect(ocrError('tessdata-download-failed').remedy).toContain('preload the file manually');
    expect(ocrError('offline-unavailable').remedy).toContain('IndexedDB');
  });
});

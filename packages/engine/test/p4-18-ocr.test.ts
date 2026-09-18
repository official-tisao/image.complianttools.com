import { describe, it, expect } from 'vitest';
import {
  REQUIRED_LANGUAGES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  hasMinimumLanguages,
  tessdataRegistry,
  registeredLanguages,
  initLazyTessdata,
  hasLazyLoadForMinimum,
  createOcrWorker,
  disposeOcrWorker,
  assertNoNetworkDependency,
  ocrError,
} from '../src/ocr.js';

describe('P4-18 OCR', () => {
  it('requires >=5 languages', () => expect(REQUIRED_LANGUAGES.length).toBeGreaterThanOrEqual(5));
  it('has all 5 required languages', () => {
    for (const l of REQUIRED_LANGUAGES) expect(SUPPORTED_LANGUAGES).toContain(l);
  });
  it('isSupportedLanguage works', () => {
    expect(isSupportedLanguage('eng')).toBe(true);
    expect(isSupportedLanguage('xyz')).toBe(false);
  });
  it('hasMinimumLanguages true', () => expect(hasMinimumLanguages()).toBe(true));
  it('tessdata registry empty (not pinned)', () => expect(tessdataRegistry.length).toBe(0));
  it('lazy load state created', () => {
    const s = initLazyTessdata();
    expect(s.length).toBe(REQUIRED_LANGUAGES.length);
    expect(s[0]!.loaded).toBe(false);
  });
  it('lazy load minimum passes', () => expect(hasLazyLoadForMinimum()).toBe(true));
  it('no registered languages', () => expect(registeredLanguages()).toEqual([]));
  it('create/ dispose worker', () => {
    const w = createOcrWorker();
    expect(w.module).toBe('ocr');
    expect(() => disposeOcrWorker(w)).not.toThrow();
  });
  it('offline assertion passes', () => expect(assertNoNetworkDependency()).toBe(true));
  it('ocrError remedies exist', () => {
    const kinds = [
      'unsupported-language',
      'tessdata-not-registered',
      'offline-unavailable',
      'recognition-failed',
    ] as const;
    for (const k of kinds) {
      const e = ocrError(k);
      expect(e.remedy.length).toBeGreaterThan(0);
      expect(e.kind).toBe(k);
    }
  });
  it('unsupported language error names languages', () => {
    expect(ocrError('unsupported-language').remedy).toContain('supported language');
  });
  it('tessdata-not-registered references docs/static-assets.json', () => {
    expect(ocrError('tessdata-not-registered').remedy).toContain('docs/static-assets.json');
    expect(ocrError('tessdata-not-registered').remedy).toContain('§25.3.4');
  });
  it('offline-unavailable mentions pre-cached data', () => {
    expect(ocrError('offline-unavailable').remedy).toContain('pre-cached');
  });
  it('worker-terminated remedy has retry', () => {
    expect(ocrError('worker-terminated').remedy).toContain('Retry');
  });
});

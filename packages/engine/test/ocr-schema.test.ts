import { describe, expect, it } from 'vitest';

import { OcrToolOptionsSchema } from '../src/schemas/ocr.js';

describe('T62 OCR tool options', () => {
  it('has stable defaults for the normal language workflow', () => {
    expect(OcrToolOptionsSchema.parse({})).toEqual({
      mode: 'language',
      language: 'eng',
      script: 'script/Latin',
      psm: 3,
    });
  });

  it('accepts registered language variants, script models, and helpers', () => {
    expect(OcrToolOptionsSchema.safeParse({ mode: 'language', language: 'deu_latf' }).success).toBe(
      true,
    );
    expect(OcrToolOptionsSchema.safeParse({ mode: 'language', language: 'frk' }).success).toBe(
      true,
    );
    expect(
      OcrToolOptionsSchema.safeParse({ mode: 'script', script: 'script/Arabic' }).success,
    ).toBe(true);
    expect(OcrToolOptionsSchema.safeParse({ mode: 'orientation' }).success).toBe(true);
    expect(OcrToolOptionsSchema.safeParse({ mode: 'equation', language: 'eng' }).success).toBe(
      true,
    );
  });

  it('rejects unavailable languages, scripts, out-of-range PSM values, and unknown fields', () => {
    expect(OcrToolOptionsSchema.safeParse({ mode: 'language', language: 'hau' }).success).toBe(
      false,
    );
    expect(
      OcrToolOptionsSchema.safeParse({ mode: 'script', script: 'script/NotRegistered' }).success,
    ).toBe(false);
    expect(OcrToolOptionsSchema.safeParse({ psm: 14 }).success).toBe(false);
    expect(OcrToolOptionsSchema.safeParse({ unexpected: true }).success).toBe(false);
  });
});

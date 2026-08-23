import { describe, expect, it } from 'vitest';

import {
  base64DataUrlSnippets,
  decodeBase64DataUrl,
  encodeBase64DataUrl,
  isEngineError,
} from '../src/index.js';

describe('Base64 data URL export', () => {
  it.each([
    [[], ''],
    [[0], 'AA=='],
    [[0, 1], 'AAE='],
    [[0, 1, 2], 'AAEC'],
    [[255, 254, 253, 252], '//79/A=='],
  ] as const)('encodes exact bytes without DOM globals: %j', (input, encoded) => {
    expect(encodeBase64DataUrl(Uint8Array.from(input), 'image/png')).toBe(
      `data:image/png;base64,${encoded}`,
    );
  });

  it('handles input large enough to cross internal string chunks', () => {
    const bytes = new Uint8Array(40_000).map((_, index) => index & 255);
    const encoded = encodeBase64DataUrl(bytes);
    expect(encoded.startsWith('data:application/octet-stream;base64,')).toBe(true);
    expect(encoded.length).toBe(37 + 4 * Math.ceil(bytes.length / 3));
  });

  it('round-trips bytes and produces deterministic HTML and CSS snippets', () => {
    const dataUrl = encodeBase64DataUrl(Uint8Array.of(0, 1, 2, 253, 254, 255), 'image/png');
    expect(decodeBase64DataUrl(dataUrl)).toEqual({
      mimeType: 'image/png',
      bytes: Uint8Array.of(0, 1, 2, 253, 254, 255),
    });
    expect(base64DataUrlSnippets(dataUrl)).toEqual({
      html: `<img src="${dataUrl}" alt="">`,
      css: `background-image: url("${dataUrl}");`,
    });
  });

  it.each([
    [() => encodeBase64DataUrl(Uint8Array.of(1, 2), 'image/png', 1), 'dimension-limit'],
    [() => encodeBase64DataUrl(Uint8Array.of(1), 'not a mime'), 'unsupported-format'],
    [() => decodeBase64DataUrl('data:image/png;base64,AA=A'), 'decode-failed'],
    [() => decodeBase64DataUrl('data:image/png;base64,AB=='), 'decode-failed'],
    [() => decodeBase64DataUrl('data:image/png;base64,AAAA', 2), 'dimension-limit'],
  ] as const)('returns a typed remediable error for hostile input', (operation, kind) => {
    try {
      operation();
      throw new Error('Expected the Base64 operation to fail.');
    } catch (error) {
      expect(isEngineError(error)).toBe(true);
      expect(error).toMatchObject({ kind, remedy: expect.any(String) });
    }
  });

  it('rejects invalid programmer byte limits', () => {
    expect(() => encodeBase64DataUrl(Uint8Array.of(), 'image/png', -1)).toThrow('byte limit');
  });
});

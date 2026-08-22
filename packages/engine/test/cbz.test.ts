import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { decodeCbz, decodeWithTypedErrors, encodeCbz, isEngineError } from '../src/index.js';

describe('CBZ codec', () => {
  it('round-trips pages in natural filename order', () => {
    const encoded = encodeCbz([
      { name: 'page10.png', bytes: new Uint8Array([10]) },
      { name: 'page2.jpg', bytes: new Uint8Array([2]) },
      { name: 'page1.webp', bytes: new Uint8Array([1]) },
    ]);
    expect(decodeCbz(encoded)).toEqual([
      { name: 'page1.webp', bytes: new Uint8Array([1]) },
      { name: 'page2.jpg', bytes: new Uint8Array([2]) },
      { name: 'page10.png', bytes: new Uint8Array([10]) },
    ]);
  });

  it('rejects traversal paths and archives without image pages', () => {
    expect(() => decodeCbz(zipSync({ '../page.png': new Uint8Array([1]) }))).toThrow(
      'unsafe traversal',
    );
    expect(() => decodeCbz(zipSync({ 'notes.txt': new Uint8Array([1]) }))).toThrow(
      'no supported image',
    );
    expect(() => encodeCbz([{ name: '../page.png', bytes: new Uint8Array([1]) }])).toThrow(
      'unsafe',
    );
  });

  it('normalizes malformed archives into a typed remediable error', async () => {
    try {
      await decodeWithTypedErrors('cbz', () => decodeCbz(new Uint8Array([0x50, 0x4b, 0, 0])));
      throw new Error('CBZ unexpectedly decoded.');
    } catch (error) {
      expect(isEngineError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: 'decode-failed',
        format: 'cbz',
        remedy: expect.any(String),
      });
    }
  });
});

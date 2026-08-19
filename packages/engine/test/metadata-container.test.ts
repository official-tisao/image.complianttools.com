import { describe, expect, it } from 'vitest';

import { readContainerMetadata, stripPngMetadata } from '../src/index.js';

function pngChunk(type: string, data: readonly number[]): number[] {
  const length = data.length;
  return [
    length >>> 24,
    length >>> 16,
    length >>> 8,
    length,
    ...[...type].map((value) => value.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

const png = new Uint8Array([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  ...pngChunk(
    'tEXt',
    [...'Author\0Ada'].map((value) => value.charCodeAt(0)),
  ),
  ...pngChunk('IDAT', [1, 2, 3]),
  ...pngChunk('IEND', []),
]);

describe('container metadata', () => {
  it('reads PNG text and strips metadata without touching image chunks', () => {
    expect(readContainerMetadata(png)).toEqual({
      format: 'png',
      tags: [{ namespace: 'PNG', name: 'Author', value: 'Ada' }],
    });
    const stripped = stripPngMetadata(png);
    expect(readContainerMetadata(stripped)).toEqual({ format: 'png', tags: [] });
    expect([...stripped]).toContain(73);
  });

  it('reads GIF comment extensions and rejects malformed containers', () => {
    const gif = new Uint8Array([
      ...new TextEncoder().encode('GIF89a'),
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0x21,
      0xfe,
      2,
      79,
      75,
      0,
      0x3b,
    ]);
    expect(readContainerMetadata(gif).tags).toEqual([
      { namespace: 'GIF', name: 'comment', value: 'OK' },
    ]);
    expect(() => readContainerMetadata(new Uint8Array([0]))).toThrow('GIF metadata');
  });
});

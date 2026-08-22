import { describe, expect, it } from 'vitest';

import { decodeDxfToSvg, decodeWithTypedErrors } from '../src/index.js';

const drawing = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
1
20
2
11
11
21
7
0
CIRCLE
8
0
10
5
20
5
40
2
0
TEXT
8
0
10
0
20
0
40
1
1
unsupported
0
ENDSEC
0
EOF
`;

describe('DXF document adapter', () => {
  it('renders supported 2D entities and reports skipped records', () => {
    const decoded = decodeDxfToSvg(drawing);
    expect(decoded.width).toBe(10);
    expect(decoded.height).toBe(5);
    expect(decoded.svg).toContain('<path d="M1 2 L11 7"');
    expect(decoded.svg).toContain('<circle cx="5" cy="5" r="2"');
    expect(decoded.warnings).toEqual(['Skipped 1 unsupported TEXT entity.']);
  });

  it('accepts byte input and produces deterministic SVG', () => {
    expect(decodeDxfToSvg(new TextEncoder().encode(drawing))).toEqual(decodeDxfToSvg(drawing));
  });

  it('returns typed errors when no entity can be rendered', async () => {
    const unsupported = drawing.replace(/0\nLINE[\s\S]*?0\nCIRCLE[\s\S]*?0\nTEXT/u, '0\nTEXT');
    await expect(
      decodeWithTypedErrors('dxf', () => decodeDxfToSvg(unsupported)),
    ).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'dxf',
      remedy: expect.any(String),
    });
  });

  it('rejects empty and overlarge sources before parsing', () => {
    expect(() => decodeDxfToSvg('')).toThrow('empty');
    expect(() => decodeDxfToSvg(' '.repeat(25_000_001))).toThrow('25 MB');
  });
});

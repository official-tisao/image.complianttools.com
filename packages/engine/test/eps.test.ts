import { describe, expect, it } from 'vitest';

import { decodeEps, decodeWithTypedErrors } from '../src/index.js';

describe('bounded EPS decoder', () => {
  it('prefers a TIFF preview from the EPSF binary header', () => {
    const bytes = new Uint8Array(40);
    bytes.set([0xc5, 0xd0, 0xd3, 0xc6]);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, 30, true);
    view.setUint32(8, 4, true);
    view.setUint32(20, 34, true);
    view.setUint32(24, 6, true);
    bytes.set([0x49, 0x49, 42, 0, 8, 0], 34);
    expect(decodeEps(bytes)).toEqual({
      kind: 'preview',
      mimeType: 'image/tiff',
      bytes: new Uint8Array([0x49, 0x49, 42, 0, 8, 0]),
    });
  });

  it('converts the documented path and transform subset to bounded SVG', () => {
    const eps = new TextEncoder().encode(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 50
1 0 0 setrgbcolor 2 setlinewidth
10 10 translate newpath 0 0 moveto 20 0 lineto 20 20 lineto closepath stroke
showpage
%%EOF`);
    const decoded = decodeEps(eps);
    expect(decoded).toMatchObject({ kind: 'svg', width: 100, height: 50 });
    if (decoded.kind === 'svg') {
      expect(decoded.svg).toContain('stroke="rgb(255 0 0)"');
      expect(decoded.svg).toContain('d="M10 40 L30 40 L30 20 Z"');
    }
  });

  it('refuses unsupported operators instead of returning a partial render', async () => {
    const eps = new TextEncoder().encode(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 10 10
/Helvetica findfont 8 scalefont setfont 1 1 moveto (text) show`);
    await expect(decodeWithTypedErrors('eps', () => decodeEps(eps))).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'eps',
      detail: expect.stringContaining('outside the supported path subset'),
      remedy: expect.any(String),
    });
  });

  it('rejects hostile preview offsets and bounding boxes', () => {
    const binary = new Uint8Array(30);
    binary.set([0xc5, 0xd0, 0xd3, 0xc6]);
    const view = new DataView(binary.buffer);
    view.setUint32(20, 0xfffffff0, true);
    view.setUint32(24, 32, true);
    expect(() => decodeEps(binary)).toThrow('outside the file');
    expect(() =>
      decodeEps(
        new TextEncoder().encode(
          '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1000000 1000000\nshowpage',
        ),
      ),
    ).toThrow('safe render limit');
  });
});

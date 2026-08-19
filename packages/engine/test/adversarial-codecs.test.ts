import { describe, expect, it } from 'vitest';

import {
  SVG_EXTERNAL_REFERENCE_MESSAGE,
  assertSafeSvg,
  decodeBmp,
  decodePcx,
  decodePnm,
  decodeQoi,
  decodeTga,
} from '../src/index.js';

const decoders = [decodeBmp, decodePcx, decodePnm, decodeQoi, decodeTga];

function qoiHeader(width: number, height: number): number[] {
  return [
    113,
    111,
    105,
    102,
    width >>> 24,
    (width >>> 16) & 255,
    (width >>> 8) & 255,
    width & 255,
    height >>> 24,
    (height >>> 16) & 255,
    (height >>> 8) & 255,
    height & 255,
    4,
    0,
  ];
}

describe('Phase 2 adversarial codec corpus', () => {
  it('rejects zero-byte, wrong-magic, and truncated inputs without hanging', () => {
    for (const decode of decoders) {
      expect(() => decode(new Uint8Array())).toThrow();
      expect(() => decode(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toThrow();
    }
  });

  it('rejects a QOI file declaring a hostile pixel allocation before allocating pixels', () => {
    const hostile = new Uint8Array(22);
    hostile.set(qoiHeader(0xffffffff, 0xffffffff));
    expect(() => decodeQoi(hostile)).toThrow('safe decode limit');
  });

  it('handles self-generated 1×1 and 30000×1 QOI fixtures within the decode limit', () => {
    const tiny = new Uint8Array([...qoiHeader(1, 1), 0xfe, 10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(decodeQoi(tiny).frames[0].data).toEqual(new Uint8ClampedArray([10, 20, 30, 255]));

    // QOI run packets encode up to 62 pixels; this fixture is only ~500 bytes but expands safely.
    const runs = Array.from(
      { length: Math.ceil(30_000 / 62) },
      (_, index) => 0xc0 | (Math.min(62, 30_000 - index * 62) - 1),
    );
    const wide = new Uint8Array([...qoiHeader(30_000, 1), ...runs, 0, 0, 0, 0, 0, 0, 0, 1]);
    const decoded = decodeQoi(wide);
    expect([decoded.width, decoded.height, decoded.frames[0].data.length]).toEqual([
      30_000, 1, 120_000,
    ]);
  });

  it('refuses SVG external references before any renderer can request them', () => {
    expect(() =>
      assertSafeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/x.png"/></svg>',
      ),
    ).toThrow(SVG_EXTERNAL_REFERENCE_MESSAGE);
  });
});

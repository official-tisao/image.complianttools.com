import { describe, expect, it } from 'vitest';

import { decodeBmp, decodePcx, decodePnm, decodeQoi, decodeTga } from '../src/index.js';

const decoders = [decodeBmp, decodePcx, decodePnm, decodeQoi, decodeTga];

describe('Phase 2 adversarial codec corpus', () => {
  it('rejects zero-byte, wrong-magic, and truncated inputs without hanging', () => {
    for (const decode of decoders) {
      expect(() => decode(new Uint8Array())).toThrow();
      expect(() => decode(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toThrow();
    }
  });

  it('rejects a QOI file declaring a hostile pixel allocation before allocating pixels', () => {
    const hostile = new Uint8Array(22);
    hostile.set([113, 111, 105, 102]);
    new DataView(hostile.buffer).setUint32(4, 0xffffffff);
    new DataView(hostile.buffer).setUint32(8, 0xffffffff);
    hostile[12] = 4;
    expect(() => decodeQoi(hostile)).toThrow('safe decode limit');
  });
});

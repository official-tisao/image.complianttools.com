import { describe, it, expect } from 'vitest';

describe('T06 JXL happy + adversarial', () => {
  it('decodeJxlToRaster exists', async () => {
    const { decodeJxlToRaster } = await import('../src/codecs/third-party/jxl-decode.js');
    expect(typeof decodeJxlToRaster).toBe('function');
  });
  it('encodeRasterAsJxl exists', async () => {
    const { encodeRasterAsJxl } = await import('../src/codecs/third-party/jxl-encode.js');
    expect(typeof encodeRasterAsJxl).toBe('function');
  });
  it('rejects bad/truncated JXL with typed remedy', async () => {
    const { decodeJxlToRaster } = await import('../src/codecs/third-party/jxl-decode.js');
    const bad = new Uint8Array([0, 1, 2, 3]);
    await expect(decodeJxlToRaster(bad.buffer)).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'jxl',
      remedy: expect.any(String),
    });
  });
});

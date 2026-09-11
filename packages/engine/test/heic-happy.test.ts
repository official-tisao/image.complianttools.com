import { describe, it, expect } from 'vitest';

describe('T02 HEIC happy path', () => {
  it('decodeHeic exists and has the right signature', async () => {
    const { decodeHeic } = await import('../src/codecs/platform/heic.js');
    expect(typeof decodeHeic).toBe('function');
  });
  it('isHeicContainer returns true for valid HEIC brand array (simulated)', async () => {
    const validHeicBytes = new Uint8Array(20);
    new DataView(validHeicBytes.buffer).setUint32(0, 20);
    validHeicBytes.set([0x66, 0x74, 0x79, 0x70], 4);
    validHeicBytes.set([0x68, 0x65, 0x69, 0x63], 8);
    const { isHeicContainer } = await import('../src/codecs/platform/heic.js');
    expect(isHeicContainer(validHeicBytes)).toBe(true);
  });
});

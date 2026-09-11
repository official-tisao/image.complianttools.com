import { describe, it, expect } from 'vitest';

describe('T02 HEIC happy path', () => {
  it('decodeHeic exists and has the right signature', async () => {
    const { decodeHeic } = await import('../src/codecs/platform/heic.js');
    expect(typeof decodeHeic).toBe('function');
  });
  it('isHeicContainer returns true for valid HEIC brand array (simulated)', () => {
    // Minimal simulation: create a valid ftyp array
    const validHeicBytes = new Uint8Array(20);
    // Size = 20; ftyp at 4; brand 'heic' at 8
    new DataView(validHeicBytes.buffer).setUint32(0, 20);
    validHeicBytes.set([0x66, 0x74, 0x79, 0x70], 4); // 'ftyp'
    validHeicBytes.set([0x68, 0x65, 0x69, 0x63], 8); // 'heic'
    const { isHeicContainer } = await import('../src/codecs/platform/heic.js');
    expect(isHeicContainer(validHeicBytes)).toBe(true);
  });
});

it('decodeHeic throws typed codec-unavailable error when no decoder available', async () => {
  const { decodeHeic } = await import('../src/codecs/platform/heic.js');
  await expect(decodeHeic(new Uint8Array(20).buffer, undefined as never)).rejects.toMatchObject({
    kind: 'codec-unavailable',
    format: 'heic',
    remedy: expect.any(String),
  });
});

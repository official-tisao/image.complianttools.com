import { describe, expect, it } from 'vitest';

import {
  decodeBmp,
  decodeFailed,
  decodeWithTypedErrors,
  encodeRaster,
  isEngineError,
} from '../src/index.js';

describe('typed codec error boundary', () => {
  it('normalizes malformed decoder failures with a remedy', async () => {
    await expect(
      decodeWithTypedErrors('bmp', () => decodeBmp(new Uint8Array())),
    ).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'bmp',
      remedy: expect.stringContaining('BMP'),
    });
  });

  it('preserves an existing EngineError', () => {
    const original = decodeFailed('qoi', new Error('bad stream'));
    expect(decodeFailed('qoi', original)).toBe(original);
    expect(isEngineError(original)).toBe(true);
  });

  it('reports unavailable encoders as typed remediable failures', async () => {
    const image = {
      width: 1,
      height: 1,
      frames: [{ data: new Uint8ClampedArray([0, 0, 0, 255]), durationMs: 0 }],
    };
    await expect(encodeRaster(image, 'gif')).rejects.toMatchObject({
      kind: 'codec-unavailable',
      format: 'gif',
      remedy: expect.any(String),
    });
  });
});

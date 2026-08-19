import { describe, expect, it } from 'vitest';
import { createRaster, decodeGif, encodeGif } from '../src/index.js';

describe('GIF encoder', () => {
  it('encodes an animated GIF that decodes to its original frame count', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    const animated = {
      ...image,
      frames: [image.frames[0], { data: image.frames[0].data.slice(), durationMs: 40 }],
    } as typeof image;
    expect(decodeGif(encodeGif(animated)).frames).toHaveLength(2);
  });
});

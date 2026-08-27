import { describe, it } from 'vitest';

import { createRaster, decodeBmp, encodeBmp } from '../src/index.js';
import { expectSimpleCodecRejects, expectSimpleCodecRoundTrip } from './fixtures/simple-codec.js';

describe('P2 BMP codec', () => {
  it('round-trips an RGBA raster', () => {
    const image = createRaster(2, 1, Uint8ClampedArray.from([255, 0, 4, 128, 3, 5, 7, 255]));
    expectSimpleCodecRoundTrip(image, encodeBmp, decodeBmp);
  });

  it('rejects invalid headers', () => {
    expectSimpleCodecRejects(decodeBmp, [new Uint8Array(), new Uint8Array(54)]);
  });
});

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createRaster,
  encodeBmp,
  encodeCbz,
  encodeCur,
  encodeDds,
  encodeFits,
  encodeGif,
  encodeHdr,
  encodeIco,
  encodePam,
  encodePcx,
  encodePfm,
  encodePpm,
  encodeQoi,
  encodeSgi,
  encodeSunRaster,
  encodeTga,
  encodeTiff,
  encodeWbmp,
  encodeXbm,
  encodeXpm,
  vectorizeRaster,
} from '../src/index.js';

const image = createRaster(
  3,
  2,
  Uint8ClampedArray.of(
    255,
    0,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
    0,
    255,
    255,
    255,
    255,
    0,
    255,
    30,
    60,
    90,
    255,
    200,
    100,
    50,
    255,
  ),
);

const expected = {
  bmp: 'a1e7d5f4638838b3f465479ac6ceb057142eae496d739645293422963e45cd89',
  cbz: 'f59e0a717f10d395790a2b02f2a7d35c031e04f5eb75551faf6d728608c68384',
  cur: '328211096892920d396f50213819b6a3dfb7e847010b0ec45b8f6325e5bdec0f',
  ddsBc1: '47c082f0f8b57a6afb8f32b737be5668ac2e13926b70bb5294c2d89c3b5bf485',
  ddsBc2: '78fe93aabda7a0dde53978d5450c4fb6428bed6b64b06f00e3fbd6ab82323a2d',
  ddsBc3: '71f1ba1bffd1781c9d4b9644541ca6fd9980ce2361f3c156f857a26d7061aa5f',
  ddsBc4: '152c30532bf29f069737cf228ae4730a8da262fcc86ad155945473a2c20ce463',
  ddsBc5: 'a6b36e059883804de6c86887e753d386705cee646b899aaa03c7ce488950462a',
  fits: 'b9925aa7d2d0ce6535f0c5e3e88a0e0e6a813eab0e4709afc450a2e2d12195f5',
  gif: 'f45751ac9e0aaf03cc01b481185d7e9f876269c93cd8301a1a9bdf671fd152b6',
  hdr: 'ffd8f309768a2eab04f2a592c3fa8d882f1bad7132b97d359104941e587c9110',
  ico: 'dcf46b4bb53302bb7c498fbaa4204f1586a3e5ea747835108cf8373f0b8edccf',
  pam: 'b27778f39cc8fdbca7f356ff5c3b87dfb3015c16f01bb606e48f9736b55f138f',
  pcx: 'dea3fdd6f37f3d597622cd7730ef2807c027f65284ecabab523ccc7dc1c68464',
  pfm: '67c0dc8649899ebbda4dfa7e234e594668144374d764114c00421d17d7fdfc00',
  ppm: '5ebdfa1537de8802fbac84db12761fe29d390543d9491a52907fb171d13538a4',
  qoi: 'bbd97e9d5619a0bb7977f73288da8d9a919ed6d6938882c77201bb4204eaec07',
  sgi: '6369695856400b2f418d316ce91f071f6d31014f412ea2b1cb0900d1919347f6',
  sun: '514fec536ca12fe1e5437cc4b1cf6bcc0bb8ff64b916f359590e7e5f522bc2b3',
  tga: '88d77e75b2e3bdaab3ca7010d0018d74b11ff22be48a57cb01d34ce47fb6bec5',
  tiff: '4654570a24b10bb0e7366989475286e5aaab404a98f2f0e1f89c95945c851d6f',
  wbmp: 'b5028eca49ce7b24890a8906657f17755a8b2159c34242c5af621f4ec4c0193b',
  svg: '70ebf3ae7462a5be19b6c1b3d655c239be3b0be0fe0e6248a37e241ace840078',
  xbm: '8adedc4767aa33ebbfb004c6d59c71d3606a1ede41f84acc0769005854bf8b95',
  xpm: 'ef2c1cf5306530d663af960db97e94e3ee877c13eb15d75c1740a240ffec1083',
} as const;

function digest(bytes: ArrayBuffer | Uint8Array): string {
  return createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
}

describe('deterministic encoder goldens', () => {
  it('pins every synchronous raster and archive encode path', () => {
    const actual: Record<keyof typeof expected, string> = {
      bmp: digest(encodeBmp(image)),
      cbz: digest(
        encodeCbz([
          { name: '001.png', bytes: Uint8Array.of(1, 2, 3) },
          { name: '002.jpg', bytes: Uint8Array.of(4, 5) },
        ]),
      ),
      cur: digest(encodeCur(image, { x: 2, y: 1 })),
      ddsBc1: digest(encodeDds(image, 'bc1')),
      ddsBc2: digest(encodeDds(image, 'bc2')),
      ddsBc3: digest(encodeDds(image, 'bc3')),
      ddsBc4: digest(encodeDds(image, 'bc4')),
      ddsBc5: digest(encodeDds(image, 'bc5')),
      fits: digest(encodeFits(image)),
      gif: digest(encodeGif(image)),
      hdr: digest(encodeHdr(image)),
      ico: digest(encodeIco(image)),
      pam: digest(encodePam(image)),
      pcx: digest(encodePcx(image)),
      pfm: digest(encodePfm(image)),
      ppm: digest(encodePpm(image)),
      qoi: digest(encodeQoi(image)),
      sgi: digest(encodeSgi(image)),
      sun: digest(encodeSunRaster(image)),
      tga: digest(encodeTga(image)),
      tiff: digest(encodeTiff(image)),
      wbmp: digest(encodeWbmp(image)),
      svg: createHash('sha256')
        .update(vectorizeRaster(image, { colors: 4 }))
        .digest('hex'),
      xbm: digest(encodeXbm(image, 'golden')),
      xpm: digest(encodeXpm(image, 'golden')),
    };
    expect(actual).toEqual(expected);
  });
});

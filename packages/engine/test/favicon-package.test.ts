import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  createFaviconPackage,
  createRaster,
  encodeMultiIco,
  FAVICON_ICO_SIZES,
} from '../src/index.js';

const source = createRaster(
  2,
  2,
  Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255),
);

const fakePngEncoder = async (image: { width: number; height: number }) =>
  Uint8Array.of(137, 80, 78, 71, image.width >>> 8, image.width & 255).buffer;

describe('favicon package', () => {
  it('writes an ordered four-resolution ICO directory', () => {
    const images = [...FAVICON_ICO_SIZES]
      .reverse()
      .map((size) => createRaster(size, size, new Uint8ClampedArray(size * size * 4)));
    const bytes = new Uint8Array(encodeMultiIco(images));
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(4, true)).toBe(4);
    expect([bytes[6], bytes[22], bytes[38], bytes[54]]).toEqual([16, 32, 48, 0]);
    for (let index = 0; index < 4; index += 1) {
      const entry = 6 + index * 16;
      expect(view.getUint16(entry + 6, true)).toBe(32);
      expect(view.getUint32(entry + 12, true)).toBeGreaterThanOrEqual(70);
    }
  });

  it('builds a deterministic ICO, PNG set, manifest, and HTML snippet archive', async () => {
    const first = await createFaviconPackage(source, 'Example Site', fakePngEncoder);
    const second = await createFaviconPackage(source, 'Example Site', fakePngEncoder);
    expect(new Uint8Array(second.archive)).toEqual(new Uint8Array(first.archive));
    expect(first.fileNames).toEqual([
      'android-chrome-192x192.png',
      'android-chrome-512x512.png',
      'apple-touch-icon.png',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'favicon.html',
      'favicon.ico',
      'site.webmanifest',
    ]);
    const archive = unzipSync(new Uint8Array(first.archive));
    expect(new DataView(archive['favicon.ico']!.buffer).getUint16(4, true)).toBe(4);
    expect(new TextDecoder().decode(archive['site.webmanifest'])).toBe(first.manifest);
    expect(JSON.parse(first.manifest)).toMatchObject({
      name: 'Example Site',
      icons: [
        { sizes: '192x192', type: 'image/png' },
        { sizes: '512x512', type: 'image/png' },
      ],
    });
    expect(first.html).toContain('rel="apple-touch-icon"');
    expect(first.html).toContain('rel="manifest"');
  });

  it('rejects invalid source geometry, names, and ICO size sets', async () => {
    await expect(createFaviconPackage(createRaster(2, 1), 'Site', fakePngEncoder)).rejects.toThrow(
      'square',
    );
    await expect(createFaviconPackage(source, ' ', fakePngEncoder)).rejects.toThrow('site name');
    expect(() => encodeMultiIco([createRaster(16, 16), createRaster(16, 16)])).toThrow('distinct');
  });
});

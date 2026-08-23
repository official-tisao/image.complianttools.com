import { expect, test } from '@playwright/test';
import { encodeGif, type RasterImage } from '../packages/engine/src/index.js';

function animatedGifFixture(): Uint8Array {
  const width = 32;
  const height = 32;
  const red = new Uint8ClampedArray(width * height * 4);
  const blue = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    red.set([239, 24, 8, 255], index * 4);
    blue.set([12, 48, 230, 255], index * 4);
  }
  const image: RasterImage = {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [
      { data: red, durationMs: 120 },
      { data: blue, durationMs: 180 },
    ],
  };
  return encodeGif(image);
}

for (const format of ['webm', 'mp4'] as const) {
  test(`converts an animated GIF to a playable ${format.toUpperCase()} locally`, async ({
    page,
  }) => {
    const crossOrigin: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
    });
    await page.goto('/gif-splitter');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Output').selectOption(format);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles({
      name: 'two-frames.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(animatedGifFixture()),
    });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`two-frames.${format}`);
    await expect(page.getByRole('status')).toContainText(
      `Converted 2 GIF frames to ${format.toUpperCase()} locally.`,
    );

    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'webm')
      expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    else expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');

    const playback = await page.evaluate(
      async ({ contents, mimeType }) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(new Blob([new Uint8Array(contents)], { type: mimeType }));
        video.src = url;
        try {
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Browser rejected the exported video.'));
          });
          return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      {
        contents: [...bytes],
        mimeType: format === 'mp4' ? 'video/mp4' : 'video/webm',
      },
    );
    expect(playback.duration).toBeGreaterThanOrEqual(0.29);
    expect(playback.width).toBe(32);
    expect(playback.height).toBe(32);
    expect(crossOrigin).toEqual([]);
  });
}

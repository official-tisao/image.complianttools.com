import { expect, test } from '@playwright/test';
import {
  encodeGif,
  inspectImageContainer,
  type RasterImage,
} from '../packages/engine/src/index.js';

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

for (const format of ['webp', 'webm', 'mp4'] as const) {
  test(`converts an animated GIF to a playable ${format.toUpperCase()} locally`, async ({
    page,
  }) => {
    const crossOrigin: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
    });
    await page.goto('/gif-converter');
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
      format === 'webp'
        ? 'Converted 2 GIF frames to animated WebP locally.'
        : `Converted 2 GIF frames to ${format.toUpperCase()} locally.`,
    );
    await page.getByRole('button', { name: 'Pause preview' }).click();
    const preview = await page
      .locator('canvas[aria-label="Decoded GIF animation preview"]')
      .evaluate((canvas) => {
        const context = (canvas as HTMLCanvasElement).getContext('2d');
        if (!context) throw new Error('Preview canvas has no 2D context.');
        return {
          frameIndex: Number((canvas as HTMLCanvasElement).dataset.frameIndex),
          pixel: [...context.getImageData(0, 0, 1, 1).data],
        };
      });

    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'webm')
      expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    else if (format === 'mp4') expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    else {
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(inspectImageContainer(bytes)).toMatchObject({
        format: 'webp',
        width: 32,
        height: 32,
        animated: true,
        frameCount: 2,
      });
    }

    const playback = await page.evaluate(
      async ({ contents, mimeType }) => {
        if (mimeType === 'image/webp') {
          if (typeof ImageDecoder === 'undefined')
            throw new Error('Browser has no ImageDecoder for animated WebP verification.');
          const decoder = new ImageDecoder({ data: new Uint8Array(contents), type: mimeType });
          await decoder.tracks.ready;
          const track = decoder.tracks.selectedTrack;
          if (!track) throw new Error('Animated WebP has no selected image track.');
          const first = await decoder.decode({ frameIndex: 0 });
          const second = await decoder.decode({ frameIndex: 1 });
          const canvas = document.createElement('canvas');
          canvas.width = first.image.displayWidth;
          canvas.height = first.image.displayHeight;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D is unavailable.');
          context.drawImage(first.image, 0, 0);
          const firstPixel = [...context.getImageData(0, 0, 1, 1).data];
          context.drawImage(second.image, 0, 0);
          const secondPixel = [...context.getImageData(0, 0, 1, 1).data];
          first.image.close();
          second.image.close();
          decoder.close();
          return {
            duration: 0.3,
            width: canvas.width,
            height: canvas.height,
            frameCount: track.frameCount,
            firstPixel,
            secondPixel,
          };
        }
        const video = document.createElement('video');
        const url = URL.createObjectURL(new Blob([new Uint8Array(contents)], { type: mimeType }));
        video.src = url;
        try {
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Browser rejected the exported video.'));
          });
          return {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            frameCount: 2,
            firstPixel: [] as number[],
            secondPixel: [] as number[],
          };
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      {
        contents: [...bytes],
        mimeType: format === 'mp4' ? 'video/mp4' : format === 'webm' ? 'video/webm' : 'image/webp',
      },
    );
    expect(playback.duration).toBeGreaterThanOrEqual(0.29);
    expect(playback.width).toBe(32);
    expect(playback.height).toBe(32);
    expect(playback.frameCount).toBe(2);
    if (format === 'webp') {
      expect(playback.firstPixel[0]).toBeGreaterThan(180);
      expect(playback.firstPixel[2]).toBeLessThan(80);
      expect(playback.secondPixel[0]).toBeLessThan(80);
      expect(playback.secondPixel[2]).toBeGreaterThan(180);
      const exportedPixel = preview.frameIndex === 0 ? playback.firstPixel : playback.secondPixel;
      for (let channel = 0; channel < 4; channel += 1)
        expect(Math.abs(preview.pixel[channel]! - exportedPixel[channel]!)).toBeLessThanOrEqual(20);
    }
    expect(crossOrigin).toEqual([]);
  });
}

test('honours reduced motion and keeps preview stepping keyboard-operable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/gif-converter');
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.getByLabel('Choose a GIF').setInputFiles({
    name: 'two-frames.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(animatedGifFixture()),
  });
  await expect(page.getByRole('button', { name: 'Play preview' })).toBeVisible();
  const canvas = page.locator('canvas[aria-label="Decoded GIF animation preview"]');
  await expect(canvas).toHaveAttribute('data-frame-index', '0');
  await page.getByRole('button', { name: 'Next frame' }).focus();
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-frame-index', '1');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Pause preview' })).toBeVisible();
});

test('exports every GIF frame as an exact PNG download', async ({ page }) => {
  await page.goto('/gif-converter');
  await page.waitForLoadState('networkidle');
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-frames.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(animatedGifFixture()),
  });
  await expect(page.getByRole('status')).toContainText('Exported 2 GIF frames locally.');
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.map((download) => download.suggestedFilename())).toEqual([
    'two-frames-frame-001.png',
    'two-frames-frame-002.png',
  ]);
  for (const download of downloads) {
    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(inspectImageContainer(bytes)).toMatchObject({ width: 32, height: 32 });
  }
});

test('converts a GIF to a real two-frame APNG locally', async ({ page, context }) => {
  await page.goto('/gif-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Output').selectOption('apng');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-frames.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(animatedGifFixture()),
  });
  const bytes = Buffer.concat(await (await (await pending).createReadStream()).toArray());
  expect(bytes.includes(Buffer.from('acTL'))).toBe(true);
  expect(inspectImageContainer(bytes)).toMatchObject({
    format: 'png',
    width: 32,
    height: 32,
    animated: true,
    frameCount: 2,
  });
  await context.setOffline(true);
  const offlinePending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'offline-two-frames.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(animatedGifFixture()),
  });
  const offlineBytes = Buffer.concat(
    await (await (await offlinePending).createReadStream()).toArray(),
  );
  expect(inspectImageContainer(offlineBytes)).toMatchObject({ animated: true, frameCount: 2 });
  await context.setOffline(false);
});

test('GIF output control leads to the file picker by keyboard', async ({ page }) => {
  await page.goto('/gif-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Output').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Output')).toHaveValue('apng');
  await expect(page.locator('input[type=file]')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} GIF route exports exact APNG animation with locale layout`, async ({ page }) => {
    await page.goto(`/${locale}/gif-converter`);
    await page.waitForLoadState('networkidle');
    await page.locator('select').selectOption('apng');
    const pending = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.gif`,
      mimeType: 'image/gif',
      buffer: Buffer.from(animatedGifFixture()),
    });
    const bytes = Buffer.concat(await (await (await pending).createReadStream()).toArray());
    expect(inspectImageContainer(bytes)).toMatchObject({
      width: 32,
      height: 32,
      animated: true,
      frameCount: 2,
    });
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/gif-converter`,
    );
  });
}

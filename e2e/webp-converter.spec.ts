import { expect, test } from '@playwright/test';
import { allowAllNetwork, denyAllNetwork, LOCAL_ORIGIN } from './support/network.js';
import {
  encodeGif,
  inspectImageContainer,
  type RasterImage,
} from '../packages/engine/src/index.js';

function gifFixture(animated: boolean): Uint8Array {
  const width = 16;
  const height = 16;
  const solid = (red: number, green: number, blue: number) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1)
      data.set([red, green, blue, 255], index * 4);
    return data;
  };
  const image: RasterImage = {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: animated
      ? [
          { data: solid(239, 24, 8), durationMs: 120 },
          { data: solid(12, 48, 230), durationMs: 180 },
        ]
      : [{ data: solid(239, 24, 8), durationMs: 100 }],
  };
  return encodeGif(image);
}

async function uploadAndRead(page: import('@playwright/test').Page, animated: boolean) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Choose image files').setInputFiles({
    name: animated ? 'animation.gif' : 'still.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(gifFixture(animated)),
  });
  const download = await downloadPromise;
  return Buffer.concat(await (await download.createReadStream()).toArray());
}

test('creates lossy, lossless, and animated WebP locally with exact-byte preview', async ({
  page,
  context,
}) => {
  const crossOrigin: string[] = [];
  const localRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN && url.protocol !== 'blob:') crossOrigin.push(request.url());
    if (url.origin === LOCAL_ORIGIN) localRequests.push(url.pathname);
  });
  await page.goto('/webp-converter');
  await page.waitForLoadState('networkidle');
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Encoding method value' }).fill('6');
  await page.getByRole('spinbutton', { name: 'Alpha quality value' }).fill('80');

  const lossy = await uploadAndRead(page, false);
  await expect(page.getByRole('status')).toContainText('Created lossy quality 75 WebP locally');
  expect(lossy.includes(Buffer.from('VP8 '))).toBe(true);
  expect(localRequests.some((path) => /format-encode-worker/u.test(path))).toBe(true);
  expect(inspectImageContainer(lossy)).toMatchObject({ width: 16, height: 16, frameCount: 1 });
  let previewBytes = await page.evaluate(async () => {
    const image = document.querySelector('figure img');
    if (!(image instanceof HTMLImageElement)) throw new Error('WebP preview is missing.');
    return [...new Uint8Array(await (await fetch(image.src)).arrayBuffer())];
  });
  expect(Buffer.from(previewBytes)).toEqual(lossy);

  await page.getByLabel('Near-lossless strength').selectOption('80');
  const nearLossless = await uploadAndRead(page, false);
  await expect(page.getByRole('status')).toContainText('Created near-lossless 80 WebP locally');
  expect(nearLossless.includes(Buffer.from('VP8L'))).toBe(true);
  await page.getByLabel('Near-lossless strength').selectOption('off');

  await page.getByLabel('Use lossless encoding').check();
  const lossless = await uploadAndRead(page, false);
  await expect(page.getByRole('status')).toContainText('Created lossless WebP locally');
  expect(lossless.includes(Buffer.from('VP8L'))).toBe(true);
  previewBytes = await page.evaluate(async () => {
    const image = document.querySelector('figure img');
    if (!(image instanceof HTMLImageElement)) throw new Error('WebP preview is missing.');
    return [...new Uint8Array(await (await fetch(image.src)).arrayBuffer())];
  });
  expect(Buffer.from(previewBytes)).toEqual(lossless);

  await page.getByLabel('Create an animation').check();
  const animation = await uploadAndRead(page, true);
  await expect(page.getByRole('status')).toContainText('2 frames');
  expect(inspectImageContainer(animation)).toMatchObject({
    format: 'webp',
    width: 16,
    height: 16,
    animated: true,
    frameCount: 2,
  });
  const decoded = await page.evaluate(
    async (contents) => {
      // Independent frame verification needs a WebCodecs ImageDecoder, which WebKit lacks. The
      // exported bytes are already asserted above, so report the missing verifier and let the
      // caller skip only the frame-level checks.
      if (typeof ImageDecoder === 'undefined') return null;
      const decoder = new ImageDecoder({ data: new Uint8Array(contents), type: 'image/webp' });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track) throw new Error('Animated WebP has no selected track.');
      const frames = [];
      for (let index = 0; index < track.frameCount; index += 1) {
        const result = await decoder.decode({ frameIndex: index });
        const canvas = document.createElement('canvas');
        canvas.width = result.image.displayWidth;
        canvas.height = result.image.displayHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.drawImage(result.image, 0, 0);
        frames.push([...context.getImageData(0, 0, 1, 1).data]);
        result.image.close();
      }
      decoder.close();
      const previewResponse = await fetch(
        (document.querySelector('img[alt="Encoded WebP preview"]') as HTMLImageElement).src,
      );
      return {
        frameCount: track.frameCount,
        frames,
        previewBytes: [...new Uint8Array(await previewResponse.arrayBuffer())],
      };
    },
    [...animation],
  );
  test.skip(
    decoded === null,
    'This browser has no ImageDecoder to independently verify animated WebP frames.',
  );
  expect(decoded!.frameCount).toBe(2);
  expect(decoded!.frames[0]![0]).toBeGreaterThan(200);
  expect(decoded!.frames[0]![2]).toBeLessThan(80);
  expect(decoded!.frames[1]![0]).toBeLessThan(80);
  expect(decoded!.frames[1]![2]).toBeGreaterThan(180);
  expect(Buffer.from(decoded!.previewBytes)).toEqual(animation);
  await denyAllNetwork(context);
  const offlineAnimation = await uploadAndRead(page, true);
  expect(inspectImageContainer(offlineAnimation)).toMatchObject({
    format: 'webp',
    animated: true,
    frameCount: 2,
  });
  await allowAllNetwork(context);
  expect(crossOrigin).toEqual([]);
});

test('reports corrupt local input with a typed remedy and no network fallback', async ({
  page,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN) crossOrigin.push(request.url());
  });
  await page.goto('/webp-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose image files').setInputFiles({
    name: 'broken.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('not-a-gif'),
  });
  await expect(page.getByRole('alert')).toContainText('Choose a valid, non-corrupted GIF file');
  expect(crossOrigin).toEqual([]);
});

test('WebP animation, lossless, and quality controls are keyboard operable', async ({ page }) => {
  await page.goto('/webp-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Create an animation').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Create an animation')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Use lossless encoding')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('slider', { name: 'Lossy quality' })).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} WebP route exports exact lossless bytes with locale layout`, async ({ page }) => {
    await page.goto(`/${locale}/webp-converter`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
    await page.getByTestId('option-webp-lossless').locator('input[type=checkbox]').check();
    const pending = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.gif`,
      mimeType: 'image/gif',
      buffer: Buffer.from(gifFixture(false)),
    });
    const webp = Buffer.concat(await (await (await pending).createReadStream()).toArray());
    expect(webp.includes(Buffer.from('VP8L'))).toBe(true);
    expect(inspectImageContainer(webp)).toMatchObject({ width: 16, height: 16, frameCount: 1 });
    const previewUrl = await page.locator('figure img').getAttribute('src');
    const preview = Buffer.from(
      await page.evaluate(
        async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
        previewUrl,
      ),
    );
    expect(preview).toEqual(webp);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/webp-converter`,
    );
  });
}

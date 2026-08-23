import { expect, test } from '@playwright/test';
import { decodeGif } from '../packages/engine/src/codecs/third-party/gif.js';

test('decodes real browser-recorded WebM pixels and exports them as GIF', async ({ page }) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/video-to-gif');
  await page.waitForLoadState('networkidle');

  const webm = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.fillStyle = '#ef1808';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const stream = canvas.captureStream(10);
    const mimeType = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(
      (candidate) => MediaRecorder.isTypeSupported(candidate),
    );
    if (!mimeType) throw new Error('This browser cannot record a WebM fixture.');
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('Unable to record the WebM fixture.'));
    });
    recorder.start(100);
    (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
    await new Promise((resolve) => setTimeout(resolve, 350));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())];
  });

  expect(webm.length).toBeGreaterThan(100);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'browser-recorded.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(webm),
  });
  const download = await downloadPromise;
  await expect(page.getByRole('status')).toContainText(
    'Extracted the frame at 0.00 seconds locally.',
  );
  const gif = decodeGif(Buffer.concat(await (await download.createReadStream()).toArray()));
  const [red, green, blue, alpha] = gif.frames[0]!.data;
  expect(red).toBeGreaterThan(180);
  expect(green).toBeLessThan(80);
  expect(blue).toBeLessThan(80);
  expect(alpha).toBe(255);
  expect(crossOrigin).toEqual([]);
});

test('video frame tool reports an invalid local container without a network fallback', async ({
  page,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/video-to-gif');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from([0, 1, 2, 3]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(crossOrigin).toEqual([]);
});

test('video frame tool names a documented container that has no permitted local parser', async ({
  page,
}) => {
  await page.goto('/video-to-gif');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.avi',
    mimeType: 'video/x-msvideo',
    buffer: Buffer.from('RIFF-invalid-AVI'),
  });
  await expect(page.getByRole('alert')).toContainText(
    'AVI input is unavailable because the pinned local container reader does not parse this container',
  );
});

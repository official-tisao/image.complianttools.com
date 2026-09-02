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

    // WebKit implements neither HTMLCanvasElement.captureStream nor WebM recording, so it cannot
    // produce the fixture this test needs. Report that as "no recording" and let the test skip,
    // matching how the MP4 case below already handles engines that cannot record.
    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined')
      return null;
    const stream = canvas.captureStream(10);
    const mimeType = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(
      (candidate) => MediaRecorder.isTypeSupported(candidate),
    );
    if (!mimeType) return null;
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
    // `requestFrame()` is a Chromium-only extension to CanvasCaptureMediaStreamTrack. A stream
    // created with an explicit frame rate already emits frames on its own, so we nudge it only
    // where the method exists and otherwise keep repainting the canvas so every engine has real
    // pixel changes to encode.
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const requestFrame =
      typeof track.requestFrame === 'function' ? () => track.requestFrame() : () => {};
    // Firefox's MediaRecorder can take longer than a fixed 350 ms window to emit the first data
    // chunk, so keep repainting until a chunk arrives rather than racing a fixed deadline. 1000 ms
    // is a hard upper bound, not a target: the loop exits as soon as `chunks` is non-empty.
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline && chunks.length === 0) {
      context.fillStyle = '#ef1808';
      context.fillRect(0, 0, canvas.width, canvas.height);
      requestFrame();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())];
  });

  test.skip(
    webm === null || webm.length < 100,
    'This browser cannot record a WebM fixture for real decode proof.',
  );
  expect(webm!.length).toBeGreaterThan(100);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'browser-recorded.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(webm!),
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

test('decodes real browser-recorded MP4 family pixels and exports them as GIF', async ({
  page,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/video-to-gif');
  await page.waitForLoadState('networkidle');

  const recording = await page.evaluate(async () => {
    // WebKit exposes neither MediaRecorder nor canvas.captureStream, so probe before touching them
    // rather than letting a ReferenceError escape as a test failure.
    if (typeof MediaRecorder === 'undefined') return null;
    const mimeType = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'].find(
      (candidate) => MediaRecorder.isTypeSupported(candidate),
    );
    if (!mimeType) return null;
    const canvas = document.createElement('canvas');
    if (typeof canvas.captureStream !== 'function') return null;
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.fillStyle = '#ef1808';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(10);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('Unable to record the MP4 fixture.'));
    });
    recorder.start(100);
    (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
    await new Promise((resolve) => setTimeout(resolve, 350));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())];
  });

  test.skip(
    recording === null,
    'Installed Edge cannot record an MP4 fixture for real decode proof.',
  );
  expect(recording!.length).toBeGreaterThan(100);
  for (const extension of ['mp4', 'm4v', 'mov'] as const) {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles({
      name: `browser-recorded.${extension}`,
      mimeType: extension === 'mov' ? 'video/quicktime' : 'video/mp4',
      buffer: Buffer.from(recording!),
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
  }
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

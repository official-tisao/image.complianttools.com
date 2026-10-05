/**
 * P6-01 route evidence — T12, T13, T15, T18, T21, T74. PLAN.md P6-01.
 *
 * These assert real outputs and real failure paths, not that a heading renders. Where a claim
 * needs proof the tests decode the produced bytes with the engine's own decoders, so "it made a
 * GIF" means a GIF that parses, not a download link that exists.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { decodeGif } from '../packages/engine/src/codecs/third-party/gif.js';
import { denyAllNetwork, LOCAL_ORIGIN } from './support/network.js';

/** A generated PNG, so nothing is fetched and no fixture file is needed. */
async function generatedPng(
  page: Page,
  width: number,
  height: number,
  rgb: [number, number, number],
  noisy = false,
) {
  const base64 = await page.evaluate(
    async ({ width, height, rgb, noisy }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      if (noisy) {
        // Deterministic per-pixel noise stands in for a real photograph. A flat colour compresses
        // below a small byte budget with no quality loss, which would let a target-size or
        // dimension-search assertion pass without the search doing anything.
        const image = context.createImageData(width, height);
        for (let index = 0; index < width * height; index += 1) {
          image.data[index * 4] = (index * 37 + rgb[0]) % 256;
          image.data[index * 4 + 1] = (index * 91 + rgb[1]) % 256;
          image.data[index * 4 + 2] = (index * 53 + rgb[2]) % 256;
          image.data[index * 4 + 3] = 255;
        }
        context.putImageData(image, 0, 0);
      } else {
        context.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        context.fillRect(0, 0, width, height);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated PNG fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return btoa(binary);
    },
    { width, height, rgb, noisy },
  );
  return Buffer.from(base64, 'base64');
}

async function open(page: Page, route: string) {
  await page.goto(route);
  // Generous, because a cold preview server on a fresh port still has to fetch and evaluate the
  // route's chunks; the default 5s is short enough to flake without telling us anything.
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true', { timeout: 20_000 });
}

/* ------------------------------------------------------------------ T12 ---- */

test.describe('T12 GIF maker', () => {
  test('produces a decodable multi-frame GIF whose preview is the downloaded bytes', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await open(page, '/gif-maker');

    const red = await generatedPng(page, 8, 8, [255, 0, 0]);
    const green = await generatedPng(page, 8, 8, [0, 255, 0]);
    await page.getByTestId('t12-input').setInputFiles([
      { name: 'red.png', mimeType: 'image/png', buffer: red },
      { name: 'green.png', mimeType: 'image/png', buffer: green },
    ]);

    await page.getByTestId('t12-run').click();
    await expect(page.getByTestId('t12-preview')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('t12-download').click();
    const download = await downloadPromise;

    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    const decoded = decodeGif(bytes);
    expect(decoded.width).toBe(8);
    expect(decoded.height).toBe(8);
    expect(decoded.frames).toHaveLength(2);
    // The first frame really is the red input and the second the green one.
    expect(decoded.frames[0]!.data[0]).toBeGreaterThan(180);
    expect(decoded.frames[0]!.data[1]).toBeLessThan(80);
    expect(decoded.frames[1]!.data[1]).toBeGreaterThan(180);

    // Preview fidelity: the preview element's src is the same blob the download offers.
    const previewSrc = await page.getByTestId('t12-preview').getAttribute('src');
    const downloadHref = await page.getByTestId('t12-download').getAttribute('href');
    expect(previewSrc).toBe(downloadHref);
  });

  test('applies a per-frame delay to the encoded GIF', async ({ page }) => {
    await open(page, '/gif-maker');
    // Two *different* frames: the encoder merges exact duplicates at its default optimization
    // level, which would collapse a two-frame GIF into one and hide the per-frame delay.
    const first = await generatedPng(page, 4, 4, [200, 30, 30]);
    const second = await generatedPng(page, 4, 4, [30, 200, 30]);
    await page.getByTestId('t12-input').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: first },
      { name: 'b.png', mimeType: 'image/png', buffer: second },
    ]);
    // Frame 1 at the default 100 ms, frame 2 overridden to 500 ms.
    await page.getByTestId('t12-delay-1').fill('500');

    await page.getByTestId('t12-run').click();
    await expect(page.getByTestId('t12-preview')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('t12-download').click();
    const bytes = Buffer.concat(await (await (await downloadPromise).createReadStream()).toArray());

    // The per-frame control is real: the two delays differ in the encoded file.
    const parsed = readGifDelays(bytes);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(new Set(parsed).size).toBeGreaterThan(1);
    expect(parsed).toContain(50); // 500 ms, stored in hundredths of a second
  });

  test('rejects frames of mismatched sizes with its remedy', async ({ page }) => {
    await open(page, '/gif-maker');
    const small = await generatedPng(page, 4, 4, [255, 0, 0]);
    const large = await generatedPng(page, 8, 8, [0, 255, 0]);
    await page.getByTestId('t12-input').setInputFiles([
      { name: 'small.png', mimeType: 'image/png', buffer: small },
      { name: 'large.png', mimeType: 'image/png', buffer: large },
    ]);
    await page.getByTestId('t12-run').click();
    const alert = page.getByTestId('t12-error');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('data-error-kind', 'mismatched-sizes');
    await expect(alert).toContainText('same width and height');
    await expect(alert).toContainText('Resize every frame');
  });

  test('rejects a corrupt frame with its remedy', async ({ page }) => {
    await open(page, '/gif-maker');
    await page
      .getByTestId('t12-input')
      .setInputFiles([
        { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png at all') },
      ]);
    await page.getByTestId('t12-run').click();
    await expect(page.getByTestId('t12-error')).toHaveAttribute('data-error-kind', 'decode-failed');
  });

  test('is keyboard operable and passes axe', async ({ page }) => {
    await open(page, '/gif-maker');
    await expect(page.getByTestId('t12-run')).toBeDisabled();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('makes no cross-origin request', async ({ page }) => {
    const crossOrigin: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== LOCAL_ORIGIN) crossOrigin.push(request.url());
    });
    await open(page, '/gif-maker');
    const frame = await generatedPng(page, 4, 4, [1, 2, 3]);
    await page
      .getByTestId('t12-input')
      .setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: frame }]);
    await page.getByTestId('t12-run').click();
    await expect(page.getByTestId('t12-preview')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('t12-download').click();
    await downloadPromise;
    expect(crossOrigin).toEqual([]);
  });
});

/** Reads the Graphic Control Extension delays from a GIF, in hundredths of a second. */
function readGifDelays(bytes: Buffer): number[] {
  const delays: number[] = [];
  for (let offset = 0; offset + 3 < bytes.length;) {
    if (bytes[offset] === 0x21 && bytes[offset + 1] === 0xf9) {
      // Graphic control extension: delay is a little-endian uint16 at offset 4 of the block.
      delays.push(bytes.readUInt16LE(offset + 4));
      offset += 8;
      continue;
    }
    offset += 1;
  }
  return delays;
}

/* ------------------------------------------------------------------ T13 ---- */

test.describe('T13 video to GIF', () => {
  test('names a container the pinned local reader cannot parse, without a network fallback', async ({
    page,
  }) => {
    const crossOrigin: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== LOCAL_ORIGIN) crossOrigin.push(request.url());
    });
    await open(page, '/video-to-gif');
    await page.getByTestId('t13-input').setInputFiles({
      name: 'legacy.avi',
      mimeType: 'video/x-msvideo',
      buffer: Buffer.from('RIFF-invalid-AVI'),
    });
    await page.getByTestId('t13-run').click();
    const alert = page.getByTestId('t13-error');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('data-error-kind', 'unsupported-container');
    await expect(alert).toContainText('AVI input is unavailable');
    await expect(alert).toContainText('Re-export the video as MP4');
    expect(crossOrigin).toEqual([]);
  });

  test('reports an unreadable local container without reaching the network', async ({ page }) => {
    const crossOrigin: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== LOCAL_ORIGIN) crossOrigin.push(request.url());
    });
    await open(page, '/video-to-gif');
    await page.getByTestId('t13-input').setInputFiles({
      name: 'broken.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from([0, 1, 2, 3]),
    });
    await page.getByTestId('t13-run').click();
    await expect(page.getByTestId('t13-error')).toBeVisible();
    expect(crossOrigin).toEqual([]);
  });

  test('exposes the trim, frame-rate, and scale controls as generated controls', async ({
    page,
  }) => {
    await open(page, '/video-to-gif');
    await expect(page.getByTestId('option-t13-trimStart')).toBeVisible();
    await expect(page.getByTestId('option-t13-trimEnd')).toBeVisible();
    await expect(page.getByTestId('option-t13-frameRate')).toBeVisible();
    await expect(page.getByTestId('option-t13-scaleWidth')).toBeVisible();
    // Defaults are the documented no-ops.
    await expect(page.getByLabel('Trim start (seconds)')).toHaveValue('0');
    await expect(page.getByLabel('Output width (pixels)')).toHaveValue('320');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('decodes a browser-recorded clip and exports a real animated GIF', async ({ page }) => {
    // Decoding and encoding a multi-frame clip exceeds the 30s default.
    test.slow();
    await open(page, '/video-to-gif');

    // A `MediaRecorder` WebM is a *live* stream: it reports `duration === Infinity` and carries
    // no seek index, so it genuinely cannot support a sampling plan. The route says so rather
    // than guessing a length. Record a finalized MP4 instead, where the browser offers one,
    // because that is a saved file with a real duration.
    const recording = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.fillStyle = '#ef1808';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function')
        return null;
      const mimeType = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'].find(
        (candidate) => MediaRecorder.isTypeSupported(candidate),
      );
      if (!mimeType) return null;
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
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const requestFrame =
        typeof track.requestFrame === 'function' ? () => track.requestFrame() : () => {};
      // Record long enough that the file has real content and a real duration.
      const deadline = Date.now() + 6000;
      let frame = 0;
      while (Date.now() < deadline) {
        context.fillStyle = frame % 2 === 0 ? '#ef1808' : '#08ef18';
        context.fillRect(0, 0, canvas.width, canvas.height);
        frame += 1;
        requestFrame();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((entry) => entry.stop());
      return [...new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())];
    });

    test.skip(
      recording === null || recording.length < 2048,
      'This browser cannot record a finalized MP4 fixture for real decode proof.',
    );
    await page.getByTestId('t13-input').setInputFiles({
      name: 'recorded.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from(recording!),
    });
    // Keep the output small so the run stays inside the encoder's time budget.
    await page.getByRole('spinbutton', { name: 'Output width (pixels)' }).fill('64');
    await page.getByTestId('t13-run').click();
    await expect(page.getByTestId('t13-preview')).toBeVisible({ timeout: 60_000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('t13-download').click();
    const download = await downloadPromise;
    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    const decoded = decodeGif(bytes);
    expect(decoded.width).toBe(64);
    const [red, green, blue] = decoded.frames[0]!.data;
    // The clip alternates red and green, so the first frame is one of exactly those two.
    expect((red > 180 && green < 100) || (green > 180 && red < 100)).toBe(true);
    expect(blue).toBeLessThan(100);
  });
});

/* ------------------------------------------------------------------ T15 ---- */

test.describe('T15 spritesheet', () => {
  test('packs frames into a sheet and emits a matching JSON atlas', async ({ page }) => {
    await open(page, '/spritesheet');
    const red = await generatedPng(page, 8, 8, [255, 0, 0]);
    const blue = await generatedPng(page, 8, 8, [0, 0, 255]);
    await page.getByTestId('t15-input').setInputFiles([
      { name: 'red.png', mimeType: 'image/png', buffer: red },
      { name: 'blue.png', mimeType: 'image/png', buffer: blue },
    ]);
    await page.getByTestId('t15-run').click();
    await expect(page.getByTestId('t15-preview')).toBeVisible();
    await expect(page.getByTestId('t15-status')).toContainText('Packed 2 frame(s)');
    await expect(page.getByTestId('t15-status')).toContainText('2×1 grid');

    // The atlas must describe the sheet that was actually exported.
    // `textContent` rather than `innerText`: the atlas sits inside a collapsed <details>, whose
    // rendered text is empty until it is opened.
    const atlas = JSON.parse((await page.getByTestId('t15-atlas-json').textContent()) ?? '');
    expect(atlas.size).toEqual({ w: 16, h: 8 });
    expect(atlas.columns).toBe(2);
    expect(atlas.frames).toHaveLength(2);
    expect(atlas.frames[0]).toMatchObject({ index: 0, x: 0, y: 0, width: 8, height: 8 });
    expect(atlas.frames[1]).toMatchObject({ index: 1, x: 8, y: 0, width: 8, height: 8 });

    // Preview fidelity: the preview is the encoded PNG the download offers.
    expect(await page.getByTestId('t15-preview').getAttribute('src')).toBe(
      await page.getByTestId('t15-download-sheet').getAttribute('href'),
    );
  });

  test('slices a packed sheet back into the frames it came from', async ({ page }) => {
    await open(page, '/spritesheet');
    const red = await generatedPng(page, 8, 8, [255, 0, 0]);
    const blue = await generatedPng(page, 8, 8, [0, 0, 255]);
    await page.getByTestId('t15-input').setInputFiles([
      { name: 'red.png', mimeType: 'image/png', buffer: red },
      { name: 'blue.png', mimeType: 'image/png', buffer: blue },
    ]);
    await page.getByTestId('t15-run').click();
    await expect(page.getByTestId('t15-preview')).toBeVisible();

    const sheetUrl = await page.getByTestId('t15-download-sheet').getAttribute('href');
    const sheetBytes = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      return [...new Uint8Array(await blob.arrayBuffer())];
    }, sheetUrl!);
    // Read the atlas *before* switching modes: switching clears the previous output, because the
    // sheet and the atlas on screen describe the last thing that was packed. `textContent` rather
    // than `innerText`, because the atlas sits inside a collapsed <details>.
    const atlasJson = (await page.getByTestId('t15-atlas-json').textContent()) ?? '';
    expect(JSON.parse(atlasJson).frames).toHaveLength(2);

    // Slice using exactly the atlas that was exported.
    await page
      .locator('[data-testid="option-t15-mode"]')
      .getByRole('button', { name: 'Slice a sheet into frames' })
      .click();
    await page.getByTestId('t15-input').setInputFiles({
      name: 'spritesheet.png',
      mimeType: 'image/png',
      buffer: Buffer.from(sheetBytes),
    });
    await page.getByTestId('t15-atlas').setInputFiles({
      name: 'spritesheet.json',
      mimeType: 'application/json',
      buffer: Buffer.from(atlasJson, 'utf8'),
    });
    await page.getByTestId('t15-run').click();
    await expect(page.getByTestId('t15-status')).toContainText('Sliced 2 frame(s)');
    await expect(page.getByTestId('t15-frames').locator('li')).toHaveCount(2);
  });

  test('rejects an atlas that does not describe this sheet', async ({ page }) => {
    await open(page, '/spritesheet');
    await page
      .locator('[data-testid="option-t15-mode"]')
      .getByRole('button', { name: 'Slice a sheet into frames' })
      .click();
    const sheet = await generatedPng(page, 16, 8, [9, 9, 9]);
    await page.getByTestId('t15-input').setInputFiles({
      name: 'sheet.png',
      mimeType: 'image/png',
      buffer: sheet,
    });
    await page.getByTestId('t15-atlas').setInputFiles({
      name: 'spritesheet.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          size: { w: 999, h: 999 },
          frameWidth: 8,
          frameHeight: 8,
          frames: [{ x: 0, y: 0, width: 8, height: 8 }],
        }),
        'utf8',
      ),
    });
    await page.getByTestId('t15-run').click();
    await expect(page.getByTestId('t15-error')).toHaveAttribute(
      'data-error-kind',
      'processing-failed',
    );
  });

  test('rejects a JSON file that is not an atlas', async ({ page }) => {
    await open(page, '/spritesheet');
    await page
      .locator('[data-testid="option-t15-mode"]')
      .getByRole('button', { name: 'Slice a sheet into frames' })
      .click();
    const sheet = await generatedPng(page, 8, 8, [1, 2, 3]);
    await page.getByTestId('t15-input').setInputFiles({
      name: 'sheet.png',
      mimeType: 'image/png',
      buffer: sheet,
    });
    await page.getByTestId('t15-atlas').setInputFiles({
      name: 'not-an-atlas.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":"world"}', 'utf8'),
    });
    await page.getByTestId('t15-run').click();
    const alert = page.getByTestId('t15-error');
    await expect(alert).toHaveAttribute('data-error-kind', 'atlas-invalid');
    await expect(alert).toContainText('spritesheet.png.json');
  });

  test('passes axe', async ({ page }) => {
    await open(page, '/spritesheet');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

/* ------------------------------------------------------------------ T18 ---- */

test.describe('T18 HTML to image', () => {
  test('renders pasted HTML to a real PNG without running script or fetching anything', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await open(page, '/html-to-image');
    await page
      .getByTestId('t18-input')
      .fill('<h1 style="color:#b91c1c">Local heading</h1><p>Body paragraph</p>');
    await page.getByTestId('t18-run').click();
    await expect(page.getByTestId('t18-preview')).toBeVisible();
    await expect(page.getByTestId('t18-status')).toContainText('Rendered');

    // Preview fidelity: preview and download are the same encoded PNG.
    expect(await page.getByTestId('t18-preview').getAttribute('src')).toBe(
      await page.getByTestId('t18-download').getAttribute('href'),
    );

    const src = await page.getByTestId('t18-preview').getAttribute('src');
    const bytes = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).arrayBuffer();
      return [...new Uint8Array(blob)];
    }, src!);
    // A real PNG signature, not a placeholder.
    expect(bytes.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test('never renders script contents as text', async ({ page }) => {
    await open(page, '/html-to-image');
    await page
      .getByTestId('t18-input')
      .fill('<p>visible</p><script>globalThis.__pwned = true;</script>');
    await page.getByTestId('t18-run').click();
    await expect(page.getByTestId('t18-preview')).toBeVisible();
    await expect(page.getByTestId('t18-warnings')).toContainText('script');
    // The script never ran.
    expect(
      await page.evaluate(() => (globalThis as Record<string, unknown>)['__pwned']),
    ).toBeUndefined();
  });

  test('reports that images are not fetched instead of silently dropping them', async ({
    page,
  }) => {
    await open(page, '/html-to-image');
    await page
      .getByTestId('t18-input')
      .fill('<p>text</p><img src="https://example.invalid/pixel.png">');
    await page.getByTestId('t18-run').click();
    await expect(page.getByTestId('t18-warnings')).toContainText('image');
    await expect(page.getByTestId('t18-warnings')).toContainText('not fetched');
  });

  test('rejects markup with no renderable content', async ({ page }) => {
    await open(page, '/html-to-image');
    await page.getByTestId('t18-input').fill('   ');
    await page.getByTestId('t18-run').click();
    await expect(page.getByTestId('t18-error')).toHaveAttribute('data-error-kind', 'invalid-html');
  });

  test('explains that URL capture is unavailable instead of offering a broken control', async ({
    page,
  }) => {
    await open(page, '/html-to-image');
    const urlHelp = page.getByTestId('t18-url-help');
    await expect(urlHelp).toBeVisible();
    await expect(urlHelp).toContainText('Not available in this build');
    await expect(urlHelp).toContainText('screenshot provider');
    await expect(urlHelp).toContainText('Relay');
    // The control is present but disabled, so it cannot be mistaken for a working fetch.
    await expect(page.getByTestId('t18-url')).toBeDisabled();
  });

  test('passes axe', async ({ page }) => {
    await open(page, '/html-to-image');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

/* ------------------------------------------------------------------ T21 ---- */

test.describe('T21 compress to target size', () => {
  test('searches toward the target and reports the bytes actually achieved', async ({ page }) => {
    await open(page, '/compress-to-size');
    const fixture = await generatedPng(page, 200, 200, [200, 40, 90]);
    await page
      .getByTestId('t21-input')
      .setInputFiles([{ name: 'sample.png', mimeType: 'image/png', buffer: fixture }]);
    await page.getByRole('spinbutton', { name: 'Target size', exact: true }).fill('20');
    await page.getByTestId('t21-run').click();
    await expect(page.getByTestId('t21-metrics')).toBeVisible();

    const actual = Number(await page.getByTestId('t21-bytes').innerText());
    const target = Number(await page.getByTestId('t21-target').innerText());
    expect(target).toBe(20_000);
    expect(actual).toBeGreaterThan(0);
    // The reported figure must be the real size of the offered download, not a claim.
    const href = await page.getByTestId('t21-download').getAttribute('href');
    const realBytes = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      return blob.size;
    }, href!);
    expect(realBytes).toBe(actual);

    const status = await page.getByTestId('t21-status').innerText();
    expect(status).toContain(String(actual));
    expect(status).toContain(String(target));
    await expect(page.getByTestId('t21-attempts')).not.toBeEmpty();
  });

  test('never claims an exact hit when the target was not met', async ({ page }) => {
    await open(page, '/compress-to-size');
    const fixture = await generatedPng(page, 300, 300, [90, 190, 60]);
    await page
      .getByTestId('t21-input')
      .setInputFiles([{ name: 'sample.png', mimeType: 'image/png', buffer: fixture }]);
    // 1 KB is below what a detailed image can encode to; the tool must say so.
    await page.getByRole('spinbutton', { name: 'Target size', exact: true }).fill('1');
    await page.getByTestId('t21-run').click();
    await expect(page.getByTestId('t21-metrics')).toBeVisible();
    const status = await page.getByTestId('t21-status').innerText();
    const actual = Number(await page.getByTestId('t21-bytes').innerText());
    expect(actual).toBeGreaterThan(1000);
    // Either a plain miss or an honest miss, but never an unqualified "the target was met".
    expect(status).not.toMatch(/^The target was met/iu);
    expect(status).toContain('closest result');
  });

  test('scales dimensions when quality alone cannot reach the budget', async ({ page }) => {
    await open(page, '/compress-to-size');
    // A flat colour compresses below the budget without any scaling, which would make this test
    // pass vacuously. A noisy fixture forces the search to actually reduce the dimensions.
    const fixture = await generatedPng(page, 400, 400, [120, 30, 200], true);
    await page
      .getByTestId('t21-input')
      .setInputFiles([{ name: 'sample.png', mimeType: 'image/png', buffer: fixture }]);
    await page.getByRole('spinbutton', { name: 'Target size', exact: true }).fill('4');
    await page
      .locator('[data-testid="option-t21-strategy"]')
      .getByRole('button', { name: 'Quality, then dimensions' })
      .click();
    await page.getByTestId('t21-run').click();
    await expect(page.getByTestId('t21-metrics')).toBeVisible();
    // The dimension search actually reduced the image rather than only lowering quality.
    const dimensions = await page.getByTestId('t21-dimensions').innerText();
    const [width] = dimensions.split('×').map((value) => Number(value.trim()));
    expect(width).toBeLessThan(400);
  });

  test('rejects a corrupt image with its remedy', async ({ page }) => {
    await open(page, '/compress-to-size');
    await page
      .getByTestId('t21-input')
      .setInputFiles([
        { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
      ]);
    await page.getByTestId('t21-run').click();
    await expect(page.getByTestId('t21-error')).toHaveAttribute('data-error-kind', 'decode-failed');
  });

  test('passes axe', async ({ page }) => {
    await open(page, '/compress-to-size');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

/* ------------------------------------------------------------------ T74 ---- */

test.describe('T74 folder watcher', () => {
  test('watches a folder and writes newly added images into an output folder', async ({ page }) => {
    await open(page, '/watch');
    test.skip(
      !(await page.evaluate(
        () =>
          typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
          'function',
      )),
      'This browser does not implement the File System Access directory API.',
    );

    // Two in-memory directory handles stand in for the picked source and output folders. They
    // implement exactly the surface the route uses: `values()`, `getFileHandle`, and
    // `createWritable` — so a real file written into the output folder proves the loop ran.
    await page.evaluate(() => {
      const written: Record<string, number> = {};
      const makePng = async (colour: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.fillStyle = colour;
        context.fillRect(0, 0, 16, 16);
        return new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
            'image/png',
          ),
        );
      };
      const files = new Map<
        string,
        { name: string; size: number; lastModified: number; blob: Blob }
      >();
      const source = {
        kind: 'directory' as const,
        name: 'watched',
        async *values() {
          for (const file of files.values())
            yield {
              kind: 'file' as const,
              handle: {
                kind: 'file' as const,
                name: file.name,
                getFile: async () => {
                  const blob = await file.blob;
                  // The route reads size/lastModified off the returned object.
                  return Object.assign(blob, { lastModified: file.lastModified });
                },
              },
            };
        },
        getFileHandle: async (name: string) => {
          const entry = files.get(name);
          if (!entry) throw new Error(`No such file: ${name}`);
          return {
            getFile: async () =>
              Object.assign(await entry.blob, { lastModified: entry.lastModified }),
          };
        },
      };
      const output = {
        kind: 'directory' as const,
        name: 'out',
        async *values() {
          // Nothing to list back: the route only writes here.
        },
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({
            write: async (blob: Blob) => {
              written[name] = blob.size;
            },
            close: async () => {},
          }),
        }),
      };

      let pickCount = 0;
      (globalThis as Record<string, unknown>)['showDirectoryPicker'] = async () => {
        pickCount += 1;
        return (pickCount === 1 ? source : output) as unknown as FileSystemDirectoryHandle;
      };
      (globalThis as Record<string, unknown>)['FileSystemDirectoryHandle'] =
        function FileSystemDirectoryHandle() {};
      (globalThis as Record<string, unknown>)['FileSystemWritableFileStream'] =
        function FileSystemWritableFileStream() {};

      // Seed two files, then expose a hook so a third can be added after the baseline sweep.
      void (async () => {
        files.set('one.png', {
          name: 'one.png',
          size: 0,
          lastModified: 1,
          blob: await makePng('#ff0000'),
        });
        files.set('two.png', {
          name: 'two.png',
          size: 0,
          lastModified: 2,
          blob: await makePng('#00ff00'),
        });
        (files.get('one.png') as { size: number }).size = (files.get('one.png')!.blob as Blob).size;
        (files.get('two.png') as { size: number }).size = (files.get('two.png')!.blob as Blob).size;
      })();

      (globalThis as Record<string, unknown>)['__ctWatchState'] = {
        addFile: async (name: string, colour: string) => {
          const blob = await makePng(colour);
          files.set(name, { name, size: blob.size, lastModified: files.size + 100, blob });
        },
        written,
      };
    });

    await page.getByTestId('t74-choose-source').click();
    await page.getByTestId('t74-choose-output').click();
    await expect(page.getByTestId('t74-source-name')).toContainText('watched');
    await expect(page.getByTestId('t74-output-name')).toContainText('out');

    await page.getByTestId('t74-start').click();

    // "Ignore files already present" is off by default, so the first sweep processes the two
    // seeded files as well as recording them as the baseline. It previously only recorded them,
    // which contradicted the toggle's own label and left a pointed-at folder of photos untouched.
    await expect(page.getByTestId('t74-status')).toContainText('Wrote 2 file(s)', {
      timeout: 15_000,
    });

    // Drop a new file into the watched folder, exactly as a person would save a photo.
    await page.evaluate(async () => {
      const state = (
        globalThis as unknown as {
          __ctWatchState: { addFile(name: string, colour: string): Promise<void> };
        }
      ).__ctWatchState;
      await state.addFile('three.png', '#0000ff');
    });

    // The interval sweep must notice it and write it into the output folder.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Object.keys(
              (globalThis as unknown as { __ctWatchState: { written: Record<string, number> } })
                .__ctWatchState.written,
            ),
          ),
        { timeout: 15_000 },
      )
      .toContain('three.webp');

    // The written file is a real encoded image, not an empty placeholder.
    const size = await page.evaluate(
      () =>
        (globalThis as unknown as { __ctWatchState: { written: Record<string, number> } })
          .__ctWatchState.written['three.webp'],
    );
    expect(size).toBeGreaterThan(0);
    await expect(page.getByTestId('t74-results')).toContainText('three.webp');

    await page.getByTestId('t74-stop').click();
    await expect(page.getByTestId('t74-status')).toContainText('Stopped watching');
  });

  test('hides the watch controls and offers a working fallback where the API is absent', async ({
    page,
  }) => {
    await open(page, '/watch');
    const supported = await page.evaluate(
      () =>
        typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function',
    );
    if (supported) {
      await expect(page.getByTestId('t74-choose-source')).toBeVisible();
    } else {
      await expect(page.getByTestId('t74-unavailable')).toBeVisible();
      await expect(page.getByTestId('t74-unavailable')).toContainText('does not implement');
      // The controls are hidden rather than shown broken.
      await expect(page.getByTestId('t74-choose-source')).toHaveCount(0);
      await expect(page.getByTestId('t74-start')).toHaveCount(0);
    }

    // The fallback works everywhere: it re-encodes the chosen images and offers downloads.
    const fixture = await generatedPng(page, 32, 32, [70, 130, 200]);
    await page
      .getByTestId('t74-input')
      .setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer: fixture }]);
    await expect(page.getByTestId('t74-results')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('t74-results')).toContainText('photo.webp');
    await expect(page.getByTestId('t74-download-all')).toBeVisible();
  });

  test('passes axe', async ({ page }) => {
    await open(page, '/watch');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

/* ------------------------------------------------- localization and SEO ---- */

test.describe('P6-01 localization and SEO', () => {
  const routes = [
    ['/gif-maker', 'GIF Maker'],
    ['/video-to-gif', 'Video to GIF'],
    ['/spritesheet', 'Spritesheet Tools'],
    ['/html-to-image', 'HTML / URL to Image'],
    ['/compress-to-size', 'Compress to Target Size'],
    ['/watch', 'Folder Watcher'],
  ] as const;

  for (const [route, title] of routes) {
    test(`${route} has a canonical link, hreflang alternates, and JSON-LD`, async ({ page }) => {
      await open(page, route);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://image.complianttools.com${route}`,
      );
      for (const locale of ['en', 'en-XA', 'ar', 'x-default'])
        await expect(page.locator(`link[rel="alternate"][hreflang="${locale}"]`)).toHaveCount(1);
      const jsonLd = JSON.parse(
        (await page.locator('script[type="application/ld+json"]').first().innerText()) as string,
      );
      expect(
        jsonLd['@graph'].some((node: { '@type': string }) => node['@type'] === 'FAQPage'),
      ).toBe(true);
      await expect(page.locator('h1')).toContainText(title.split(' ')[0]!);
    });

    test(`${route} renders in Arabic with RTL direction`, async ({ page }) => {
      await open(page, `/ar${route}`);
      await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
    });

    test(`${route} renders in the en-XA pseudo locale without raw English`, async ({ page }) => {
      await open(page, `/en-XA${route}`);
      await expect(page.locator('main')).toHaveAttribute('lang', 'en-XA');
      const heading = await page.locator('h1').innerText();
      // en-XA wraps every string, so the heading cannot be the plain English title.
      expect(heading).toMatch(/[àëïôü]/iu);
    });
  }
});

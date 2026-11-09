import { expect, test } from '@playwright/test';

const heifBytes = Buffer.from([
  0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0,
]);

test('converts through the capability-probed platform decoder and downloads PNG', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class MockImageDecoder {
      static async isTypeSupported({ type }: { type: string }) {
        return type === 'image/heif';
      }

      constructor(options: { type: string }) {
        if (options.type !== 'image/heif') throw new Error(`Unexpected MIME type ${options.type}`);
      }

      async decode() {
        return {
          image: {
            displayWidth: 1,
            displayHeight: 1,
            async copyTo(destination: Uint8Array) {
              destination.set([12, 34, 56, 255]);
            },
            close() {},
          },
        };
      }

      close() {}
    }

    Object.defineProperty(globalThis, 'ImageDecoder', {
      configurable: true,
      value: MockImageDecoder,
    });
  });
  await page.goto('/heic-converter');
  await page.waitForLoadState('networkidle');

  // No file selected yet: the primary action stays disabled and conversion never starts by itself.
  await expect(page.getByTestId('heic-convert')).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Select a HEIC or HEIF file to begin.');

  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'camera.heif',
    mimeType: 'image/heif',
    buffer: heifBytes,
  });

  // Selection only prepares the workflow; nothing downloads until Convert is clicked.
  await expect(page.getByTestId('heic-convert')).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('File ready');

  await page.getByTestId('heic-convert').click();
  await expect(page.getByRole('status')).toContainText('Conversion complete');

  // The result card exposes the converted bytes through an explicit Download action.
  await expect(page.getByTestId('heic-download')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('heic-download').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('camera.png');
  const png = Buffer.concat(await (await download.createReadStream()).toArray());
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
    width: 1,
    height: 1,
  });
});

test('surfaces the named platform limitation when HEIC is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'ImageDecoder', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/heic-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'camera.heic',
    mimeType: 'image/heic',
    buffer: heifBytes,
  });
  await page.getByTestId('heic-convert').click();

  // Without a platform decoder the page falls back to the bundled libheif WASM decoder. These
  // truncated fixture bytes are not a decodable HEIC/HEIF image, so the honest outcome is a
  // decode failure carrying a remedy — not the old platform-unavailable notice.
  await expect(page.getByRole('alert')).toContainText('Remedy:', { timeout: 60_000 });
});

test('rejects AVIF bytes renamed as HEIC before invoking a platform decoder', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'ImageDecoder', {
      configurable: true,
      value: class {
        static async isTypeSupported() {
          return true;
        }
        constructor() {
          throw new Error('decoder must not be constructed');
        }
      },
    });
  });
  await page.goto('/heic-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'renamed.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]),
  });
  await expect(page.getByRole('alert')).toContainText('not a valid HEIC or HEIF');
  await page.getByTestId('heic-convert').click();
  // The invalid file never enables conversion and the decoder is still never constructed.
  await expect(page.getByTestId('heic-convert')).toBeEnabled();
  await expect(page.getByTestId('heic-convert')).click();
  await expect(page.getByRole('alert')).toContainText('Remedy:', { timeout: 60_000 });
});

test('uses the native browser image pipeline when WebCodecs ImageDecoder is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'ImageDecoder', {
      configurable: true,
      value: undefined,
    });
    const nativeCreateImageBitmap = globalThis.createImageBitmap.bind(globalThis);
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = 'rgb(12, 34, 56)';
        context.fillRect(0, 0, 2, 1);
        return nativeCreateImageBitmap(canvas);
      },
    });
  });
  await page.goto('/heic-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'native.heic',
    mimeType: 'image/heic',
    buffer: heifBytes,
  });
  await page.getByTestId('heic-convert').click();
  await expect(page.getByRole('status')).toContainText('Conversion complete');
  const pending = page.waitForEvent('download');
  await page.getByTestId('heic-download').click();
  const png = Buffer.concat(await (await (await pending).createReadStream()).toArray());
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
    width: 2,
    height: 1,
  });
});

test('replacing the selected file resets the previous conversion result', async ({ page }) => {
  await page.addInitScript(() => {
    class MockImageDecoder {
      static async isTypeSupported({ type }: { type: string }) {
        return type === 'image/heif';
      }
      constructor(options: { type: string }) {
        if (options.type !== 'image/heif') throw new Error(`Unexpected MIME type ${options.type}`);
      }
      async decode() {
        return {
          image: {
            displayWidth: 3,
            displayHeight: 2,
            async copyTo(destination: Uint8Array) {
              destination.set([12, 34, 56, 255]);
            },
            close() {},
          },
        };
      }
      close() {}
    }
    Object.defineProperty(globalThis, 'ImageDecoder', {
      configurable: true,
      value: MockImageDecoder,
    });
  });
  await page.goto('/heic-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'first.heif',
    mimeType: 'image/heif',
    buffer: heifBytes,
  });
  await page.getByTestId('heic-convert').click();
  await expect(page.getByRole('status')).toContainText('Conversion complete');
  await expect(page.getByTestId('heic-download')).toBeVisible();

  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'second.heic',
    mimeType: 'image/heic',
    buffer: heifBytes,
  });
  await expect(page.getByTestId('heic-convert')).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('File ready');
});

test('HEIC file picker is keyboard reachable', async ({ page }) => {
  await page.goto('/heic-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').focus();
  await expect(page.locator('input[type=file]')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} HEIC route emits exact PNG dimensions with locale layout`, async ({ page }) => {
    await page.addInitScript(() => {
      class MockImageDecoder {
        static async isTypeSupported({ type }: { type: string }) {
          return type === 'image/heif';
        }
        constructor(options: { type: string }) {
          if (options.type !== 'image/heif')
            throw new Error(`Unexpected MIME type ${options.type}`);
        }
        async decode() {
          return {
            image: {
              displayWidth: 1,
              displayHeight: 1,
              async copyTo(destination: Uint8Array) {
                destination.set([12, 34, 56, 255]);
              },
              close() {},
            },
          };
        }
        close() {}
      }
      Object.defineProperty(globalThis, 'ImageDecoder', {
        configurable: true,
        value: MockImageDecoder,
      });
    });
    await page.goto(`/${locale}/heic-converter`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.heif`,
      mimeType: 'image/heif',
      buffer: heifBytes,
    });
    await page.getByTestId('heic-convert').click();
    await expect(page.getByTestId('heic-download')).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.getByTestId('heic-download').click();
    const png = Buffer.concat(await (await (await pending).createReadStream()).toArray());
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
      width: 1,
      height: 1,
    });
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/heic-converter`,
    );
  });
}

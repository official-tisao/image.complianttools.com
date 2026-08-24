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

  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Choose a HEIC or HEIF image').setInputFiles({
    name: 'camera.heif',
    mimeType: 'image/heif',
    buffer: heifBytes,
  });
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('camera.png');
  const png = Buffer.concat(await (await download.createReadStream()).toArray());
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
    width: 1,
    height: 1,
  });
  await expect(page.getByRole('status')).toHaveText('Converted 1×1 HEIC image to PNG locally.');
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

  await expect(page.getByRole('alert')).toContainText(
    'This browser does not provide an HEIC decoder. Open the file on a device with HEIC support or export it as JPEG.',
  );
  await expect(page.getByRole('alert')).toContainText('Remedy:');
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
    const pending = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.heif`,
      mimeType: 'image/heif',
      buffer: heifBytes,
    });
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

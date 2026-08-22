import { expect, test } from '@playwright/test';

const fixture = {
  name: 'encoder-source.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

const signatures = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46],
} as const;

test('selectable formats equal the production encoder set', async ({ page }) => {
  await page.goto('/convert');
  await expect(page.getByText(/Local encoder download before first use:/)).toContainText(
    'JPEG 195 KB · PNG 165 KB · WEBP 210 KB',
  );
  const options = await page.getByLabel('Format').locator('option').allTextContents();
  expect(options).toEqual(['same', 'jpeg', 'png', 'webp']);
  expect(options).not.toContain('qoi');
  expect(options).not.toContain('avif');
  expect(options).not.toContain('jxl');
});

for (const format of ['jpeg', 'png', 'webp'] as const) {
  test(`exports a real ${format} through the engine encoder`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    await page.goto('/convert');
    await page.getByLabel('Format').selectOption(format);
    await page.setInputFiles('[data-testid=file-input]', fixture);
    await expect(page.getByRole('button', { name: 'Download' }), pageErrors.join('\n')).toBeEnabled(
      {
        timeout: 15_000,
      },
    );
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await pending;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(signatures[format].length);
    expect([...bytes.subarray(0, signatures[format].length)]).toEqual(signatures[format]);
    if (format === 'webp') expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });
}

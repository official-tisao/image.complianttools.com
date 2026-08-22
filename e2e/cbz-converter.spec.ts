import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

function readStoredZip(input: Buffer): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  let offset = 0;
  while (offset + 30 <= input.length && input.readUInt32LE(offset) === 0x0403_4b50) {
    expect(input.readUInt16LE(offset + 8)).toBe(0);
    const size = input.readUInt32LE(offset + 18);
    const nameLength = input.readUInt16LE(offset + 26);
    const extraLength = input.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = input.toString('utf8', nameStart, nameStart + nameLength);
    files[name] = input.subarray(dataStart, dataStart + size);
    offset = dataStart + size;
  }
  return files;
}

test('CBZ converter downloads the selected image pages locally', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles([
    { name: 'page2.png', mimeType: 'image/png', buffer: Buffer.from([2]) },
    { name: 'page1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([1]) },
  ]);
  const download = await pending;
  expect(download.suggestedFilename()).toBe('comic.cbz');
  const path = await download.path();
  expect(path).not.toBeNull();
  const archive = readStoredZip(await readFile(path!));
  expect([...archive['page1.jpg']!]).toEqual([1]);
  expect([...archive['page2.png']!]).toEqual([2]);
  await expect(page.getByRole('status')).toContainText('Packed 2 image pages');
});

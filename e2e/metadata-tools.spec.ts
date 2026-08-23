import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

function jpegWithExif(tiff: Uint8Array, name: string) {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(tiff)]);
  return {
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe1,
      (payload.length + 2) >>> 8,
      (payload.length + 2) & 255,
      ...payload,
      0xff,
      0xd9,
    ]),
  };
}

function makerNoteJpeg() {
  const tiff = new Uint8Array(80);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 32, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 0x927c, true);
  view.setUint16(36, 7, true);
  view.setUint32(38, 5, true);
  view.setUint32(42, 64, true);
  tiff.set([0xde, 0xad, 0xbe, 0xef, 1], 64);
  return jpegWithExif(tiff, 'maker-note.jpg');
}

function gpsJpeg() {
  const tiff = new Uint8Array(96);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8825, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 32, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 2, true);
  view.setUint16(36, 5, true);
  view.setUint32(38, 3, true);
  view.setUint32(42, 64, true);
  tiff.fill(0xaa, 64, 88);
  return jpegWithExif(tiff, 'gps.jpg');
}

function copyrightJpeg() {
  const tiff = new Uint8Array(80);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8298, true);
  view.setUint16(12, 2, true);
  view.setUint32(14, 12, true);
  view.setUint32(18, 48, true);
  tiff.set(Buffer.from('Original\0', 'ascii'), 48);
  return jpegWithExif(tiff, 'copyright.jpg');
}

test('metadata viewer reports an opaque MakerNote locally', async ({ page }) => {
  await page.goto('/exif-viewer');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles(makerNoteJpeg());
  await expect(page.getByRole('heading', { name: 'maker-note.jpg' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'MakerNote' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /5 bytes \(deadbeef01\)/u })).toBeVisible();
});

test('GPS-only preset downloads a JPEG with coordinate storage wiped', async ({ page }) => {
  await page.goto('/remove-exif');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Removal preset').selectOption('gps');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles(gpsJpeg());
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect([...output.subarray(22, 34)]).toEqual(new Array(12).fill(0));
  expect([...output.subarray(76, 100)]).toEqual(new Array(24).fill(0));
  await expect(page.getByRole('status')).toContainText('Removed metadata locally');
});

test('metadata removal defaults to a byte-identical no-op', async ({ page }) => {
  await page.goto('/remove-exif');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Removal preset')).toHaveValue('keep');
  const fixture = copyrightJpeg();
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles(fixture);
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect(output).toEqual(fixture.buffer);
  await expect(page.getByRole('status')).toContainText('Kept every byte locally');
});

test('metadata viewer edits an existing JPEG copyright field without relocating EXIF', async ({
  page,
}) => {
  await page.goto('/exif-viewer');
  await page.waitForLoadState('networkidle');
  const fixture = copyrightJpeg();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByRole('cell', { name: 'Original' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Edit Copyright' }).check();
  await page.getByRole('textbox', { name: 'Copyright value', exact: true }).fill('Mine');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download edited JPEG' }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect(output.subarray(60, 65)).toEqual(Buffer.from('Mine\0', 'ascii'));
  expect(output.subarray(65, 72)).toEqual(Buffer.alloc(7));
  expect(output.subarray(0, 26)).toEqual(fixture.buffer.subarray(0, 26));
  expect(output.subarray(30, 60)).toEqual(fixture.buffer.subarray(30, 60));
  await expect(page.getByRole('status')).toContainText('all other bytes were preserved');
});

test('metadata viewer reports generated edit validation as a typed remedy', async ({ page }) => {
  await page.goto('/exif-viewer');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles(copyrightJpeg());
  await page.getByRole('checkbox', { name: 'Edit GPS latitude' }).check();
  await page.getByRole('textbox', { name: 'GPS latitude value' }).fill('43.7');
  await page.getByRole('button', { name: 'Download edited JPEG' }).click();
  await expect(page.getByRole('alert')).toContainText('Enable both GPS latitude and longitude');
  await expect(page.getByRole('alert')).toContainText('Remedy:');
});

test('image inspector reports deterministic PNG container facts', async ({ page }) => {
  await page.goto('/image-info');
  await page.waitForLoadState('networkidle');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAQAAABWKLW/AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-by-three.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.getByText('2 × 3 px')).toBeVisible();
  await expect(page.getByText('Grayscale + alpha')).toBeVisible();
  await expect(page.getByText('IHDR (13 bytes)')).toBeVisible();
  await expect(page.getByText(/bits\/byte \(estimate\)/u)).toBeVisible();
});

test('metadata and inspector adversarial failures surface a typed remedy', async ({ page }) => {
  for (const route of ['/exif-viewer', '/remove-exif', '/image-info'] as const) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    if (route === '/remove-exif') await page.getByLabel('Removal preset').selectOption('all');
    await page
      .locator('input[type=file]')
      .last()
      .setInputFiles({
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      });
    await expect(page.getByRole('alert')).toContainText('Remedy:');
  }
});

test('metadata tools are keyboard-operable end to end', async ({ page }) => {
  test.setTimeout(60_000);
  const copyright = copyrightJpeg();

  await page.goto('/exif-viewer');
  await page.waitForLoadState('networkidle');
  const viewerInput = page.locator('input[type=file]');
  await viewerInput.focus();
  await expect(viewerInput).toBeFocused();
  // Playwright supplies the file at the native picker boundary; every application control below
  // is reached and activated with the keyboard.
  await viewerInput.setInputFiles(copyright);
  const copyrightToggle = page.getByRole('checkbox', { name: 'Edit Copyright' });
  await copyrightToggle.focus();
  await page.keyboard.press('Space');
  await expect(copyrightToggle).toBeChecked();
  const copyrightValue = page.getByRole('textbox', { name: 'Copyright value', exact: true });
  await copyrightValue.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Keys');
  const viewerDownload = page.waitForEvent('download');
  const saveButton = page.getByRole('button', { name: 'Download edited JPEG' });
  await saveButton.focus();
  await page.keyboard.press('Enter');
  const editedPath = await (await viewerDownload).path();
  expect(editedPath).not.toBeNull();
  expect((await readFile(editedPath!)).subarray(60, 65)).toEqual(Buffer.from('Keys\0', 'ascii'));

  await page.goto('/remove-exif');
  await page.waitForLoadState('networkidle');
  const preset = page.getByLabel('Removal preset');
  await preset.focus();
  await expect(preset).toBeFocused();
  await page.keyboard.press('End');
  await expect(preset).toHaveValue('custom');
  await page.keyboard.press('Tab');
  const artist = page.getByRole('checkbox', { name: 'Artist' });
  await artist.focus();
  await page.keyboard.press('Space');
  await expect(artist).toBeChecked();
  const removerInput = page.locator('input[type=file]');
  await removerInput.focus();
  await expect(removerInput).toBeFocused();

  await page.goto('/image-info');
  await page.waitForLoadState('networkidle');
  const inspectorInput = page.locator('input[type=file]');
  await inspectorInput.focus();
  await expect(inspectorInput).toBeFocused();
  await inspectorInput.setInputFiles({
    name: 'two-by-three.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAQAAABWKLW/AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('2 × 3 px')).toBeVisible();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`image inspector survives ${locale} localization`, async ({ page }) => {
    await page.goto(`/${locale}/image-info`);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', locale);
    await expect(main).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/image-info`,
    );
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      locale === 'ar' ? 'فاحص الصور' : '［Ïmàgë Ïnspëctôr',
    );
    await page.locator('input[type=file]').setInputFiles({
      name: 'two-by-three.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAQAAABWKLW/AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(page.getByText('2 × 3 px')).toBeVisible();
    await expect(page.getByText(locale === 'ar' ? 'الأبعاد' : /Dïmënsïôns/u)).toBeVisible();
  });

  test(`metadata remover survives ${locale} localization`, async ({ page }) => {
    await page.goto(`/${locale}/remove-exif`);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', locale);
    await expect(main).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/remove-exif`,
    );
    const preset = page.getByTestId('option-metadata-preset').locator('select');
    await expect(preset.locator('option[value=keep]')).toHaveText(
      locale === 'ar' ? 'الاحتفاظ بكل شيء' : /Këëp ëvërythïng/u,
    );
    await preset.selectOption('custom');
    await expect(
      page.getByText(locale === 'ar' ? 'حقول EXIF المراد إزالتها' : /ËXÏF fïëlds tô rëmôvë/u),
    ).toBeVisible();
    await preset.selectOption('keep');
    const pending = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles(copyrightJpeg());
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    expect(await readFile(path!)).toEqual(copyrightJpeg().buffer);
    await expect(page.getByRole('status')).toContainText(
      locale === 'ar' ? 'تم الاحتفاظ بكل بايت محليًا' : /Këpt ëvëry bytë lôcàlly/u,
    );
  });

  test(`metadata viewer survives ${locale} localization`, async ({ page }) => {
    await page.goto(`/${locale}/exif-viewer`);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', locale);
    await expect(main).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/exif-viewer`,
    );
    const fixture = copyrightJpeg();
    await page.locator('input[type=file]').setInputFiles(fixture);
    await expect(page.getByRole('cell', { name: 'Original' })).toBeVisible();
    await expect(
      page.getByRole('columnheader', {
        name: locale === 'ar' ? 'القيمة' : /Vàlüë/u,
      }),
    ).toBeVisible();
    const copyrightToggleName = locale === 'ar' ? 'تعديل حقوق النشر' : /Ëdït Côpyrïght/u;
    const copyrightValueName = locale === 'ar' ? 'قيمة حقوق النشر' : /Côpyrïght vàlüë/u;
    await page.getByRole('checkbox', { name: copyrightToggleName }).check();
    await page.getByRole('textbox', { name: copyrightValueName }).fill('Local');
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: locale === 'ar' ? 'تنزيل JPEG المعدّل' : /Dôwnlôàd ëdïtëd JPËG/u,
      })
      .click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    expect((await readFile(path!)).subarray(60, 66)).toEqual(Buffer.from('Local\0', 'ascii'));
    await expect(page.getByRole('status')).toContainText(
      locale === 'ar' ? 'وحُفظت جميع البايتات الأخرى' : /àll ôthër bytës wërë prësërvëd/u,
    );
  });
}

<script lang="ts">
  import type { FaviconPackage } from '@complianttools/image-engine/export/favicon';
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine/errors';
  import { createRaster } from '@complianttools/image-engine/ops/raster';
  import {
    FaviconToolOptionsSchema,
    faviconToolOptionDescriptions,
    type FaviconToolOptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);

  let options = $state<FaviconToolOptions>(FaviconToolOptionsSchema.parse({}));
  let sourceFile = $state<File>();
  let output = $state<FaviconPackage>();
  let previewUrl = $state('');
  let status = $state('');
  let error = $state('');
  const controlValues = $derived({ 'favicon.siteName': options.siteName });

  function clearOutput() {
    output = undefined;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (path !== 'favicon.siteName') return;
    try {
      options = FaviconToolOptionsSchema.parse({ siteName: value });
      error = '';
      status = sourceFile
        ? t(
            'favicon.siteNameChanged',
            'Site name changed. Create the package again to update its manifest.',
          )
        : '';
      clearOutput();
    } catch {
      error = t('favicon.nameError', 'Site name must contain between 1 and 128 characters.');
    }
  }
  function selectFile(file: File | undefined) {
    sourceFile = file;
    status = file ? t('favicon.ready', '{value} is ready.', file.name) : '';
    error = '';
    clearOutput();
  }
  async function createPackage() {
    status = '';
    error = '';
    if (!sourceFile) {
      error = t('favicon.chooseFirst', 'Choose an image first.');
      return;
    }
    try {
      const { createFaviconPackage } = await import('@complianttools/image-engine/export/favicon');
      const bitmap = await createImageBitmap(sourceFile);
      try {
        const size = Math.min(512, bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context)
          throw new Error(t('favicon.canvasError', 'Your browser cannot create a local canvas.'));
        const scale = Math.max(size / bitmap.width, size / bitmap.height);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;
        context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
        output = await withTypedEngineErrorsAsync(
          t('favicon.failure', 'Favicon generation failed'),
          t(
            'favicon.remedy',
            'Choose a valid raster image, reduce its dimensions, or use a shorter site name.',
          ),
          () =>
            createFaviconPackage(
              createRaster(size, size, context.getImageData(0, 0, size, size).data),
              options.siteName,
            ),
        );
      } finally {
        bitmap.close();
      }
      previewUrl = URL.createObjectURL(new Blob([output.previewPng], { type: 'image/png' }));
      status = t(
        'favicon.created',
        'Created favicon.ico, PNG icons, a web manifest, and an HTML snippet locally.',
      );
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : reason instanceof Error
          ? reason.message
          : t('favicon.unable', 'Unable to create the favicon.');
    }
  }
  function downloadPackage() {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output.archive], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'favicon-package.zip';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('favicon.back', '← Convert')}</a>
  <h1>{t('favicon.title', 'Favicon Generator')}</h1>
  <p>
    {t(
      'favicon.description',
      'Create a multi-resolution ICO, PNG icon set, web manifest, and HTML link snippet locally. Your image is never uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, faviconToolOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <h2>{t('favicon.faqTitle', 'Frequently asked')}</h2>
  <div>
    <h3>{t('favicon.faqTitle1', 'What sizes are included?')}</h3>
    <p>{t('favicon.faqAnswer1', '16, 32, 48, 180, 192, and 512 pixels in PNG plus an ICO.')}</p>
    <h3>{t('favicon.faqTitle2', 'Does the preview match the download?')}</h3>
    <p>
      {t(
        'favicon.faqAnswer2',
        'Yes. The 32×32 preview shows the same icon included in the package.',
      )}
    </p>
    <h3>{t('favicon.faqTitle3', 'Is anything uploaded?')}</h3>
    <p>{t('favicon.faqAnswer3', 'No. Everything is generated locally.')}</p>
  </div>
  <label>
    {t('favicon.choose', 'Choose an image')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onchange={(event) => selectFile(event.currentTarget.files?.[0])}
    />
  </label>
  <button type="button" onclick={() => void createPackage()} disabled={!sourceFile}
    >{t('favicon.create', 'Create package')}</button
  >
  <button type="button" onclick={downloadPackage} disabled={!output}
    >{t('favicon.download', 'Download package')}</button
  >
  {#if output}
    <section aria-labelledby="favicon-preview-heading">
      <h2 id="favicon-preview-heading">{t('favicon.preview', 'Exact 32×32 package preview')}</h2>
      <img
        src={previewUrl}
        alt={t('favicon.previewAlt', 'Generated 32 by 32 favicon')}
        width="32"
        height="32"
      />
      <label
        >{t('favicon.html', 'HTML link snippet')}
        <textarea readonly value={output.html}></textarea></label
      >
      <label>site.webmanifest <textarea readonly value={output.manifest}></textarea></label>
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

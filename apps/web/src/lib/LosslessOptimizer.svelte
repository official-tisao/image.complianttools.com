<script lang="ts">
  import {
    createRaster,
    engineErrorMessage,
    isEngineError,
    optimizeGifLossless,
    optimizeJpegLossless,
    optimizePngLossless,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine';
  import { onDestroy } from 'svelte';
  import { translate, type Locale } from './i18n';

  type LocalBlobPart = NonNullable<ConstructorParameters<typeof globalThis.Blob>[0]>[number];
  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(
    locale === 'en' ? '/lossless-optimize' : `/${locale}/lossless-optimize`,
  );
  let status = $state('');
  let error = $state('');
  let output = $state<ArrayBuffer>();
  let outputName = $state('');
  let outputType = $state('');
  let previewUrl = $state('');

  function clearOutput() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    output = undefined;
    outputName = '';
    outputType = '';
  }

  onDestroy(clearOutput);

  async function decodeJpegInBrowser(bytes: ArrayBuffer) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context)
        throw new Error(t('lossless.canvasError', 'Your browser cannot create a local canvas.'));
      context.drawImage(bitmap, 0, 0);
      return createRaster(
        canvas.width,
        canvas.height,
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
    } finally {
      bitmap.close();
    }
  }

  async function optimise(file: File | undefined) {
    status = '';
    error = '';
    clearOutput();
    if (!file) return;
    const isGif = file.type === 'image/gif' || /\.gif$/iu.test(file.name);
    const isPng = file.type === 'image/png' || /\.png$/iu.test(file.name);
    const isJpeg = file.type === 'image/jpeg' || /\.(?:jpe?g|jfif)$/iu.test(file.name);
    if (!isGif && !isPng && !isJpeg) {
      error = t(
        'lossless.unsupported',
        'Choose a PNG, GIF, or JPEG image for lossless optimization.',
      );
      return;
    }
    try {
      const result = await withTypedEngineErrorsAsync(
        t('lossless.failure', 'Lossless optimization failed'),
        t('lossless.remedy', 'Choose a valid PNG, GIF, or JPEG image and try again.'),
        async () => {
          const input = await file.arrayBuffer();
          return isGif
            ? optimizeGifLossless(input)
            : isJpeg
              ? await optimizeJpegLossless(input, decodeJpegInBrowser)
              : await optimizePngLossless(input);
        },
      );
      const extension = isGif ? 'gif' : isJpeg ? 'jpg' : 'png';
      outputType = isGif ? 'image/gif' : isJpeg ? 'image/jpeg' : 'image/png';
      outputName = `${file.name.replace(/\.(?:png|gif|jpe?g|jfif)$/iu, '')}-optimized.${extension}`;
      output = result.bytes;
      previewUrl = URL.createObjectURL(new Blob([output as LocalBlobPart], { type: outputType }));
      status = result.changed
        ? t(
            'lossless.optimized',
            'Optimized and pixel-verified locally: {value}',
            `${result.originalBytes.toLocaleString(locale)} → ${result.optimizedBytes.toLocaleString(locale)} ${t('lossless.bytes', 'bytes')}.`,
          )
        : t(
            'lossless.preserved',
            'Pixel-verified locally; no smaller safe candidate was found, so the original {value} bytes were preserved.',
            result.originalBytes.toLocaleString(locale),
          );
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('lossless.unable', 'Unable to optimize this image.');
    }
  }

  function downloadOutput() {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output as LocalBlobPart], { type: outputType }));
    const download = document.createElement('a');
    download.href = url;
    download.download = outputName;
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<svelte:head>
  <title>{t('lossless.metaTitle', 'Lossless Image Optimizer')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'lossless.metaDescription',
      'Optimize PNG, GIF, and JPEG files locally without changing rendered pixels.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>
<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('lossless.back', '← Convert')}</a
  >
  <h1>{t('lossless.title', 'Lossless PNG, GIF, and JPEG Optimizer')}</h1>
  <p>
    {t(
      'lossless.description',
      'Optimize PNG, GIF, or JPEG files locally. Every candidate is independently decoded and returned only when rendered pixels are unchanged; GIF timing and loop settings are checked too. Files never leave your browser.',
    )}
  </p>
  <label>
    {t('lossless.choose', 'Choose a PNG, GIF, or JPEG')}
    <input
      type="file"
      accept="image/png,image/gif,image/jpeg,.png,.gif,.jpg,.jpeg,.jfif"
      onchange={(event) => void optimise(event.currentTarget.files?.[0])}
    />
  </label>
  {#if output && previewUrl}
    <section aria-labelledby="lossless-preview-heading">
      <h2 id="lossless-preview-heading">{t('lossless.preview', 'Verified output preview')}</h2>
      <img src={previewUrl} alt={t('lossless.previewAlt', 'Pixel-verified optimized output')} />
      <button type="button" onclick={downloadOutput}
        >{t('lossless.download', 'Download output')}</button
      >
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

<script lang="ts">
  import {
    VectorizeToolOptionsSchema,
    createRaster,
    engineErrorMessage,
    isEngineError,
    vectorizeRaster,
    vectorizeToolOptionDescriptions,
    withTypedEngineErrors,
    type VectorizeToolOptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/image-to-svg' : `/${locale}/image-to-svg`);

  let options = $state<VectorizeToolOptions>(VectorizeToolOptionsSchema.parse({}));
  let sourceFile = $state<File>();
  let fileName = $state('');
  let svg = $state('');
  let previewUrl = $state('');
  let status = $state('');
  let error = $state('');
  const controlValues = $derived({
    'vector.colors': options.colors,
    'vector.curveTolerance': options.curveTolerance,
  });

  function clearOutput() {
    svg = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (!path.startsWith('vector.')) return;
    options = VectorizeToolOptionsSchema.parse({
      ...options,
      [path.slice('vector.'.length)]: value,
    });
    clearOutput();
    status = sourceFile
      ? t('vector.optionsChanged', 'Options changed. Trace again to update the faithful preview.')
      : '';
  }
  function selectFile(file: File | undefined) {
    sourceFile = file;
    fileName = file?.name ?? '';
    status = file ? t('vector.ready', '{value} is ready to trace.', file.name) : '';
    error = '';
    clearOutput();
  }
  async function vectorize() {
    status = '';
    error = '';
    if (!sourceFile) {
      error = t('vector.chooseFirst', 'Choose a raster image first.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(sourceFile);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context)
          throw new Error(t('vector.canvasError', 'Your browser cannot create a local canvas.'));
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        svg = withTypedEngineErrors(
          t('vector.failure', 'Vector tracing failed'),
          t(
            'vector.remedy',
            'Choose a valid raster image, reduce its dimensions, or increase curve tolerance.',
          ),
          () =>
            vectorizeRaster(createRaster(canvas.width, canvas.height, data), {
              colors: options.colors,
              curveTolerance: options.curveTolerance,
            }),
        );
      } finally {
        bitmap.close();
      }
      previewUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      status = `${t('vector.traced', 'Traced {value} locally into', fileName)} ${new Blob([svg]).size} ${t('vector.svgBytes', 'SVG bytes')}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : reason instanceof Error
          ? reason.message
          : t('vector.unable', 'Unable to vectorize this image.');
    }
  }
  function downloadSvg() {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.[^.]+$/u, '')}.svg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<svelte:head>
  <title>{t('vector.title', 'Image to SVG')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'vector.metaDescription',
      'Posterize and trace raster images locally into SVG paths.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/svg-to-png' : `/${locale}/svg-to-png`}
    >{t('vector.back', '← SVG to PNG')}</a
  >
  <h1>{t('vector.title', 'Image to SVG')}</h1>
  <p>
    {t(
      'vector.description',
      'Posterize and trace a raster image into self-contained SVG paths on your device. Nothing is uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, vectorizeToolOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <label>
    {t('vector.choose', 'Choose a raster image')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onchange={(event) => selectFile(event.currentTarget.files?.[0])}
    />
  </label>
  <button type="button" onclick={() => void vectorize()} disabled={!sourceFile}
    >{t('vector.trace', 'Trace image')}</button
  >
  <button type="button" onclick={downloadSvg} disabled={!svg}
    >{t('vector.download', 'Download SVG')}</button
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if previewUrl}
    <section aria-labelledby="vector-preview-heading">
      <h2 id="vector-preview-heading">
        {t('vector.preview', 'Faithful exported SVG preview')}
      </h2>
      <p>
        {t(
          'vector.previewDescription',
          'The preview and download use the same exact self-contained SVG text.',
        )}
      </p>
      <img src={previewUrl} alt={t('vector.previewAlt', 'Traced SVG export preview')} />
    </section>
  {/if}
</main>

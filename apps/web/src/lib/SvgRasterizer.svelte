<script lang="ts">
  import { rasterizeSvg } from '@complianttools/image-engine/codecs/svg/rasterize';
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine/errors';
  import {
    SvgRasterizeToolOptionsSchema,
    svgRasterizeOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/svg-to-png' : `/${locale}/svg-to-png`);

  let status = $state('');
  let error = $state('');
  let options = $state(SvgRasterizeToolOptionsSchema.parse({}));
  const controlValues = $derived({ 'svg.mode': options.mode, 'svg.value': options.value });

  function setControl(path: string, value: unknown) {
    if (!path.startsWith('svg.')) return;
    const parsed = SvgRasterizeToolOptionsSchema.safeParse({
      ...options,
      [path.slice(4)]: value,
    });
    if (parsed.success) options = parsed.data;
  }

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const result = await withTypedEngineErrorsAsync(
        t('svgRaster.failure', 'SVG rasterization failed'),
        t('svgRaster.remedy', 'Choose a valid self-contained SVG or reduce the output dimensions.'),
        async () => {
          const svg = await file.text();
          const rasterOptions =
            options.mode === 'width'
              ? { width: options.value }
              : options.mode === 'height'
                ? { height: options.value }
                : options.mode === 'scale'
                  ? { zoom: options.value }
                  : {};
          const image = await rasterizeSvg(svg, rasterOptions);
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context)
            throw new Error(
              t('svgRaster.canvasError', 'Your browser cannot create a local canvas.'),
            );
          context.putImageData(
            new ImageData(image.frames[0].data, image.width, image.height),
            0,
            0,
          );
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (encoded) =>
                encoded
                  ? resolve(encoded)
                  : reject(new Error(t('svgRaster.pngError', 'PNG encoding failed.'))),
              'image/png',
            ),
          );
          return { blob, width: image.width, height: image.height };
        },
      );
      const url = URL.createObjectURL(result.blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.(?:svg|svgz)$/iu, '')}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `${t('svgRaster.done', 'Rasterized {value} to PNG locally at', file.name)} ${result.width}×${result.height}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('svgRaster.unable', 'Unable to rasterize this SVG.');
    }
  }
</script>

<svelte:head>
  <title>{t('svgRaster.title', 'SVG to PNG')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'svgRaster.metaDescription',
      'Rasterize a self-contained SVG to PNG locally in your browser.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}
    >{t('svgRaster.back', '← Convert')}</a
  >
  <h1>{t('svgRaster.title', 'SVG to PNG')}</h1>
  <p>
    {t(
      'svgRaster.description',
      'Rasterize a self-contained SVG locally. External references and active SVG content are refused.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, svgRasterizeOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <label
    >{t('svgRaster.choose', 'Choose an SVG')}
    <input
      type="file"
      accept="image/svg+xml,.svg"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

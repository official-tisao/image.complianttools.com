<script lang="ts">
  import { onDestroy } from 'svelte';
  import { encodeRasterAsWebp } from '@complianttools/image-engine/codecs/jsquash';
  import { encodeAnimatedWebp } from '@complianttools/image-engine/codecs/simple/animated-webp';
  import { prepareWebpSequence } from '@complianttools/image-engine/codecs/simple/webp-export';
  import { decodeGif } from '@complianttools/image-engine/codecs/third-party/gif';
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
  } from '@complianttools/image-engine/errors';
  import { createRaster } from '@complianttools/image-engine/ops/raster';
  import {
    WebpConverterToolOptionsSchema,
    webpConverterToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import type { FormatId, RasterImage } from '@complianttools/image-engine/types';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/webp-converter' : `/${locale}/webp-converter`);
  let options = $state(WebpConverterToolOptionsSchema.parse({}));
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function updateOption(path: string, value: unknown) {
    const name = path.slice('webp.'.length);
    if (!(name in options)) return;
    const parsed = WebpConverterToolOptionsSchema.safeParse({ ...options, [name]: value });
    if (parsed.success) options = parsed.data;
  }

  async function decodeFile(file: File): Promise<RasterImage> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const format: FormatId =
      extension === 'gif'
        ? 'gif'
        : extension === 'png'
          ? 'png'
          : extension === 'webp'
            ? 'webp'
            : 'jpeg';
    return decodeWithTypedErrors(format, async () => {
      if (format === 'gif') return decodeGif(await file.arrayBuffer());
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context)
          throw new Error(t('webp.canvasError', 'Your browser cannot create a local canvas.'));
        context.drawImage(bitmap, 0, 0);
        return createRaster(
          bitmap.width,
          bitmap.height,
          new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
        );
      } finally {
        bitmap.close();
      }
    });
  }

  async function convert(fileList: globalThis.FileList | null) {
    status = '';
    error = '';
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    try {
      const decoded = await Promise.all(files.map(decodeFile));
      const prepared = prepareWebpSequence(decoded, options);
      let output: Uint8Array;
      let frameCount = 1;
      if (options.animated) {
        output = await encodeAnimatedWebp(prepared, {
          quality: options.quality,
          lossless: options.lossless,
          loopCount: options.loopCount,
        });
        frameCount = prepared.frames.length;
      } else {
        output = new Uint8Array(
          await encodeRasterAsWebp(prepared, {
            quality: options.quality,
            lossless: options.lossless ? 1 : 0,
          }),
        );
      }
      URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([output], { type: 'image/webp' }));
      const download = document.createElement('a');
      download.href = previewUrl;
      download.download = `${files[0]!.name.replace(/\.[^.]+$/u, '')}.webp`;
      download.click();
      status = `${t('webp.created', 'Created')} ${options.lossless ? t('webp.lossless', 'lossless') : `${t('webp.lossyQuality', 'lossy quality')} ${options.quality}`} WebP ${t('webp.locally', 'locally')} (${frameCount} ${t(frameCount === 1 ? 'webp.frame' : 'webp.frames', frameCount === 1 ? 'frame' : 'frames')}, ${output.byteLength.toLocaleString()} ${t('webp.bytes', 'bytes')}).`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${t('webp.remedy', 'Choose valid supported images, reduce their dimensions or frame count, or change the WebP settings.')}`;
    }
  }
</script>

<svelte:head>
  <title>{t('webp.title', 'WebP Converter')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'webp.metaDescription',
      'Create lossy, lossless, or animated WebP images locally in your browser.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('webp.back', '← Convert')}</a>
  <h1>{t('webp.title', 'WebP Converter')}</h1>
  <p>
    {t(
      'webp.description',
      'Create lossy, lossless, or animated WebP files on your device. Nothing is uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, webpConverterToolOptionDescriptions)}
    values={Object.fromEntries(
      Object.entries(options).map(([name, value]) => [`webp.${name}`, value]),
    )}
    onChange={updateOption}
    {locale}
  />
  <label>
    {t('webp.choose', 'Choose image files')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
      multiple={options.animated}
      onchange={(event) => void convert(event.currentTarget.files)}
    />
  </label>
  {#if previewUrl}<figure>
      <img src={previewUrl} alt={t('webp.previewAlt', 'Encoded WebP preview')} />
      <figcaption>
        {t('webp.previewDescription', 'Preview of the exact downloaded WebP bytes.')}
      </figcaption>
    </figure>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

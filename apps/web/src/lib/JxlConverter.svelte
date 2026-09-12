<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getCodec } from '@complianttools/image-engine/codecs/registry';
  import { decodeJxlToRaster } from '@complianttools/image-engine/codecs/third-party/jxl-decode';
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
  } from '@complianttools/image-engine/errors';
  import { createRaster } from '@complianttools/image-engine/ops/raster';
  import {
    JxlConverterToolOptionsSchema,
    jxlConverterToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { encodeInFormatWorker } from '$lib/formatEncoderWorker';
  import { localizeOptions, translate, type Locale } from './i18n';

  const lazyBytes = getCodec('jxl').lazyBytes;
  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/jxl-converter' : `/${locale}/jxl-converter`);
  let options = $state(JxlConverterToolOptionsSchema.parse({}));
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function updateOption(path: string, value: unknown) {
    const name = path.slice('jxl.'.length);
    if (!(name in options)) return;
    const parsed = JxlConverterToolOptionsSchema.safeParse({ ...options, [name]: value });
    if (parsed.success) options = parsed.data;
  }

  async function rasterFromBrowserImage(file: File) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(t('jxl.canvasError', 'Your browser cannot create a local canvas.'));
      context.drawImage(bitmap, 0, 0);
      return createRaster(
        bitmap.width,
        bitmap.height,
        new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
      );
    } finally {
      bitmap.close();
    }
  }

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      let blob: Blob;
      let extension: 'jxl' | 'png';
      if (options.direction === 'encode') {
        const sourceExtension = file.name.split('.').pop()?.toLowerCase();
        const sourceFormat =
          sourceExtension === 'webp'
            ? 'webp'
            : /jpe?g|jfif/u.test(sourceExtension ?? '')
              ? 'jpeg'
              : 'png';
        const raster = await decodeWithTypedErrors(sourceFormat, () =>
          rasterFromBrowserImage(file),
        );
        const bytes = await encodeInFormatWorker('jxl', raster, {
          quality: options.quality,
          lossless: options.lossless,
          effort: options.effort,
        });
        blob = new Blob([bytes], { type: 'image/jxl' });
        extension = 'jxl';
        status = `${t('jxl.created', 'Created')} ${options.lossless ? t('jxl.losslessRaster', 'lossless raster') : `${t('jxl.lossyQuality', 'lossy quality')} ${options.quality}`} ${raster.width}×${raster.height} JPEG XL ${t('jxl.locally', 'locally')}.`;
      } else {
        const image = await decodeWithTypedErrors('jxl', async () =>
          decodeJxlToRaster(await file.arrayBuffer()),
        );
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context)
          throw new Error(t('jxl.canvasError', 'Your browser cannot create a local canvas.'));
        const imageData = context.createImageData(image.width, image.height);
        imageData.data.set(image.frames[0].data);
        context.putImageData(imageData, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error(t('jxl.pngError', 'Unable to encode PNG locally.'))),
            'image/png',
          ),
        );
        extension = 'png';
        status = `${t('jxl.converted', 'Converted')} ${image.width}×${image.height} ${t('jxl.toPng', 'JPEG XL image to PNG locally')}.`;
      }
      URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = previewUrl;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.${extension}`;
      download.click();
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${t('jxl.remedy', 'Choose a valid supported image, reduce its dimensions, or change the JPEG XL settings.')}`;
    }
  }
</script>

<svelte:head>
  <title>{t('jxl.title', 'JPEG XL Converter')} — Image Compliant Tools</title>
  <meta name="description" content="Encode images as JPEG XL or decode JPEG XL to PNG locally." />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <meta property="og:title" content="JPEG XL Converter" />
  <meta property="og:description" content="Encode JPEG XL or decode to PNG locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "JPEG XL Converter",
      "applicationCategory": "MultimediaApplication",
      "operatingSystem": "Any",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
    }
  </script>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Image Tools",
          "item": "https://image.complianttools.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "JPEG XL Converter",
          "item": "https://image.complianttools.com/jxl-converter"
        }
      ]
    }
  </script>
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('jxl.back', '← Convert')}</a>
  <h1>{t('jxl.title', 'JPEG XL Converter')}</h1>
  <p>
    {t(
      'jxl.description',
      'Encode PNG, JPEG, or WebP pixels as JPEG XL, or decode JPEG XL to PNG locally. Nothing is uploaded. The local codec downloads only after you choose a file and is about',
    )}
    {Math.round((lazyBytes / 1_000_000) * 10) / 10} MB.
  </p>
  <p>
    {t(
      'jxl.reconstructionNotice',
      'Lossless raster mode preserves decoded pixels. Reconstructible JPEG recompression is not exposed by the pinned browser codec and is not claimed here.',
    )}
  </p>
  <h2>{t('jxl.faqTitle', 'Frequently asked')}</h2>
  <div>
    <h3>{t('jxl.faqTitle1', 'Does lossless mode preserve pixels?')}</h3>
    <p>{t('jxl.faqAnswer1', 'Yes. Lossless raster mode preserves decoded pixels exactly.')}</p>
    <h3>{t('jxl.faqTitle2', 'Can I recompress a JPEG as JPEG XL?')}</h3>
    <p>
      {t(
        'jxl.faqAnswer2',
        'No. Reconstructible JPEG recompression is not exposed by the pinned browser codec.',
      )}
    </p>
    <h3>{t('jxl.faqTitle3', 'Is anything uploaded?')}</h3>
    <p>{t('jxl.faqAnswer3', 'No. Everything runs locally.')}</p>
  </div>
  <GeneratedControls
    descriptions={localizeOptions(locale, jxlConverterToolOptionDescriptions)}
    values={Object.fromEntries(
      Object.entries(options).map(([name, value]) => [`jxl.${name}`, value]),
    )}
    onChange={updateOption}
    {locale}
  />
  <label>
    {options.direction === 'encode'
      ? t('jxl.chooseSource', 'Choose a PNG, JPEG, or WebP image')
      : t('jxl.chooseJxl', 'Choose a JPEG XL image')}
    <input
      type="file"
      accept={options.direction === 'encode'
        ? 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
        : 'image/jxl,.jxl'}
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if previewUrl}<figure>
      {#if options.direction === 'decode'}<img
          src={previewUrl}
          alt={t('jxl.previewAlt', 'Exact converted output preview')}
        />
      {:else}<p>
          {t(
            'jxl.previewUnavailable',
            'JPEG XL preview requires decoding; the downloaded bytes are retained locally.',
          )}
        </p>{/if}
      <figcaption>
        {t('jxl.previewDescription', 'Output created entirely in this browser.')}
      </figcaption>
    </figure>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

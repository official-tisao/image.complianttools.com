<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getCodec } from '@complianttools/image-engine/codecs/registry';
  import { decodeAvifToRaster } from '@complianttools/image-engine/codecs/third-party/avif-decode';
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
  } from '@complianttools/image-engine/errors';
  import { createRaster } from '@complianttools/image-engine/ops/raster';
  import {
    AvifConverterToolOptionsSchema,
    avifConverterToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { encodeInFormatWorker } from '$lib/formatEncoderWorker';
  import { localizeOptions, translate, type Locale } from './i18n';

  const lazyBytes = getCodec('avif').lazyBytes;
  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/avif-converter' : `/${locale}/avif-converter`);
  let options = $state(AvifConverterToolOptionsSchema.parse({}));
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function updateOption(path: string, value: unknown) {
    const name = path.slice('avif.'.length);
    if (!(name in options)) return;
    const parsed = AvifConverterToolOptionsSchema.safeParse({ ...options, [name]: value });
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
        throw new Error(t('avif.canvasError', 'Your browser cannot create a local canvas.'));
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
      let extension: 'avif' | 'png';
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
        const bytes = await encodeInFormatWorker('avif', raster, {
          quality: options.quality,
          lossless: options.lossless,
          speed: options.speed,
          subsample: { '444': 3, '422': 2, '420': 1 }[options.chroma],
          bitDepth: options.bitDepth,
        });
        blob = new Blob([bytes], { type: 'image/avif' });
        extension = 'avif';
        status = `${t('avif.created', 'Created')} ${options.lossless ? t('avif.lossless', 'lossless') : `${t('avif.lossyQuality', 'lossy quality')} ${options.quality}`} ${raster.width}×${raster.height} AVIF ${t('avif.locally', 'locally')}.`;
      } else {
        const image = await decodeWithTypedErrors('avif', async () =>
          decodeAvifToRaster(await file.arrayBuffer()),
        );
        const frame = image.frames[0];
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context)
          throw new Error(t('avif.canvasError', 'Your browser cannot create a local canvas.'));
        const imageData = context.createImageData(image.width, image.height);
        imageData.data.set(frame.data);
        context.putImageData(imageData, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error(t('avif.pngError', 'Unable to encode PNG locally.'))),
            'image/png',
          ),
        );
        extension = 'png';
        status = `${t('avif.converted', 'Converted')} ${image.width}×${image.height} ${t('avif.toPng', 'AVIF image to PNG locally')}.`;
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
        : `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${t('avif.remedy', 'Choose a valid supported image, reduce its dimensions, or change the AVIF settings.')}`;
    }
  }
</script>

<svelte:head>
  <title>{t('avif.title', 'AVIF Converter')} — Image Compliant Tools</title>
  <meta name="description" content="Encode images as AVIF or decode AVIF to PNG locally." />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <meta property="og:title" content="AVIF Converter" />
  <meta property="og:description" content="Encode AVIF or decode AVIF to PNG locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('avif.back', '← Convert')}</a>
  <h1>{t('avif.title', 'AVIF Converter')}</h1>
  <p>
    {t(
      'avif.description',
      'Encode PNG, JPEG, or WebP as AVIF, or decode AVIF to PNG locally. Nothing is uploaded. The local codec downloads only after you choose a file and is about',
    )}
    {Math.round((lazyBytes / 1_000_000) * 10) / 10} MB.
  </p>
  <p class="encoding-notice">
    {t(
      'avif.slowNotice',
      'AVIF encoding is slower than JPEG or WebP because it searches more compression choices to produce smaller files. Higher speed settings finish sooner.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, avifConverterToolOptionDescriptions)}
    values={Object.fromEntries(
      Object.entries(options).map(([name, value]) => [`avif.${name}`, value]),
    )}
    onChange={updateOption}
    {locale}
  />
  <label>
    {options.direction === 'encode'
      ? t('avif.chooseSource', 'Choose a PNG, JPEG, or WebP image')
      : t('avif.chooseAvif', 'Choose an AVIF image')}
    <input
      type="file"
      accept={options.direction === 'encode'
        ? 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
        : 'image/avif,.avif'}
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if previewUrl}<figure>
      <img src={previewUrl} alt={t('avif.previewAlt', 'Exact converted output preview')} />
      <figcaption>
        {t('avif.previewDescription', 'Preview of the exact downloaded bytes.')}
      </figcaption>
    </figure>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

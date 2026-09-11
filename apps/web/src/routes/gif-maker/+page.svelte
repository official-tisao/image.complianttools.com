<script lang="ts">
  import { page } from '$app/state';
  import {
    createRaster,
    encodeGif,
    generateGifFrames,
    withTypedEngineErrorsAsync,
    engineErrorMessage,
    isEngineError,
  } from '@complianttools/image-engine';
  import {
    GifMakerToolOptionsSchema,
    gifMakerToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from '$lib/i18n';

  const locale = $derived(
    (page.url.pathname.split('/')[1] === 'ar'
      ? 'ar'
      : page.url.pathname.split('/')[1] === 'en-XA'
        ? 'en-XA'
        : 'en') as Locale,
  );

  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);

  const localizedPath = $derived(locale === 'en' ? '/gif-maker' : `/${locale}/gif-maker`);

  let status = $state('');
  let error = $state('');
  let options = $state(GifMakerToolOptionsSchema.parse({}));
  let files = $state<readonly File[]>([]);

  const controlValues = $derived({
    'gifMaker.optimizeLevel': options.optimizeLevel,
    'gifMaker.lossy': options.lossy,
    'gifMaker.quantizer': options.quantizer,
    'gifMaker.paletteSize': options.paletteSize,
    'gifMaker.paletteMode': options.paletteMode,
    'gifMaker.transparencyIndex': options.transparencyIndex,
    'gifMaker.dither': options.dither,
    'gifMaker.ditherAmount': options.ditherAmount,
    'gifMaker.disposal': options.disposal,
    'gifMaker.interlace': options.interlace,
    'gifMaker.frameGenerator': options.frameGenerator,
    'gifMaker.crossfadeFrames': options.crossfadeFrames,
    'gifMaker.delayMs': options.delayMs,
    'gifMaker.loopCount': options.loopCount,
  } as const);

  function setControl(path: string, value: unknown) {
    const key = path.replace('gifMaker.', '') as keyof typeof options;

    try {
      options = GifMakerToolOptionsSchema.parse({ ...options, [key]: value });
      error = '';
    } catch (_e) {
      error = t('gifMaker.invalidOption', 'Invalid option value.');
    }
  }

  function selectFiles(selected: readonly File[]) {
    files = selected;
    status = selected.length
      ? `${t('gifMaker.filesReady', '{value} files ready', selected.length)}`
      : '';
    error = '';
  }

  async function createGif() {
    status = '';
    error = '';

    if (files.length === 0) {
      error = t('gifMaker.chooseFirst', 'Choose at least one image first.');
      return;
    }

    try {
      await withTypedEngineErrorsAsync(
        t('gifMaker.failure', 'GIF creation failed'),
        t(
          'gifMaker.remedy',
          'Choose valid image files, reduce dimensions or frame count, or adjust encoding settings.',
        ),
        async () => {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { willReadFrequently: true });

          if (!context) {
            throw new Error(
              t('gifMaker.canvasError', 'Your browser cannot create a local canvas.'),
            );
          }

          const frames: { data: Uint8ClampedArray; durationMs: number }[] = [];

          for (const [index, file] of files.entries()) {
            const bitmap = await createImageBitmap(file);

            if (index === 0) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
            }

            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0);
            bitmap.close();

            frames.push({
              data: new Uint8ClampedArray(
                context.getImageData(0, 0, canvas.width, canvas.height).data,
              ),
              durationMs: options.delayMs,
            });
          }

          const base = createRaster(canvas.width, canvas.height, frames[0]!.data);

          const image = generateGifFrames(
            { ...base, frames: frames as unknown as typeof base.frames },
            options.frameGenerator,
            options.crossfadeFrames,
          );

          const bytes = encodeGif(image, options.loopCount, {
            optimizeLevel: options.optimizeLevel,
            lossy: options.lossy,
            quantizer: options.quantizer,
            paletteSize: options.paletteSize,
            paletteMode: options.paletteMode,
            transparencyIndex: options.transparencyIndex,
            dither: options.dither,
            ditherAmount: options.ditherAmount,
            disposal: options.disposal,
            interlace: options.interlace,
          });

          const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
          const download = document.createElement('a');

          download.href = url;
          download.download = `${files[0]!.name.replace(/\.[^.]+$/u, '')}.gif`;
          download.click();

          URL.revokeObjectURL(url);

          status = translate(
            locale,
            'gifMaker.created',
            'Created a {width}×{height} GIF with {frames} frame(s) locally ({bytes} bytes; loop {loop}, {generator}, {quantizer}, {paletteMode} palette up to {size} entries, transparency index {transparency}, {dither} dithering at {ditherAmount}%, {disposal} disposal, {interlace}, optimization {opt}, palette reduction {lossy}).',
          )
            .replace('{width}', String(canvas.width))
            .replace('{height}', String(canvas.height))
            .replace('{frames}', String(image.frames.length))
            .replace('{bytes}', String(bytes.byteLength))
            .replace('{loop}', String(options.loopCount))
            .replace('{generator}', options.frameGenerator)
            .replace('{quantizer}', options.quantizer)
            .replace('{paletteMode}', options.paletteMode)
            .replace('{size}', String(options.paletteSize))
            .replace('{transparency}', String(options.transparencyIndex))
            .replace('{dither}', options.dither)
            .replace('{ditherAmount}', String(options.ditherAmount))
            .replace('{disposal}', options.disposal)
            .replace('{interlace}', options.interlace ? 'interlaced' : 'sequential')
            .replace('{opt}', String(options.optimizeLevel))
            .replace('{lossy}', String(options.lossy));
        },
      );
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : reason instanceof Error
          ? reason.message
          : t('gifMaker.unable', 'Unable to create the GIF.');
    }
  }
</script>

<svelte:head>
  <title>{t('gifMaker.title', 'GIF Maker')} — Image Compliant Tools</title>

  <meta
    name="description"
    content={t(
      'gifMaker.metaDescription',
      'Create animated GIFs locally with quantization, dithering, palette, and optimization controls.',
    )}
  />

  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <link rel="alternate" hreflang="en" href="https://image.complianttools.com/gif-maker" />
  <link rel="alternate" hreflang="ar" href="https://image.complianttools.com/ar/gif-maker" />

  <meta property="og:title" content={t('gifMaker.title', 'GIF Maker')} />

  <meta
    property="og:description"
    content={t('gifMaker.metaDescription', 'Build local GIFs with full control.')}
  />

  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />

  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "GIF Maker",
      "applicationCategory": "MultimediaApplication",
      "operatingSystem": "Any",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
    }
  </script>
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>
    {t('gifMaker.back', '← Convert')}
  </a>

  <h1>{t('gifMaker.title', 'GIF Maker')}</h1>

  <p>
    {t(
      'gifMaker.description',
      'Create an animated GIF locally from one or more images. Configure quantization, dithering, palette mode, frame optimization, loop count, and frame generation (forward, reverse, bounce, or crossfade). Nothing is uploaded.',
    )}
  </p>

  <h2>{t('gifMaker.faqTitle', 'Frequently asked')}</h2>

  <div>
    <h3>{t('gifMaker.faqTitle1', 'Does the preview match the download?')}</h3>

    <p>
      {t(
        'gifMaker.faqAnswer1',
        'Yes. The same encoded GIF bytes are offered by the download link.',
      )}
    </p>

    <h3>{t('gifMaker.faqTitle2', 'Can I adjust quantization and dithering?')}</h3>

    <p>
      {t(
        'gifMaker.faqAnswer2',
        'Yes. Select quantizer (median-cut, octree, Wu, neural, or fixed 3:3:2), dither method, palette mode, transparency index, and optimization level.',
      )}
    </p>

    <h3>{t('gifMaker.faqTitle3', 'Is anything uploaded?')}</h3>

    <p>{t('gifMaker.faqAnswer3', 'No. All encoding is local using our own GIF encoder.')}</p>
  </div>

  <GeneratedControls
    descriptions={localizeOptions(locale, gifMakerToolOptionDescriptions)}
    values={{ ...controlValues }}
    onChange={setControl}
  />

  <label>
    {t('gifMaker.chooseImages', 'Choose images')}

    <input
      type="file"
      accept="image/*"
      multiple
      aria-label={t('gifMaker.fileAria', 'Image file input for GIF frames')}
      onchange={(event) => selectFiles([...(event.currentTarget.files ?? [])])}
    />
  </label>

  <button type="button" onclick={() => void createGif()} disabled={files.length === 0}>
    {t('gifMaker.create', 'Create GIF')}
  </button>

  {#if status}
    <p role="status">{status}</p>
  {/if}

  {#if error}
    <p role="alert">{error}</p>
  {/if}
</main>

<style>
  label {
    display: block;
    margin-top: 1rem;
  }

  input[type='file'] {
    display: block;
    margin-top: 0.25rem;
  }
</style>

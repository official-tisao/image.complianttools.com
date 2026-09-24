<script lang="ts">
  import {
    HEIC_UNSUPPORTED_MESSAGE,
    decodeHeic,
    detectHeicMimeType,
    isHeicContainer,
    supportsHeicDecode,
  } from '@complianttools/image-engine/codecs/platform/heic';
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine/errors';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import { translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/heic-converter' : `/${locale}/heic-converter`);

  let status = $state('');
  let error = $state('');

  function rasterFromSource(source: unknown, width: number, height: number): RasterImage {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error(t('heic.canvasError', 'Your browser cannot create a local canvas.'));
    context.drawImage(source as never, 0, 0);
    return {
      width,
      height,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [{ data: context.getImageData(0, 0, width, height).data, durationMs: 0 }],
    };
  }

  async function decodeWithNativeImagePipeline(bytes: ArrayBuffer): Promise<RasterImage> {
    const blob = new Blob([bytes], { type: detectHeicMimeType(bytes) });
    if (typeof globalThis.createImageBitmap === 'function') {
      try {
        const bitmap = await globalThis.createImageBitmap(blob);
        try {
          return rasterFromSource(bitmap, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      } catch {
        // Safari may support HEIC through its native image element but not createImageBitmap.
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new globalThis.Image();
      image.src = url;
      await image.decode();
      return rasterFromSource(image, image.naturalWidth, image.naturalHeight);
    } catch {
      throw new Error(HEIC_UNSUPPORTED_MESSAGE);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const result = await withTypedEngineErrorsAsync(
        t('heic.failure', 'HEIC conversion failed'),
        t(
          'heic.remedy',
          'Open the file in a browser with HEIC support, export it as JPEG on its source device, or choose a valid HEIC/HEIF image.',
        ),
        async () => {
          const bytes = await file.arrayBuffer();
          if (!isHeicContainer(bytes)) {
            throw new Error('The selected file is not a valid HEIC or HEIF container.');
          }
          const image = await decodeWithTypedErrors('heic', async () =>
            (await supportsHeicDecode()) ? decodeHeic(bytes) : decodeWithNativeImagePipeline(bytes),
          );
          const frame = image.frames[0];
          if (!frame)
            throw new Error(t('heic.noFrame', 'The HEIC decoder returned no image frame.'));
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context)
            throw new Error(t('heic.canvasError', 'Your browser cannot create a local canvas.'));
          context.putImageData(new ImageData(frame.data, image.width, image.height), 0, 0);
          const png = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(new Error(t('heic.pngError', 'Unable to encode PNG locally.'))),
              'image/png',
            ),
          );
          return { image, png };
        },
      );
      const url = URL.createObjectURL(result.png);
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.(heic|heif)$/iu, '')}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `${t('heic.converted', 'Converted')} ${result.image.width}×${result.image.height} ${t('heic.toPng', 'HEIC image to PNG locally')}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : engineErrorMessage(reason);
    }
  }
</script>

<svelte:head>
  <title>{t('heic.title', 'HEIC / HEIF Converter')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'heic.metaDescription',
      "Convert HEIC and HEIF to PNG locally with your browser's platform decoder. HEIC output is deliberately unavailable.",
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <meta property="og:title" content="HEIC / HEIF Converter" />
  <meta property="og:description" content="Convert HEIC and HEIF to PNG locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('heic.back', '← Convert')}</a>
  <h1>{t('heic.title', 'HEIC / HEIF Converter')}</h1>
  <p>
    {t(
      'heic.description',
      'Convert a HEIC or HEIF image to PNG locally when your browser provides a platform decoder. HEIC encoding is deliberately unavailable.',
    )}
  </p>
  <p>
    {t(
      'heic.faq1',
      'HEIC and HEIF decode through your browser’s platform decoder when available; PNG is always produced locally. HEIC encoding is deliberately unavailable.',
    )}
  </p>
  <h2>{t('heic.faqTitle', 'Frequently asked')}</h2>
  <div>
    <h3>{t('heic.faqTitle1', 'Does HEIC encode work?')}</h3>
    <p>
      {t(
        'heic.faqAnswer1',
        'No. HEIC encoding requires HEVC patents and a GPL/commercial encoder, so only decode is offered.',
      )}
    </p>
    <h3>{t('heic.faqTitle2', 'What formats can I convert from?')}</h3>
    <p>{t('heic.faqAnswer2', 'HEIC and HEIF input files (.heic, .heif) are supported.')}</p>
    <h3>{t('heic.faqTitle3', 'Is my file uploaded?')}</h3>
    <p>{t('heic.faqAnswer3', 'No. The file is read locally; nothing is uploaded.')}</p>
  </div>
  <label aria-label="HEIC file input for conversion to PNG" data-testid="heic-file-label">
    {t('heic.choose', 'Choose a HEIC or HEIF image')}
    <input
      type="file"
      accept="image/heic,image/heif,.heic,.heif"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

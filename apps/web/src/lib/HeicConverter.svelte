<script lang="ts">
  import {
    HEIC_UNSUPPORTED_MESSAGE,
    decodeHeic,
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
    supportsHeicDecode,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine';
  import { translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/heic-converter' : `/${locale}/heic-converter`);

  let status = $state('');
  let error = $state('');

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
          if (!(await supportsHeicDecode())) throw new Error(HEIC_UNSUPPORTED_MESSAGE);
          const bytes = await file.arrayBuffer();
          const image = await decodeWithTypedErrors('heic', () => decodeHeic(bytes));
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
  <label>
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

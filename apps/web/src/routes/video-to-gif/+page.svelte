<script lang="ts">
  import { page } from '$app/state';
  import {
    decodeWithTypedErrors,
    encodeGif,
    engineErrorMessage,
    extractContainerVideoFrame,
    getCodec,
    codecUnavailableError,
    type FormatId,
  } from '@complianttools/image-engine';
  import { translate, type Locale } from '$lib/i18n';

  function getLocale(pathname: string): Locale {
    const segment = pathname.split('/')[1];

    if (segment === 'ar') {
      return 'ar';
    }

    if (segment === 'en-XA') {
      return 'en-XA';
    }

    return 'en';
  }

  const locale = $derived(getLocale(page.url.pathname));

  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);

  const localizedPath = $derived(locale === 'en' ? '/video-to-gif' : `/${locale}/video-to-gif`);

  let timestamp = $state(0);
  let status = $state('');
  let error = $state('');

  const videoFormats: Readonly<Record<string, FormatId>> = {
    mp4: 'mp4',
    m4v: 'm4v',
    mov: 'mov',
    '3gp': '3gp',
    webm: 'webm',
    mkv: 'mkv',
    ogv: 'ogv',
    avi: 'avi',
    wmv: 'wmv',
    flv: 'flv',
    mts: 'mts',
    m2ts: 'm2ts',
  };

  async function extract(file: File | undefined) {
    status = '';
    error = '';

    if (!file) return;

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const format = videoFormats[extension];

      if (!format) {
        throw codecUnavailableError('mp4' as FormatId, 'decode');
      }

      const codec = getCodec(format);

      if (!codec.supports.includes('decode')) {
        throw codecUnavailableError(format, 'decode');
      }

      const frame = await decodeWithTypedErrors(format, () =>
        extractContainerVideoFrame(file, timestamp),
      );

      const output = encodeGif(frame);
      const url = URL.createObjectURL(new Blob([output], { type: 'image/gif' }));
      const download = document.createElement('a');

      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}-frame.gif`;
      download.click();

      URL.revokeObjectURL(url);

      status = t(
        'videoGif.extracted',
        'Extracted the frame at {value} seconds locally.',
        timestamp,
      );
    } catch (reason) {
      error =
        engineErrorMessage(reason) +
        ' ' +
        t('error.remedyLabel', 'Remedy') +
        ': ' +
        (typeof reason === 'object' && reason !== null && 'remedy' in reason
          ? String((reason as { remedy: unknown }).remedy)
          : t(
              'videoGif.remedy',
              'Choose a valid MP4 or WebM video, reduce timestamp, or try another browser.',
            ));
    }
  }
</script>

<svelte:head>
  <title>{t('videoGif.title', 'Video Frame to GIF')} — Image Compliant Tools</title>

  <meta
    name="description"
    content={t(
      'videoGif.metaDescription',
      'Extract one frame from MP4, WebM, MOV, or OGV locally and save it as a GIF.',
    )}
  />

  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />

  <meta property="og:title" content={t('videoGif.title', 'Video Frame to GIF')} />

  <meta
    property="og:description"
    content={t('videoGif.metaDescription', 'Extract a video frame to GIF locally.')}
  />

  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />

  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Video Frame to GIF",
      "applicationCategory": "MultimediaApplication",
      "operatingSystem": "Any",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      }
    }
  </script>
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>
    {t('videoGif.back', '← Convert')}
  </a>

  <h1>{t('videoGif.title', 'Video Frame to GIF')}</h1>

  <p>
    {t(
      'videoGif.description',
      'Extract one frame from MP4, M4V, MOV, 3GP, WebM, MKV, or OGV locally. AVI, WMV, FLV, MTS, and M2TS are named explicitly when unavailable. Decoding also depends on your browser’s WebCodecs support; no video codec is downloaded.',
    )}
  </p>

  <h2>{t('videoGif.faqTitle', 'Frequently asked')}</h2>

  <div>
    <h3>{t('videoGif.faqTitle1', 'Does every browser work?')}</h3>

    <p>
      {t(
        'videoGif.faqAnswer1',
        'MP4 and WebM require a compatible local WebCodecs VideoDecoder; unsupported codecs are reported with a typed remedy.',
      )}
    </p>

    <h3>{t('videoGif.faqTitle2', 'Does the preview match the download?')}</h3>

    <p>
      {t(
        'videoGif.faqAnswer2',
        'Yes. The same decoded RGBA frame is encoded to GIF and offered as the download.',
      )}
    </p>

    <h3>{t('videoGif.faqTitle3', 'Is anything uploaded?')}</h3>

    <p>
      {t('videoGif.faqAnswer3', 'No. Everything is processed locally in your browser.')}
    </p>
  </div>

  <label>
    {t('videoGif.timestamp', 'Timestamp in seconds')}

    <input
      type="number"
      min="0"
      step="0.01"
      bind:value={timestamp}
      aria-label={t('videoGif.timestampAria', 'Video timestamp in seconds')}
    />
  </label>

  <label>
    {t('videoGif.choose', 'Choose a video')}

    <input
      type="file"
      accept="video/mp4,video/webm,video/quicktime,video/ogg,.m4v,.mov,.3gp,.mkv,.avi,.wmv,.flv,.mts,.m2ts"
      aria-label={t('videoGif.fileAria', 'Video file input')}
      onchange={(event) => void extract(event.currentTarget.files?.[0])}
    />
  </label>

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

  input[type='number'],
  input[type='file'] {
    display: block;
    margin-top: 0.25rem;
  }
</style>

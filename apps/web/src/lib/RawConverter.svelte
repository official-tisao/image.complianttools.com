<script lang="ts">
  import { developDng } from '@complianttools/image-engine/codecs/raw/develop';
  import { extractRawCameraPreview } from '@complianttools/image-engine/codecs/raw/preview';
  import { rawPreviewExtensionError } from '@complianttools/image-engine/codecs/raw/support';
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
  } from '@complianttools/image-engine/errors';
  import {
    RawToolOptionsSchema,
    rawToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/raw-converter' : `/${locale}/raw-converter`);

  let status = $state(''),
    error = $state(''),
    previewUrl = $state(''),
    developedUrl = $state(''),
    developedDownload = $state(''),
    developedFilename = $state('developed.png');
  let options = $state(RawToolOptionsSchema.parse({}));
  const controlValues = $derived(
    Object.fromEntries(Object.entries(options).map(([key, value]) => [`raw.${key}`, value])),
  );

  function setControl(path: string, value: unknown) {
    if (!path.startsWith('raw.')) return;
    const parsed = RawToolOptionsSchema.safeParse({ ...options, [path.slice(4)]: value });
    if (parsed.success) options = parsed.data;
  }

  function replaceUrl(current: string, next: string) {
    if (current) URL.revokeObjectURL(current);
    return next;
  }
  async function canvasPng(data: Uint8ClampedArray, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.putImageData(new ImageData(data, width, height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob)
      throw new Error(
        t('raw.pngError', 'The browser could not encode the developed DNG preview as PNG.'),
      );
    return blob;
  }
  async function extract(file: File | undefined) {
    status = '';
    error = '';
    previewUrl = replaceUrl(previewUrl, '');
    developedUrl = replaceUrl(developedUrl, '');
    developedDownload = replaceUrl(developedDownload, '');
    if (!file) return;
    try {
      const extensionError = rawPreviewExtensionError(file.name);
      if (extensionError) throw extensionError;
      const bytes = await file.arrayBuffer(),
        baseName = file.name.replace(/\.[^.]+$/u, '');
      const isDng = file.name.toLowerCase().endsWith('.dng');
      if (options.instantPreview) {
        try {
          const preview = await decodeWithTypedErrors('raw', () => extractRawCameraPreview(bytes));
          previewUrl = replaceUrl(
            previewUrl,
            URL.createObjectURL(new Blob([preview.bytes], { type: preview.mimeType })),
          );
          const download = document.createElement('a');
          download.href = previewUrl;
          download.download = `${baseName}-camera-preview.${preview.extension}`;
          download.click();
          status = `${t('raw.extracted', 'Extracted')} ${preview.label}. ${t('raw.previewNotice', "This is the camera's embedded rendering, not a RAW develop")}.`;
        } catch (reason) {
          if (!isDng) throw reason;
          status = t(
            'raw.noPreview',
            'No embedded camera preview was found; continuing with the full DNG develop.',
          );
        }
      }
      if (!isDng) {
        status = `${status ? `${status} ` : ''}${t('raw.dngOnly', 'Full RAW development is available for DNG only; proprietary sensor-data decoding is not shipped, so this format remains camera-preview only.')}`;
        return;
      }
      status = `${status ? `${status} ` : ''}${t('raw.developing', 'Developing the DNG in the background…')}`;
      await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
      const developed = await decodeWithTypedErrors('raw', () => developDng(bytes, options));
      const png = await canvasPng(developed.frames[0].data, developed.width, developed.height);
      developedUrl = replaceUrl(developedUrl, URL.createObjectURL(png));
      if (options.outputBitDepth === 16 && developed.frames[0].data16) {
        const raw16 = new Uint16Array(developed.frames[0].data16);
        developedDownload = replaceUrl(
          developedDownload,
          URL.createObjectURL(new Blob([raw16], { type: 'application/octet-stream' })),
        );
        developedFilename = `${baseName}-${developed.width}x${developed.height}-rgba16le.raw`;
      } else {
        developedDownload = replaceUrl(developedDownload, URL.createObjectURL(png));
        developedFilename = `${baseName}-developed.png`;
      }
      status = `${t('raw.complete', 'DNG develop complete at')} ${options.outputBitDepth}-${t('raw.bitUsing', 'bit using')} ${options.demosaic.toUpperCase()}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${t('raw.remedy', 'Choose a valid supported RAW file, use DNG for full development, or reduce the source dimensions.')}`;
    }
  }
</script>

<svelte:head
  ><title>{t('raw.seoTitle', 'RAW & DNG')} — Image Compliant Tools</title><meta
    name="description"
    content="Extract RAW camera previews and develop DNG files locally."
  /><link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} /></svelte:head
>
<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('raw.back', '← Convert')}</a>
  <h1>{t('raw.title', 'RAW Camera Preview and DNG Developer')}</h1>
  <p>
    {t(
      'raw.description',
      "Embedded previews are the camera's rendering, not a full RAW develop. Full development currently supports DNG.",
    )}
  </p>
  <fieldset>
    <legend>{t('raw.options', 'DNG develop options')}</legend>
    <GeneratedControls
      descriptions={localizeOptions(locale, rawToolOptionDescriptions)}
      values={controlValues}
      onChange={setControl}
      {locale}
    />
  </fieldset>
  <label
    >{t('raw.choose', 'Choose a RAW file')}
    <input
      type="file"
      accept=".3fr,.arw,.bay,.cap,.cr2,.cr3,.crf,.crw,.cs1,.dcr,.dcs,.dng,.drf,.erf,.fff,.iiq,.k25,.kdc,.mdc,.mef,.mos,.mrw,.nef,.nrw,.orf,.pef,.ptx,.raf,.raw,.rw2,.rwl,.rwz,.sr2,.srf,.srw,.x3f"
      onchange={(event) => void extract(event.currentTarget.files?.[0])}
    /></label
  >
  {#if previewUrl}<h2>{t('raw.cameraPreview', 'Camera preview')}</h2>
    <img src={previewUrl} alt={t('raw.cameraPreviewAlt', 'Embedded camera preview')} />{/if}
  {#if developedUrl}<h2>{t('raw.developedPreview', 'Developed DNG preview')}</h2>
    <img src={developedUrl} alt={t('raw.developedPreviewAlt', 'Developed DNG preview')} />
    <p>
      <a href={developedDownload} download={developedFilename}
        >{t('raw.download', 'Download')}
        {options.outputBitDepth}-{t('raw.bitOutput', 'bit developed output')}</a
      >
    </p>{/if}
  {#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
</main>

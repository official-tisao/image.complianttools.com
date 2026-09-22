<script lang="ts">
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine/errors';
  import {
    readIllustratorDocumentInfo,
    readPdfDocumentInfo,
    renderIllustratorPage,
    renderPdfPage,
  } from '@complianttools/image-engine/documents/pdf-read';
  import {
    PdfToImageOptionsSchema,
    pdfToImageOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/pdf-to-image' : `/${locale}/pdf-to-image`);

  let status = $state('');
  let error = $state('');
  let options = $state(PdfToImageOptionsSchema.parse({}));
  const controlValues = $derived({
    'pdf.pageNumber': options.pageNumber,
    'pdf.dpi': options.dpi,
  });

  function setControl(path: string, value: unknown) {
    if (!path.startsWith('pdf.')) return;
    const parsed = PdfToImageOptionsSchema.safeParse({ ...options, [path.slice(4)]: value });
    if (parsed.success) options = parsed.data;
  }

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const result = await withTypedEngineErrorsAsync(
        t('pdfImage.failure', 'PDF page rendering failed'),
        t(
          'pdfImage.remedy',
          'Choose a valid PDF or PDF-compatible Illustrator file, select an existing page, or reduce the DPI.',
        ),
        async () => {
          const input = await file.arrayBuffer();
          const isIllustrator = /\.ai$/iu.test(file.name);
          const info = isIllustrator
            ? await readIllustratorDocumentInfo(input)
            : await readPdfDocumentInfo(input);
          if (options.pageNumber > info.pageCount)
            throw new Error(
              `${t('pdfImage.hasPages', 'PDF has {value}', info.pageCount)} ${t(info.pageCount === 1 ? 'pdfImage.page' : 'pdfImage.pages', info.pageCount === 1 ? 'page' : 'pages')}; ${t('pdfImage.unavailablePage', 'the selected page is unavailable')}.`,
            );
          const renderOptions = { pageNumber: options.pageNumber, scale: options.dpi / 72 };
          const image = isIllustrator
            ? await renderIllustratorPage(input, renderOptions, undefined, () =>
                document.createElement('canvas'),
              )
            : await renderPdfPage(input, renderOptions, undefined, () =>
                document.createElement('canvas'),
              );
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context)
            throw new Error(
              t('pdfImage.canvasError', 'Your browser cannot create a local canvas.'),
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
                  : reject(new Error(t('pdfImage.pngError', 'PNG encoding failed.'))),
              'image/png',
            ),
          );
          return { blob, info, image };
        },
      );
      const url = URL.createObjectURL(result.blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.(?:pdf|ai)$/iu, '')}-page-${options.pageNumber}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `${t('pdfImage.renderedPage', 'Rendered page {value}', options.pageNumber)} ${t('pdfImage.of', 'of')} ${result.info.pageCount} ${t('pdfImage.at', 'at')} ${options.dpi} DPI (${result.image.width}×${result.image.height}) ${t('pdfImage.locally', 'locally')}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('pdfImage.unable', 'Unable to render this PDF page.');
    }
  }
</script>

<svelte:head>
  <title>{t('pdfImage.title', 'PDF or Illustrator to Image')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'pdfImage.metaDescription',
      'Render a PDF or modern PDF-compatible Illustrator page to PNG locally.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <meta property="og:title" content="PDF or Illustrator to Image" />
  <meta property="og:description" content="Render PDF page to PNG locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('pdfImage.back', '← Convert')}</a
  >
  <h1>{t('pdfImage.title', 'PDF or Illustrator to Image')}</h1>
  <p>
    {t(
      'pdfImage.description',
      'Render one PDF or modern PDF-compatible Illustrator page to PNG on your device. Legacy PostScript Illustrator files are refused explicitly. Your file is never uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, pdfToImageOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <h2>{t('pdfImage.faqTitle', 'Frequently asked')}</h2>
  <div>
    <h3>{t('pdfImage.faqTitle1', 'Can I convert AI files?')}</h3>
    <p>
      {t(
        'pdfImage.faqAnswer1',
        'Only modern PDF-compatible .ai files are supported. Legacy PostScript .ai files are refused.',
      )}
    </p>
    <h3>{t('pdfImage.faqTitle2', 'Does the preview match the download?')}</h3>
    <p>
      {t(
        'pdfImage.faqAnswer2',
        'Yes. The rendered PNG preview and the download use the same page and DPI.',
      )}
    </p>
    <h3>{t('pdfImage.faqTitle3', 'Is anything uploaded?')}</h3>
    <p>{t('pdfImage.faqAnswer3', 'No. The file is read and rendered locally.')}</p>
  </div>
  <h2>{t('pdfImage.faqTitle', 'Frequently asked')}</h2>
  <div>
    <h3>{t('pdfImage.faqTitle1', 'Can I convert legacy Illustrator files?')}</h3>
    <p>
      {t(
        'pdfImage.faqAnswer1',
        'No. Legacy PostScript AI files are explicitly refused; export as PDF first.',
      )}
    </p>
    <h3>{t('pdfImage.faqTitle2', 'Does the preview match the download?')}</h3>
    <p>{t('pdfImage.faqAnswer2', 'Yes. The same page and DPI are used for both.')}</p>
    <h3>{t('pdfImage.faqTitle3', 'Is anything uploaded?')}</h3>
    <p>{t('pdfImage.faqAnswer3', 'No. Everything is local.')}</p>
  </div>
  <label
    >{t('pdfImage.choose', 'Choose a PDF or AI file')}
    <input
      type="file"
      accept="application/pdf,.pdf,.ai"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

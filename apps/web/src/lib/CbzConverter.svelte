<script lang="ts">
  import { onDestroy } from 'svelte';
  import { codecUnavailableError } from '@complianttools/image-engine/codecs/registry';
  import { decodeCbz, encodeCbz, type ComicPage } from '@complianttools/image-engine/documents/cbz';
  import { createPdfFromPngPages } from '@complianttools/image-engine/documents/pdf';
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine/errors';
  import {
    CbzToolOptionsSchema,
    cbzToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  type LocalBlobPart = NonNullable<ConstructorParameters<typeof globalThis.Blob>[0]>[number];
  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/cbz-converter' : `/${locale}/cbz-converter`);
  let status = $state('');
  let error = $state('');
  let files = $state<readonly File[]>([]);
  let output = $state<Uint8Array>();
  let outputName = $state('');
  let outputType = $state('');
  let extractedPages = $state<readonly ComicPage[]>([]);
  let previewUrl = $state('');
  let options = $state(CbzToolOptionsSchema.parse({}));
  const controlValues = $derived({ 'cbz.operation': options.operation });
  const previewNames = $derived(
    options.operation === 'create' && output ? decodeCbz(output).map((page) => page.name) : [],
  );

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function clearOutput() {
    output = undefined;
    outputName = '';
    outputType = '';
    extractedPages = [];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (path !== 'cbz.operation') return;
    const parsed = CbzToolOptionsSchema.safeParse({ operation: value });
    if (parsed.success) {
      options = parsed.data;
      files = [];
      status = '';
      error = '';
      clearOutput();
    }
  }
  function selectFiles(selected: readonly File[]) {
    files = selected;
    status = selected.length
      ? `${selected.length} ${t(selected.length === 1 ? 'cbz.fileReady' : 'cbz.filesReady', selected.length === 1 ? 'file ready' : 'files ready')}.`
      : '';
    error = '';
    clearOutput();
  }
  async function pageAsPng(page: ComicPage) {
    const bitmap = await createImageBitmap(new Blob([page.bytes as LocalBlobPart]));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(
          t('cbz.canvasError', 'Your browser cannot create a local canvas for a comic page.'),
        );
      context.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error(`${t('cbz.encodeError', 'Unable to encode')} ${page.name}.`)),
          'image/png',
        ),
      );
      return {
        pngBytes: new Uint8Array(await blob.arrayBuffer()),
        width: bitmap.width,
        height: bitmap.height,
      };
    } finally {
      bitmap.close();
    }
  }
  async function generate() {
    status = '';
    error = '';
    clearOutput();
    if (files.length === 0) {
      error = t('cbz.chooseFirst', 'Choose input files first.');
      return;
    }
    try {
      await withTypedEngineErrorsAsync(
        t('cbz.failure', 'Comic conversion failed'),
        t('cbz.remedy', 'Choose valid image pages or a bounded CBZ/ZIP archive and try again.'),
        async () => {
          if (options.operation === 'create') {
            const pages = await Promise.all(
              files.map(async (file) => ({
                name: file.name,
                bytes: new Uint8Array(await file.arrayBuffer()),
              })),
            );
            output = new Uint8Array(encodeCbz(pages));
            outputName = 'comic.cbz';
            outputType = 'application/vnd.comicbook+zip';
            status = `${t('cbz.packed', 'Packed {value}', pages.length)} ${t(pages.length === 1 ? 'cbz.imagePage' : 'cbz.imagePages', pages.length === 1 ? 'image page' : 'image pages')} ${t('cbz.intoCbz', 'into a CBZ locally')}.`;
            return;
          }
          const file = files[0]!;
          const source = new Uint8Array(await file.arrayBuffer());
          if (new globalThis.TextDecoder('latin1').decode(source.subarray(0, 4)) === 'Rar!')
            throw codecUnavailableError('cbr', 'decode');
          const pages = decodeCbz(source);
          if (options.operation === 'extract') {
            extractedPages = pages;
            status = `${t('cbz.prepared', 'Prepared {value}', pages.length)} ${t(pages.length === 1 ? 'cbz.orderedPage' : 'cbz.orderedPages', pages.length === 1 ? 'naturally ordered image page' : 'naturally ordered image pages')} ${t('cbz.locally', 'locally')}.`;
            return;
          }
          output = new Uint8Array(
            await createPdfFromPngPages(await Promise.all(pages.map(pageAsPng))),
          );
          outputName = `${file.name.replace(/\.(?:cbz|zip)$/iu, '')}.pdf`;
          outputType = 'application/pdf';
          previewUrl = URL.createObjectURL(
            new Blob([output as LocalBlobPart], { type: outputType }),
          );
          status = `${t('cbz.converted', 'Converted {value}', pages.length)} ${t(pages.length === 1 ? 'cbz.comicPage' : 'cbz.comicPages', pages.length === 1 ? 'naturally ordered comic page' : 'naturally ordered comic pages')} ${t('cbz.toPdf', 'to PDF locally')}.`;
        },
      );
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('cbz.unable', 'Unable to convert this comic archive.');
    }
  }
  function download(bytes: Uint8Array, type: string, name: string) {
    const url = URL.createObjectURL(new Blob([bytes as LocalBlobPart], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function downloadOutput() {
    if (output) download(output, outputType, outputName);
  }
  function downloadPages() {
    for (const page of extractedPages) download(page.bytes, 'application/octet-stream', page.name);
  }
</script>

<svelte:head>
  <title>{t('cbz.title', 'CBZ Comic Converter')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'cbz.metaDescription',
      'Create or extract CBZ/ZIP comics and convert their image pages to PDF locally.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <link rel="alternate" hreflang="en" href="https://image.complianttools.com/cbz-converter" />
  <link rel="alternate" hreflang="ar" href="https://image.complianttools.com/ar/cbz-converter" />
  <meta property="og:title" content="CBZ Comic Converter" />
  <meta property="og:description" content="Create or extract CBZ comics locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "CBZ Comic Converter",
      "applicationCategory": "MultimediaApplication",
      "operatingSystem": "Any",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
    }
  </script>
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('cbz.back', '← Convert')}</a>
  <h1>{t('cbz.title', 'CBZ Comic Converter')}</h1>
  <p>
    {t(
      'cbz.description',
      'Create a CBZ from images, extract a CBZ/ZIP image set, or convert its naturally ordered pages to PDF locally. RAR-backed CBR remains explicitly unavailable; no page is uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, cbzToolOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <h2>{t('cbz.faqTitle', 'Frequently asked')}</h2>
  <div>
    <h3>{t('cbz.faqTitle1', 'Can I create a multi-page comic?')}</h3>
    <p>
      {t('cbz.faqAnswer1', 'Yes. Choose multiple images in order; ordering options are available.')}
    </p>
    <h3>{t('cbz.faqTitle2', 'Does the preview match the download?')}</h3>
    <p>
      {t(
        'cbz.faqAnswer2',
        'Yes. The page order preview and PDF preview use the same local content.',
      )}
    </p>
    <h3>{t('cbz.faqTitle3', 'Is anything uploaded?')}</h3>
    <p>{t('cbz.faqAnswer3', 'No. All processing is local.')}</p>
  </div>
  <label>
    {options.operation === 'create'
      ? t('cbz.chooseImages', 'Choose comic page images')
      : t('cbz.chooseArchive', 'Choose a CBZ, ZIP, or CBR archive')}
    <input
      type="file"
      multiple={options.operation === 'create'}
      accept={options.operation === 'create'
        ? 'image/avif,image/gif,image/jpeg,image/jxl,image/png,image/webp'
        : '.cbz,.zip,.cbr,application/zip,application/vnd.comicbook+zip'}
      onchange={(event) => selectFiles([...(event.currentTarget.files ?? [])])}
    />
  </label>
  <button type="button" onclick={() => void generate()} disabled={files.length === 0}
    >{t('cbz.generate', 'Generate output')}</button
  >
  {#if output}
    <button type="button" onclick={downloadOutput}
      >{t('cbz.download', 'Download')} {outputName}</button
    >
  {:else if extractedPages.length}
    <button type="button" onclick={downloadPages}
      >{t('cbz.downloadPages', 'Download extracted pages')}</button
    >
  {/if}
  {#if previewNames.length}
    <section aria-labelledby="cbz-preview-heading">
      <h2 id="cbz-preview-heading">{t('cbz.pageOrder', 'Exact CBZ page order')}</h2>
      <ol>
        {#each previewNames as name (name)}<li>{name}</li>{/each}
      </ol>
    </section>
  {:else if extractedPages.length}
    <section aria-labelledby="extract-preview-heading">
      <h2 id="extract-preview-heading">
        {t('cbz.extractedOrder', 'Exact extracted page order')}
      </h2>
      <ol>
        {#each extractedPages as page (page.name)}<li>
            {page.name} ({page.bytes.byteLength}
            {t('cbz.bytes', 'bytes')})
          </li>{/each}
      </ol>
    </section>
  {:else if previewUrl}
    <section aria-labelledby="comic-pdf-preview-heading">
      <h2 id="comic-pdf-preview-heading">
        {t('cbz.pdfPreview', 'Faithful exported PDF preview')}
      </h2>
      <iframe title={t('cbz.pdfPreviewTitle', 'Comic PDF export preview')} src={previewUrl}
      ></iframe>
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

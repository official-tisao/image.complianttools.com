<script lang="ts">
  import { onDestroy } from 'svelte';
  import { codecUnavailableError } from '@complianttools/image-engine/codecs/registry';
  import { decodeCbz, encodeCbz, type ComicPage } from '@complianttools/image-engine/documents/cbz';
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
      ? `${t(selected.length === 1 ? 'cbz.fileReady' : 'cbz.filesReady', selected.length === 1 ? 'file ready' : 'files ready')}.`
      : '';
    error = '';
    clearOutput();
  }

  let fileInput: HTMLInputElement;

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
  }

  async function handleFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      selectFiles([]);
      return;
    }
    const validation =
      files.length === 0
        ? ''
        : 'Choose valid image pages or a bounded CBZ/ZIP archive and try again.';
    if (validation) {
      error = validation;
      selectFiles([]);
      return;
    }
    selectFiles([...(input.files ?? [])]);
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
          const { createPdfFromPngPages } =
            await import('@complianttools/image-engine/documents/pdf');
          output = new Uint8Array(
            await createPdfFromPngPages(
              await Promise.all(
                pages.map(async (page) => {
                  const bitmap = await createImageBitmap(new Blob([page.bytes as LocalBlobPart]));
                  const canvas = document.createElement('canvas');
                  canvas.width = bitmap.width;
                  canvas.height = bitmap.height;
                  const context = canvas.getContext('2d');
                  if (!context)
                    throw new Error(
                      t(
                        'cbz.canvasError',
                        'Your browser cannot create a local canvas for a comic page.',
                      ),
                    );
                  context.drawImage(bitmap, 0, 0);
                  const blob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(
                      (value) =>
                        value
                          ? resolve(value)
                          : reject(
                              new Error(
                                `${t('cbz.encodeError', 'Unable to encode')} ${page.name}.`,
                              ),
                            ),
                      'image/png',
                    );
                  });
                  return {
                    pngBytes: new Uint8Array(await blob.arrayBuffer()),
                    width: bitmap.width,
                    height: bitmap.height,
                  };
                }),
              ),
            ),
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
  <meta property="og:title" content="CBZ Comic Converter" />
  <meta property="og:description" content="Create or extract CBZ comics locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
  <meta property="twitter:image" content="https://image.complianttools.com/og/tools.svg" />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('cbz.back', '← Convert')}</a>
  <header class="page-header">
    <h1>{t('cbz.title', 'CBZ Comic Converter')}</h1>
    <p class="page-description">
      {t(
        'cbz.description',
        'Create a CBZ from images, extract a CBZ/ZIP image set, or convert its naturally ordered pages to PDF locally. RAR-backed CBR remains explicitly unavailable; no page is uploaded.',
      )}
    </p>
    <p class="privacy-badge">{t('privacy.badge', 'Local only')}</p>
  </header>

  <div class="container">
    <div class="generated-controls">
      <GeneratedControls
        descriptions={localizeOptions(locale, cbzToolOptionDescriptions)}
        values={controlValues}
        onChange={setControl}
        {locale}
      />
    </div>

    <div class="converter-workspace card">
      <div class="workspace-header">
        <h2>{t('cbz.converterTitle', 'CBZ Converter')}</h2>
        <p class="workspace-description">
          {t('cbz.converterDescription', 'Pack ordered images into CBZ or extract pages locally.')}
        </p>
      </div>

      <!-- File Selection Area -->
      <div class="file-section">
        <div class="upload-area">
          <div
            class="upload-button"
            class:drag-over={files.length > 0}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleFileSelect}
            aria-label={t('cbz.drop', 'Drop comic page images here')}
            role="group"
          >
            <span class="upload-icon" aria-hidden="true">📁</span>
            <span class="upload-heading">{t('cbz.chooseImages', 'Choose comic page images')}</span>
            <span class="upload-sub">{t('cbz.browseHint', 'Or browse files from your device')}</span
            >
            <p class="formats">
              {t(
                'cbz.supported',
                'Accepted: image/avif,image/gif,image/jpeg,image/jxl,image/png,image/webp',
              )}
            </p>
          </div>
          <button type="button" class="browse-button" onclick={() => fileInput?.click()}>
            {t('cbz.browse', 'Browse Files')}
          </button>
          <input
            bind:this={fileInput}
            type="file"
            aria-label={options.operation === 'create'
              ? t('cbz.chooseImages', 'Choose comic page images')
              : t('cbz.chooseArchive', 'Choose a CBZ, ZIP, or CBR archive')}
            multiple={options.operation === 'create'}
            accept={options.operation === 'create'
              ? 'image/avif,image/gif,image/jpeg,image/jxl,image/png,image/webp'
              : '.cbz,.zip,.cbr,application/zip,application/vnd.comicbook+zip'}
            onchange={handleFileSelect}
            class="file-input"
          />
        </div>

        {#if files.length > 0}
          <div class="file-list">
            <p class="file-list-heading">{t('cbz.selectedFiles', 'Selected files')}</p>
            <ul class="file-list">
              {#each files as file (file.name)}
                <li class="file-item">{file.name}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button
          type="button"
          class="primary-button"
          onclick={() => void generate()}
          disabled={files.length === 0}
          class:disabled={files.length === 0}
          data-testid="cbz-generate"
        >
          {t('cbz.generate', 'Generate Output')}
        </button>
        {#if output}
          <button
            type="button"
            class="secondary-button"
            onclick={downloadOutput}
            class:disabled={!output}
            data-testid="cbz-download"
          >
            {t('cbz.download', 'Download')}
            {outputName}
          </button>
        {/if}
        {#if extractedPages.length}
          <button
            type="button"
            class="tertiary-button"
            onclick={downloadPages}
            data-testid="cbz-download-pages"
          >
            {t('cbz.downloadPages', 'Download extracted pages')}
          </button>
        {/if}
      </div>

      <!-- CBZ Page Order -->
      {#if previewNames.length}
        <section class="page-order-section">
          <h3 class="page-order-heading">{t('cbz.pageOrder', 'Exact CBZ page order')}</h3>
          <ol class="page-order-list">
            {#each previewNames as name (name)}
              <li class="page-item">{name}</li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if extractedPages.length}
        <section class="page-order-section">
          <h3 class="page-order-heading">
            {t('cbz.extractedOrder', 'Exact extracted page order')}
          </h3>
          <ol class="page-order-list">
            {#each extractedPages as page (page.name)}
              <li class="page-item">
                {page.name} ({page.bytes.byteLength}
                {t('cbz.bytes', 'bytes')})
              </li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if previewUrl}
        <section class="pdf-preview-section">
          <h3 class="pdf-preview-heading">
            {t('cbz.pdfPreview', 'Faithful exported PDF preview')}
          </h3>
          <iframe
            class="pdf-preview"
            title={t('cbz.pdfPreviewTitle', 'Comic PDF export preview')}
            src={previewUrl}
          ></iframe>
        </section>
      {/if}

      {#if status}<p class="status-message" role="status">{status}</p>{/if}
      {#if error}<p class="error-message" role="alert">{error}</p>{/if}

      <!-- FAQ Section -->
      <div class="faq-section">
        <h2 class="faq-title">{t('cbz.faqTitle', 'Frequently asked')}</h2>
        <div class="faq-list">
          <details class="faq-item">
            <summary class="faq-question"
              >{t('cbz.faqTitle1', 'Can I create a multi-page comic?')}</summary
            >
            <p class="faq-answer">
              {t(
                'cbz.faqAnswer1',
                'Yes. Choose multiple images in order; ordering options are available.',
              )}
            </p>
          </details>
          <details class="faq-item">
            <summary class="faq-question"
              >{t('cbz.faqTitle2', 'Does the preview match the download?')}</summary
            >
            <p class="faq-answer">
              {t(
                'cbz.faqAnswer2',
                'Yes. The page order preview and PDF preview use the same local content.',
              )}
            </p>
          </details>
          <details class="faq-item">
            <summary class="faq-question">{t('cbz.faqTitle3', 'Is anything uploaded?')}</summary>
            <p class="faq-answer">{t('cbz.faqAnswer3', 'No. All processing is local.')}</p>
          </details>
        </div>
      </div>

      <!-- Related Tools Navigation -->
      <nav class="related-tools">
        <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}
          >{t('nav.convert', 'Convert')}</a
        >
        <a href={locale === 'en' ? '/avif-converter' : `/${locale}/avif-converter`}
          >{t('nav.avif', 'AVIF')}</a
        >
        <a href={locale === 'en' ? '/webp-converter' : `/${locale}/webp-converter`}
          >{t('nav.webp', 'WebP')}</a
        >
        <a href={locale === 'en' ? '/jxl-converter' : `/${locale}/jxl-converter`}
          >{t('nav.jxl', 'JPEG XL')}</a
        >
        <a href={locale === 'en' ? '/raw-converter' : `/${locale}/raw-converter`}
          >{t('nav.raw', 'RAW')}</a
        >
        <a href="/docs/formats/jpeg">{t('nav.jpegGuide', 'JPEG guide')}</a>
      </nav>
    </div>
  </div>
</main>

<style>
  :global(body) {
    font-family: Geist, Inter, system-ui, sans-serif;
    color: #1c1a17;
    background: #f0eeea;
  }

  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 40px;
  }

  .page-header {
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 2.5rem;
    margin: 0 0 16px;
    font-weight: 600;
  }

  .page-description {
    color: #5c5a56;
    font-size: 1.1rem;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .privacy-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--c-surface-subtle, #f3f3f5);
    color: var(--c-text-muted, #5c5a56);
    padding: 0.35rem 0.7rem;
    border-radius: var(--r-full, 999px);
    font-size: 0.8rem;
    margin: 0;
  }

  .container {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .generated-controls {
    padding: 24px;
    background: var(--c-surface, #fff);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-lg, 8px);
  }

  .converter-workspace {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .card {
    background: var(--c-surface, #fff);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-lg, 8px);
    padding: 24px;
    box-shadow: var(--sh-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  }

  .workspace-header {
    margin-bottom: 24px;
  }

  .workspace-header h2 {
    margin: 0 0 8px;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .page-description {
    color: #5c5a56;
    font-size: 1.1rem;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .privacy-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--c-surface-subtle, #f3f3f5);
    color: var(--c-text-muted, #5c5a56);
    padding: 0.35rem 0.7rem;
    border-radius: var(--r-full, 999px);
    font-size: 0.8rem;
    margin: 0;
  }

  .file-section {
    margin-bottom: 24px;
  }

  .upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    background: var(--c-surface-sunk, #f6f4f0);
    border: 2px dashed var(--c-border-strong, #c9c5bd);
    border-radius: var(--r-md, 5px);
    padding: 24px;
    transition:
      border-color var(--dur-fast, 140ms) ease,
      background var(--dur-fast, 140ms) ease;
  }

  .upload-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 20px;
    background: var(--c-surface, #fff);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-md, 5px);
    cursor: pointer;
    transition:
      border-color var(--dur-fast, 140ms) ease,
      background var(--dur-fast, 140ms) ease;
  }

  .upload-button.drag-over {
    border-color: var(--c-accent, #1c1a17);
    background: var(--c-accent-subtle, rgba(28, 26, 23, 0.06));
  }

  .upload-icon {
    font-size: 2rem;
    margin-bottom: 8px;
  }

  .upload-heading {
    font-weight: 600;
    margin: 4px 0;
  }

  .upload-sub {
    color: var(--c-text-muted, #5c5a56);
    font-size: 0.9rem;
    margin: 0;
  }

  .browse-button {
    background: var(--c-surface-subtle, #f3f3f5);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-full, 999px);
    padding: 6px 12px;
    font-size: 0.9rem;
    color: var(--c-text, #1c1a17);
    cursor: pointer;
  }

  .formats {
    color: var(--c-text-muted, #5c5a56);
    font-size: 0.85rem;
  }

  .file-list {
    margin-top: 8px;
    padding-left: 0;
  }

  .file-item {
    font-size: 0.95rem;
    color: #1c1a17;
  }

  .file-list-heading {
    color: #5c5a56;
    font-size: 0.95rem;
    margin-bottom: 8px;
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 24px;
  }

  .primary-button {
    background: var(--c-accent, #1c1a17);
    color: white;
    border: none;
    border-radius: var(--r-md, 5px);
    padding: 12px 24px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--dur-fast, 140ms) ease;
  }

  .primary-button:hover:not(:disabled) {
    background: var(--c-accent-hover, #151310);
  }

  .primary-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .secondary-button {
    background: var(--c-surface, #fff);
    color: var(--c-text, #1c1a17);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-md, 5px);
    padding: 12px 24px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur-fast, 140ms) ease,
      border-color var(--dur-fast, 140ms) ease;
  }

  .secondary-button:hover:not(:disabled) {
    background: var(--c-surface-sunk, #f6f4f0);
  }

  .secondary-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .tertiary-button {
    background: var(--c-surface-sunk, #f6f4f0);
    color: var(--c-text, #1c1a17);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-md, 5px);
    padding: 12px 24px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur-fast, 140ms) ease,
      border-color var(--dur-fast, 140ms) ease;
  }

  .tertiary-button:hover:not(:disabled) {
    background: var(--c-surface, #fff);
  }

  .tertiary-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .page-order-section {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--c-border, #e2e2e7);
  }

  .page-order-heading {
    margin: 0 0 12px;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .page-order-list {
    padding-left: 24px;
    margin: 0;
  }

  .page-item {
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .pdf-preview-section {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--c-border, #e2e2e7);
  }

  .pdf-preview-heading {
    margin: 0 0 12px;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .pdf-preview {
    width: 100%;
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-md, 5px);
    background: var(--c-canvas, #eee);
  }

  .faq-section {
    margin-top: 40px;
  }

  .faq-title {
    font-size: 2rem;
    margin-bottom: 24px;
    font-weight: 600;
  }

  .faq-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .faq-item {
    padding: 16px 0;
    border-top: 1px solid var(--c-border, #e2e2e7);
  }

  .faq-item:first-child {
    border-top: none;
  }

  .faq-question {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 8px;
    cursor: pointer;
  }

  .faq-answer {
    font-size: 1rem;
    line-height: 1.5;
    color: #1c1a17;
  }

  .related-tools {
    margin-top: 40px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .related-tools a {
    color: var(--c-text, #1c1a17);
    text-decoration: none;
    font-size: 1rem;
    transition: color var(--dur-fast, 140ms) ease;
  }

  .related-tools a:hover {
    color: var(--c-accent, #1c1a17);
  }

  .status-message {
    color: var(--c-text-muted, #5c5a56);
    font-size: 0.95rem;
    margin: 8px 0;
  }

  .error-message {
    color: var(--c-danger, #b3261e);
    background: var(--c-surface-sunk, #fdf2f2);
    border: 1px solid var(--c-danger, #f3c1bd);
    border-radius: var(--r-md, 5px);
    padding: 12px;
    margin: 8px 0;
  }

  @media (max-width: 767px) {
    main {
      padding: 24px 16px;
    }

    .page-header h1 {
      font-size: 2rem;
    }

    .page-description {
      font-size: 1rem;
    }

    .container {
      gap: 24px;
    }

    .generated-controls {
      padding: 16px;
    }

    .converter-workspace {
      gap: 16px;
    }

    .card {
      padding: 16px;
    }

    .upload-area {
      padding: 16px;
    }

    .upload-button {
      padding: 16px;
    }

    .upload-icon {
      font-size: 1.5rem;
    }

    .browse-button {
      padding: 8px 10px;
      font-size: 0.85rem;
    }

    .primary-button {
      padding: 8px 16px;
      font-size: 0.9rem;
    }

    .secondary-button {
      padding: 8px 12px;
      font-size: 0.9rem;
    }

    .tertiary-button {
      padding: 8px 12px;
      font-size: 0.9rem;
    }

    .page-order-list {
      padding-left: 16px;
    }

    .page-item {
      margin-bottom: 6px;
      font-size: 0.9rem;
    }
  }

  @media (max-width: 640px) {
    main {
      padding: 16px;
    }

    .page-header h1 {
      font-size: 1.6rem;
    }

    .page-description {
      font-size: 0.9rem;
    }

    .container {
      gap: 16px;
    }

    .generated-controls {
      padding: 12px;
    }

    .converter-workspace {
      gap: 12px;
    }

    .card {
      padding: 12px;
    }

    .upload-area {
      padding: 16px;
    }

    .upload-button {
      padding: 16px;
    }

    .upload-icon {
      font-size: 1.5rem;
    }

    .browse-button {
      padding: 8px 10px;
      font-size: 0.85rem;
    }

    .primary-button {
      padding: 8px 16px;
      font-size: 0.9rem;
    }

    .secondary-button {
      padding: 8px 12px;
      font-size: 0.9rem;
    }

    .tertiary-button {
      padding: 8px 12px;
      font-size: 0.9rem;
    }

    .page-order-list {
      padding-left: 16px;
    }

    .page-item {
      margin-bottom: 6px;
      font-size: 0.9rem;
    }
  }
</style>

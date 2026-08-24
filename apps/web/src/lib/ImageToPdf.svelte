<script lang="ts">
  import {
    ImageToPdfOptionsSchema,
    createPdfFromImagePages,
    engineErrorMessage,
    imageToPdfOptionDescriptions,
    isEngineError,
    withTypedEngineErrorsAsync,
    type ImageToPdfOptions,
    type PdfImagePage,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/image-to-pdf' : `/${locale}/image-to-pdf`);

  let options = $state<ImageToPdfOptions>(ImageToPdfOptionsSchema.parse({}));
  let files = $state<readonly File[]>([]);
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');
  let outputBytes = $state<Uint8Array>();
  const controlValues = $derived(
    Object.fromEntries(Object.entries(options).map(([key, value]) => [`pdf.${key}`, value])),
  );
  const orderedFiles = $derived(
    options.ordering === 'filename'
      ? [...files].sort((left, right) => left.name.localeCompare(right.name, 'en'))
      : files,
  );

  function clearOutput() {
    outputBytes = undefined;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (!path.startsWith('pdf.')) return;
    options = ImageToPdfOptionsSchema.parse({
      ...options,
      [path.slice('pdf.'.length)]: value,
    });
    status = files.length
      ? t(
          'imagePdf.optionsChanged',
          'Options changed. Create the PDF again to update the faithful preview.',
        )
      : '';
    clearOutput();
  }
  function selectFiles(selected: readonly File[]) {
    files = selected;
    status = selected.length
      ? `${selected.length} ${t(selected.length === 1 ? 'imagePdf.imageReady' : 'imagePdf.imagesReady', selected.length === 1 ? 'image ready' : 'images ready')}.`
      : '';
    error = '';
    clearOutput();
  }
  async function encodePage(file: File): Promise<PdfImagePage> {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(t('imagePdf.canvasError', 'Your browser cannot create a local canvas.'));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      const encoding = options.compression === 'jpeg' ? 'jpeg' : 'png';
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error(`${t('imagePdf.encodeError', 'Unable to encode')} ${encoding}.`)),
          encoding === 'jpeg' ? 'image/jpeg' : 'image/png',
          encoding === 'jpeg' ? options.jpegQuality / 100 : undefined,
        ),
      );
      return {
        pngBytes: await blob.arrayBuffer(),
        encoding,
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      bitmap.close();
    }
  }
  async function createPdf() {
    status = '';
    error = '';
    if (files.length === 0) {
      error = t('imagePdf.chooseFirst', 'Choose at least one image first.');
      return;
    }
    try {
      const pages = await Promise.all(orderedFiles.map(encodePage));
      outputBytes = await withTypedEngineErrorsAsync(
        t('imagePdf.failure', 'PDF creation failed'),
        t(
          'imagePdf.remedy',
          'Choose valid browser-decodable images, reduce their dimensions, or use lossless PNG compression.',
        ),
        () =>
          createPdfFromImagePages(pages, {
            pageSize: options.pageSize,
            orientation: options.orientation,
            marginPoints: options.marginPoints,
          }),
      );
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([outputBytes], { type: 'application/pdf' }));
      status = `${t('imagePdf.created', 'Created a {value}-page PDF locally', orderedFiles.length)} (${outputBytes.byteLength} ${t('imagePdf.bytes', 'bytes')}).`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : reason instanceof Error
          ? reason.message
          : t('imagePdf.unable', 'Unable to create the PDF.');
    }
  }
  function downloadPdf() {
    if (!outputBytes) return;
    const url = URL.createObjectURL(new Blob([outputBytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${orderedFiles[0]!.name.replace(/\.[^.]+$/u, '')}.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<svelte:head>
  <title>{t('imagePdf.title', 'Image to PDF')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t('imagePdf.metaDescription', 'Create an ordered, page-sized PDF from local images.')}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/pdf-to-image' : `/${locale}/pdf-to-image`}
    >{t('imagePdf.back', '← PDF to Image')}</a
  >
  <h1>{t('imagePdf.title', 'Image to PDF')}</h1>
  <p>
    {t(
      'imagePdf.description',
      'Create a multi-page PDF locally with explicit page size, orientation, margin, ordering, and compression. Your images are never uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, imageToPdfOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <label>
    {t('imagePdf.choose', 'Choose images in page order')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      onchange={(event) =>
        selectFiles(event.currentTarget.files ? [...event.currentTarget.files] : [])}
    />
  </label>
  {#if orderedFiles.length}
    <ol aria-label={t('imagePdf.order', 'PDF page order')}>
      {#each orderedFiles as file (`${file.name}:${file.size}:${file.lastModified}`)}<li>
          {file.name}
        </li>{/each}
    </ol>
  {/if}
  <button type="button" onclick={() => void createPdf()} disabled={files.length === 0}
    >{t('imagePdf.create', 'Create PDF')}</button
  >
  <button type="button" onclick={downloadPdf} disabled={!outputBytes}
    >{t('imagePdf.download', 'Download PDF')}</button
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if previewUrl}
    <section aria-labelledby="pdf-preview-heading">
      <h2 id="pdf-preview-heading">{t('imagePdf.preview', 'Faithful exported PDF preview')}</h2>
      <p>
        {t(
          'imagePdf.previewDescription',
          'This viewer receives the exact PDF bytes offered by Download PDF.',
        )}
      </p>
      <iframe title={t('imagePdf.previewTitle', 'Exported PDF preview')} src={previewUrl}></iframe>
    </section>
  {/if}
</main>

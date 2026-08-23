<script lang="ts">
  import {
    PdfToImageOptionsSchema,
    pdfToImageOptionDescriptions,
    readIllustratorDocumentInfo,
    readPdfDocumentInfo,
    renderIllustratorPage,
    renderPdfPage,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

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
      const input = await file.arrayBuffer();
      const isIllustrator = /\.ai$/iu.test(file.name);
      const info = isIllustrator
        ? await readIllustratorDocumentInfo(input)
        : await readPdfDocumentInfo(input);
      if (options.pageNumber > info.pageCount)
        throw new Error(
          `PDF has ${info.pageCount} page${info.pageCount === 1 ? '' : 's'}; page ${options.pageNumber} is unavailable.`,
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
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.putImageData(new ImageData(image.frames[0].data, image.width, image.height), 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('PNG encoding failed.'))),
          'image/png',
        ),
      );
      const url = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.(?:pdf|ai)$/iu, '')}-page-${options.pageNumber}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Rendered page ${options.pageNumber} of ${info.pageCount} at ${options.dpi} DPI (${image.width}×${image.height}) locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to render this PDF page.';
    }
  }
</script>

<svelte:head>
  <title>PDF or Illustrator to Image — Image Compliant Tools</title>
  <meta
    name="description"
    content="Render a PDF or modern PDF-compatible Illustrator page to PNG locally."
  />
  <link rel="canonical" href="https://image.complianttools.com/pdf-to-image" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>PDF or Illustrator to Image</h1>
  <p>
    Render one PDF or modern PDF-compatible Illustrator page to PNG on your device. Legacy
    PostScript Illustrator files are refused explicitly. Your file is never uploaded.
  </p>
  <GeneratedControls
    descriptions={pdfToImageOptionDescriptions}
    values={controlValues}
    onChange={setControl}
  />
  <label
    >Choose a PDF or AI file <input
      type="file"
      accept="application/pdf,.pdf,.ai"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

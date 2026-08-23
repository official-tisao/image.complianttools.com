<script lang="ts">
  import { readPdfDocumentInfo, renderPdfPage } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let pageNumber = $state(1);
  let scale = $state(1);

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const input = await file.arrayBuffer();
      const info = await readPdfDocumentInfo(input);
      if (pageNumber > info.pageCount)
        throw new Error(
          `PDF has ${info.pageCount} page${info.pageCount === 1 ? '' : 's'}; page ${pageNumber} is unavailable.`,
        );
      const image = await renderPdfPage(input, { pageNumber, scale }, undefined, () =>
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
      download.download = `${file.name.replace(/\.pdf$/iu, '')}-page-${pageNumber}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Rendered page ${pageNumber} of ${info.pageCount} at ${image.width}×${image.height} locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to render this PDF page.';
    }
  }
</script>

<svelte:head>
  <title>PDF to Image — Image Compliant Tools</title>
  <meta name="description" content="Render a PDF page to PNG locally in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/pdf-to-image" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>PDF to Image</h1>
  <p>Render one PDF page to PNG on your device. Your PDF is never uploaded.</p>
  <label>Page <input type="number" min="1" bind:value={pageNumber} /></label>
  <label>Scale <input type="number" min="0.1" step="0.1" bind:value={scale} /></label>
  <label
    >Choose a PDF <input
      type="file"
      accept="application/pdf,.pdf"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

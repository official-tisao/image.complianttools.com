<script lang="ts">
  import { createPdfFromPng } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Unable to encode PNG.'))),
          'image/png',
        ),
      );
      const pdf = await createPdfFromPng(await png.arrayBuffer(), canvas.width, canvas.height);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.pdf`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Created a one-page PDF from ${file.name} locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create the PDF.';
    }
  }
</script>

<svelte:head>
  <title>Image to PDF — Image Compliant Tools</title>
  <meta
    name="description"
    content="Create a single-page PDF from an image locally in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/image-to-pdf" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image to PDF</h1>
  <p>Create a single-page PDF locally. Your image is never uploaded.</p>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

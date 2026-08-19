<script lang="ts">
  import { createPdfFromPngPages } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function convert(files: readonly File[]) {
    status = '';
    error = '';
    if (files.length === 0) return;
    try {
      const pages = [];
      for (const file of files) {
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
        pages.push({
          pngBytes: await png.arrayBuffer(),
          width: canvas.width,
          height: canvas.height,
        });
      }
      const pdf = await createPdfFromPngPages(pages);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${files[0]!.name.replace(/\.[^.]+$/u, '')}.pdf`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Created a ${files.length}-page PDF locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create the PDF.';
    }
  }
</script>

<svelte:head>
  <title>Image to PDF — Image Compliant Tools</title>
  <meta name="description" content="Create a multi-page PDF from local images in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/image-to-pdf" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image to PDF</h1>
  <p>Create a multi-page PDF locally. Your images are never uploaded.</p>
  <label
    >Choose images in page order <input
      type="file"
      accept="image/*"
      multiple
      onchange={(event) =>
        void convert(event.currentTarget.files ? [...event.currentTarget.files] : [])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

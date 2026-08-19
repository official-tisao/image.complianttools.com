<script lang="ts">
  import { createRaster, vectorizeRaster } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function vectorize(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const svg = vectorizeRaster(createRaster(canvas.width, canvas.height, data));
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.svg`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Vectorized ${file.name} locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to vectorize this image.';
    }
  }
</script>

<svelte:head>
  <title>Image to SVG — Image Compliant Tools</title>
  <meta name="description" content="Vectorize raster images locally into SVG paths." />
  <link rel="canonical" href="https://image.complianttools.com/image-to-svg" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image to SVG</h1>
  <p>Trace a raster image to SVG paths on your device. Nothing is uploaded.</p>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void vectorize(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

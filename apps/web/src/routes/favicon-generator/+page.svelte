<script lang="ts">
  import { createRaster, encodeIco } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function createFavicon(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const size = Math.min(256, bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.drawImage(bitmap, (size - bitmap.width) / 2, (size - bitmap.height) / 2);
      bitmap.close();
      const ico = encodeIco(createRaster(size, size, context.getImageData(0, 0, size, size).data));
      const url = URL.createObjectURL(new Blob([ico], { type: 'image/x-icon' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = 'favicon.ico';
      download.click();
      URL.revokeObjectURL(url);
      status = `Created a ${size}×${size} favicon locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create the favicon.';
    }
  }
</script>

<svelte:head>
  <title>Favicon Generator — Image Compliant Tools</title>
  <meta name="description" content="Create a local favicon.ico from an image." />
  <link rel="canonical" href="https://image.complianttools.com/favicon-generator" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Favicon Generator</h1>
  <p>Create a 32-bit ICO favicon locally. Your image is never uploaded.</p>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void createFavicon(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

<script lang="ts">
  import { createRaster, encodeGif } from '@complianttools/image-engine';

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
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const image = createRaster(
        canvas.width,
        canvas.height,
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      const url = URL.createObjectURL(new Blob([encodeGif(image)], { type: 'image/gif' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.gif`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Created a ${canvas.width}×${canvas.height} GIF locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create a GIF.';
    }
  }
</script>

<svelte:head>
  <title>GIF Maker — Image Compliant Tools</title>
  <meta name="description" content="Create a GIF from an image locally in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/gif-maker" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>GIF Maker</h1>
  <p>Create a GIF locally from an image. Nothing is uploaded.</p>
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

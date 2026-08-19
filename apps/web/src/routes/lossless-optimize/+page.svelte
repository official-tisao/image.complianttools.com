<script lang="ts">
  import { createRaster, encodeRasterAsOptimisedPng } from '@complianttools/image-engine';
  let status = $state('');
  let error = $state('');
  async function optimise(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    if (file.type !== 'image/png') {
      error =
        'PNG is supported now. JPEG and GIF lossless optimization remain unavailable until their pixel-identity verification is complete.';
      return;
    }
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
      const output = await encodeRasterAsOptimisedPng(image);
      const url = URL.createObjectURL(new Blob([output], { type: 'image/png' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.png$/iu, '')}-optimized.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Optimized locally: ${file.size.toLocaleString()} → ${output.byteLength.toLocaleString()} bytes.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to optimize this PNG.';
    }
  }
</script>

<svelte:head
  ><title>Lossless PNG Optimizer — Image Compliant Tools</title><meta
    name="description"
    content="Optimize PNG files locally without changing pixels."
  /><link rel="canonical" href="https://image.complianttools.com/lossless-optimize" /></svelte:head
>
<main>
  <a href="/convert">← Convert</a>
  <h1>Lossless PNG Optimizer</h1>
  <p>Optimize PNG files locally. Pixels are unchanged; files never leave your browser.</p>
  <label
    >Choose a PNG <input
      type="file"
      accept="image/png"
      onchange={(event) => void optimise(event.currentTarget.files?.[0])}
    /></label
  >{#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
</main>

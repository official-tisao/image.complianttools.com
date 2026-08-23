<script lang="ts">
  import {
    createRaster,
    optimizeGifLossless,
    optimizeJpegLossless,
    optimizePngLossless,
  } from '@complianttools/image-engine';
  let status = $state('');
  let error = $state('');

  async function decodeJpegInBrowser(bytes: ArrayBuffer) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.drawImage(bitmap, 0, 0);
      return createRaster(
        canvas.width,
        canvas.height,
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
    } finally {
      bitmap.close();
    }
  }

  async function optimise(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    const isGif = file.type === 'image/gif' || /\.gif$/iu.test(file.name);
    const isPng = file.type === 'image/png' || /\.png$/iu.test(file.name);
    const isJpeg = file.type === 'image/jpeg' || /\.(?:jpe?g|jfif)$/iu.test(file.name);
    if (!isGif && !isPng && !isJpeg) {
      error = 'Choose a PNG, GIF, or JPEG image for lossless optimization.';
      return;
    }
    try {
      {
        const input = await file.arrayBuffer();
        const result = isGif
          ? optimizeGifLossless(input)
          : isJpeg
            ? await optimizeJpegLossless(input, decodeJpegInBrowser)
            : await optimizePngLossless(input);
        const extension = isGif ? 'gif' : isJpeg ? 'jpg' : 'png';
        const mimeType = isGif ? 'image/gif' : isJpeg ? 'image/jpeg' : 'image/png';
        const url = URL.createObjectURL(new Blob([result.bytes], { type: mimeType }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.(?:png|gif|jpe?g|jfif)$/iu, '')}-optimized.${extension}`;
        download.click();
        URL.revokeObjectURL(url);
        status = result.changed
          ? `Optimized and pixel-verified locally: ${result.originalBytes.toLocaleString()} → ${result.optimizedBytes.toLocaleString()} bytes.`
          : `Pixel-verified locally; no smaller safe candidate was found, so the original ${result.originalBytes.toLocaleString()} bytes were preserved.`;
        return;
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to optimize this image.';
    }
  }
</script>

<svelte:head
  ><title>Lossless PNG, GIF, and JPEG Optimizer — Image Compliant Tools</title><meta
    name="description"
    content="Optimize PNG, GIF, and JPEG files locally without changing rendered pixels."
  /><link rel="canonical" href="https://image.complianttools.com/lossless-optimize" /></svelte:head
>
<main>
  <a href="/convert">← Convert</a>
  <h1>Lossless PNG, GIF, and JPEG Optimizer</h1>
  <p>
    Optimize PNG, GIF, or JPEG files locally. Every candidate is independently decoded and returned
    only when rendered pixels are unchanged; GIF timing and loop settings are checked too. Files
    never leave your browser.
  </p>
  <label
    >Choose a PNG, GIF, or JPEG <input
      type="file"
      accept="image/png,image/gif,image/jpeg,.png,.gif,.jpg,.jpeg,.jfif"
      onchange={(event) => void optimise(event.currentTarget.files?.[0])}
    /></label
  >{#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
</main>

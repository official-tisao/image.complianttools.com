<script lang="ts">
  import {
    createRaster,
    encodeRasterAsOptimisedPng,
    optimizeGifLossless,
  } from '@complianttools/image-engine';
  let status = $state('');
  let error = $state('');
  async function optimise(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    const isGif = file.type === 'image/gif' || /\.gif$/iu.test(file.name);
    const isPng = file.type === 'image/png' || /\.png$/iu.test(file.name);
    if (!isGif && !isPng) {
      error =
        'JPEG lossless optimization remains unavailable until pixel-identity verification is complete.';
      return;
    }
    try {
      if (isGif) {
        const result = optimizeGifLossless(await file.arrayBuffer());
        const url = URL.createObjectURL(new Blob([result.bytes], { type: 'image/gif' }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}-optimized.gif`;
        download.click();
        URL.revokeObjectURL(url);
        status = result.changed
          ? `Optimized and pixel-verified locally: ${result.originalBytes.toLocaleString()} → ${result.optimizedBytes.toLocaleString()} bytes.`
          : `Pixel-verified locally; no smaller safe GIF candidate was found, so the original ${result.originalBytes.toLocaleString()} bytes were preserved.`;
        return;
      }
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
      error = reason instanceof Error ? reason.message : 'Unable to optimize this image.';
    }
  }
</script>

<svelte:head
  ><title>Lossless PNG and GIF Optimizer — Image Compliant Tools</title><meta
    name="description"
    content="Optimize PNG and GIF files locally without changing rendered pixels."
  /><link rel="canonical" href="https://image.complianttools.com/lossless-optimize" /></svelte:head
>
<main>
  <a href="/convert">← Convert</a>
  <h1>Lossless PNG and GIF Optimizer</h1>
  <p>
    Optimize PNG or GIF files locally. GIF output is independently decoded and returned only when
    every rendered frame, delay, dimension, and loop setting is unchanged. Files never leave your
    browser.
  </p>
  <label
    >Choose a PNG or GIF <input
      type="file"
      accept="image/png,image/gif,.png,.gif"
      onchange={(event) => void optimise(event.currentTarget.files?.[0])}
    /></label
  >{#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
</main>

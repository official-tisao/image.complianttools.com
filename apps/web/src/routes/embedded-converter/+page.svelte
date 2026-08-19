<script lang="ts">
  import { createRaster, emitEmbeddedCArray } from '@complianttools/image-engine';

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
      const output = emitEmbeddedCArray(
        createRaster(
          canvas.width,
          canvas.height,
          context.getImageData(0, 0, canvas.width, canvas.height).data,
        ),
        { format: 'rgb565', outputName: 'image_data' },
      );
      const url = URL.createObjectURL(new Blob([output], { type: 'text/x-c' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.h`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Exported ${canvas.width}×${canvas.height} RGB565 C data locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create embedded C data.';
    }
  }
</script>

<svelte:head>
  <title>Embedded Image Converter — Image Compliant Tools</title>
  <meta name="description" content="Convert an image into local RGB565 C array data." />
  <link rel="canonical" href="https://image.complianttools.com/embedded-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Embedded Image Converter</h1>
  <p>Export an RGB565 C array locally for embedded projects. Nothing is uploaded.</p>
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

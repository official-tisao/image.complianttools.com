<script lang="ts">
  import {
    createRaster,
    emitAdafruitGfxBitmap,
    emitEmbeddedCArray,
    emitLvglV8CArray,
    emitLvglV9CArray,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let target = $state<'generic' | 'lvgl-v8' | 'lvgl-v9' | 'adafruit'>('generic');
  let outputName = $state('image_data');

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
      const output =
        target === 'lvgl-v8'
          ? emitLvglV8CArray(image, { format: 'rgb565', outputName })
          : target === 'lvgl-v9'
            ? emitLvglV9CArray(image, { format: 'rgb565', outputName })
            : target === 'adafruit'
              ? emitAdafruitGfxBitmap(image, outputName)
              : emitEmbeddedCArray(image, { format: 'rgb565', outputName });
      const url = URL.createObjectURL(new Blob([output], { type: 'text/x-c' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.h`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Exported ${canvas.width}×${canvas.height} ${target.replace('-', ' ')} C data locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create embedded C data.';
    }
  }
</script>

<svelte:head>
  <title>Embedded Image Converter — Image Compliant Tools</title>
  <meta
    name="description"
    content="Convert an image into local generic, LVGL, or Adafruit embedded C data."
  />
  <link rel="canonical" href="https://image.complianttools.com/embedded-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Embedded Image Converter</h1>
  <p>
    Export a local RGB565 C array for generic, LVGL v8/v9, or Adafruit projects. Nothing is
    uploaded.
  </p>
  <label>
    Target
    <select bind:value={target}>
      <option value="generic">Generic RGB565 C array</option>
      <option value="lvgl-v9">LVGL v9 image descriptor</option>
      <option value="lvgl-v8">LVGL v8 image descriptor</option>
      <option value="adafruit">Adafruit GFX 1-bit bitmap</option>
    </select>
  </label>
  <label>
    C symbol name
    <input bind:value={outputName} pattern="[A-Za-z_][A-Za-z0-9_]*" required />
  </label>
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

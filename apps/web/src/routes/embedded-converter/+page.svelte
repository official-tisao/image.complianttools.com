<script lang="ts">
  import {
    createRaster,
    embeddedByteSize,
    emitAdafruitGfxBitmap,
    emitEmbeddedCArray,
    emitEspIdfCArray,
    emitLvglV8CArray,
    emitLvglV9CArray,
    packEmbeddedPixels,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let target = $state<'generic' | 'binary' | 'lvgl-v8' | 'lvgl-v9' | 'adafruit' | 'esp-idf'>(
    'generic',
  );
  let outputName = $state('image_data');
  let format = $state<
    | 'rgb332'
    | 'rgb565'
    | 'rgb565be'
    | 'rgb888'
    | 'bgr888'
    | 'argb8888'
    | 'rgba8888'
    | 'gray8'
    | 'mono1'
  >('rgb565');

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
      const options = { format, outputName };
      const output =
        target === 'lvgl-v8'
          ? emitLvglV8CArray(image, options)
          : target === 'lvgl-v9'
            ? emitLvglV9CArray(image, options)
            : target === 'adafruit'
              ? emitAdafruitGfxBitmap(image, outputName)
              : target === 'esp-idf'
                ? emitEspIdfCArray(image, options)
                : target === 'binary'
                  ? new Uint8Array(packEmbeddedPixels(image, options))
                  : emitEmbeddedCArray(image, options);
      const binary = target === 'binary';
      const url = URL.createObjectURL(
        new Blob([output], { type: binary ? 'application/octet-stream' : 'text/x-c' }),
      );
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.${binary ? 'bin' : 'h'}`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Exported ${canvas.width}×${canvas.height} ${target.replace('-', ' ')} data locally (${embeddedByteSize(image, options)} bytes flash footprint).`;
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
    Export a local pixel array for generic, LVGL, Adafruit, ESP-IDF, or TFT_eSPI projects. Nothing
    is uploaded.
  </p>
  <label>
    Target
    <select bind:value={target}>
      <option value="generic">Generic RGB565 C array</option>
      <option value="binary">Generic RGB565 binary</option>
      <option value="lvgl-v9">LVGL v9 image descriptor</option>
      <option value="lvgl-v8">LVGL v8 image descriptor</option>
      <option value="adafruit">Adafruit GFX 1-bit bitmap</option>
      <option value="esp-idf">ESP-IDF / TFT_eSPI RGB565 array</option>
    </select>
  </label>
  <label>
    Pixel format
    <select bind:value={format}>
      <option value="rgb332">RGB332</option>
      <option value="rgb565">RGB565</option>
      <option value="rgb565be">RGB565 big-endian</option>
      <option value="rgb888">RGB888</option>
      <option value="bgr888">BGR888</option>
      <option value="argb8888">ARGB8888</option>
      <option value="rgba8888">RGBA8888</option>
      <option value="gray8">Gray8</option>
      <option value="mono1">Mono1</option>
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

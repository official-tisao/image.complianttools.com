<script lang="ts">
  import {
    createRaster,
    embeddedByteSize,
    emitAdafruitGfxBitmap,
    emitEmbeddedCArray,
    emitEspIdfCArray,
    emitLvglV8CArray,
    emitLvglV8RawCArray,
    emitLvglV9CArray,
    packGenericRawPixels,
    packLvglV8Binary,
    packLvglV9Binary,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let target = $state<
    | 'generic'
    | 'generic-bin'
    | 'lvgl-v8'
    | 'lvgl-v8-bin'
    | 'lvgl-v9'
    | 'lvgl-v9-bin'
    | 'adafruit'
    | 'esp-idf'
  >('generic');
  let outputName = $state('image_data');
  let alphaByte = $state(false);
  let chromaKeyed = $state(false);
  let chromaKey = $state('#00ff00');
  let bigEndian = $state(false);
  let storage = $state<'const' | 'static' | 'static-const'>('static-const');
  let lineWidth = $state(12);
  let dithering = $state<'none' | 'ordered'>('none');
  let format = $state<
    | 'alpha1'
    | 'alpha2'
    | 'alpha4'
    | 'alpha8'
    | 'indexed1'
    | 'indexed2'
    | 'indexed4'
    | 'indexed8'
    | 'raw'
    | 'raw-alpha'
    | 'raw-chroma'
    | 'rgb332'
    | 'rgb565'
    | 'rgb565be'
    | 'rgb565a8'
    | 'rgb888'
    | 'bgr888'
    | 'argb8888'
    | 'rgba8888'
    | 'xrgb8888'
    | 'gray8'
    | 'mono1'
  >('rgb565');

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(new Blob([sourceBytes], { type: file.type }));
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
      const parsedChromaKey = /^#([0-9a-f]{6})$/iu.exec(chromaKey);
      if (chromaKeyed && !parsedChromaKey) throw new Error('Choose a six-digit chroma-key colour.');
      const chroma = parsedChromaKey?.[1];
      const options = {
        format,
        outputName,
        alphaByte,
        bigEndian,
        storage,
        lineWidth,
        dithering,
        ...(chromaKeyed && chroma
          ? {
              chromaKey: [
                Number.parseInt(chroma.slice(0, 2), 16),
                Number.parseInt(chroma.slice(2, 4), 16),
                Number.parseInt(chroma.slice(4, 6), 16),
              ] as const,
            }
          : {}),
      };
      const output =
        target === 'lvgl-v8' &&
        (format === 'raw' || format === 'raw-alpha' || format === 'raw-chroma')
          ? emitLvglV8RawCArray(sourceBytes, image.width, image.height, outputName, format)
          : target === 'lvgl-v8'
            ? emitLvglV8CArray(image, options)
            : target === 'lvgl-v9'
              ? emitLvglV9CArray(image, options)
              : target === 'lvgl-v9-bin'
                ? packLvglV9Binary(image, options)
                : target === 'lvgl-v8-bin'
                  ? packLvglV8Binary(image, options)
                  : target === 'adafruit'
                    ? emitAdafruitGfxBitmap(image, outputName)
                    : target === 'esp-idf'
                      ? emitEspIdfCArray(image, options)
                      : target === 'generic-bin'
                        ? packGenericRawPixels(image, options)
                        : emitEmbeddedCArray(image, options);
      const binary = target.endsWith('-bin');
      const url = URL.createObjectURL(
        new Blob([output], { type: binary ? 'application/octet-stream' : 'text/x-c' }),
      );
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.${binary ? 'bin' : 'h'}`;
      download.click();
      URL.revokeObjectURL(url);
      const footprint = binary
        ? (output as Uint8Array).byteLength
        : format === 'raw' || format === 'raw-alpha' || format === 'raw-chroma'
          ? sourceBytes.byteLength
          : embeddedByteSize(image, options);
      status = `Exported ${canvas.width}×${canvas.height} ${target.replace('-', ' ')} data locally (${footprint} bytes flash footprint).`;
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
      <option value="generic-bin">Generic raw binary</option>
      <option value="lvgl-v9">LVGL v9 image descriptor</option>
      <option value="lvgl-v9-bin">LVGL v9 binary</option>
      <option value="lvgl-v8">LVGL v8 image descriptor</option>
      <option value="lvgl-v8-bin">LVGL v8 binary</option>
      <option value="adafruit">Adafruit GFX 1-bit bitmap</option>
      <option value="esp-idf">ESP-IDF / TFT_eSPI RGB565 array</option>
    </select>
  </label>
  <label>
    Dithering
    <select bind:value={dithering}>
      <option value="none">None</option>
      <option value="ordered">Ordered Bayer</option>
    </select>
  </label>
  <label><input type="checkbox" bind:checked={alphaByte} /> Append alpha byte</label>
  <label><input type="checkbox" bind:checked={bigEndian} /> Big-endian byte order</label>
  <label><input type="checkbox" bind:checked={chromaKeyed} /> Chroma key colour</label>
  {#if chromaKeyed}
    <label>Chroma key <input type="color" bind:value={chromaKey} /></label>
  {/if}
  <label>
    Storage qualifier
    <select bind:value={storage}>
      <option value="static-const">static const</option>
      <option value="const">const</option>
      <option value="static">static</option>
    </select>
  </label>
  <label
    >Bytes per source line <input type="number" min="1" max="256" bind:value={lineWidth} /></label
  >
  <label>
    Pixel format
    <select bind:value={format}>
      <option value="alpha1">Alpha 1-bit (LVGL v8)</option>
      <option value="alpha2">Alpha 2-bit (LVGL v8)</option>
      <option value="alpha4">Alpha 4-bit (LVGL v8)</option>
      <option value="alpha8">Alpha 8-bit (LVGL v8)</option>
      <option value="indexed1">Indexed 1-bit (LVGL v8)</option>
      <option value="indexed2">Indexed 2-bit (LVGL v8)</option>
      <option value="indexed4">Indexed 4-bit (LVGL v8)</option>
      <option value="indexed8">Indexed 8-bit (LVGL v8)</option>
      <option value="raw">Raw encoded data (LVGL v8 custom decoder)</option>
      <option value="raw-alpha">Raw encoded data with alpha (LVGL v8)</option>
      <option value="raw-chroma">Raw encoded data chroma keyed (LVGL v8)</option>
      <option value="rgb332">RGB332</option>
      <option value="rgb565">RGB565</option>
      <option value="rgb565be">RGB565 big-endian</option>
      <option value="rgb565a8">RGB565 + separate alpha plane (LVGL v9)</option>
      <option value="rgb888">RGB888</option>
      <option value="bgr888">BGR888</option>
      <option value="argb8888">ARGB8888</option>
      <option value="rgba8888">RGBA8888</option>
      <option value="xrgb8888">XRGB8888 (LVGL v9)</option>
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

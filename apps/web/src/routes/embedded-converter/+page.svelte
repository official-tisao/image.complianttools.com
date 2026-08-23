<script lang="ts">
  import {
    EmbeddedToolOptionsSchema,
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
    embeddedToolOptionDescriptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let status = $state('');
  let error = $state('');
  let toolOptions = $state(EmbeddedToolOptionsSchema.parse({}));
  const controlValues = $derived(
    Object.fromEntries(
      Object.entries(toolOptions).map(([key, value]) => [`embedded.${key}`, value]),
    ),
  );

  function setControl(path: string, value: unknown) {
    if (!path.startsWith('embedded.')) return;
    const parsed = EmbeddedToolOptionsSchema.safeParse({
      ...toolOptions,
      [path.slice('embedded.'.length)]: value,
    });
    if (parsed.success) toolOptions = parsed.data;
  }

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
      const parsedChromaKey = /^#([0-9a-f]{6})$/iu.exec(toolOptions.chromaKey);
      const chroma = parsedChromaKey?.[1];
      const options = {
        format: toolOptions.format,
        outputName: toolOptions.outputName,
        alphaByte: toolOptions.alphaByte,
        bigEndian: toolOptions.bigEndian,
        storage: toolOptions.storage,
        lineWidth: toolOptions.lineWidth,
        dithering: toolOptions.dithering,
        ...(toolOptions.chromaKeyed && chroma
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
        toolOptions.target === 'lvgl-v8' &&
        (toolOptions.format === 'raw' ||
          toolOptions.format === 'raw-alpha' ||
          toolOptions.format === 'raw-chroma')
          ? emitLvglV8RawCArray(
              sourceBytes,
              image.width,
              image.height,
              toolOptions.outputName,
              toolOptions.format,
            )
          : toolOptions.target === 'lvgl-v8'
            ? emitLvglV8CArray(image, options)
            : toolOptions.target === 'lvgl-v9'
              ? emitLvglV9CArray(image, options)
              : toolOptions.target === 'lvgl-v9-bin'
                ? packLvglV9Binary(image, options)
                : toolOptions.target === 'lvgl-v8-bin'
                  ? packLvglV8Binary(image, options)
                  : toolOptions.target === 'adafruit'
                    ? emitAdafruitGfxBitmap(image, toolOptions.outputName)
                    : toolOptions.target === 'esp-idf'
                      ? emitEspIdfCArray(image, options)
                      : toolOptions.target === 'generic-bin'
                        ? packGenericRawPixels(image, options)
                        : emitEmbeddedCArray(image, options);
      const binary = toolOptions.target.endsWith('-bin');
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
        : toolOptions.format === 'raw' ||
            toolOptions.format === 'raw-alpha' ||
            toolOptions.format === 'raw-chroma'
          ? sourceBytes.byteLength
          : embeddedByteSize(image, options);
      status = `Exported ${canvas.width}×${canvas.height} ${toolOptions.target.replace('-', ' ')} data locally (${footprint} bytes flash footprint).`;
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
  <GeneratedControls
    descriptions={embeddedToolOptionDescriptions}
    values={controlValues}
    onChange={setControl}
  />
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

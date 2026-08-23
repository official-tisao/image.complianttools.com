<script lang="ts">
  import {
    EmbeddedToolOptionsSchema,
    createRaster,
    embeddedByteSize,
    embeddedToolOptionDescriptions,
    emitAdafruitGfxBitmap,
    emitEmbeddedCArray,
    emitEspIdfCArray,
    emitLvglV8CArray,
    emitLvglV8RawCArray,
    emitLvglV9CArray,
    engineErrorMessage,
    isEngineError,
    packGenericRawPixels,
    packLvglV8Binary,
    packLvglV9Binary,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  type LocalBlobPart = NonNullable<ConstructorParameters<typeof globalThis.Blob>[0]>[number];
  let status = $state('');
  let error = $state('');
  let sourceFile = $state<File>();
  let output = $state<string | Uint8Array>();
  let outputName = $state('');
  let toolOptions = $state(EmbeddedToolOptionsSchema.parse({}));
  const controlValues = $derived(
    Object.fromEntries(
      Object.entries(toolOptions).map(([key, value]) => [`embedded.${key}`, value]),
    ),
  );
  const previewText = $derived(
    typeof output === 'string'
      ? output
      : output
        ? [...output].map((value) => value.toString(16).padStart(2, '0')).join(' ')
        : '',
  );

  function clearOutput() {
    output = undefined;
    outputName = '';
  }
  function setControl(path: string, value: unknown) {
    if (!path.startsWith('embedded.')) return;
    const parsed = EmbeddedToolOptionsSchema.safeParse({
      ...toolOptions,
      [path.slice('embedded.'.length)]: value,
    });
    if (parsed.success) {
      toolOptions = parsed.data;
      status = sourceFile
        ? 'Options changed. Generate again to update the exact output preview.'
        : '';
      error = '';
      clearOutput();
    } else error = parsed.error.issues[0]?.message ?? 'These embedded options are incompatible.';
  }
  function selectFile(file: File | undefined) {
    sourceFile = file;
    status = file ? `${file.name} is ready.` : '';
    error = '';
    clearOutput();
  }
  async function generate() {
    status = '';
    error = '';
    clearOutput();
    if (!sourceFile) {
      error = 'Choose an image first.';
      return;
    }
    try {
      const result = await withTypedEngineErrorsAsync(
        'Embedded export failed',
        'Choose a valid raster image and a pixel format supported by the selected target.',
        async () => {
          const sourceBytes = new Uint8Array(await sourceFile!.arrayBuffer());
          const bitmap = await createImageBitmap(
            new Blob([sourceBytes], { type: sourceFile!.type }),
          );
          try {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Your browser cannot create a local canvas.');
            context.drawImage(bitmap, 0, 0);
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
            const generated =
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
            const footprint = binary
              ? (generated as Uint8Array).byteLength
              : toolOptions.format === 'raw' ||
                  toolOptions.format === 'raw-alpha' ||
                  toolOptions.format === 'raw-chroma'
                ? sourceBytes.byteLength
                : embeddedByteSize(image, options);
            return {
              generated,
              fileName: `${sourceFile!.name.replace(/\.[^.]+$/u, '')}.${binary ? 'bin' : 'h'}`,
              footprint,
              width: image.width,
              height: image.height,
            };
          } finally {
            bitmap.close();
          }
        },
      );
      output = result.generated;
      outputName = result.fileName;
      status = `Generated ${result.width}×${result.height} ${toolOptions.target.replace('-', ' ')} data locally (${result.footprint} bytes flash footprint).`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} Remedy: ${reason.remedy}`
        : 'Unable to create embedded C data.';
    }
  }
  function downloadOutput() {
    if (output === undefined) return;
    const binary = output instanceof Uint8Array;
    const url = URL.createObjectURL(
      new Blob([output as LocalBlobPart], {
        type: binary ? 'application/octet-stream' : 'text/x-c',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = outputName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
  <label>
    Choose an image
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onchange={(event) => selectFile(event.currentTarget.files?.[0])}
    />
  </label>
  <button type="button" onclick={() => void generate()} disabled={!sourceFile}
    >Generate output</button
  >
  <button type="button" onclick={downloadOutput} disabled={output === undefined}
    >Download output</button
  >
  {#if output !== undefined}
    <section aria-labelledby="embedded-preview-heading">
      <h2 id="embedded-preview-heading">Exact export preview</h2>
      <p>
        {output instanceof Uint8Array ? 'Hexadecimal bytes' : 'Generated C source'} for {outputName}
      </p>
      <textarea aria-label="Exact embedded output" readonly value={previewText}></textarea>
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

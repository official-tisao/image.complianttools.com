<script lang="ts">
  import {
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
  } from '@complianttools/image-engine/export/embedded';
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
  } from '@complianttools/image-engine/errors';
  import { createRaster } from '@complianttools/image-engine/ops/raster';
  import {
    EmbeddedToolOptionsSchema,
    embeddedToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  type LocalBlobPart = NonNullable<ConstructorParameters<typeof globalThis.Blob>[0]>[number];
  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(
    locale === 'en' ? '/embedded-converter' : `/${locale}/embedded-converter`,
  );
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
        ? t(
            'embedded.optionsChanged',
            'Options changed. Generate again to update the exact output preview.',
          )
        : '';
      error = '';
      clearOutput();
    } else
      error =
        parsed.error.issues[0]?.message ??
        t('embedded.incompatible', 'These embedded options are incompatible.');
  }
  function selectFile(file: File | undefined) {
    sourceFile = file;
    status = file ? t('embedded.ready', '{value} is ready.', file.name) : '';
    error = '';
    clearOutput();
  }
  async function generate() {
    status = '';
    error = '';
    clearOutput();
    if (!sourceFile) {
      error = t('embedded.chooseFirst', 'Choose an image first.');
      return;
    }
    try {
      const result = await withTypedEngineErrorsAsync(
        t('embedded.failure', 'Embedded export failed'),
        t(
          'embedded.remedy',
          'Choose a valid raster image and a pixel format supported by the selected target.',
        ),
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
            if (!context)
              throw new Error(
                t('embedded.canvasError', 'Your browser cannot create a local canvas.'),
              );
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
      status = `${t('embedded.generated', 'Generated')} ${result.width}×${result.height} ${toolOptions.target.replace('-', ' ')} ${t('embedded.dataLocally', 'data locally')} (${result.footprint} ${t('embedded.footprint', 'bytes flash footprint')}).`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('embedded.unable', 'Unable to create embedded C data.');
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
  <title>{t('embedded.title', 'Embedded Image Converter')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'embedded.metaDescription',
      'Convert an image into local generic, LVGL, or Adafruit embedded C data.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('embedded.back', '← Convert')}</a
  >
  <h1>{t('embedded.title', 'Embedded Image Converter')}</h1>
  <p>
    {t(
      'embedded.description',
      'Export a local pixel array for generic, LVGL, Adafruit, ESP-IDF, or TFT_eSPI projects. Nothing is uploaded.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, embeddedToolOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  <label>
    {t('embedded.choose', 'Choose an image')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onchange={(event) => selectFile(event.currentTarget.files?.[0])}
    />
  </label>
  <button type="button" onclick={() => void generate()} disabled={!sourceFile}
    >{t('embedded.generate', 'Generate output')}</button
  >
  <button type="button" onclick={downloadOutput} disabled={output === undefined}
    >{t('embedded.download', 'Download output')}</button
  >
  {#if output !== undefined}
    <section aria-labelledby="embedded-preview-heading">
      <h2 id="embedded-preview-heading">{t('embedded.preview', 'Exact export preview')}</h2>
      <p>
        {output instanceof Uint8Array
          ? t('embedded.hexBytes', 'Hexadecimal bytes')
          : t('embedded.cSource', 'Generated C source')}
        {t('embedded.for', 'for')}
        {outputName}
      </p>
      <textarea
        aria-label={t('embedded.outputLabel', 'Exact embedded output')}
        readonly
        value={previewText}></textarea>
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

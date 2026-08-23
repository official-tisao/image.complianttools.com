<script lang="ts">
  import {
    VectorizeToolOptionsSchema,
    createRaster,
    engineErrorMessage,
    isEngineError,
    vectorizeRaster,
    vectorizeToolOptionDescriptions,
    withTypedEngineErrors,
    type VectorizeToolOptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let options = $state<VectorizeToolOptions>(VectorizeToolOptionsSchema.parse({}));
  let sourceFile = $state<File>();
  let fileName = $state('');
  let svg = $state('');
  let previewUrl = $state('');
  let status = $state('');
  let error = $state('');
  const controlValues = $derived({
    'vector.colors': options.colors,
    'vector.curveTolerance': options.curveTolerance,
  });

  function clearOutput() {
    svg = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (!path.startsWith('vector.')) return;
    options = VectorizeToolOptionsSchema.parse({
      ...options,
      [path.slice('vector.'.length)]: value,
    });
    clearOutput();
    status = sourceFile ? 'Options changed. Trace again to update the faithful preview.' : '';
  }
  function selectFile(file: File | undefined) {
    sourceFile = file;
    fileName = file?.name ?? '';
    status = file ? `${file.name} is ready to trace.` : '';
    error = '';
    clearOutput();
  }
  async function vectorize() {
    status = '';
    error = '';
    if (!sourceFile) {
      error = 'Choose a raster image first.';
      return;
    }
    try {
      const bitmap = await createImageBitmap(sourceFile);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Your browser cannot create a local canvas.');
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        svg = withTypedEngineErrors(
          'Vector tracing failed',
          'Choose a valid raster image, reduce its dimensions, or increase curve tolerance.',
          () =>
            vectorizeRaster(createRaster(canvas.width, canvas.height, data), {
              colors: options.colors,
              curveTolerance: options.curveTolerance,
            }),
        );
      } finally {
        bitmap.close();
      }
      previewUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      status = `Traced ${fileName} locally into ${new Blob([svg]).size} SVG bytes.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} Remedy: ${reason.remedy}`
        : reason instanceof Error
          ? reason.message
          : 'Unable to vectorize this image.';
    }
  }
  function downloadSvg() {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.[^.]+$/u, '')}.svg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<svelte:head>
  <title>Image to SVG — Image Compliant Tools</title>
  <meta name="description" content="Posterize and trace raster images locally into SVG paths." />
  <link rel="canonical" href="https://image.complianttools.com/image-to-svg" />
</svelte:head>

<main>
  <a href="/svg-to-png">← SVG to PNG</a>
  <h1>Image to SVG</h1>
  <p>
    Posterize and trace a raster image into self-contained SVG paths on your device. Nothing is
    uploaded.
  </p>
  <GeneratedControls
    descriptions={vectorizeToolOptionDescriptions}
    values={controlValues}
    onChange={setControl}
  />
  <label>
    Choose a raster image
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onchange={(event) => selectFile(event.currentTarget.files?.[0])}
    />
  </label>
  <button type="button" onclick={() => void vectorize()} disabled={!sourceFile}>Trace image</button>
  <button type="button" onclick={downloadSvg} disabled={!svg}>Download SVG</button>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if previewUrl}
    <section aria-labelledby="vector-preview-heading">
      <h2 id="vector-preview-heading">Faithful exported SVG preview</h2>
      <p>The preview and download use the same exact self-contained SVG text.</p>
      <img src={previewUrl} alt="Traced SVG export preview" />
    </section>
  {/if}
</main>

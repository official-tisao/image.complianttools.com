<script lang="ts">
  import {
    FaviconToolOptionsSchema,
    createFaviconPackage,
    createRaster,
    engineErrorMessage,
    faviconToolOptionDescriptions,
    isEngineError,
    withTypedEngineErrorsAsync,
    type FaviconPackage,
    type FaviconToolOptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let options = $state<FaviconToolOptions>(FaviconToolOptionsSchema.parse({}));
  let sourceFile = $state<File>();
  let output = $state<FaviconPackage>();
  let previewUrl = $state('');
  let status = $state('');
  let error = $state('');
  const controlValues = $derived({ 'favicon.siteName': options.siteName });

  function clearOutput() {
    output = undefined;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (path !== 'favicon.siteName') return;
    try {
      options = FaviconToolOptionsSchema.parse({ siteName: value });
      error = '';
      status = sourceFile
        ? 'Site name changed. Create the package again to update its manifest.'
        : '';
      clearOutput();
    } catch {
      error = 'Site name must contain between 1 and 128 characters.';
    }
  }
  function selectFile(file: File | undefined) {
    sourceFile = file;
    status = file ? `${file.name} is ready.` : '';
    error = '';
    clearOutput();
  }
  async function createPackage() {
    status = '';
    error = '';
    if (!sourceFile) {
      error = 'Choose an image first.';
      return;
    }
    try {
      const bitmap = await createImageBitmap(sourceFile);
      try {
        const size = Math.min(512, bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Your browser cannot create a local canvas.');
        const scale = Math.max(size / bitmap.width, size / bitmap.height);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;
        context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
        output = await withTypedEngineErrorsAsync(
          'Favicon generation failed',
          'Choose a valid raster image, reduce its dimensions, or use a shorter site name.',
          () =>
            createFaviconPackage(
              createRaster(size, size, context.getImageData(0, 0, size, size).data),
              options.siteName,
            ),
        );
      } finally {
        bitmap.close();
      }
      previewUrl = URL.createObjectURL(new Blob([output.previewPng], { type: 'image/png' }));
      status = `Created favicon.ico, ${output.fileNames.length - 3} PNG icons, a web manifest, and an HTML snippet locally.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} Remedy: ${reason.remedy}`
        : reason instanceof Error
          ? reason.message
          : 'Unable to create the favicon.';
    }
  }
  function downloadPackage() {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output.archive], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'favicon-package.zip';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<svelte:head>
  <title>Favicon Generator — Image Compliant Tools</title>
  <meta
    name="description"
    content="Create a multi-resolution favicon package with PNG icons, manifest, and HTML locally."
  />
  <link rel="canonical" href="https://image.complianttools.com/favicon-generator" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Favicon Generator</h1>
  <p>
    Create a multi-resolution ICO, PNG icon set, web manifest, and HTML link snippet locally. Your
    image is never uploaded.
  </p>
  <GeneratedControls
    descriptions={faviconToolOptionDescriptions}
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
  <button type="button" onclick={() => void createPackage()} disabled={!sourceFile}
    >Create package</button
  >
  <button type="button" onclick={downloadPackage} disabled={!output}>Download package</button>
  {#if output}
    <section aria-labelledby="favicon-preview-heading">
      <h2 id="favicon-preview-heading">Exact 32×32 package preview</h2>
      <img src={previewUrl} alt="Generated 32 by 32 favicon" width="32" height="32" />
      <label>HTML link snippet <textarea readonly value={output.html}></textarea></label>
      <label>site.webmanifest <textarea readonly value={output.manifest}></textarea></label>
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

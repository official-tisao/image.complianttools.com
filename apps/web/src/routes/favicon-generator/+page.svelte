<script lang="ts">
  import { createFaviconPackage, createRaster } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let siteName = $state('Site');
  let htmlSnippet = $state('');
  let manifest = $state('');

  async function createFavicon(file: File | undefined) {
    status = '';
    error = '';
    htmlSnippet = '';
    manifest = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const size = Math.min(512, bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.drawImage(bitmap, (size - bitmap.width) / 2, (size - bitmap.height) / 2);
      bitmap.close();
      const output = await createFaviconPackage(
        createRaster(size, size, context.getImageData(0, 0, size, size).data),
        siteName,
      );
      htmlSnippet = output.html;
      manifest = output.manifest;
      const url = URL.createObjectURL(new Blob([output.archive], { type: 'application/zip' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = 'favicon-package.zip';
      download.click();
      URL.revokeObjectURL(url);
      status = `Created favicon.ico, ${output.fileNames.length - 3} PNG icons, a web manifest, and an HTML snippet locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create the favicon.';
    }
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
  <label>Site name <input bind:value={siteName} maxlength="128" /></label>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void createFavicon(event.currentTarget.files?.[0])}
    /></label
  >
  {#if htmlSnippet}
    <label>HTML link snippet <textarea readonly value={htmlSnippet}></textarea></label>
    <label>site.webmanifest <textarea readonly value={manifest}></textarea></label>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

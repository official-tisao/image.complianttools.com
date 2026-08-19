<script lang="ts">
  import { stripPngMetadata } from '@complianttools/image-engine';

  let fileName = $state('');
  let status = $state('');
  let error = $state('');

  async function strip(file: File | undefined) {
    fileName = file?.name ?? '';
    status = '';
    error = '';
    if (!file) return;
    try {
      const output = stripPngMetadata(await file.arrayBuffer());
      const url = URL.createObjectURL(new Blob([output], { type: 'image/png' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.name.replace(/\.png$/iu, '')}-stripped.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      status = `Removed metadata locally: ${file.size} bytes → ${output.byteLength} bytes.`;
    } catch (reason) {
      error =
        reason instanceof Error ? reason.message : 'Unable to remove metadata from this file.';
    }
  }
</script>

<svelte:head>
  <title>Remove PNG Metadata — Image Compliant Tools</title>
  <meta name="description" content="Remove supported PNG metadata locally in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/remove-exif" />
</svelte:head>

<main>
  <a href="/exif-viewer">← Metadata Viewer</a>
  <h1>Metadata Remover</h1>
  <p>
    PNG metadata is stripped locally. Other format-specific stripping options are not offered until
    they are implemented and verified.
  </p>
  <label>
    Choose a PNG
    <input
      type="file"
      accept="image/png"
      onchange={(event) => void strip(event.currentTarget.files?.[0])}
    />
  </label>
  {#if fileName}<p>{fileName}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

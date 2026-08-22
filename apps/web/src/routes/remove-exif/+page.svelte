<script lang="ts">
  import {
    stripGifMetadata,
    stripJpegMetadata,
    stripJpegGpsMetadata,
    stripPngMetadata,
    stripWebpMetadata,
  } from '@complianttools/image-engine';

  let fileName = $state('');
  let status = $state('');
  let error = $state('');
  let preset = $state<'all' | 'gps'>('all');

  async function strip(file: File | undefined) {
    fileName = file?.name ?? '';
    status = '';
    error = '';
    if (!file) return;
    try {
      const isPng = file.type === 'image/png' || /\.png$/iu.test(file.name);
      const isWebp = file.type === 'image/webp' || /\.webp$/iu.test(file.name);
      const isGif = file.type === 'image/gif' || /\.gif$/iu.test(file.name);
      const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/iu.test(file.name);
      if (preset === 'gps' && !isJpeg)
        throw new Error('GPS-only removal is currently verified for JPEG files only.');
      const input = await file.arrayBuffer();
      const output = isPng
        ? stripPngMetadata(input)
        : isWebp
          ? stripWebpMetadata(input)
          : isGif
            ? stripGifMetadata(input)
            : preset === 'gps'
              ? stripJpegGpsMetadata(input)
              : stripJpegMetadata(input);
      const extension = isPng ? 'png' : isWebp ? 'webp' : isGif ? 'gif' : 'jpg';
      const url = URL.createObjectURL(
        new Blob([output], {
          type: isPng ? 'image/png' : isWebp ? 'image/webp' : isGif ? 'image/gif' : 'image/jpeg',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.name.replace(/\.[^.]+$/u, '')}-stripped.${extension}`;
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
  <title>Remove Image Metadata — Image Compliant Tools</title>
  <meta
    name="description"
    content="Remove supported PNG, JPEG, GIF, and WebP metadata locally in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/remove-exif" />
</svelte:head>

<main>
  <a href="/exif-viewer">← Metadata Viewer</a>
  <h1>Metadata Remover</h1>
  <p>
    PNG, JPEG, GIF, and WebP metadata is stripped locally. Other format-specific stripping options
    are not offered until they are implemented and verified.
  </p>
  <label>
    Removal preset
    <select bind:value={preset}>
      <option value="all">Remove all metadata</option>
      <option value="gps">Remove EXIF GPS only (JPEG)</option>
    </select>
  </label>
  <label>
    Choose a PNG, JPEG, GIF, or WebP
    <input
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={(event) => void strip(event.currentTarget.files?.[0])}
    />
  </label>
  {#if fileName}<p>{fileName}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

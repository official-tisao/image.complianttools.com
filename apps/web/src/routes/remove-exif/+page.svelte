<script lang="ts">
  import {
    stripGifMetadata,
    stripJpegExifTags,
    stripJpegGpsMetadata,
    stripJpegMakerNotes,
    stripJpegMetadata,
    stripJpegMetadataExceptOrientationCopyright,
    stripPngMetadata,
    stripWebpMetadata,
  } from '@complianttools/image-engine';

  let fileName = $state('');
  let status = $state('');
  let error = $state('');
  let preset = $state<
    'keep' | 'all' | 'gps' | 'except-orientation-copyright' | 'maker-notes' | 'custom'
  >('all');
  let selectedTags = $state<number[]>([]);
  const customFields = [
    [0x013b, 'Artist'],
    [0x8298, 'Copyright'],
    [0x010e, 'ImageDescription'],
    [0x9286, 'UserComment'],
    [0x9003, 'DateTimeOriginal'],
    [0x0131, 'Software'],
    [0x4746, 'Rating'],
    [0x9c9e, 'Keywords'],
    [0x8825, 'GPS coordinates'],
    [0x0112, 'Orientation'],
    [0x927c, 'MakerNotes'],
  ] as const;

  function selectTag(tag: number, checked: boolean) {
    selectedTags = checked
      ? [...new Set([...selectedTags, tag])]
      : selectedTags.filter((value) => value !== tag);
  }

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
      if (
        ['gps', 'except-orientation-copyright', 'maker-notes', 'custom'].includes(preset) &&
        !isJpeg
      )
        throw new Error(
          'This selective metadata preset is currently verified for JPEG files only.',
        );
      if (preset === 'custom' && selectedTags.length === 0)
        throw new Error('Select at least one EXIF field to remove.');
      const input = await file.arrayBuffer();
      const output =
        preset === 'keep'
          ? new Uint8Array(input)
          : isPng
            ? stripPngMetadata(input)
            : isWebp
              ? stripWebpMetadata(input)
              : isGif
                ? stripGifMetadata(input)
                : preset === 'gps'
                  ? stripJpegGpsMetadata(input)
                  : preset === 'except-orientation-copyright'
                    ? stripJpegMetadataExceptOrientationCopyright(input)
                    : preset === 'maker-notes'
                      ? stripJpegMakerNotes(input)
                      : preset === 'custom'
                        ? stripJpegExifTags(input, selectedTags)
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
      status =
        preset === 'keep'
          ? `Kept every byte locally (${output.byteLength} bytes).`
          : `Removed metadata locally: ${file.size} bytes → ${output.byteLength} bytes.`;
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
      <option value="except-orientation-copyright"
        >Remove all except Orientation + Copyright (JPEG)</option
      >
      <option value="maker-notes">Remove MakerNotes only (JPEG)</option>
      <option value="keep">Keep everything (byte-identical)</option>
      <option value="custom">Custom fields (JPEG)</option>
    </select>
  </label>
  {#if preset === 'custom'}
    <fieldset>
      <legend>EXIF fields to remove</legend>
      {#each customFields as [tag, label]}
        <label
          ><input
            type="checkbox"
            checked={selectedTags.includes(tag)}
            onchange={(event) => selectTag(tag, event.currentTarget.checked)}
          />
          {label}</label
        >
      {/each}
    </fieldset>
  {/if}
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

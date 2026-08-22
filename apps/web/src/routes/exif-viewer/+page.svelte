<script lang="ts">
  import {
    editJpegCopyrightMetadata,
    readContainerMetadata,
    type MetadataTag,
  } from '@complianttools/image-engine';

  let fileName = $state('');
  let tags = $state<readonly MetadataTag[]>([]);
  let error = $state('');
  let status = $state('');
  let inputBytes = $state<Uint8Array>();
  let copyright = $state('');
  let canEditCopyright = $state(false);

  async function inspect(file: File | undefined) {
    fileName = file?.name ?? '';
    tags = [];
    error = '';
    status = '';
    inputBytes = undefined;
    canEditCopyright = false;
    if (!file) return;
    try {
      inputBytes = new Uint8Array(await file.arrayBuffer());
      tags = readContainerMetadata(inputBytes).tags;
      const field = tags.find((tag) => tag.namespace === 'EXIF' && tag.name === 'copyright');
      canEditCopyright = /\.jpe?g$/iu.test(file.name) && field !== undefined;
      copyright = field?.value ?? '';
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : 'This local metadata reader could not inspect the file.';
    }
  }

  function saveCopyright() {
    error = '';
    status = '';
    if (!inputBytes) return;
    try {
      const output = editJpegCopyrightMetadata(inputBytes, copyright);
      const url = URL.createObjectURL(new Blob([output], { type: 'image/jpeg' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${fileName.replace(/\.[^.]+$/u, '')}-metadata-edited.jpg`;
      download.click();
      URL.revokeObjectURL(url);
      status = 'Edited the existing EXIF copyright field locally; all other bytes were preserved.';
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to edit this EXIF field.';
    }
  }
</script>

<svelte:head>
  <title>Metadata Viewer — Image Compliant Tools</title>
  <meta
    name="description"
    content="Read supported PNG, JPEG, GIF, and WebP metadata locally in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/exif-viewer" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Metadata Viewer</h1>
  <p>
    Your file stays in this browser. PNG, JPEG, GIF, and WebP metadata markers are supported today.
  </p>
  <label>
    Choose an image
    <input
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    />
  </label>
  {#if fileName}
    <h2>{fileName}</h2>
  {/if}
  {#if error}
    <p role="alert">{error}</p>
  {:else if status}
    <p role="status">{status}</p>
  {:else if fileName && tags.length === 0}
    <p>No readable metadata was found.</p>
  {:else if tags.length}
    <table>
      <thead><tr><th>Namespace</th><th>Field</th><th>Value</th></tr></thead>
      <tbody
        >{#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}<tr
            ><td>{tag.namespace}</td><td>{tag.name}</td><td>{tag.value}</td></tr
          >{/each}</tbody
      >
    </table>
  {/if}
  {#if canEditCopyright}
    <section aria-labelledby="edit-copyright-heading">
      <h2 id="edit-copyright-heading">Edit existing copyright</h2>
      <p>The replacement must fit in the existing EXIF field so no other metadata is relocated.</p>
      <label>Copyright <input bind:value={copyright} /></label>
      <button type="button" onclick={saveCopyright}>Download edited JPEG</button>
    </section>
  {/if}
</main>

<script lang="ts">
  import { readContainerMetadata, type MetadataTag } from '@complianttools/image-engine';

  let details = $state<{
    name: string;
    type: string;
    bytes: number;
    width: number;
    height: number;
  }>();
  let tags = $state<readonly MetadataTag[]>([]);
  let error = $state('');

  async function inspect(file: File | undefined) {
    details = undefined;
    tags = [];
    error = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      details = {
        bytes: file.size,
        height: bitmap.height,
        name: file.name,
        type: file.type,
        width: bitmap.width,
      };
      bitmap.close();
      try {
        tags = readContainerMetadata(await file.arrayBuffer()).tags;
      } catch {
        // Pixel dimensions remain useful for formats without a currently supported metadata reader.
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to inspect this image.';
    }
  }
</script>

<svelte:head>
  <title>Image Inspector — Image Compliant Tools</title>
  <meta
    name="description"
    content="Inspect image dimensions, size, type, and supported local metadata."
  />
  <link rel="canonical" href="https://image.complianttools.com/image-info" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image Inspector</h1>
  <p>Inspect dimensions and supported metadata locally. Your file is never uploaded.</p>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    /></label
  >
  {#if details}
    <dl>
      <dt>Name</dt>
      <dd>{details.name}</dd>
      <dt>Type</dt>
      <dd>{details.type || 'unknown'}</dd>
      <dt>Size</dt>
      <dd>{details.bytes} bytes</dd>
      <dt>Dimensions</dt>
      <dd>{details.width} × {details.height} px</dd>
    </dl>
    {#if tags.length}
      <h2>Supported metadata</h2>
      <ul>
        {#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}<li>
            {tag.namespace}: {tag.name} — {tag.value}
          </li>{/each}
      </ul>
    {/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>

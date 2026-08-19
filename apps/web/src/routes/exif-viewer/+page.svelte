<script lang="ts">
  import { readContainerMetadata, type MetadataTag } from '@complianttools/image-engine';

  let fileName = $state('');
  let tags = $state<readonly MetadataTag[]>([]);
  let error = $state('');

  async function inspect(file: File | undefined) {
    fileName = file?.name ?? '';
    tags = [];
    error = '';
    if (!file) return;
    try {
      tags = readContainerMetadata(await file.arrayBuffer()).tags;
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : 'This local metadata reader could not inspect the file.';
    }
  }
</script>

<svelte:head>
  <title>Metadata Viewer — Image Compliant Tools</title>
  <meta name="description" content="Read supported PNG and GIF metadata locally in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/exif-viewer" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Metadata Viewer</h1>
  <p>
    Your file stays in this browser. PNG text/EXIF/ICC markers and GIF comments are supported today.
  </p>
  <label>
    Choose an image
    <input
      type="file"
      accept="image/png,image/gif"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    />
  </label>
  {#if fileName}
    <h2>{fileName}</h2>
  {/if}
  {#if error}
    <p role="alert">{error}</p>
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
</main>

<script lang="ts">
  type Reference =
    | { name: string; reason: string; alternative: string }
    | { name: string; summary: string; notes: string };
  let { data }: { data: Reference } = $props();
</script>

<svelte:head>
  <title>{data.name} format reference</title>
  <meta
    name="description"
    content={`${data.name} local codec support, limitations, and practical guidance.`}
  />
</svelte:head>

<main class="reference">
  <p class="eyebrow">Format reference</p>
  <h1>{data.name}</h1>
  {#if 'summary' in data}
    <p>{data.summary}</p>
    <h2>Local codec support</h2>
    <p>{data.notes}</p>
    <p>Processing stays in this browser; source pixels are not uploaded.</p>
    <p><a href="/convert">Convert an image locally</a></p>
  {:else}
    <p><strong>Not supported in v1.</strong> {data.reason}</p>
    <h2>What to do instead</h2>
    <p>{data.alternative}</p>
    <p>No file is uploaded or fetched when this capability status is shown.</p>
    <p><a href="/convert">See available local conversion formats</a></p>
  {/if}
</main>

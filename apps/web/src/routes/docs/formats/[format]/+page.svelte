<script lang="ts">
  let { data }: { data: { name: string; reason: string; alternative: string } } = $props();
</script>

<svelte:head>
  <title>{data.name} support status</title>
  <meta
    name="description"
    content={`${data.name} is unavailable, with specific local alternatives.`}
  />
</svelte:head>

<main class="reference">
  <p class="eyebrow">Format reference</p>
  <h1>{data.name}</h1>
  <p><strong>Not supported in v1.</strong> {data.reason}</p>
  <h2>What to do instead</h2>
  <p>{data.alternative}</p>
  <p>No file is uploaded or fetched when this capability status is shown.</p>
  <p><a href="/convert">See available local conversion formats</a></p>
</main>

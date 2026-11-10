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
    <p class="cta">
      <a
        href="/convert"
        class="button primary convert-button"
        aria-label="Convert an image locally"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <polyline points="14 5 19 10 14 15" />
          <polyline points="10 19 5 14 10 9" />
        </svg>
        Convert Image Now
      </a>
    </p>
  {:else}
    <p><strong>Not supported in v1.</strong> {data.reason}</p>
    <h2>What to do instead</h2>
    <p>{data.alternative}</p>
    <p>No file is uploaded or fetched when this capability status is shown.</p>
    <p class="cta">
      <a
        href="/convert"
        class="button primary convert-button"
        aria-label="See available local conversion formats"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <polyline points="14 5 19 10 14 15" />
          <polyline points="10 19 5 14 10 9" />
        </svg>
        Convert Image Now
      </a>
    </p>
  {/if}
</main>

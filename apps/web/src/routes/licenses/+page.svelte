<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Third-party licences</title></svelte:head>
<main class="reference">
  <h1>Third-party licences</h1>
  <pre>{data.licences}</pre>
</main>

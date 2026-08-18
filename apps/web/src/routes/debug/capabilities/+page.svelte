<script lang="ts">
  import { onMount } from 'svelte';
  import { probeCapabilities, type FormatCapability } from '@complianttools/image-engine';
  let capabilities = $state<FormatCapability[]>([]);
  onMount(async () => {
    capabilities = await probeCapabilities();
  });
</script>

<svelte:head><title>Runtime capabilities</title></svelte:head>
<main class="reference">
  <h1>Runtime capabilities</h1>
  <dl id="capabilities">
    {#each capabilities as capability (capability.id)}<dt>{capability.id}</dt>
      <dd>{capability.decode}</dd>{/each}
  </dl>
</main>

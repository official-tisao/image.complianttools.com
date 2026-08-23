<script lang="ts">
  import { onMount } from 'svelte';
  import { probeRuntimeCapabilities, type RuntimeCapabilities } from '@complianttools/image-engine';

  const labels: Readonly<Record<keyof RuntimeCapabilities, string>> = {
    wasmSimd: 'WebAssembly SIMD',
    wasmThreads: 'WebAssembly threads',
    webGpu: 'WebGPU',
    webGl2: 'WebGL 2',
    offscreenCanvas: 'OffscreenCanvas',
    fileSystemAccess: 'File System Access',
    opfs: 'Origin private file system',
    webCodecs: 'WebCodecs',
  };
  let capabilities = $state<RuntimeCapabilities>();
  onMount(() => {
    capabilities = probeRuntimeCapabilities();
  });
</script>

<svelte:head><title>Runtime capabilities</title></svelte:head>
<main class="reference">
  <h1>Runtime capabilities</h1>
  <dl id="capabilities">
    {#if capabilities}
      {#each Object.entries(capabilities) as [id, available] (id)}<dt>
          {labels[id as keyof RuntimeCapabilities]}
        </dt>
        <dd>{available ? 'Available' : 'Unavailable'}</dd>{/each}
    {/if}
  </dl>
</main>

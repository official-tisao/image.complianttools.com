<script lang="ts">
  import ToolWorkspace from '$lib/ToolWorkspace.svelte';
  import ImageInspector from '$lib/ImageInspector.svelte';
  import { toolCopy } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const phaseOneTool = $derived(
    data.tool === 'convert' || data.tool === 'compress' || data.tool === 'resize'
      ? data.tool
      : null,
  );
  const copy = $derived(phaseOneTool ? toolCopy(data.locale, phaseOneTool) : null);
</script>

{#if phaseOneTool && copy}
  <ToolWorkspace
    kind={phaseOneTool}
    locale={data.locale}
    title={copy.title}
    description={copy.description}
  />
{:else}
  <ImageInspector locale={data.locale} />
{/if}

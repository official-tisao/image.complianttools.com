<script lang="ts">
  import ToolWorkspace from '$lib/ToolWorkspace.svelte';
  import { toolCopy } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const copy = $derived(toolCopy(data.locale, data.tool));
</script>

<ToolWorkspace
  kind={data.tool}
  locale={data.locale}
  title={copy.title}
  description={copy.description}
/>

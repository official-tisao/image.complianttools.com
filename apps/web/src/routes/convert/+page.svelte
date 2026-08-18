<script lang="ts">
  import ToolWorkspace from '$lib/ToolWorkspace.svelte';
  import { toolCopy } from '$lib/i18n';
  const copy = toolCopy('en', 'convert');
</script>

<ToolWorkspace kind="convert" title={copy.title} description={copy.description} />

<script lang="ts">
  import ToolWorkspace from '$lib/ToolWorkspace.svelte';
  import { toolCopy } from '$lib/i18n';
  const copy = toolCopy('en', 'resize');
</script>

<ToolWorkspace kind="resize" title={copy.title} description={copy.description} />

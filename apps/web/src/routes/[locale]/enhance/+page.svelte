<script lang="ts">
  import P3AdvancedColourTool from '$lib/P3AdvancedColourTool.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<P3AdvancedColourTool kind="enhance" locale={data.locale} />

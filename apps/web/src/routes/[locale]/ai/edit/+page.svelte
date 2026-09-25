<script lang="ts">
  import AiTool from '$lib/AiTool.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<AiTool kind="edit" locale={data.locale} />

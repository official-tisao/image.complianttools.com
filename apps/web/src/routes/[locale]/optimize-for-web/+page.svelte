<script lang="ts">
  import LongTailTool from '$lib/LongTailTool.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<LongTailTool kind="optimize-for-web" locale={data.locale} />

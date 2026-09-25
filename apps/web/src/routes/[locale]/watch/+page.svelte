<script lang="ts">
  import LongTailTool from '$lib/LongTailTool.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<LongTailTool kind="watch" locale={data.locale} />

<script lang="ts">
  import LongTailTool from '$lib/LongTailTool.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<LongTailTool kind="spritesheet" locale={data.locale} />

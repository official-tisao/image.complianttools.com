<script lang="ts">
  import T44T48T66LocalTool from '$lib/T44T48T66LocalTool.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<T44T48T66LocalTool kind="denoise" locale={data.locale} />

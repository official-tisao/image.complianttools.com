<script lang="ts">
  import T15Spritesheet from '$lib/T15Spritesheet.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T15Spritesheet locale={data.locale} />

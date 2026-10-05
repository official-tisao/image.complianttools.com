<script lang="ts">
  import T13VideoToGif from '$lib/T13VideoToGif.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T13VideoToGif locale={data.locale} />

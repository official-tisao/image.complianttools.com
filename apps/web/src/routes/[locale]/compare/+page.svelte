<script lang="ts">
  import T60Compare from '$lib/T60Compare.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T60Compare locale={data.locale} />

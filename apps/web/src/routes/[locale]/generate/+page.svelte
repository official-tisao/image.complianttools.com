<script lang="ts">
  import T79Generator from '$lib/T79Generator.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T79Generator locale={data.locale} />

<script lang="ts">
  import T61DuplicateFinder from '$lib/T61DuplicateFinder.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T61DuplicateFinder locale={data.locale} />

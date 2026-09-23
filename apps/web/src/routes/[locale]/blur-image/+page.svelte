<script lang="ts">
  import T56T58RegionPrivacy from '$lib/T56T58RegionPrivacy.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<T56T58RegionPrivacy locale={data.locale} mode="blur" />

<script lang="ts">
  import T63AltTextReview from '$lib/T63AltTextReview.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<T63AltTextReview locale={data.locale} />

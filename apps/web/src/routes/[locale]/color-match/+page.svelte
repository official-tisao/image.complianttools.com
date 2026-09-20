<script lang="ts">
  import T80ColorMatch from '$lib/T80ColorMatch.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<T80ColorMatch locale={data.locale} />

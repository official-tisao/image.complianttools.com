<script lang="ts">
  import T81AdaptiveResize from '$lib/T81AdaptiveResize.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T81AdaptiveResize locale={data.locale} />

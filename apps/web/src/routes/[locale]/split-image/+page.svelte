<script lang="ts">
  import TransformExpansion from '$lib/TransformExpansion.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<TransformExpansion kind="split-image" locale={data.locale} />

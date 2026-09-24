<script lang="ts">
  import TransformExpansion from '$lib/TransformExpansion.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<TransformExpansion kind="collage" locale={data.locale} />

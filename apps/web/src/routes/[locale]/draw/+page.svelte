<script lang="ts">
  import T49T53CanvasTools from '$lib/T49T53CanvasTools.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<T49T53CanvasTools locale={data.locale} mode="draw" />

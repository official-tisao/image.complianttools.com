<script lang="ts">
  import P4CutoutComposite from '$lib/P4CutoutComposite.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<P4CutoutComposite kind="remove-background" locale={data.locale} />

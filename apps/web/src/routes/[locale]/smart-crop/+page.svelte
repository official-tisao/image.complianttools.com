<script lang="ts">
  import T27SmartCrop from '$lib/T27SmartCrop.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T27SmartCrop locale={data.locale} />

<script lang="ts">
  import T12GifMaker from '$lib/T12GifMaker.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T12GifMaker locale={data.locale} />

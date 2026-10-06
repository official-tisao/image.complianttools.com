<script lang="ts">
  import T18HtmlToImage from '$lib/T18HtmlToImage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T18HtmlToImage locale={data.locale} />

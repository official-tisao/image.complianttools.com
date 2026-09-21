<script lang="ts">
  import T57BlurFace from '$lib/T57BlurFace.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<T57BlurFace locale={data.locale} />

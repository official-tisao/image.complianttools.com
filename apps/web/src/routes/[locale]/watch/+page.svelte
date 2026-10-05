<script lang="ts">
  import T74FolderWatcher from '$lib/T74FolderWatcher.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<T74FolderWatcher locale={data.locale} />

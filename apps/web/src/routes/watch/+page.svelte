<script lang="ts">
  import { page } from '$app/state';
  import T74FolderWatcher from '$lib/T74FolderWatcher.svelte';
  import type { Locale } from '$lib/i18n';

  const locale = $derived(
    (page.url.pathname.split('/')[1] === 'ar'
      ? 'ar'
      : page.url.pathname.split('/')[1] === 'en-XA'
        ? 'en-XA'
        : 'en') as Locale,
  );
</script>

<T74FolderWatcher {locale} />
